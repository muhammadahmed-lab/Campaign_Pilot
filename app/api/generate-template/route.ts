import { NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { openai } from '@/app/lib/openai';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  timestamp: number;
};

type RequestBody = {
  messages: ChatMessage[];
  campaignId: string;
  templateStyle?: string;
};

const STYLE_INSTRUCTIONS: Record<string, string> = {
  minimal: 'Use a minimal, clean design with lots of whitespace. Simple single-column layout, no background colors, just clean typography and subtle spacing.',
  professional: 'Use a professional corporate design with a branded header, structured sections, and a clear call-to-action button.',
  newsletter: 'Use a newsletter layout with a masthead header, multiple content sections with dividers, sidebar highlights, and a footer with social links.',
  announcement: 'Use a bold announcement style with a large hero section, centered text, prominent headline, and a single clear CTA button.',
  'product-update': 'Use a product update layout with a version badge, feature highlights with icons, before/after sections, and a changelog-style format.',
};

function toDataUrl(image: string): string {
  if (image.startsWith('data:')) return image;
  return `data:image/png;base64,${image}`;
}

function convertMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    if (message.images && message.images.length > 0) {
      return {
        role: message.role,
        content: [
          ...(message.content.trim()
            ? [{ type: 'text' as const, text: message.content }]
            : []),
          ...message.images
            .filter((img) => typeof img === 'string' && img.trim().length > 0)
            .map((img) => ({
              type: 'image_url' as const,
              image_url: {
                url: toDataUrl(img),
              },
            })),
        ],
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

function extractJson(text: string): { subject: string; html: string } | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.subject === 'string' && typeof parsed.html === 'string') {
      return parsed;
    }
  } catch {
    // try extracting JSON from text
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    if (parsed && typeof parsed.subject === 'string' && typeof parsed.html === 'string') {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

const TEMPLATE_PROMPT = `Based on the conversation below, generate a professional HTML email template.

Requirements:
- Use inline CSS styles (no external stylesheets)
- Clean, modern design with proper spacing
- Include a header section, main content, and footer
- Use a clean color scheme (white background, dark text, accent colors)
- Support {{name}} placeholder for personalization
- Do NOT include any <img> tags or image URLs. The user will add images separately.
- Include all the key information discussed in the conversation
- Structure content with clear headings and sections

CRITICAL - Responsive email layout rules:
- Use a single centered table layout with max-width:600px and width:100%
- Wrap everything in: <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;width:100%">
- Use percentage widths (width:100%) not fixed pixel widths for content
- Set font sizes in px (minimum 14px for body text, 16px recommended)
- Use padding for spacing, not margin (email clients handle padding better)
- Include <meta name="viewport" content="width=device-width, initial-scale=1.0">
- Buttons should be table-based with padding, not fixed width divs
- All text must be readable on mobile without zooming
- Use this structure:
  <!DOCTYPE html>
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>@media only screen and (max-width:620px){.email-container{width:100%!important;padding:16px!important;}}</style>
  </head><body style="margin:0;padding:0;background-color:#f4f4f4;">
  <table role="presentation" class="email-container" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;padding:32px;">
  ...content...
  </table></body></html>

Return ONLY a JSON object with two fields:
- subject: A compelling email subject line
- html: The complete responsive HTML email template

Do not include markdown code fences or any other text outside the JSON.`;

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured' },
        { status: 500 }
      );
    }

    const body = (await req.json()) as RequestBody;

    if (
      !body ||
      !Array.isArray(body.messages) ||
      body.messages.length === 0 ||
      typeof body.campaignId !== 'string' ||
      body.campaignId.trim().length === 0
    ) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const styleKey = body.templateStyle && STYLE_INSTRUCTIONS[body.templateStyle] ? body.templateStyle : 'professional';
    const styleInstruction = STYLE_INSTRUCTIONS[styleKey];
    const fullPrompt = `${TEMPLATE_PROMPT}\n\nDesign style: ${styleInstruction}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      max_completion_tokens: 4096,
      messages: [
        {
          role: 'system',
          content: fullPrompt,
        },
        ...(convertMessages(body.messages) as any[]),
      ],
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content?.trim();

    if (!responseText) {
      return NextResponse.json(
        { error: 'Empty response from OpenAI' },
        { status: 502 }
      );
    }

    const parsed = extractJson(responseText);

    if (!parsed) {
      console.error('Invalid JSON response from OpenAI:', responseText);
      return NextResponse.json(
        { error: 'Failed to parse template response' },
        { status: 502 }
      );
    }

    // Collect image URLs from chat messages (already uploaded to Supabase in StepChat)
    const imageUrls: string[] = [];
    const seen = new Set<string>();
    for (const msg of body.messages) {
      if (msg.images && msg.images.length > 0) {
        for (const img of msg.images) {
          if (typeof img === 'string' && img.startsWith('http') && !seen.has(img)) {
            seen.add(img);
            imageUrls.push(img);
          }
        }
      }
    }

    // Inject images into the template after the first paragraph
    let finalHtml = parsed.html;
    if (imageUrls.length > 0) {
      const imagesHtml = imageUrls.map(
        (url) => `<div style="text-align:center;margin:24px 0;"><img src="${url}" alt="Campaign image" width="100%" style="width:100%;max-width:540px;height:auto;display:block;margin:0 auto;border-radius:8px;" /></div>`
      ).join('\n');

      const firstParagraph = finalHtml.match(/<\/p>/i);
      if (firstParagraph && firstParagraph.index !== undefined) {
        const insertPos = firstParagraph.index + firstParagraph[0].length;
        finalHtml = finalHtml.slice(0, insertPos) + '\n' + imagesHtml + '\n' + finalHtml.slice(insertPos);
      } else {
        const headingEnd = finalHtml.match(/<\/h[12345]>/i);
        if (headingEnd && headingEnd.index !== undefined) {
          const insertPos = headingEnd.index + headingEnd[0].length;
          finalHtml = finalHtml.slice(0, insertPos) + '\n' + imagesHtml + '\n' + finalHtml.slice(insertPos);
        }
      }
    }

    await prisma.campaign.update({
      where: { id: body.campaignId },
      data: {
        subject: parsed.subject,
        htmlBody: finalHtml,
      },
    });

    return NextResponse.json({
      subject: parsed.subject,
      html: finalHtml,
    });
  } catch (error) {
    console.error('Generate template API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate email template' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { openai } from '@/app/lib/openai';
import type { ImageAsset, ImageRole } from '@/app/types';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  classifiedImages?: ImageAsset[];
  timestamp: number;
};

type RequestBody = {
  messages: ChatMessage[];
  campaignId: string;
  templateStyle?: string;
  imageAssets?: ImageAsset[];
};

const STYLE_INSTRUCTIONS: Record<string, string> = {
  minimal: 'Minimal design with generous whitespace. Logo small in header (left-aligned). No hero banner. Simple single-column layout with clean typography.',
  professional: 'Professional corporate design with branded header (logo centered or left), hero banner below header if provided, structured content sections with clear hierarchy, prominent CTA button.',
  newsletter: 'Newsletter layout with logo masthead, optional hero banner, multiple content sections separated by dividers, product/feature images within sections, social icons and unsubscribe link in footer.',
  announcement: 'Bold announcement style. Large centered logo, full-width hero image if provided, big centered headline, concise body text, single prominent CTA button, minimal footer.',
  'product-update': 'Product update layout with logo in header, optional version/release badge, product screenshots placed within feature highlight sections, changelog-style bullet points, CTA to learn more.',
};

function toImageUrl(image: string): string {
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
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
              image_url: { url: toImageUrl(img) },
            })),
        ],
      };
    }
    return { role: message.role, content: message.content };
  });
}

function extractJson(text: string): { subject: string; html: string } | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.subject === 'string' && typeof parsed.html === 'string') {
      return parsed;
    }
  } catch { /* try regex */ }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (parsed && typeof parsed.subject === 'string' && typeof parsed.html === 'string') {
      return parsed;
    }
  } catch { return null; }
  return null;
}

// Resolve image assets from explicit list or fallback to chat message extraction
function resolveImageAssets(body: RequestBody): ImageAsset[] {
  if (body.imageAssets && body.imageAssets.length > 0) {
    return body.imageAssets;
  }
  // Fallback: extract from chat messages
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const msg of body.messages) {
    for (const img of msg.images ?? []) {
      if (typeof img === 'string' && img.startsWith('http') && !seen.has(img)) {
        seen.add(img);
        urls.push(img);
      }
    }
  }
  return urls.map((url, i) => ({
    url,
    role: (i === 0 ? 'hero' : 'screenshot') as ImageRole,
    alt: 'Campaign image',
  }));
}

function buildImageSection(assets: ImageAsset[]): string {
  const nonRef = assets.filter(a => a.role !== 'reference');
  const refs = assets.filter(a => a.role === 'reference');

  let section = '';

  if (nonRef.length === 0 && refs.length === 0) {
    return 'IMAGE ASSETS: None provided. Do NOT include any <img> tags or placeholder image URLs.';
  }

  if (nonRef.length > 0) {
    const lines = nonRef.map((a, i) =>
      `- Image ${i + 1} [${a.role.toUpperCase()}]: URL="${a.url}" | Alt: "${a.alt || 'Campaign image'}"`
    );
    section += `IMAGE ASSETS TO USE IN THE TEMPLATE:\n${lines.join('\n')}\n\n`;
    section += `IMAGE PLACEMENT RULES:
- LOGO images: Place in the email header/masthead area. Use: <img src="URL" alt="ALT" width="150" style="width:150px;max-width:150px;height:auto;display:block;" />
- HERO/BANNER images: Place as full-width section below header, before main content. Use: <img src="URL" alt="ALT" width="600" style="width:100%;max-width:600px;height:auto;display:block;" />
- SCREENSHOT images: Place within relevant content/feature sections. Use: <img src="URL" alt="ALT" width="500" style="width:100%;max-width:500px;height:auto;display:block;margin:0 auto;border-radius:8px;" />
- ICON images: Place inline with feature descriptions. Use: <img src="URL" alt="ALT" width="48" style="width:48px;height:auto;display:inline-block;vertical-align:middle;" />
- OTHER images: Place in the most contextually appropriate location.

CRITICAL: Use the EXACT URLs provided above. Do NOT fabricate, modify, or create placeholder image URLs.
Each <img> tag MUST have: src, alt, width attribute, and inline style with width, max-width, height:auto.
Wrap each image in a table cell: <tr><td style="text-align:center;padding:16px 0;"><img ... /></td></tr>`;
  }

  if (refs.length > 0) {
    section += `\n\nREFERENCE TEMPLATE:
The user uploaded a reference email template they want you to REPLICATE. You can see this reference image in the conversation.
Study the reference carefully and replicate:
- The overall layout structure (header, hero, sections, footer arrangement)
- The color scheme and background colors
- The typography style (font sizes, weights, alignment)
- The button styles and CTA placement
- The spacing and padding patterns
- The section dividers and visual hierarchy

Use the user's actual content (from the conversation) in this replicated layout.
If the user provided brand assets (logo, images), use those instead of the reference's images.`;
  }

  return section;
}

const BASE_PROMPT = `You are an expert email template designer. Generate a professional, responsive HTML email template.

Requirements:
- Use inline CSS styles only (no external stylesheets)
- Professional, polished design with proper spacing and visual hierarchy
- Include header, main content sections, and footer
- Support {{name}} placeholder for personalization
- Include all key information from the conversation

RESPONSIVE EMAIL LAYOUT (CRITICAL):
- Use table-based layout: <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
- Max width 600px, centered: style="max-width:600px;margin:0 auto;width:100%"
- All widths as percentages or with max-width constraints
- Minimum 14px font size for body text, 16px recommended
- Use padding for spacing (not margin - email clients handle padding better)
- Include viewport meta tag
- Include media query: @media only screen and (max-width:620px){.email-container{width:100%!important;padding:16px!important;}}
- Buttons: table-based with padding, not fixed-width divs
- Full structure:
  <!DOCTYPE html>
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>@media only screen and (max-width:620px){.email-container{width:100%!important;padding:16px!important;}}</style>
  </head><body style="margin:0;padding:0;background-color:#f4f4f4;">
  <table role="presentation" class="email-container" ...>
  ...content with proper table rows and cells...
  </table></body></html>

Return ONLY a JSON object with two fields:
- subject: A compelling email subject line
- html: The complete responsive HTML email template

Do not include markdown code fences or any text outside the JSON.`;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key is not configured' }, { status: 500 });
    }

    const body = (await req.json()) as RequestBody;

    if (!body || !Array.isArray(body.messages) || body.messages.length === 0 ||
        typeof body.campaignId !== 'string' || body.campaignId.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Resolve image assets
    const imageAssets = resolveImageAssets(body);
    const imageSection = buildImageSection(imageAssets);

    // Build style instruction
    const styleKey = body.templateStyle && STYLE_INSTRUCTIONS[body.templateStyle] ? body.templateStyle : 'professional';
    const styleInstruction = STYLE_INSTRUCTIONS[styleKey];

    const fullPrompt = `${BASE_PROMPT}\n\n${imageSection}\n\nDesign style: ${styleInstruction}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      max_completion_tokens: 8192,
      messages: [
        { role: 'system', content: fullPrompt },
        ...(convertMessages(body.messages) as any[]),
      ],
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content?.trim();

    if (!responseText) {
      return NextResponse.json({ error: 'Empty response from OpenAI' }, { status: 502 });
    }

    const parsed = extractJson(responseText);

    if (!parsed) {
      console.error('Invalid JSON response from OpenAI:', responseText.slice(0, 500));
      return NextResponse.json({ error: 'Failed to parse template response' }, { status: 502 });
    }

    await prisma.campaign.update({
      where: { id: body.campaignId },
      data: { subject: parsed.subject, htmlBody: parsed.html },
    });

    return NextResponse.json({ subject: parsed.subject, html: parsed.html });
  } catch (error) {
    console.error('Generate template API error:', error);
    return NextResponse.json({ error: 'Failed to generate email template' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { openai, SYSTEM_PROMPT } from '@/app/lib/openai';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  timestamp: number;
};

type RequestBody = {
  messages: ChatMessage[];
  campaignId: string;
};

function toImageUrl(image: string): string {
  // Already a URL (Supabase or other)
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  // Already a data URL
  if (image.startsWith('data:')) return image;
  // Raw base64 fallback
  return `data:image/png;base64,${image}`;
}

function convertMessages(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> }> {
  return messages.map((message) => {
    if (message.role === 'user' && message.images && message.images.length > 0) {
      return {
        role: 'user' as const,
        content: [
          ...(message.content.trim()
            ? [{ type: 'text' as const, text: message.content }]
            : []),
          ...message.images
            .filter((img) => typeof img === 'string' && img.trim().length > 0)
            .map((img) => ({
              type: 'image_url' as const,
              image_url: {
                url: toImageUrl(img),
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

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      stream: true,
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        ...(convertMessages(body.messages) as any[]),
      ],
    });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              controller.enqueue(new TextEncoder().encode(text));
            }
          }
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}

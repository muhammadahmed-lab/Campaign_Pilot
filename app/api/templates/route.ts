import { NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

const ALLOWED_STYLES = new Set(['minimal', 'professional', 'newsletter', 'announcement', 'product-update']);
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_ROLES = new Set(['logo', 'hero', 'screenshot', 'icon', 'reference', 'other']);

function isValidImageAssets(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length > 100) return false;
  return value.every((asset) => (
    asset &&
    typeof asset === 'object' &&
    !Array.isArray(asset) &&
    typeof (asset as { url?: unknown }).url === 'string' &&
    typeof (asset as { role?: unknown }).role === 'string' &&
    ALLOWED_IMAGE_ROLES.has((asset as { role: string }).role) &&
    (
      (asset as { alt?: unknown }).alt === undefined ||
      typeof (asset as { alt?: unknown }).alt === 'string'
    )
  ));
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templates = await prisma.template.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        name: true,
        subject: true,
        templateStyle: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Templates GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const rawName = typeof body.name === 'string' ? body.name.trim() : '';
    if (rawName.length === 0 || rawName.length > 100) {
      return NextResponse.json({ error: 'Name must be 1–100 characters' }, { status: 400 });
    }

    const subject = typeof body.subject === 'string' ? body.subject : '';
    if (subject.length > 500) {
      return NextResponse.json({ error: 'Subject too long' }, { status: 400 });
    }

    const htmlBody = typeof body.htmlBody === 'string' ? body.htmlBody : '';
    if (Buffer.byteLength(htmlBody, 'utf8') > MAX_HTML_BYTES) {
      return NextResponse.json({ error: 'Template HTML too large' }, { status: 413 });
    }

    const templateStyle = typeof body.templateStyle === 'string' && ALLOWED_STYLES.has(body.templateStyle)
      ? body.templateStyle
      : 'professional';

    const imageAssets = body.imageAssets === undefined ? [] : body.imageAssets;
    if (!isValidImageAssets(imageAssets)) {
      return NextResponse.json({ error: 'Invalid imageAssets' }, { status: 400 });
    }

    const created = await prisma.template.create({
      data: {
        userId: session.user.id,
        name: rawName,
        subject,
        htmlBody,
        templateStyle,
        imageAssets,
      },
      select: {
        id: true,
        name: true,
        subject: true,
        templateStyle: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Templates POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

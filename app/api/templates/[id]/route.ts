import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

const ALLOWED_STYLES = new Set(['minimal', 'professional', 'newsletter', 'announcement', 'product-update']);
const ALLOWED_IMAGE_ROLES = new Set(['logo', 'hero', 'screenshot', 'icon', 'reference', 'other']);
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const ALLOWED_FIELDS = new Set(['name', 'subject', 'htmlBody', 'templateStyle', 'imageAssets']);

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

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const template = await prisma.template.findFirst({
      where: { id: params.id, userId: session.user.id },
    });

    if (!template) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await prisma.template.findFirst({
      where: { id: params.id, userId: session.user.id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_FIELDS.has(key)) continue;

      switch (key) {
        case 'name': {
          if (typeof value !== 'string') return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
          const trimmed = value.trim();
          if (trimmed.length === 0 || trimmed.length > 100) {
            return NextResponse.json({ error: 'Name must be 1–100 characters' }, { status: 400 });
          }
          updateData.name = trimmed;
          break;
        }
        case 'subject': {
          if (typeof value !== 'string') return NextResponse.json({ error: 'Invalid subject' }, { status: 400 });
          if (value.length > 500) return NextResponse.json({ error: 'Subject too long' }, { status: 400 });
          updateData.subject = value;
          break;
        }
        case 'htmlBody': {
          if (typeof value !== 'string') return NextResponse.json({ error: 'Invalid htmlBody' }, { status: 400 });
          if (Buffer.byteLength(value, 'utf8') > MAX_HTML_BYTES) {
            return NextResponse.json({ error: 'Template HTML too large' }, { status: 413 });
          }
          updateData.htmlBody = value;
          break;
        }
        case 'templateStyle': {
          if (typeof value !== 'string' || !ALLOWED_STYLES.has(value)) {
            return NextResponse.json({ error: 'Invalid templateStyle' }, { status: 400 });
          }
          updateData.templateStyle = value;
          break;
        }
        case 'imageAssets': {
          if (!isValidImageAssets(value)) {
            return NextResponse.json({ error: 'Invalid imageAssets' }, { status: 400 });
          }
          updateData.imageAssets = value;
          break;
        }
      }
    }

    const updated = await prisma.template.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await prisma.template.findFirst({
      where: { id: params.id, userId: session.user.id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.template.delete({ where: { id: params.id } });

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

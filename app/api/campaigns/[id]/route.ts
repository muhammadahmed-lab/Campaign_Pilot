import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { supabase } from '@/app/lib/supabase';
import { encrypt } from '@/app/lib/crypto';

const allowedFields = new Set([
  'scheduledAt', 'sendNow', 'subject', 'htmlBody', 'provider',
  'providerEmail', 'providerCredential', 'recipientCount', 'chatHistory',
  'name', 'sendDelay', 'templateStyle', 'archivedAt', 'recipients', 'imageAssets',
]);

const allowedImageRoles = new Set(['logo', 'hero', 'screenshot', 'icon', 'reference', 'other']);

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: params.id, userId: session.user.id },
      select: {
        id: true, name: true, status: true, subject: true, htmlBody: true,
        scheduledAt: true, sendNow: true, sendDelay: true, templateStyle: true,
        provider: true, providerEmail: true,
        recipientCount: true, sent: true, failed: true,
        chatHistory: true, recipients: true, imageAssets: true, archivedAt: true,
        createdAt: true, updatedAt: true,
        // providerCredential intentionally excluded
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(campaign);
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

    const existing = await prisma.campaign.findFirst({
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
      if (!allowedFields.has(key)) continue;

      switch (key) {
        case 'scheduledAt': {
          if (value === null) { updateData.scheduledAt = null; break; }
          if (typeof value !== 'string') return NextResponse.json({ error: 'Invalid scheduledAt' }, { status: 400 });
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return NextResponse.json({ error: 'Invalid scheduledAt' }, { status: 400 });
          updateData.scheduledAt = date;
          break;
        }
        case 'sendNow': {
          if (typeof value !== 'boolean') return NextResponse.json({ error: 'Invalid sendNow' }, { status: 400 });
          updateData.sendNow = value;
          break;
        }
        case 'sendDelay': {
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
            return NextResponse.json({ error: 'Invalid sendDelay' }, { status: 400 });
          }
          updateData.sendDelay = value;
          break;
        }
        case 'recipientCount': {
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
            return NextResponse.json({ error: 'Invalid recipientCount' }, { status: 400 });
          }
          updateData.recipientCount = value;
          break;
        }
        case 'name':
        case 'subject':
        case 'htmlBody':
        case 'provider':
        case 'providerEmail':
        case 'templateStyle': {
          if (value !== null && typeof value !== 'string') {
            return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
          }
          updateData[key] = value;
          break;
        }
        case 'providerCredential': {
          if (value !== null && typeof value !== 'string') {
            return NextResponse.json({ error: 'Invalid providerCredential' }, { status: 400 });
          }
          updateData.providerCredential = value ? encrypt(value) : '';
          break;
        }
        case 'chatHistory': {
          updateData.chatHistory = value;
          break;
        }
        case 'recipients': {
          if (!Array.isArray(value)) return NextResponse.json({ error: 'Invalid recipients' }, { status: 400 });
          if (value.length > 10000) return NextResponse.json({ error: 'Too many recipients' }, { status: 413 });
          // Each recipient must be a plain object with a string email. Any
          // additional fields (name, or custom CSV columns) must be strings if
          // present — no nested objects, no arrays.
          const isValid = value.every((recipient) => {
            if (!recipient || typeof recipient !== 'object' || Array.isArray(recipient)) return false;
            const r = recipient as Record<string, unknown>;
            if (typeof r.email !== 'string') return false;
            for (const [k, v] of Object.entries(r)) {
              if (k === 'email') continue;
              if (v === undefined || v === null) continue;
              if (typeof v !== 'string') return false;
            }
            return true;
          });
          if (!isValid) return NextResponse.json({ error: 'Invalid recipients' }, { status: 400 });
          updateData.recipients = value;
          break;
        }
        case 'imageAssets': {
          if (!Array.isArray(value)) return NextResponse.json({ error: 'Invalid imageAssets' }, { status: 400 });
          if (value.length > 100) return NextResponse.json({ error: 'Too many imageAssets' }, { status: 413 });
          const isValid = value.every((asset) => (
            asset &&
            typeof asset === 'object' &&
            !Array.isArray(asset) &&
            typeof (asset as { url?: unknown }).url === 'string' &&
            typeof (asset as { role?: unknown }).role === 'string' &&
            allowedImageRoles.has((asset as { role: string }).role) &&
            (
              (asset as { alt?: unknown }).alt === undefined ||
              typeof (asset as { alt?: unknown }).alt === 'string'
            )
          ));
          if (!isValid) return NextResponse.json({ error: 'Invalid imageAssets' }, { status: 400 });
          updateData.imageAssets = value;
          break;
        }
        case 'archivedAt': {
          if (value === null) {
            updateData.archivedAt = null;
          } else if (typeof value === 'string') {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) {
              return NextResponse.json({ error: 'Invalid archivedAt' }, { status: 400 });
            }
            updateData.archivedAt = date;
          }
          break;
        }
      }
    }

    const updated = await prisma.campaign.update({
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

    const campaign = await prisma.campaign.findFirst({
      where: { id: params.id, userId: session.user.id },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Clean up images from Supabase BEFORE deleting the campaign row.
    // If storage fails, propagate to the outer catch (500) — campaign row stays,
    // user can retry. Previously this was silently swallowed, leaving permanent orphans.
    const { data: files, error: listError } = await supabase.storage
      .from('campaign-images')
      .list(`${session.user.id}/${params.id}`);
    if (listError) throw listError;
    if (files && files.length > 0) {
      const paths = files.map((f) => `${session.user.id}/${params.id}/${f.name}`);
      const { error: removeError } = await supabase.storage.from('campaign-images').remove(paths);
      if (removeError) throw removeError;
    }

    await prisma.campaign.delete({ where: { id: params.id } });

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

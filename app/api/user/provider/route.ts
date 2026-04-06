import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { NextResponse } from 'next/server';

const DEFAULT_PROVIDER_CONFIG = {
  provider: 'gmail',
  providerEmail: '',
  providerCredential: '',
};

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await prisma.providerConfig.findUnique({
      where: { userId: session.user.id },
      select: {
        provider: true,
        providerEmail: true,
        providerCredential: true,
      },
    });

    return NextResponse.json(config ?? DEFAULT_PROVIDER_CONFIG, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch provider configuration' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const provider = typeof body.provider === 'string' ? body.provider.trim() : '';
    const providerEmail = typeof body.providerEmail === 'string' ? body.providerEmail.trim() : '';
    const providerCredential = typeof body.providerCredential === 'string' ? body.providerCredential.trim() : '';

    if (!['gmail', 'resend'].includes(provider)) {
      return NextResponse.json({ error: "Provider must be 'gmail' or 'resend'" }, { status: 400 });
    }

    if (!providerEmail) {
      return NextResponse.json({ error: 'providerEmail is required' }, { status: 400 });
    }

    if (!providerCredential) {
      return NextResponse.json({ error: 'providerCredential is required' }, { status: 400 });
    }

    const updatedConfig = await prisma.providerConfig.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, provider, providerEmail, providerCredential },
      update: { provider, providerEmail, providerCredential },
      select: { provider: true, providerEmail: true, providerCredential: true },
    });

    return NextResponse.json(updatedConfig, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save provider configuration' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { inngest } from '@/app/lib/inngest';
import { sendBatch } from '@/app/lib/resend';
import { sendSmtpBatch } from '@/app/lib/smtp';

type Recipient = {
  email: string;
  name?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function interpolate(template: string, recipient: Recipient) {
  return template.replace(/\{\{\s*name\s*\}\}/g, recipient.name?.trim() || '');
}

async function directProcessCampaign(params: {
  campaignId: string;
  recipients: Recipient[];
  provider: string;
  providerEmail: string;
  providerCredential: string;
  sendNow: boolean;
  scheduledAt: string | null;
}) {
  const { campaignId, recipients, provider, providerEmail, providerCredential, sendNow, scheduledAt } = params;

  if (!sendNow && scheduledAt) {
    const scheduledDate = new Date(scheduledAt);
    if (!Number.isNaN(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now()) {
      return; // Can't wait in direct mode for scheduled sends
    }
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, subject: true, htmlBody: true },
  });

  if (!campaign) throw new Error('Campaign not found');

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'sending' },
  });

  const batchSize = provider === 'gmail' ? 10 : 50;
  const recipientChunks = chunk(recipients, batchSize);
  let totalSent = 0;
  let totalFailed = 0;

  for (const recipientsChunk of recipientChunks) {
    const emails = recipientsChunk.map((recipient) => ({
      from: providerEmail,
      to: recipient.email,
      subject: interpolate(campaign.subject, recipient),
      html: interpolate(campaign.htmlBody, recipient),
    }));

    try {
      const result = provider === 'gmail'
        ? await sendSmtpBatch(providerEmail, providerCredential, emails)
        : await sendBatch(providerCredential, emails);
      totalSent += result.sent;
      totalFailed += result.failed;
    } catch {
      totalFailed += recipientsChunk.length;
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { sent: totalSent, failed: totalFailed },
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: totalSent > 0 ? 'completed' : 'failed',
      sent: totalSent,
      failed: totalFailed,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const campaignId = params.id;
    const body = await request.json();

    if (!body || !Array.isArray(body.recipients)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (body.recipients.length === 0 || body.recipients.length > 10000) {
      return NextResponse.json({ error: 'Recipients must contain between 1 and 10000 entries' }, { status: 400 });
    }

    const recipients: Recipient[] = body.recipients.map((r: any) => ({
      email: String(r.email || '').trim().toLowerCase(),
      name: r.name?.trim() || undefined,
    }));

    const invalidRecipient = recipients.find((r) => !r.email || !isValidEmail(r.email));
    if (invalidRecipient) {
      return NextResponse.json({ error: `Invalid recipient email: ${invalidRecipient.email}` }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true, userId: true, status: true, provider: true,
        providerEmail: true, providerCredential: true,
        scheduledAt: true, sendNow: true, sendDelay: true,
      },
    });

    if (!campaign || campaign.userId !== session.user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft campaigns can be launched' }, { status: 400 });
    }

    if (!campaign.provider || !campaign.providerCredential || !campaign.providerEmail) {
      return NextResponse.json({ error: 'Campaign provider configuration is incomplete' }, { status: 400 });
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: campaign.sendNow ? 'sending' : 'scheduled',
        recipientCount: recipients.length,
        sent: 0,
        failed: 0,
      },
    });

    const eventData = {
      campaignId,
      recipients,
      provider: campaign.provider,
      providerEmail: campaign.providerEmail,
      providerCredential: campaign.providerCredential,
      sendNow: Boolean(campaign.sendNow),
      scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null,
      sendDelay: campaign.sendDelay ?? 0,
    };

    try {
      await inngest.send({ name: 'campaign/launch', data: eventData });
    } catch {
      // Fallback to direct processing
      directProcessCampaign(eventData).catch(console.error);
    }

    return NextResponse.json({ success: true, campaignId });
  } catch (error) {
    console.error('Campaign launch error:', error);
    return NextResponse.json({ error: 'Failed to launch campaign' }, { status: 500 });
  }
}

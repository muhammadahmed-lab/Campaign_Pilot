import { Inngest } from 'inngest';
import { prisma } from '@/app/lib/prisma';
import { sendBatch } from '@/app/lib/resend';
import { sendSmtpBatch } from '@/app/lib/smtp';
import { supabase } from '@/app/lib/supabase';

type Recipient = {
  email: string;
  name?: string;
};

type LaunchCampaignEvent = {
  data: {
    campaignId: string;
    recipients: Recipient[];
    provider: string;
    providerEmail: string;
    providerCredential: string;
    sendNow: boolean;
    scheduledAt: string | null;
    sendDelay?: number;
  };
};

export const inngest = new Inngest({ id: 'campaign-pilot' });

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function interpolate(template: string, recipient: Recipient) {
  return template.replace(/\{\{\s*name\s*\}\}/g, recipient.name?.trim() || '');
}

export const launchCampaign = inngest.createFunction(
  { id: 'launch-campaign' },
  { event: 'campaign/launch' },
  async ({ event, step }: { event: LaunchCampaignEvent; step: any }) => {
    const {
      campaignId,
      recipients,
      provider,
      providerEmail,
      providerCredential,
      sendNow,
      scheduledAt,
      sendDelay = 0,
    } = event.data;

    // Step 1: Wait for scheduled time if not sending now
    if (!sendNow && scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (!Number.isNaN(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now()) {
        await step.sleepUntil('scheduled-send', scheduledDate);
      }
    }

    // Step 2: Load campaign data
    const campaign = await step.run('load-campaign', async () => {
      return prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, subject: true, htmlBody: true },
      });
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Step 3: Mark as sending
    await step.run('mark-sending', async () => {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'sending' },
      });
    });

    // Step 4+: Send in batches (batch size 1 when delay is set)
    const batchSize = sendDelay > 0 ? 1 : (provider === 'gmail' ? 10 : 50);
    const recipientChunks = chunk(recipients, batchSize);

    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < recipientChunks.length; i++) {
      const recipientsChunk = recipientChunks[i];

      await step.run(`send-batch-${i + 1}`, async () => {
        const emails = recipientsChunk.map((recipient) => ({
          from: providerEmail,
          to: recipient.email,
          subject: interpolate(campaign.subject, recipient),
          html: interpolate(campaign.htmlBody, recipient),
        }));

        try {
          if (provider === 'gmail') {
            const result = await sendSmtpBatch(providerEmail, providerCredential, emails);
            totalSent += result.sent;
            totalFailed += result.failed;
          } else {
            const result = await sendBatch(providerCredential, emails);
            totalSent += result.sent;
            totalFailed += result.failed;
          }
        } catch {
          totalFailed += recipientsChunk.length;
        }

        await prisma.campaign.update({
          where: { id: campaignId },
          data: { sent: totalSent, failed: totalFailed },
        });
      });

      if (i < recipientChunks.length - 1) {
        const delay = sendDelay > 0 ? `${sendDelay}s` : '1s';
        await step.sleep(`rate-limit-${i + 1}`, delay);
      }
    }

    // Final step: Mark complete
    await step.run('finalize', async () => {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: totalSent > 0 ? 'completed' : 'failed',
          sent: totalSent,
          failed: totalFailed,
        },
      });
    });

    // Images are kept until user archives or deletes the campaign

    return { success: true, campaignId, sent: totalSent, failed: totalFailed };
  }
);

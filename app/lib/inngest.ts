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

    for (let i = 0; i < recipientChunks.length; i++) {
      const recipientsChunk = recipientChunks[i];

      await step.run(`send-batch-${i + 1}`, async () => {
        const emails = recipientsChunk.map((recipient) => ({
          from: providerEmail,
          to: recipient.email,
          subject: interpolate(campaign.subject, recipient),
          html: interpolate(campaign.htmlBody, recipient),
        }));

        let batchSent = 0;
        let batchFailed = 0;

        try {
          if (provider === 'gmail') {
            const result = await sendSmtpBatch(providerEmail, providerCredential, emails);
            batchSent = result.sent;
            batchFailed = result.failed;
          } else {
            const result = await sendBatch(providerCredential, emails);
            batchSent = result.sent;
            batchFailed = result.failed;
          }
        } catch (err) {
          console.error('Send batch error:', err);
          batchFailed = recipientsChunk.length;
        }

        // Atomic compare-and-swap: only apply the increment if this batch index
        // hasn't been recorded yet. updateMany returns { count } without throwing
        // when the WHERE excludes the row, so retries of an already-applied step
        // silently no-op instead of double-counting.
        const updateResult = await prisma.campaign.updateMany({
          where: { id: campaignId, lastProcessedBatch: { lt: i } },
          data: {
            sent: { increment: batchSent },
            failed: { increment: batchFailed },
            lastProcessedBatch: i,
          },
        });
        if (updateResult.count === 0) {
          console.warn(
            `[launchCampaign] Skipping already-processed batch ${i} for campaign ${campaignId}`
          );
        }

        return { batchSent, batchFailed };
      });

      if (i < recipientChunks.length - 1) {
        const delay = sendDelay > 0 ? `${sendDelay}s` : '1s';
        await step.sleep(`rate-limit-${i + 1}`, delay);
      }
    }

    // Final step: Read actual counts from DB and set final status
    await step.run('finalize', async () => {
      const final = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { sent: true, failed: true },
      });

      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: (final?.sent ?? 0) > 0 ? 'completed' : 'failed',
        },
      });
    });

    // Images are kept until user archives or deletes the campaign

    return { success: true, campaignId };
  }
);

// Daily cleanup of abandoned draft campaigns (older than 14 days).
// Drops storage objects and the campaign row, per-row so one failure doesn't abort the batch.
export const cleanupOldDrafts = inngest.createFunction(
  { id: 'cleanup-old-drafts' },
  { cron: '0 3 * * *' },
  async ({ step }: { step: any }) => {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const drafts = await prisma.campaign.findMany({
      where: { status: 'draft', updatedAt: { lt: cutoff } },
      select: { id: true, userId: true },
    });

    let pruned = 0;
    let errors = 0;

    for (const draft of drafts) {
      const result = await step.run(`cleanup-${draft.id}`, async () => {
        try {
          const folder = `${draft.userId}/${draft.id}`;
          const { data: files, error: listError } = await supabase.storage
            .from('campaign-images')
            .list(folder);
          if (listError) throw listError;

          if (files && files.length > 0) {
            const paths = files.map((file) => `${folder}/${file.name}`);
            const { error: removeError } = await supabase.storage
              .from('campaign-images')
              .remove(paths);
            if (removeError) throw removeError;
          }

          await prisma.campaign.delete({ where: { id: draft.id } });
          return { ok: true };
        } catch (error) {
          console.error('Cleanup old draft error:', { campaignId: draft.id, error });
          return { ok: false };
        }
      });

      if (result.ok) pruned += 1;
      else errors += 1;
    }

    return { pruned, errors };
  }
);

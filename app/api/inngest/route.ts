import { serve } from 'inngest/next';
import { inngest, launchCampaign, cleanupOldDrafts } from '@/app/lib/inngest';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [launchCampaign, cleanupOldDrafts],
});

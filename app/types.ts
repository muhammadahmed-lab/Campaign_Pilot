export type EmailProvider = 'resend' | 'gmail';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';
export type TemplateStyle = 'minimal' | 'professional' | 'newsletter' | 'announcement' | 'product-update';
export type ImageRole = 'logo' | 'hero' | 'screenshot' | 'icon' | 'reference' | 'other';

export interface ImageAsset {
  url: string;
  role: ImageRole;
  alt?: string;
}

export interface Recipient {
  email: string;
  name?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  classifiedImages?: ImageAsset[];
  timestamp: number;
}

export interface WizardState {
  step: number;
  campaignId: string | null;
  scheduledAt: Date | null;
  sendNow: boolean;
  chatMessages: ChatMessage[];
  subject: string;
  htmlBody: string;
  recipients: Recipient[];
  provider: EmailProvider;
  providerEmail: string;
  providerCredential: string;
}

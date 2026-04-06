'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import StepIndicator from '@/app/components/wizard/StepIndicator';
import StepCalendar from '@/app/components/wizard/StepCalendar';
import StepChat from '@/app/components/wizard/StepChat';
import StepTemplate from '@/app/components/wizard/StepTemplate';
import StepRecipients from '@/app/components/wizard/StepRecipients';
import StepLaunch from '@/app/components/wizard/StepLaunch';
import type { ChatMessage, Recipient, EmailProvider } from '@/app/types';

interface LocalWizardState {
  name: string;
  scheduledAt: Date | null;
  sendNow: boolean;
  chatMessages: ChatMessage[];
  subject: string;
  htmlBody: string;
  recipients: Recipient[];
  provider: EmailProvider;
  providerEmail: string;
  providerCredential: string;
  saveCredentials: boolean;
  sendDelay: number;
  templateStyle: string;
}

const INITIAL_STATE: LocalWizardState = {
  name: '',
  scheduledAt: null,
  sendNow: false,
  chatMessages: [],
  subject: '',
  htmlBody: '',
  recipients: [],
  provider: 'gmail',
  providerEmail: '',
  providerCredential: '',
  saveCredentials: true,
  sendDelay: 0,
  templateStyle: 'professional',
};

export default function NewCampaignWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [wizardState, setWizardState] = useState<LocalWizardState>(INITIAL_STATE);
  const [isLaunching, setIsLaunching] = useState(false);

  // Create campaign draft only when needed (lazy creation)
  const ensureCampaign = async (): Promise<string | null> => {
    if (campaignId) return campaignId;
    try {
      const res = await fetch('/api/campaigns', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCampaignId(data.id);
        return data.id;
      }
    } catch (error) {
      console.error('Failed to create campaign:', error);
    }
    return null;
  };

  const saveCampaign = async (state: LocalWizardState, id?: string | null) => {
    const cid = id || campaignId;
    if (!cid) return;
    try {
      await fetch(`/api/campaigns/${cid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: state.name,
          scheduledAt: state.scheduledAt?.toISOString() ?? null,
          sendNow: state.sendNow,
          subject: state.subject,
          htmlBody: state.htmlBody,
          provider: state.provider,
          providerEmail: state.providerEmail,
          providerCredential: state.providerCredential,
          recipientCount: state.recipients.length,
          chatHistory: state.chatMessages,
          sendDelay: state.sendDelay,
          templateStyle: state.templateStyle,
        }),
      });
    } catch (error) {
      console.error('Failed to save campaign state:', error);
    }
  };

  const handleNext = async () => {
    // Create campaign draft on first "Next" click (lazy creation)
    const cid = await ensureCampaign();
    if (!cid) {
      toast.error('Failed to create campaign. Please try again.');
      return;
    }
    const nextStep = Math.min(currentStep + 1, 5);
    await saveCampaign(wizardState, cid);
    setCurrentStep(nextStep);
  };

  const handleBack = async () => {
    if (currentStep === 1) {
      // If no campaign was created yet (user never clicked Next), just go back
      // If campaign exists but is empty, delete the draft
      if (campaignId) {
        try {
          await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
        } catch { /* ignore */ }
      }
      router.push('/');
      return;
    }
    const prevStep = Math.max(currentStep - 1, 1);
    await saveCampaign(wizardState);
    setCurrentStep(prevStep);
  };

  const handleLaunch = async () => {
    if (!campaignId) return;
    setIsLaunching(true);

    try {
      // Save final state first
      await saveCampaign(wizardState);

      const res = await fetch(`/api/campaigns/${campaignId}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: wizardState.recipients }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to launch campaign');
        return;
      }

      // Save credentials for future campaigns if opted in
      if (wizardState.saveCredentials) {
        try {
          await fetch('/api/user/provider', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: wizardState.provider,
              providerEmail: wizardState.providerEmail,
              providerCredential: wizardState.providerCredential,
            }),
          });
        } catch {
          // silently ignore credential save failure
        }
      }

      toast.success(
        wizardState.sendNow
          ? `Campaign launched! Sending to ${wizardState.recipients.length} recipients.`
          : `Campaign scheduled! Will send to ${wizardState.recipients.length} recipients.`
      );

      router.push(`/campaign/${campaignId}`);
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setIsLaunching(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <StepCalendar
            scheduledAt={wizardState.scheduledAt}
            setScheduledAt={(d) => setWizardState((prev) => ({ ...prev, scheduledAt: d }))}
            sendNow={wizardState.sendNow}
            setSendNow={(v) => setWizardState((prev) => ({ ...prev, sendNow: v }))}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 2:
        return (
          <StepChat
            campaignId={campaignId!}
            chatMessages={wizardState.chatMessages}
            setChatMessages={(msgs) => setWizardState((prev) => ({ ...prev, chatMessages: msgs }))}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 3:
        return (
          <StepTemplate
            campaignId={campaignId!}
            chatMessages={wizardState.chatMessages}
            subject={wizardState.subject}
            setSubject={(s) => setWizardState((prev) => ({ ...prev, subject: s }))}
            htmlBody={wizardState.htmlBody}
            setHtmlBody={(h) => setWizardState((prev) => ({ ...prev, htmlBody: h }))}
            templateStyle={wizardState.templateStyle}
            setTemplateStyle={(s) => setWizardState((prev) => ({ ...prev, templateStyle: s }))}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 4:
        return (
          <StepRecipients
            recipients={wizardState.recipients}
            setRecipients={(r) => setWizardState((prev) => ({ ...prev, recipients: r }))}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 5:
        return (
          <StepLaunch
            campaignId={campaignId!}
            scheduledAt={wizardState.scheduledAt}
            sendNow={wizardState.sendNow}
            subject={wizardState.subject}
            htmlBody={wizardState.htmlBody}
            recipientCount={wizardState.recipients.length}
            provider={wizardState.provider}
            setProvider={(p) => setWizardState((prev) => ({ ...prev, provider: p }))}
            providerEmail={wizardState.providerEmail}
            setProviderEmail={(e) => setWizardState((prev) => ({ ...prev, providerEmail: e }))}
            providerCredential={wizardState.providerCredential}
            setProviderCredential={(c) => setWizardState((prev) => ({ ...prev, providerCredential: c }))}
            saveCredentials={wizardState.saveCredentials}
            setSaveCredentials={(v) => setWizardState((prev) => ({ ...prev, saveCredentials: v }))}
            sendDelay={wizardState.sendDelay}
            setSendDelay={(d) => setWizardState((prev) => ({ ...prev, sendDelay: d }))}
            onLaunch={handleLaunch}
            onBack={handleBack}
            isLaunching={isLaunching}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-cp-black text-cp-light">
      <header className="sticky top-0 z-10 bg-cp-black/80 backdrop-blur-md border-b border-cp-border px-6 py-4 flex items-center">
        <button
          onClick={() => router.push('/')}
          className="flex items-center text-cp-grey hover:text-white transition-colors mr-4"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>
        <h1 className="text-lg font-semibold font-heading text-white shrink-0">New Campaign</h1>
        <input
          type="text"
          value={wizardState.name}
          onChange={(e) => setWizardState((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Campaign name..."
          className="bg-transparent border-none text-lg font-heading text-white focus:outline-none placeholder:text-cp-muted flex-1 ml-3"
        />
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-12">
          <StepIndicator currentStep={currentStep} />
        </div>

        {renderStep()}
      </main>
    </div>
  );
}

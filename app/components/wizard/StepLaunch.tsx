'use client';

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import type { EmailProvider } from '@/app/types';

interface StepLaunchProps {
  campaignId: string;
  scheduledAt: Date | null;
  sendNow: boolean;
  subject: string;
  htmlBody: string;
  recipientCount: number;
  provider: EmailProvider;
  setProvider: (p: EmailProvider) => void;
  providerEmail: string;
  setProviderEmail: (e: string) => void;
  providerCredential: string;
  setProviderCredential: (c: string) => void;
  saveCredentials: boolean;
  setSaveCredentials: (v: boolean) => void;
  sendDelay: number;
  setSendDelay: (d: number) => void;
  onLaunch: () => void;
  onBack: () => void;
  isLaunching: boolean;
}

const DELAY_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: '1 second' },
  { value: 2, label: '2 seconds' },
  { value: 3, label: '3 seconds' },
  { value: 5, label: '5 seconds' },
  { value: 10, label: '10 seconds' },
];

export default function StepLaunch({
  scheduledAt,
  sendNow,
  subject,
  htmlBody,
  recipientCount,
  provider,
  setProvider,
  providerEmail,
  setProviderEmail,
  providerCredential,
  setProviderCredential,
  saveCredentials,
  setSaveCredentials,
  sendDelay,
  setSendDelay,
  onLaunch,
  onBack,
  isLaunching,
}: StepLaunchProps) {
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetchProvider = async () => {
      try {
        const res = await fetch('/api/user/provider');
        if (!res.ok) return;
        const data = await res.json();
        if (!providerEmail && data.providerEmail) {
          setProviderEmail(data.providerEmail);
        }
        if (!providerCredential && data.providerCredential) {
          setProviderCredential(data.providerCredential);
        }
        if (data.provider) {
          setProvider(data.provider);
        }
      } catch {
        // silently ignore
      }
    };
    fetchProvider();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isValid = providerEmail.trim() !== '' && providerCredential.trim() !== '';

  const inputCls = 'w-full bg-cp-black border border-cp-muted rounded-lg px-4 py-3 text-white placeholder-cp-grey focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-shadow';

  return (
    <div className="flex flex-col text-cp-light">
      <div className="space-y-8">
        {/* Campaign Summary */}
        <section>
          <h2 className="text-2xl font-semibold font-heading text-white mb-4">Review & Launch</h2>
          <div className="bg-cp-dark border border-cp-border rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-cp-grey uppercase tracking-wider mb-1">Schedule</p>
                <p className="text-cp-light font-medium flex items-center">
                  <svg className="w-4 h-4 mr-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {sendNow ? 'Send Immediately' : scheduledAt ? format(scheduledAt, 'PPP \'at\' p') : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-cp-grey uppercase tracking-wider mb-1">Recipients</p>
                <p className="text-cp-light font-medium flex items-center">
                  <svg className="w-4 h-4 mr-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {recipientCount.toLocaleString()} contacts
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-cp-grey uppercase tracking-wider mb-1">Subject Line</p>
                <p className="text-cp-light font-medium truncate">{subject || '(No Subject)'}</p>
              </div>
            </div>

            <div className="flex flex-col">
              <p className="text-xs font-medium text-cp-grey uppercase tracking-wider mb-2">Template Preview</p>
              <div className="bg-white rounded-lg border border-cp-muted overflow-hidden min-h-[200px] max-h-[400px]">
                <iframe
                  sandbox="allow-same-origin"
                  className="w-full h-[300px] border-none"
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;font-size:14px;line-height:1.6;}a{color:#4f46e5;}img{max-width:100%;}</style></head><body>${htmlBody}</body></html>`}
                  title="Email Preview"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Provider Selection */}
        <section>
          <h3 className="text-lg font-medium font-heading text-white mb-4">Select Email Provider</h3>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setProvider('gmail')}
              className={`p-4 rounded-xl border text-left transition-all ${
                provider === 'gmail'
                  ? 'bg-white/5 border-white ring-1 ring-white'
                  : 'bg-cp-dark border-cp-border hover:border-cp-muted'
              }`}
            >
              <div className="flex items-center space-x-3 mb-2">
                <svg className={`w-6 h-6 ${provider === 'gmail' ? 'text-white' : 'text-cp-grey'}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
                </svg>
                <span className="font-medium text-white">Gmail SMTP</span>
              </div>
              <p className="text-xs text-cp-grey">Send via your Google account using an App Password.</p>
            </button>

            <button
              onClick={() => setProvider('resend')}
              className={`p-4 rounded-xl border text-left transition-all ${
                provider === 'resend'
                  ? 'bg-white/5 border-white ring-1 ring-white'
                  : 'bg-cp-dark border-cp-border hover:border-cp-muted'
              }`}
            >
              <div className="flex items-center space-x-3 mb-2">
                <svg className={`w-6 h-6 ${provider === 'resend' ? 'text-white' : 'text-cp-grey'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="font-medium text-white">Resend API</span>
              </div>
              <p className="text-xs text-cp-grey">High deliverability sending via Resend API key.</p>
            </button>
          </div>

          {/* Credentials Form */}
          <div className="bg-cp-dark border border-cp-border rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-cp-light mb-1">
                {provider === 'gmail' ? 'Gmail Address' : 'Sender Email (From)'}
              </label>
              <input
                type="email"
                value={providerEmail}
                onChange={(e) => setProviderEmail(e.target.value)}
                placeholder={provider === 'gmail' ? 'you@gmail.com' : 'hello@yourdomain.com'}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cp-light mb-1">
                {provider === 'gmail' ? 'App Password' : 'API Key'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={providerCredential}
                  onChange={(e) => setProviderCredential(e.target.value)}
                  placeholder={provider === 'gmail' ? 'xxxx xxxx xxxx xxxx' : 're_...'}
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-cp-grey hover:text-cp-light text-sm"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Save credentials checkbox */}
            <label className="flex items-center gap-3 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={saveCredentials}
                onChange={(e) => setSaveCredentials(e.target.checked)}
                className="w-4 h-4 rounded border-cp-muted bg-cp-black text-white focus:ring-white/50 focus:ring-offset-0"
              />
              <span className="text-sm text-cp-light">Save credentials for future campaigns</span>
            </label>
          </div>
        </section>
        {/* Sending Options */}
        <section>
          <h3 className="text-lg font-medium font-heading text-white mb-2">Sending Options</h3>
          <p className="text-sm text-cp-grey mb-4">Add a delay between each email to avoid spam filters</p>
          <div className="bg-cp-dark border border-cp-border rounded-xl p-6">
            <label className="block text-sm font-medium text-cp-light mb-3">Delay between emails</label>
            <div className="flex flex-wrap gap-3">
              {DELAY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSendDelay(opt.value)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    sendDelay === opt.value
                      ? 'bg-white text-black'
                      : 'bg-cp-dark border border-cp-border text-cp-grey hover:border-cp-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-cp-muted">
              Selected: {DELAY_OPTIONS.find((o) => o.value === sendDelay)?.label || `${sendDelay} seconds`}
            </p>
          </div>
        </section>
      </div>

      {/* Launch Button */}
      <div className="mt-8 pt-6 border-t border-cp-border space-y-4">
        <button
          onClick={onLaunch}
          disabled={!isValid || isLaunching}
          className="w-full py-4 rounded-xl bg-white text-black font-semibold text-lg hover:bg-cp-light disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-3"
        >
          {isLaunching ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Launching Campaign...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Launch Campaign
            </>
          )}
        </button>

        <button
          onClick={onBack}
          disabled={isLaunching}
          className="w-full py-2.5 text-sm font-medium text-cp-grey hover:text-white transition-colors"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}

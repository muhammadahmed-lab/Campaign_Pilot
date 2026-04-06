'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import useConfirm from '../../hooks/useConfirm';

interface Campaign {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  createdAt: string;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';
  sent: number;
  failed: number;
  recipientCount: number;
  scheduledAt: string | null;
  sendNow: boolean;
  archivedAt: string | null;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [ConfirmDialog, confirm] = useConfirm();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      if (!res.ok) throw new Error('Failed to fetch campaign');
      const data = await res.json();
      setCampaign(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}/status`);
      if (!res.ok) return;
      const data = await res.json();
      setCampaign((prev) => (prev ? { ...prev, ...data } : null));
    } catch (err) {
      console.error('Polling failed:', err);
    }
  }, [id]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    if (campaign?.status === 'sending' || campaign?.status === 'scheduled') {
      pollInterval = setInterval(pollStatus, 2000);
    }
    return () => clearInterval(pollInterval);
  }, [campaign?.status, pollStatus]);

  useEffect(() => {
    let timeInterval: NodeJS.Timeout;
    if (campaign?.status === 'sending') {
      timeInterval = setInterval(() => setNow(Date.now()), 1000);
    }
    return () => clearInterval(timeInterval);
  }, [campaign?.status]);

  if (loading) {
    return (
      <div className="min-h-screen bg-cp-black flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-cp-border border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-cp-black flex flex-col items-center justify-center text-cp-grey">
        <p className="text-lg">{error || 'Campaign not found'}</p>
        <Link href="/" className="mt-6 px-4 py-2 bg-cp-border hover:bg-cp-muted rounded-lg text-sm transition-colors text-cp-light">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const progress = campaign.recipientCount > 0 ? Math.round((campaign.sent / campaign.recipientCount) * 100) : 0;
  const totalAttempted = campaign.sent + campaign.failed;
  const successRate = totalAttempted > 0 ? Math.round((campaign.sent / totalAttempted) * 100) : 0;

  const startTime = campaign.scheduledAt ? new Date(campaign.scheduledAt).getTime() : new Date(campaign.createdAt).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleArchive = async () => {
    if (!(await confirm({ title: 'Archive Campaign', message: 'Images will be removed to save storage, but campaign stats will be kept.', confirmLabel: 'Archive' }))) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivedAt: new Date().toISOString(), htmlBody: '' }),
      });
      if (!res.ok) throw new Error();
      // Clean up images
      await fetch(`/api/campaigns/${id}/images`, { method: 'DELETE' }).catch(() => {});
      toast.success('Campaign archived');
      setCampaign((prev) => prev ? { ...prev, archivedAt: new Date().toISOString(), htmlBody: '' } : null);
    } catch {
      toast.error('Failed to archive campaign');
    }
  };

  const handleDelete = async () => {
    if (!(await confirm({ title: 'Delete Campaign', message: 'Permanently delete this campaign and all its data? This cannot be undone.', variant: 'danger', confirmLabel: 'Delete Forever' }))) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Campaign deleted');
      router.push('/');
    } catch {
      toast.error('Failed to delete campaign');
    }
  };

  const isArchived = !!campaign.archivedAt;

  const statusStyles: Record<string, string> = {
    draft: 'bg-cp-grey/10 text-cp-grey border-cp-grey/20',
    scheduled: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    sending: 'bg-amber-500/10 text-amber-400/80 border-amber-500/20 animate-pulse',
    completed: 'bg-emerald-500/10 text-emerald-400/80 border-emerald-500/20',
    failed: 'bg-red-500/10 text-red-400/80 border-red-500/20',
  };

  return (
    <>
    {ConfirmDialog}
    <div className="min-h-screen bg-cp-black text-cp-light p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between pb-6 border-b border-cp-border/60">
          <div className="flex items-center space-x-4">
            <Link href="/" className="p-2 hover:bg-cp-border rounded-full transition-colors text-cp-grey hover:text-cp-light">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold font-heading tracking-tight text-white">
                {campaign.name || campaign.subject || 'Untitled Campaign'}
              </h1>
              <p className="text-sm text-cp-grey mt-1">Created {format(new Date(campaign.createdAt), 'PPP')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isArchived && (campaign.status === 'completed' || campaign.status === 'failed') && (
              <button
                onClick={handleArchive}
                className="px-4 py-2 text-sm font-medium text-cp-grey hover:text-white bg-cp-dark border border-cp-border hover:border-cp-muted rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Archive
              </button>
            )}
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-sm font-medium text-cp-grey hover:text-red-400 bg-cp-dark border border-cp-border hover:border-red-400/30 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </header>

        {/* Archived Banner */}
        {isArchived && (
          <div className="bg-cp-charcoal border border-cp-border rounded-xl px-6 py-4 flex items-center gap-3">
            <svg className="w-5 h-5 text-cp-grey shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <p className="text-sm text-cp-grey">
              This campaign was archived on {format(new Date(campaign.archivedAt!), 'PPP')}. Images have been removed to save storage.
            </p>
          </div>
        )}

        {/* Status & Progress */}
        <section className="bg-cp-dark border border-cp-border/60 rounded-2xl p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 text-xs font-medium uppercase tracking-wider rounded-full border ${statusStyles[campaign.status]}`}>
                {campaign.status}
              </span>
              <div className="flex items-center text-sm text-cp-grey gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {campaign.sendNow ? 'Sent immediately' : campaign.scheduledAt ? format(new Date(campaign.scheduledAt), 'PPp') : 'Not scheduled'}
              </div>
            </div>

            {(campaign.status === 'sending' || campaign.status === 'completed') && (
              <div className="flex items-center text-sm text-cp-grey gap-2 bg-cp-black/50 px-3 py-1.5 rounded-lg border border-cp-border/50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {campaign.status === 'sending' ? `Elapsed: ${formatElapsed(elapsedSeconds)}` : 'Finished'}
              </div>
            )}
          </div>

          {(campaign.status === 'sending' || campaign.status === 'completed' || campaign.status === 'failed') && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-cp-light">Sending Progress</span>
                <span className="text-white">{progress}%</span>
              </div>
              <div className="w-full bg-cp-border rounded-full h-3 overflow-hidden">
                <div
                  className="bg-white h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-cp-grey text-right">
                {campaign.sent} of {campaign.recipientCount} recipients
              </p>
            </div>
          )}
        </section>

        {/* Stats Grid */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-cp-dark border border-cp-border/60 rounded-xl p-5">
            <p className="text-sm text-cp-grey mb-2">Total Recipients</p>
            <p className="text-3xl font-semibold text-white">{campaign.recipientCount.toLocaleString()}</p>
          </div>
          <div className="bg-cp-dark border border-cp-border/60 rounded-xl p-5">
            <p className="text-sm text-emerald-400/80 mb-2">Successfully Sent</p>
            <p className="text-3xl font-semibold text-white">{campaign.sent.toLocaleString()}</p>
          </div>
          <div className="bg-cp-dark border border-cp-border/60 rounded-xl p-5">
            <p className="text-sm text-red-400/80 mb-2">Failed</p>
            <p className="text-3xl font-semibold text-white">{campaign.failed.toLocaleString()}</p>
          </div>
          <div className="bg-cp-dark border border-cp-border/60 rounded-xl p-5">
            <p className="text-sm text-blue-400 mb-2">Success Rate</p>
            <p className="text-3xl font-semibold text-white">{successRate}%</p>
          </div>
        </section>

        {/* Email Preview (sandboxed iframe to prevent XSS) */}
        {campaign.htmlBody && (
          <section className="bg-cp-dark border border-cp-border/60 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-cp-border/60 bg-cp-charcoal/80">
              <h2 className="font-medium font-heading text-cp-light">Email Content Preview</h2>
            </div>
            <div className="bg-white min-h-[300px]">
              <iframe
                sandbox=""
                className="w-full border-none min-h-[400px]"
                style={{ height: '500px' }}
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;background:#fff;line-height:1.6}a{color:#4f46e5}img{max-width:100%;height:auto}</style></head><body>${campaign.htmlBody}</body></html>`}
                title="Email Preview"
              />
            </div>
          </section>
        )}
      </div>
    </div>
    </>
  );
}

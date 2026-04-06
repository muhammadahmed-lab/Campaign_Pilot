'use client';

import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import type { Campaign } from '../page';
import useConfirm from '../hooks/useConfirm';

export default function CampaignCard({ campaign, onDelete }: { campaign: Campaign; onDelete: (id: string) => void }) {
  const [ConfirmDialog, confirm] = useConfirm();
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'draft':
        return { label: 'Draft', classes: 'bg-cp-muted text-cp-grey', dot: false };
      case 'scheduled':
        return { label: 'Scheduled', classes: 'bg-cp-border text-cp-light', dot: false };
      case 'sending':
        return { label: 'Sending', classes: 'bg-cp-charcoal text-white border border-cp-border', dot: true };
      case 'completed':
        return { label: 'Completed', classes: 'bg-cp-charcoal text-emerald-400/80 border border-cp-border', dot: false };
      case 'failed':
        return { label: 'Failed', classes: 'bg-cp-charcoal text-red-400/80 border border-cp-border', dot: false };
      default:
        return { label: 'Unknown', classes: 'bg-cp-muted text-cp-grey', dot: false };
    }
  };

  const statusConfig = getStatusConfig(campaign.status);

  return (
    <>
    {ConfirmDialog}
    <Link
      href={`/campaign/${campaign.id}`}
      className="group relative flex flex-col justify-between bg-cp-dark border border-cp-border rounded-xl p-6 hover:border-cp-muted transition-all duration-200"
    >
      {/* Delete Button */}
      <button
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (await confirm({ title: 'Delete Campaign', message: 'Are you sure you want to delete this campaign? This action cannot be undone.', variant: 'danger', confirmLabel: 'Delete' })) {
            onDelete(campaign.id);
          }
        }}
        className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-cp-grey hover:text-red-400 hover:bg-cp-charcoal transition-all"
        title="Delete campaign"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono font-medium ${statusConfig.classes}`}>
            {statusConfig.dot && (
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            )}
            {statusConfig.label}
          </span>
          <span className="text-xs text-cp-grey font-mono mr-6">
            {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}
          </span>
        </div>

        <h3 className="mb-1 line-clamp-2 text-lg font-heading text-white group-hover:text-cp-light transition-colors">
          {campaign.name || campaign.subject || 'Untitled Campaign'}
        </h3>
        {campaign.name && campaign.subject && (
          <p className="mb-3 text-sm text-cp-grey line-clamp-1">Subject: {campaign.subject}</p>
        )}
        {!(campaign.name && campaign.subject) && <div className="mb-3" />}

        <div className="space-y-3">
          <div className="flex items-center text-sm text-cp-grey">
            <svg className="mr-2 h-4 w-4 text-cp-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>
              {campaign.sendNow
                ? 'Send immediately'
                : campaign.scheduledAt
                ? format(new Date(campaign.scheduledAt), 'MMM d, yyyy \u2022 h:mm a')
                : 'Not scheduled'}
            </span>
          </div>

          <div className="flex items-center text-sm text-cp-grey">
            <svg className="mr-2 h-4 w-4 text-cp-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{campaign.recipientCount.toLocaleString()} recipient{campaign.recipientCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {(campaign.status === 'completed' || campaign.status === 'failed') && (
        <div className="mt-6 border-t border-cp-border pt-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-emerald-400/80 font-mono">{campaign.sent.toLocaleString()}</span>
              <span className="text-cp-grey">sent</span>
            </div>
            {campaign.failed > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-red-400/80 font-mono">{campaign.failed.toLocaleString()}</span>
                <span className="text-cp-grey">failed</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Link>
    </>
  );
}

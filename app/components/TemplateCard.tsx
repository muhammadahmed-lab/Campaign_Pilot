'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import useConfirm from '../hooks/useConfirm';

export interface TemplateSummary {
  id: string;
  name: string;
  subject: string;
  templateStyle: string;
  updatedAt: string;
}

export default function TemplateCard({
  template,
  onDelete,
}: {
  template: TemplateSummary;
  onDelete: (id: string) => void;
}) {
  const [ConfirmDialog, confirm] = useConfirm();

  return (
    <>
      {ConfirmDialog}
      <Link
        href={`/campaign/new?templateId=${template.id}`}
        className="group relative flex flex-col justify-between bg-cp-dark border border-cp-border rounded-xl p-6 hover:border-cp-muted transition-all duration-200"
      >
        <button
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (
              await confirm({
                title: 'Delete Template',
                message: 'Are you sure you want to delete this template? Existing campaigns that used it are not affected.',
                variant: 'danger',
                confirmLabel: 'Delete',
              })
            ) {
              onDelete(template.id);
            }
          }}
          className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-cp-grey hover:text-red-400 hover:bg-cp-charcoal transition-all"
          title="Delete template"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono font-medium bg-cp-charcoal text-cp-light border border-cp-border uppercase tracking-wider">
              {template.templateStyle}
            </span>
            <span className="text-xs text-cp-grey font-mono mr-6">
              {formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true })}
            </span>
          </div>

          <h3 className="mb-1 line-clamp-2 text-lg font-heading text-white group-hover:text-cp-light transition-colors">
            {template.name}
          </h3>
          {template.subject ? (
            <p className="mb-3 text-sm text-cp-grey line-clamp-1">Subject: {template.subject}</p>
          ) : (
            <div className="mb-3" />
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-cp-light group-hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Start campaign from this template
        </div>
      </Link>
    </>
  );
}

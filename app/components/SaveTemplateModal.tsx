'use client';

import { useEffect, useRef, useState } from 'react';

interface SaveTemplateModalProps {
  open: boolean;
  initialName?: string;
  onCancel: () => void;
  onSave: (name: string) => Promise<void> | void;
}

export default function SaveTemplateModal({ open, initialName, onCancel, onSave }: SaveTemplateModalProps) {
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName((initialName || '').slice(0, 100));
      setIsSaving(false);
      // Defer focus until after mount paint
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [open, initialName]);

  if (!open) return null;

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= 100 && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-cp-dark border border-cp-border p-6 rounded-lg shadow-xl max-w-md w-full">
        <h3 className="text-lg font-semibold text-white mb-2 font-heading">Save as Template</h3>
        <p className="text-sm text-cp-grey mb-4">
          Save this design so you can reuse it for future campaigns.
        </p>
        <label htmlFor="template-name" className="block text-xs text-cp-grey mb-1 uppercase tracking-wider">
          Template name
        </label>
        <input
          id="template-name"
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKey}
          maxLength={100}
          placeholder="e.g. Welcome Email"
          className="w-full bg-cp-black border border-cp-border focus:border-white/50 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
        />
        <p className="text-xs text-cp-muted mt-1">{trimmed.length}/100</p>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 border border-cp-muted text-cp-light hover:text-white rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 bg-white text-black hover:bg-cp-light rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

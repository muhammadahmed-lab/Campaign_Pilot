'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '@/app/types';

interface StepTemplateProps {
  campaignId: string;
  chatMessages: ChatMessage[];
  subject: string;
  setSubject: (s: string) => void;
  htmlBody: string;
  setHtmlBody: (h: string) => void;
  templateStyle: string;
  setTemplateStyle: (s: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const TEMPLATE_STYLES = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'professional', label: 'Professional' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'product-update', label: 'Product Update' },
];

// Simple HTML formatter for readable code view
function formatHtml(html: string): string {
  let formatted = '';
  let indent = 0;
  // Add newlines before/after tags
  const parts = html.replace(/>\s*</g, '>\n<').split('\n');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Decrease indent for closing tags
    if (trimmed.startsWith('</')) indent = Math.max(0, indent - 1);
    formatted += '  '.repeat(indent) + trimmed + '\n';
    // Increase indent for opening tags (not self-closing, not closing)
    if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>') && !trimmed.startsWith('<!') && !trimmed.startsWith('<meta') && !trimmed.startsWith('<link') && !trimmed.startsWith('<br') && !trimmed.startsWith('<hr') && !trimmed.startsWith('<img')) {
      indent++;
    }
  }
  return formatted.trim();
}

export default function StepTemplate({
  campaignId,
  chatMessages,
  subject,
  setSubject,
  htmlBody,
  setHtmlBody,
  templateStyle,
  setTemplateStyle,
  onNext,
  onBack,
}: StepTemplateProps) {
  const [activeTab, setActiveTab] = useState<'visual' | 'code'>('visual');
  const [codeValue, setCodeValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null); // URL waiting for size selection

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);

  // Load HTML into contenteditable iframe
  const loadIntoIframe = useCallback((html: string) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html><head>
        <meta charset="utf-8">
        <style>
          body { margin:0; padding:24px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#1a1a1a; background:#fff; line-height:1.6; min-height:100vh; cursor:text; }
          a { color:#4f46e5; text-decoration:underline; }
          img { max-width:100%; height:auto; border-radius:8px; display:block; margin:16px 0; }
          [contenteditable]:focus { outline:2px solid #3b82f6; outline-offset:2px; border-radius:4px; }
          [contenteditable]:hover { outline:1px dashed #94a3b8; outline-offset:2px; border-radius:4px; }
        </style>
      </head>
      <body contenteditable="true">${html}</body></html>
    `);
    doc.close();

    doc.body.addEventListener('input', () => {
      setHtmlBody(doc.body.innerHTML);
    });
  }, [setHtmlBody]);

  // Load content into iframe when in visual mode
  useEffect(() => {
    if (activeTab === 'visual' && htmlBody && iframeRef.current) {
      const timer = setTimeout(() => loadIntoIframe(htmlBody), 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, htmlBody, loadIntoIframe]);

  // Auto-generate on mount if empty
  useEffect(() => {
    if (!htmlBody && !isGenerating && chatMessages.length > 0) {
      generateTemplate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateTemplate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/generate-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages, campaignId, templateStyle }),
      });
      if (!res.ok) throw new Error('Failed to generate template');
      const data = await res.json();
      if (data.subject) setSubject(data.subject);
      if (data.html) setHtmlBody(data.html);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate template.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('campaignId', campaignId);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();

      setPendingImage(url);
    } catch {
      alert('Failed to upload image.');
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const insertImageWithSize = (url: string, maxWidth: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    const wrapper = doc.createElement('div');
    wrapper.style.textAlign = 'center';
    wrapper.style.margin = '24px 0';

    const img = doc.createElement('img');
    img.src = url;
    img.setAttribute('width', maxWidth);
    img.style.width = '100%';
    img.style.maxWidth = maxWidth;
    img.style.height = 'auto';
    img.style.display = 'block';
    img.style.margin = '0 auto';
    img.style.borderRadius = '8px';

    wrapper.appendChild(img);
    doc.body.appendChild(wrapper);
    setHtmlBody(doc.body.innerHTML);
    setPendingImage(null);
  };

  const handleHtmlFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setHtmlBody(content);
    };
    reader.readAsText(file);
    if (htmlInputRef.current) htmlInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Top Row: Back & Subject */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-cp-grey hover:text-white transition-colors w-fit"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>

        <div className="flex-1 flex items-center gap-3 bg-cp-dark border border-cp-border rounded-lg px-4 py-2 focus-within:border-white/50 transition-all">
          <span className="text-cp-grey text-sm font-medium uppercase tracking-wider">Subject:</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter email subject..."
            className="flex-1 bg-transparent border-none text-white font-heading text-lg focus:outline-none placeholder:text-cp-muted"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400/80 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Template Style Selector */}
      <div>
        <p className="text-xs font-mono text-cp-grey mb-2 uppercase tracking-wider">Template Style</p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_STYLES.map((style) => (
            <button
              key={style.value}
              onClick={() => setTemplateStyle(style.value)}
              className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                templateStyle === style.value
                  ? 'bg-white text-black border-white'
                  : 'bg-cp-dark text-cp-light border-cp-border hover:border-cp-grey'
              }`}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      <input ref={htmlInputRef} type="file" accept=".html,.htm" className="hidden" onChange={handleHtmlFileUpload} />

      {/* Editor Area */}
      <div className="flex-1 flex flex-col bg-cp-dark border border-cp-border rounded-xl overflow-hidden min-h-[600px]">
        {/* Tabs */}
        <div className="flex items-center border-b border-cp-border bg-cp-charcoal px-2 pt-2">
          <button
            onClick={() => { setHtmlBody(codeValue || htmlBody); setActiveTab('visual'); }}
            className={`flex items-center gap-2 px-4 py-3 rounded-t-lg text-sm transition-colors border-b-2 ${
              activeTab === 'visual'
                ? 'bg-cp-dark border-white text-white'
                : 'border-transparent text-cp-grey hover:text-cp-light hover:bg-cp-dark/50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Visual Editor
          </button>
          <button
            onClick={() => { setCodeValue(formatHtml(htmlBody)); setActiveTab('code'); }}
            className={`flex items-center gap-2 px-4 py-3 rounded-t-lg text-sm transition-colors border-b-2 ${
              activeTab === 'code'
                ? 'bg-cp-dark border-white text-white'
                : 'border-transparent text-cp-grey hover:text-cp-light hover:bg-cp-dark/50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            HTML Code
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-cp-charcoal border-b border-cp-border">
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={activeTab === 'code'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-cp-grey hover:text-white hover:bg-cp-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Insert Image
          </button>
          <span className="text-xs font-mono text-cp-muted">
            {activeTab === 'visual' ? 'Click on text to edit directly' : 'Editing raw HTML'}
          </span>
        </div>

        {/* Editor Content */}
        {/* Image Size Picker */}
        {pendingImage && (
          <div className="px-4 py-4 bg-cp-dark border-b border-cp-border">
            <p className="text-sm text-cp-light mb-3">Choose image size:</p>
            <div className="flex items-end gap-3">
              {[
                { label: 'Small', width: '150px', preview: 'h-10 w-10' },
                { label: 'Medium', width: '300px', preview: 'h-10 w-16' },
                { label: 'Large', width: '450px', preview: 'h-10 w-24' },
                { label: 'Full Width', width: '100%', preview: 'h-10 w-32' },
              ].map((size) => (
                <button
                  key={size.label}
                  onClick={() => insertImageWithSize(pendingImage, size.width)}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className={`${size.preview} rounded border border-cp-border group-hover:border-white bg-cp-charcoal transition-colors overflow-hidden`}>
                    <img src={pendingImage} alt="" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-xs text-cp-grey group-hover:text-white transition-colors">{size.label}</span>
                </button>
              ))}
              <button
                onClick={() => setPendingImage(null)}
                className="ml-auto text-xs text-cp-grey hover:text-red-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 relative flex flex-col">
          {activeTab === 'visual' ? (
            <div className="flex-1 flex flex-col bg-gray-100">
              {/* Mock Email Chrome */}
              <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-col gap-1.5 shrink-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-14 text-xs">From:</span>
                  <span className="text-gray-700">you@yourcompany.com</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-14 text-xs">To:</span>
                  <span className="text-gray-700">{'{{name}}'} &lt;recipient@example.com&gt;</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-14 text-xs">Subject:</span>
                  <span className="text-gray-900 font-medium">{subject || 'No subject'}</span>
                </div>
              </div>

              {/* Iframe */}
              <div className="flex-1 relative bg-white mx-auto w-full max-w-3xl shadow-sm border-x border-gray-200">
                {isGenerating && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-8 h-8 text-black animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-sm font-mono text-black uppercase tracking-widest">Generating...</span>
                    </div>
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  className="w-full border-none"
                  style={{ minHeight: '500px', height: '600px' }}
                  title="Email Editor"
                />
              </div>
            </div>
          ) : (
            <textarea
              value={codeValue}
              onChange={(e) => { setCodeValue(e.target.value); setHtmlBody(e.target.value); }}
              spellCheck={false}
              wrap="off"
              className="flex-1 w-full bg-cp-black text-cp-light font-mono text-sm p-6 resize-none focus:outline-none whitespace-pre overflow-x-auto leading-relaxed min-h-[500px]"
              placeholder="<!-- Paste or edit raw HTML here -->"
            />
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-cp-border">
        <div className="flex gap-3 w-full sm:w-auto">
          <button
            onClick={generateTemplate}
            disabled={isGenerating}
            className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg border border-cp-muted text-cp-light hover:bg-cp-border hover:text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50 font-medium"
          >
            <svg className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Regenerate
          </button>
          <button
            onClick={() => htmlInputRef.current?.click()}
            className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg border border-cp-muted text-cp-light hover:bg-cp-border hover:text-white transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload HTML
          </button>
        </div>

        <button
          onClick={onNext}
          disabled={isGenerating || !htmlBody}
          className="w-full sm:w-auto px-8 py-2.5 rounded-lg bg-white text-black hover:bg-cp-light transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Approve & Continue
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

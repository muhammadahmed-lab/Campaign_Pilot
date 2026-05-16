'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import type { ChatMessage, ImageAsset } from '@/app/types';
import { splitHtmlDoc, assembleHtml } from '@/app/lib/htmlEnvelope';

interface StepTemplateProps {
  campaignId: string;
  chatMessages: ChatMessage[];
  imageAssets?: ImageAsset[];
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

export default function StepTemplate({
  campaignId,
  chatMessages,
  imageAssets,
  subject,
  setSubject,
  htmlBody,
  setHtmlBody,
  templateStyle,
  setTemplateStyle,
  onNext,
  onBack,
}: StepTemplateProps) {
  const [activeTab, setActiveTab] = useState<'visual' | 'code' | 'preview'>('visual');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [codeValue, setCodeValue] = useState(htmlBody);

  // lastLoadedRef tracks the htmlBody value we last wrote into (or read from)
  // the Visual iframe. The input listener stamps this BEFORE calling setHtmlBody
  // so the reload effect below sees `htmlBody === lastLoadedRef.current` and
  // skips — preventing the loop that wiped edits in the original implementation.
  const lastLoadedRef = useRef<string>('');
  const htmlBodyRef = useRef(htmlBody);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const htmlFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    htmlBodyRef.current = htmlBody;
    setCodeValue(htmlBody);
  }, [htmlBody]);

  const loadIntoIframe = useCallback(
    (fullHtml: string) => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument;
      if (!doc) return;

      doc.open();
      doc.write(fullHtml);
      doc.close();

      if (doc.body) {
        doc.body.setAttribute('contenteditable', 'true');
        doc.body.addEventListener('input', () => {
          const { before, after } = splitHtmlDoc(htmlBodyRef.current);
          const newBody = doc.body.innerHTML;
          const reassembled = assembleHtml(before, newBody, after);
          lastLoadedRef.current = reassembled;
          setHtmlBody(reassembled);
        });
      }

      lastLoadedRef.current = fullHtml;
    },
    [setHtmlBody]
  );

  // Reload the Visual iframe only on EXTERNAL htmlBody changes:
  //   - Code-tab edits (handleCodeChange writes htmlBody directly)
  //   - HTML file upload
  //   - Regenerate
  //   - Draft hydration (resumeId path in parent)
  // Skipped while user is typing in Visual (lastLoadedRef matches htmlBody).
  useEffect(() => {
    if (activeTab !== 'visual') return;
    if (!iframeRef.current) return;
    if (htmlBody === lastLoadedRef.current) return;
    loadIntoIframe(htmlBody);
  }, [activeTab, htmlBody, loadIntoIframe]);

  const generateTemplate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/generate-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages, campaignId, templateStyle, imageAssets }),
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
  }, [chatMessages, campaignId, templateStyle, imageAssets, setHtmlBody, setSubject]);

  // Auto-generate on mount if empty
  useEffect(() => {
    if (!htmlBody && !isGenerating && chatMessages.length > 0) {
      generateTemplate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCodeValue(val);
    setHtmlBody(val);
  };

  const handleHtmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) setHtmlBody(content);
    };
    reader.readAsText(file);
    if (htmlFileInputRef.current) htmlFileInputRef.current.value = '';
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result;
        if (typeof result === 'string') resolve(result);
        else reject(new Error('FileReader returned non-string result'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
      reader.readAsDataURL(file);
    });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('campaignId', campaignId);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      setPendingImageUrl(url);
      setShowImagePicker(true);
    } catch {
      // Storage unreachable — fall back to embedding as a data: URI. The iframe
      // renders base64 natively. Warn the user since this can bloat the email.
      try {
        const dataUrl = await readFileAsDataUrl(file);
        setPendingImageUrl(dataUrl);
        setShowImagePicker(true);
        toast('Storage unavailable — embedding image inline. This may bloat the email.', { icon: '⚠️' });
      } catch {
        toast.error('Failed to load image');
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const insertImage = (maxWidth: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !pendingImageUrl) return;
    const p = doc.createElement('p');
    p.setAttribute('style', 'text-align:center;margin:16px 0;');
    const img = doc.createElement('img');
    img.src = pendingImageUrl;
    img.setAttribute('alt', '');
    img.setAttribute(
      'style',
      `max-width:${maxWidth};width:100%;height:auto;display:block;margin:0 auto;border-radius:8px;`
    );
    p.appendChild(img);
    doc.body.appendChild(p);
    const { before, after } = splitHtmlDoc(htmlBodyRef.current);
    const reassembled = assembleHtml(before, doc.body.innerHTML, after);
    lastLoadedRef.current = reassembled;
    setHtmlBody(reassembled);
    setShowImagePicker(false);
    setPendingImageUrl(null);
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Top Row: Back */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-cp-grey hover:text-white transition-colors w-fit"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>
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
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      <input ref={htmlFileInputRef} type="file" accept=".html,.htm" className="hidden" onChange={handleHtmlUpload} />

      {/* Editor Area */}
      <div className="flex-1 flex flex-col bg-cp-dark border border-cp-border rounded-xl overflow-hidden min-h-[600px]">
        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-cp-border bg-cp-charcoal px-2 pt-2">
          <div className="flex">
            {(['visual', 'code', 'preview'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'bg-cp-dark border-white text-white'
                    : 'border-transparent text-cp-grey hover:text-cp-light hover:bg-cp-dark/50'
                }`}
              >
                {tab === 'visual' ? 'Visual Editor' : tab === 'code' ? 'HTML Code' : 'Preview'}
              </button>
            ))}
          </div>
          {activeTab === 'visual' && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 mr-2 rounded-md text-sm text-cp-grey hover:text-white hover:bg-cp-border transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Insert Image
            </button>
          )}
        </div>

        {/* Email composer chrome — Subject is the editable one (like Gmail) */}
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
            <label htmlFor="campaign-subject" className="text-gray-500 w-14 text-xs cursor-text">Subject:</label>
            <input
              id="campaign-subject"
              name="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              autoComplete="off"
              placeholder="Enter subject..."
              className="flex-1 bg-transparent border-none text-gray-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 rounded-sm placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Editor content panes — all three always mounted, toggle via `display`.
            Keeping them mounted prevents the Visual iframe from being recreated
            on tab switch, which would lose its document and listener. */}
        <div className="flex-1 relative">
          {isGenerating && (
            <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-8 h-8 text-black animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm font-mono text-black uppercase tracking-widest">Generating...</span>
              </div>
            </div>
          )}

          <div style={{ display: activeTab === 'visual' ? 'block' : 'none' }} className="h-full">
            <iframe
              ref={iframeRef}
              className="w-full bg-white border-none"
              style={{ minHeight: '600px', height: '600px' }}
              title="Email Editor"
            />
          </div>

          <div style={{ display: activeTab === 'code' ? 'block' : 'none' }} className="h-full">
            <textarea
              value={codeValue}
              onChange={handleCodeChange}
              spellCheck={false}
              wrap="off"
              className="w-full bg-cp-black text-cp-light font-mono text-sm p-6 resize-none focus:outline-none whitespace-pre overflow-x-auto leading-relaxed min-h-[600px]"
              placeholder="<!-- Paste or edit raw HTML here -->"
            />
          </div>

          <div style={{ display: activeTab === 'preview' ? 'block' : 'none' }} className="h-full">
            <iframe
              srcDoc={htmlBody}
              sandbox=""
              className="w-full min-h-[600px] border-none bg-white"
              title="Email Preview"
            />
          </div>
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
            onClick={() => htmlFileInputRef.current?.click()}
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

      {/* Image Size Picker Modal */}
      {showImagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-cp-dark border border-cp-border p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-4 font-heading">Select Image Size</h3>
            <div className="flex flex-col space-y-3">
              <button onClick={() => insertImage('150px')} className="px-4 py-2 bg-cp-charcoal hover:bg-cp-border text-white rounded transition-colors text-left">Small (150px)</button>
              <button onClick={() => insertImage('300px')} className="px-4 py-2 bg-cp-charcoal hover:bg-cp-border text-white rounded transition-colors text-left">Medium (300px)</button>
              <button onClick={() => insertImage('450px')} className="px-4 py-2 bg-cp-charcoal hover:bg-cp-border text-white rounded transition-colors text-left">Large (450px)</button>
              <button onClick={() => insertImage('100%')} className="px-4 py-2 bg-cp-charcoal hover:bg-cp-border text-white rounded transition-colors text-left">Full Width</button>
            </div>
            <button
              onClick={() => { setShowImagePicker(false); setPendingImageUrl(null); }}
              className="mt-6 w-full px-4 py-2 border border-cp-muted text-cp-light hover:text-white rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

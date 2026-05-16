import { splitHtmlDoc, assembleHtml } from '@/app/lib/htmlEnvelope';

export interface CompactResult {
  html: string;
  replaced: number;
  failed: number;
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = dataUrl.match(/^data:([^;,]+)(?:;base64)?,(.*)$/i);
  if (!match) return null;
  const [, mime, payload] = match;
  const isBase64 = /;base64,/i.test(dataUrl);
  try {
    if (isBase64) {
      const binary = atob(payload);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime || 'application/octet-stream' });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime || 'text/plain' });
  } catch {
    return null;
  }
}

// Scans an HTML email body for <img src="data:..."> tags, uploads each to
// /api/upload, and swaps the src with the returned public URL. Keeps the
// htmlBody small enough to stay under provider size limits when sending.
//
// Client-side only — relies on DOMParser, atob, FormData, fetch.
export async function compactInlineImages(html: string, campaignId: string): Promise<CompactResult> {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return { html, replaced: 0, failed: 0 };
  }
  const { before, bodyHtml, after } = splitHtmlDoc(html);
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<!doctype html><body>${bodyHtml}</body>`, 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img'));
  let replaced = 0;
  let failed = 0;

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || !src.startsWith('data:')) return;
      const blob = dataUrlToBlob(src);
      if (!blob) {
        failed += 1;
        return;
      }
      const mime = blob.type || 'image/png';
      const ext = (mime.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
      const filename = `inline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const file = new File([blob], filename, { type: mime });
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('campaignId', campaignId);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        const json = await res.json();
        if (json && typeof json.url === 'string') {
          img.setAttribute('src', json.url);
          replaced += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    })
  );

  return { html: assembleHtml(before, doc.body.innerHTML, after), replaced, failed };
}

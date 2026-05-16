// Splits and reassembles an email HTML document so callers can edit only the
// body content while preserving DOCTYPE, head, and body opening tag (with its
// inline styles intact).

export function splitHtmlDoc(html: string): { before: string; bodyHtml: string; after: string } {
  const match = html.match(/^([\s\S]*<body[^>]*>)([\s\S]*)(<\/body>[\s\S]*)$/i);
  if (match) return { before: match[1], bodyHtml: match[2], after: match[3] };
  const defaultBefore = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#fff;line-height:1.6;">`;
  const defaultAfter = `</body></html>`;
  return { before: defaultBefore, bodyHtml: html, after: defaultAfter };
}

export function assembleHtml(before: string, body: string, after: string): string {
  return `${before}${body}${after}`;
}

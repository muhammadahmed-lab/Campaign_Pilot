import juice from 'juice';

// Extracts every CSS rule from <style> blocks in the html and writes them
// as inline style="..." attributes on the matching elements. Gmail strips
// <style> blocks in many contexts; inline styles always survive.
//
// Does NOT fix layout primitives that email clients don't support at all
// (flexbox, grid, ::before/::after, position:absolute, etc) — callers must
// still write table-based, email-safe HTML for those.
export function inlineCss(html: string): string {
  if (!html || !html.trim()) return html;
  try {
    return juice(html, {
      removeStyleTags: true,
      preserveImportant: true,
      preserveMediaQueries: true,
    });
  } catch (err) {
    // Fail soft — send the original HTML rather than blocking the campaign.
    console.error('inlineCss error:', err);
    return html;
  }
}

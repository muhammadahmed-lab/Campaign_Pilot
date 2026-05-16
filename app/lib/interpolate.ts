import type { Recipient } from '@/app/types';

// Replaces {{key}} tokens in a template with values from a recipient record.
// Built-ins:
//   {{name}}       — recipient.name (trimmed)
//   {{firstname}}  — first whitespace-delimited word of name
//   {{lastname}}   — remaining words of name
//   {{email}}      — recipient.email
// Custom: any additional Recipient field (from CSV columns), looked up
// case-insensitively. Unknown tokens render as empty string (NOT the literal
// `{{token}}`) so accidental typos don't leak into sent emails.
export function interpolate(template: string, recipient: Recipient): string {
  const fullName = (recipient.name || '').trim();
  const parts = fullName.split(/\s+/);
  const builtins: Record<string, string> = {
    name: fullName,
    firstname: parts[0] || '',
    lastname: parts.slice(1).join(' ') || '',
    email: recipient.email,
  };
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const lowered = key.toLowerCase();
    if (lowered in builtins) return builtins[lowered];
    const value = recipient[lowered] ?? recipient[key];
    return typeof value === 'string' ? value : '';
  });
}

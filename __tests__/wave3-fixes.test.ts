import { interpolate } from '@/app/lib/interpolate';
import type { Recipient } from '@/app/types';

describe('interpolate — built-in variables', () => {
  it('substitutes {{name}} with the trimmed full name', () => {
    const r: Recipient = { email: 'a@b.com', name: '  Jane Doe  ' };
    expect(interpolate('Hello {{name}}!', r)).toBe('Hello Jane Doe!');
  });

  it('substitutes {{firstname}} with the first whitespace-delimited word', () => {
    const r: Recipient = { email: 'a@b.com', name: 'Jane Mary Doe' };
    expect(interpolate('Hi {{firstname}}', r)).toBe('Hi Jane');
  });

  it('substitutes {{lastname}} with everything after the first word', () => {
    const r: Recipient = { email: 'a@b.com', name: 'Jane Mary Doe' };
    expect(interpolate('Mx. {{lastname}}', r)).toBe('Mx. Mary Doe');
  });

  it('substitutes {{email}} with the recipient email', () => {
    const r: Recipient = { email: 'jane@example.com' };
    expect(interpolate('Sent to {{email}}', r)).toBe('Sent to jane@example.com');
  });

  it('returns empty firstname/lastname when name is missing', () => {
    const r: Recipient = { email: 'a@b.com' };
    // Both tokens substitute to empty, leaving the literal space between them.
    expect(interpolate('Hi {{firstname}} {{lastname}}.', r)).toBe('Hi  .');
  });

  it('returns empty lastname when name is a single word', () => {
    const r: Recipient = { email: 'a@b.com', name: 'Jane' };
    expect(interpolate('{{firstname}}/{{lastname}}', r)).toBe('Jane/');
  });
});

describe('interpolate — custom CSV columns', () => {
  it('substitutes a custom column by lowercase key', () => {
    const r: Recipient = { email: 'a@b.com', company: 'Acme' };
    expect(interpolate('Welcome to {{company}}', r)).toBe('Welcome to Acme');
  });

  it('matches placeholders case-insensitively against custom keys', () => {
    const r: Recipient = { email: 'a@b.com', industry: 'tech' };
    expect(interpolate('{{INDUSTRY}}', r)).toBe('tech');
  });

  it('handles multiple substitutions in the same template', () => {
    const r: Recipient = {
      email: 'jane@acme.com',
      name: 'Jane Doe',
      company: 'Acme',
      role: 'CEO',
    };
    expect(interpolate('Hi {{firstname}}, {{role}} of {{company}}', r)).toBe(
      'Hi Jane, CEO of Acme'
    );
  });

  it('renders unknown placeholders as empty string (not the literal token)', () => {
    const r: Recipient = { email: 'a@b.com', name: 'Jane' };
    expect(interpolate('Hi {{firstname}}, your {{nonexistent}} value.', r)).toBe(
      'Hi Jane, your  value.'
    );
  });

  it('does not match tokens that contain dashes or punctuation outside [a-zA-Z0-9_]', () => {
    const r: Recipient = { email: 'a@b.com' };
    // The regex only matches \w-style chars; {{first-name}} should remain literal.
    expect(interpolate('Hi {{first-name}}', r)).toBe('Hi {{first-name}}');
  });

  it('tolerates whitespace inside the braces', () => {
    const r: Recipient = { email: 'a@b.com', name: 'Jane' };
    expect(interpolate('Hi {{  name  }}!', r)).toBe('Hi Jane!');
  });
});

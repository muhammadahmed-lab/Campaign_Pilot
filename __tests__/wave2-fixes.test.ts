const mockResendBatchSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    batch: { send: mockResendBatchSend },
  })),
}));

jest.mock('inngest', () => ({
  Inngest: jest.fn().mockImplementation(() => ({
    createFunction: jest.fn((options, trigger, fn) => ({
      id: options.id,
      options,
      trigger,
      fn,
      run: fn,
    })),
    send: jest.fn(),
  })),
}));

jest.mock('@/app/lib/auth', () => ({ auth: jest.fn() }));

jest.mock('@/app/lib/prisma', () => ({
  prisma: {
    campaign: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/app/lib/supabase', () => ({
  supabase: { storage: { from: jest.fn() } },
}));

jest.mock('@/app/lib/inngest', () => ({
  inngest: { send: jest.fn() },
  launchCampaign: { id: 'launch-campaign' },
  cleanupOldDrafts: { id: 'cleanup-old-drafts' },
}));

jest.mock('@/app/lib/crypto', () => ({
  encrypt: jest.fn((s: string) => s),
  decrypt: jest.fn((s: string) => s),
}));

jest.mock('@/app/lib/resend', () => ({ sendBatch: jest.fn() }));
jest.mock('@/app/lib/smtp', () => ({ sendSmtpBatch: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST as launchPOST } from '@/app/api/campaigns/[id]/launch/route';
import { DELETE as campaignDELETE } from '@/app/api/campaigns/[id]/route';
import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { supabase } from '@/app/lib/supabase';
import { inngest } from '@/app/lib/inngest';
import { encrypt, decrypt } from '@/app/lib/crypto';

const ORIGINAL_ENV = process.env;

const mockAuth = auth as unknown as jest.Mock;
const mockCampaignFindFirst = prisma.campaign.findFirst as unknown as jest.Mock;
const mockCampaignFindUnique = prisma.campaign.findUnique as unknown as jest.Mock;
const mockCampaignUpdate = prisma.campaign.update as unknown as jest.Mock;
const mockCampaignDelete = prisma.campaign.delete as unknown as jest.Mock;
const mockStorageFrom = supabase.storage.from as unknown as jest.Mock;
const mockInngestSend = inngest.send as unknown as jest.Mock;
const mockEncrypt = encrypt as unknown as jest.Mock;
const mockDecrypt = decrypt as unknown as jest.Mock;

let mockStorageList: jest.Mock;
let mockStorageRemove: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();

  process.env.OPENAI_API_KEY = 'test-key';

  mockStorageList = jest.fn().mockResolvedValue({ data: [], error: null });
  mockStorageRemove = jest.fn().mockResolvedValue({ data: null, error: null });
  mockStorageFrom.mockReturnValue({
    list: mockStorageList,
    remove: mockStorageRemove,
  });

  mockAuth.mockResolvedValue({ user: { id: 'user-A' } });
  mockEncrypt.mockImplementation((s: string) => s);
  mockDecrypt.mockImplementation((s: string) => s);

  const resendModule = jest.requireMock('resend') as { Resend: jest.Mock };
  resendModule.Resend.mockImplementation(() => ({
    batch: { send: mockResendBatchSend },
  }));
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('POST /api/campaigns/[id]/launch — size cap (A2)', () => {
  it('returns 413 Payload too large when content-length exceeds 5MB', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-A' } });

    const req = new NextRequest('http://localhost/api/campaigns/cmp-1/launch', {
      method: 'POST',
      headers: { 'content-length': String(6 * 1024 * 1024) },
      body: JSON.stringify({ recipients: [{ email: 'a@b.com' }] }),
    });

    const res = await launchPOST(req, { params: { id: 'cmp-1' } });
    const json = await res.json();

    expect(res.status).toBe(413);
    expect(json).toEqual({ error: 'Payload too large' });
    expect(mockCampaignFindUnique).not.toHaveBeenCalled();
    expect(mockCampaignUpdate).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});

describe('POST /api/campaigns/[id]/launch — recipient dedup (A1)', () => {
  beforeEach(() => {
    mockCampaignFindUnique.mockResolvedValue({
      id: 'cmp-1',
      userId: 'user-A',
      status: 'draft',
      provider: 'gmail',
      providerEmail: 'me@x.com',
      providerCredential: 'plaintext',
      scheduledAt: null,
      sendNow: true,
      sendDelay: 0,
    });
    mockCampaignUpdate.mockResolvedValue({
      id: 'cmp-1',
      status: 'sending',
      recipientCount: 1,
      sent: 0,
      failed: 0,
    });
    mockInngestSend.mockResolvedValue({ ids: ['evt-1'] });
  });

  it('collapses duplicate recipients by normalized email before updating and enqueueing', async () => {
    const req = new NextRequest('http://localhost/api/campaigns/cmp-1/launch', {
      method: 'POST',
      body: JSON.stringify({
        recipients: Array(5).fill({ email: 'alice@example.com', name: 'Alice' }),
      }),
    });

    const res = await launchPOST(req, { params: { id: 'cmp-1' } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, campaignId: 'cmp-1' });

    expect(mockCampaignUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'cmp-1' }),
        data: expect.objectContaining({
          recipientCount: 1,
          sent: 0,
          failed: 0,
        }),
      }),
    );

    expect(mockInngestSend).toHaveBeenCalledTimes(1);
    const sentArg = mockInngestSend.mock.calls[0][0];
    const event = Array.isArray(sentArg) ? sentArg[0] : sentArg;

    expect(event.data.recipients).toHaveLength(1);
    expect(event.data.recipients[0].email).toBe('alice@example.com');
  });

  it('returns 400 No valid recipients when all recipients are empty after normalization and deduplication', async () => {
    const req = new NextRequest('http://localhost/api/campaigns/cmp-1/launch', {
      method: 'POST',
      body: JSON.stringify({
        recipients: [{ email: '' }, { email: '   ' }],
      }),
    });

    const res = await launchPOST(req, { params: { id: 'cmp-1' } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'No valid recipients' });
    expect(mockCampaignFindUnique).not.toHaveBeenCalled();
    expect(mockCampaignUpdate).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/campaigns/[id] — propagates storage errors (A3)', () => {
  beforeEach(() => {
    mockCampaignFindFirst.mockResolvedValue({ id: 'cmp-1' });
    mockCampaignDelete.mockResolvedValue({ id: 'cmp-1' });
  });

  it('returns 500 and does not delete the campaign when Supabase list returns an error', async () => {
    mockStorageList.mockResolvedValue({
      data: null,
      error: { message: 'Storage list failed' },
    });

    const req = new NextRequest('http://localhost/api/campaigns/cmp-1', {
      method: 'DELETE',
    });

    const res = await campaignDELETE(req, { params: { id: 'cmp-1' } });

    expect(res.status).toBe(500);
    expect(mockStorageList).toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
    expect(mockCampaignDelete).not.toHaveBeenCalled();
  });

  it('removes stored files, deletes the campaign, and returns 204 when files exist', async () => {
    mockStorageList.mockResolvedValue({
      data: [{ name: 'a.png' }],
      error: null,
    });
    mockStorageRemove.mockResolvedValue({
      data: null,
      error: null,
    });

    const req = new NextRequest('http://localhost/api/campaigns/cmp-1', {
      method: 'DELETE',
    });

    const res = await campaignDELETE(req, { params: { id: 'cmp-1' } });

    expect(res.status).toBe(204);
    expect(mockStorageList).toHaveBeenCalled();
    expect(mockStorageRemove).toHaveBeenCalled();
    expect(mockCampaignDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'cmp-1' }),
      }),
    );
  });

  it('deletes the campaign and returns 204 without calling remove when no files exist', async () => {
    mockStorageList.mockResolvedValue({
      data: [],
      error: null,
    });

    const req = new NextRequest('http://localhost/api/campaigns/cmp-1', {
      method: 'DELETE',
    });

    const res = await campaignDELETE(req, { params: { id: 'cmp-1' } });

    expect(res.status).toBe(204);
    expect(mockStorageList).toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
    expect(mockCampaignDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'cmp-1' }),
      }),
    );
  });
});

describe('sendBatch per-email partial-failure (B1)', () => {
  type EmailPayload = {
    from: string;
    to: string;
    subject: string;
    html: string;
  };

  const emails: EmailPayload[] = [
    { from: 'sender@example.com', to: '1st@example.com', subject: 'Subject 1', html: '<p>One</p>' },
    { from: 'sender@example.com', to: '2nd@example.com', subject: 'Subject 2', html: '<p>Two</p>' },
    { from: 'sender@example.com', to: '3rd@example.com', subject: 'Subject 3', html: '<p>Three</p>' },
  ];

  const callRealSendBatch = async (inputEmails: EmailPayload[] = emails) => {
    const { sendBatch: realSendBatch } =
      jest.requireActual<typeof import('@/app/lib/resend')>('@/app/lib/resend');

    return realSendBatch('resend-api-key', inputEmails);
  };

  it('returns all sent when every per-email response has an id', async () => {
    mockResendBatchSend.mockResolvedValue({
      data: {
        data: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
      },
      error: null,
    });

    const result = await callRealSendBatch();

    expect(result).toEqual({
      sent: 3,
      failed: 0,
      errors: [],
    });
    expect(mockResendBatchSend).toHaveBeenCalledWith([
      { from: 'sender@example.com', to: ['1st@example.com'], subject: 'Subject 1', html: '<p>One</p>' },
      { from: 'sender@example.com', to: ['2nd@example.com'], subject: 'Subject 2', html: '<p>Two</p>' },
      { from: 'sender@example.com', to: ['3rd@example.com'], subject: 'Subject 3', html: '<p>Three</p>' },
    ]);
  });

  it('counts per-email failures and preserves the failing recipient email and message', async () => {
    mockResendBatchSend.mockResolvedValue({
      data: {
        data: [{ id: 'e1' }, { error: { message: 'invalid' } }, { id: 'e3' }],
      },
      error: null,
    });

    const result = await callRealSendBatch();

    expect(result).toEqual({
      sent: 2,
      failed: 1,
      errors: [{ email: '2nd@example.com', error: 'invalid' }],
    });
  });

  it('treats a top-level Resend error as all failed', async () => {
    mockResendBatchSend.mockResolvedValue({
      error: { message: 'quota' },
    });

    const result = await callRealSendBatch();

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(3);
    expect(result.errors).toEqual([
      { email: '1st@example.com', error: 'quota' },
      { email: '2nd@example.com', error: 'quota' },
      { email: '3rd@example.com', error: 'quota' },
    ]);
  });

  it('falls back to all-sent when the Resend response shape is unexpected', async () => {
    mockResendBatchSend.mockResolvedValue({
      data: {
        data: { not: 'an-array' },
      },
      error: null,
    });

    const result = await callRealSendBatch();

    expect(result).toEqual({
      sent: 3,
      failed: 0,
      errors: [],
    });
  });
});

describe('crypto encrypt/decrypt hardening (B2)', () => {
  beforeAll(() => {
    process.env = {
      ...ORIGINAL_ENV,
      CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64),
    };
  });

  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('round-trips encrypted ciphertext back to the original plaintext', () => {
    const { encrypt: realEncrypt, decrypt: realDecrypt } =
      jest.requireActual<typeof import('@/app/lib/crypto')>('@/app/lib/crypto');

    const ciphertext = realEncrypt('secret');

    expect(ciphertext).toContain(':');
    expect(realDecrypt(ciphertext)).toBe('secret');
  });

  it('returns plaintext without colons unchanged for migration compatibility', () => {
    const { decrypt: realDecrypt } =
      jest.requireActual<typeof import('@/app/lib/crypto')>('@/app/lib/crypto');

    expect(realDecrypt('plain-no-colons')).toBe('plain-no-colons');
  });

  it('throws when ciphertext is tampered with', () => {
    const { encrypt: realEncrypt, decrypt: realDecrypt } =
      jest.requireActual<typeof import('@/app/lib/crypto')>('@/app/lib/crypto');

    const ciphertext = realEncrypt('secret');
    const parts = ciphertext.split(':');
    const encryptedPayload = parts[2];
    const flipIndex = Math.floor(encryptedPayload.length / 2);
    const replacement = encryptedPayload[flipIndex] === 'a' ? 'b' : 'a';

    parts[2] =
      encryptedPayload.slice(0, flipIndex) +
      replacement +
      encryptedPayload.slice(flipIndex + 1);

    const tampered = parts.join(':');

    expect(() => realDecrypt(tampered)).toThrow();
  });

  it('throws a clear error when no encryption key or fallback secret is available', () => {
    const { encrypt: realEncrypt } =
      jest.requireActual<typeof import('@/app/lib/crypto')>('@/app/lib/crypto');

    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    delete process.env.NEXTAUTH_SECRET;

    expect(() => realEncrypt('x')).toThrow(/No encryption key available/);
  });
});

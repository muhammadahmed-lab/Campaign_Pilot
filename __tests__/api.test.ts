import { NextRequest } from 'next/server';

jest.mock('@/app/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/app/lib/prisma', () => ({
  prisma: {
    campaign: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/app/lib/inngest', () => ({
  inngest: {
    send: jest.fn(),
  },
}));

jest.mock('@/app/lib/resend', () => ({
  sendBatch: jest.fn(),
}));

jest.mock('@/app/lib/smtp', () => ({
  sendSmtpBatch: jest.fn(),
}));

import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

const mockedAuth = auth as jest.Mock;
const mockedPrisma = prisma as any;

describe('Campaign API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/campaigns', () => {
    it('returns 401 when not authenticated', async () => {
      const { GET } = await import('@/app/api/campaigns/route');
      mockedAuth.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it('returns campaigns list for authenticated user', async () => {
      const { GET } = await import('@/app/api/campaigns/route');
      mockedAuth.mockResolvedValue({ user: { id: 'test-user-id' } });
      const campaigns = [
        { id: 'c1', status: 'draft', subject: 'Test', createdAt: new Date() },
      ];
      mockedPrisma.campaign.findMany.mockResolvedValue(campaigns);

      const response = await GET();
      expect(response.status).toBe(200);
      expect(mockedPrisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'test-user-id' },
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  describe('POST /api/campaigns', () => {
    it('returns 401 when not authenticated', async () => {
      const { POST } = await import('@/app/api/campaigns/route');
      mockedAuth.mockResolvedValue(null);

      const response = await POST();
      expect(response.status).toBe(401);
    });

    it('creates a new draft campaign', async () => {
      const { POST } = await import('@/app/api/campaigns/route');
      mockedAuth.mockResolvedValue({ user: { id: 'test-user-id' } });
      mockedPrisma.campaign.create.mockResolvedValue({ id: 'new-id' });

      const response = await POST();
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.id).toBe('new-id');
      expect(mockedPrisma.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'test-user-id',
            status: 'draft',
          }),
        })
      );
    });
  });

  describe('PATCH /api/campaigns/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      const { PATCH } = await import('@/app/api/campaigns/[id]/route');
      mockedAuth.mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/campaigns/test-id', {
        method: 'PATCH',
        body: JSON.stringify({ subject: 'Updated' }),
        headers: { 'content-type': 'application/json' },
      });

      const response = await PATCH(req, { params: { id: 'test-id' } });
      expect(response.status).toBe(401);
    });

    it('returns 404 for non-existent campaign', async () => {
      const { PATCH } = await import('@/app/api/campaigns/[id]/route');
      mockedAuth.mockResolvedValue({ user: { id: 'test-user-id' } });
      mockedPrisma.campaign.findFirst.mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/campaigns/missing-id', {
        method: 'PATCH',
        body: JSON.stringify({ subject: 'Updated' }),
        headers: { 'content-type': 'application/json' },
      });

      const response = await PATCH(req, { params: { id: 'missing-id' } });
      expect(response.status).toBe(404);
    });

    it('rejects invalid sendNow type', async () => {
      const { PATCH } = await import('@/app/api/campaigns/[id]/route');
      mockedAuth.mockResolvedValue({ user: { id: 'test-user-id' } });
      mockedPrisma.campaign.findFirst.mockResolvedValue({ id: 'test-id' });

      const req = new NextRequest('http://localhost/api/campaigns/test-id', {
        method: 'PATCH',
        body: JSON.stringify({ sendNow: 'yes' }),
        headers: { 'content-type': 'application/json' },
      });

      const response = await PATCH(req, { params: { id: 'test-id' } });
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/campaigns/[id]/status', () => {
    it('returns 401 when not authenticated', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/status/route');
      mockedAuth.mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/campaigns/test-id/status');
      const response = await GET(req, { params: { id: 'test-id' } });
      expect(response.status).toBe(401);
    });

    it('returns campaign status', async () => {
      const { GET } = await import('@/app/api/campaigns/[id]/status/route');
      mockedAuth.mockResolvedValue({ user: { id: 'test-user-id' } });
      mockedPrisma.campaign.findUnique.mockResolvedValue({
        id: 'test-id',
        userId: 'test-user-id',
        status: 'sending',
        sent: 50,
        failed: 2,
        recipientCount: 100,
        scheduledAt: null,
        sendNow: true,
      });

      const req = new NextRequest('http://localhost/api/campaigns/test-id/status');
      const response = await GET(req, { params: { id: 'test-id' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('sending');
      expect(data.sent).toBe(50);
    });
  });
});

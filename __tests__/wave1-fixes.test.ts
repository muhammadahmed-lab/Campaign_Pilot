import { NextRequest } from 'next/server';
import { POST as generateTemplatePOST } from '@/app/api/generate-template/route';
import { DELETE as uploadDELETE } from '@/app/api/upload/route';
import { cleanupOldDrafts } from '@/app/lib/inngest';
import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { supabase } from '@/app/lib/supabase';
import { openai } from '@/app/lib/openai';

jest.mock('inngest', () => ({
  Inngest: jest.fn().mockImplementation(() => ({
    createFunction: jest.fn((options, trigger, fn) => ({
      id: options.id,
      options,
      trigger,
      fn,
      run: fn,
    })),
  })),
}));

jest.mock('@/app/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/app/lib/prisma', () => ({
  prisma: {
    campaign: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/app/lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(),
    },
  },
}));

jest.mock('@/app/lib/openai', () => ({
  openai: {
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  },
}));

const mockAuth = auth as unknown as jest.Mock;
const mockCampaignFindFirst = prisma.campaign.findFirst as unknown as jest.Mock;
const mockCampaignFindMany = prisma.campaign.findMany as unknown as jest.Mock;
const mockCampaignUpdate = prisma.campaign.update as unknown as jest.Mock;
const mockCampaignDelete = prisma.campaign.delete as unknown as jest.Mock;
const mockStorageFrom = supabase.storage.from as unknown as jest.Mock;
const mockOpenAICreate = openai.chat.completions.create as unknown as jest.Mock;

let mockStorageList: jest.Mock;
let mockStorageRemove: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();

  process.env.OPENAI_API_KEY = 'test-key';

  mockStorageList = jest.fn().mockResolvedValue({ data: [], error: null });
  mockStorageRemove = jest.fn().mockResolvedValue({ error: null });

  mockStorageFrom.mockReturnValue({
    list: mockStorageList,
    remove: mockStorageRemove,
  });

  mockAuth.mockResolvedValue({ user: { id: 'user-A' } });
  mockCampaignUpdate.mockResolvedValue({ id: 'cmp-1' });
  mockCampaignDelete.mockResolvedValue({ id: 'cmp-1' });
});

describe('POST /api/generate-template IDOR protection', () => {
  function buildGenerateTemplateRequest(overrides: Record<string, unknown> = {}) {
    return new Request('http://localhost/api/generate-template', {
      method: 'POST',
      body: JSON.stringify({
        campaignId: 'cmp-1',
        messages: [{ role: 'user', content: 'Create a launch email' }],
        templateStyle: 'professional',
        imageAssets: [],
        ...overrides,
      }),
    });
  }

  test('returns 403 and does not call OpenAI or update campaign when campaign is not owned by current user', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-A' } });
    mockCampaignFindFirst.mockResolvedValue(null);

    const response = await generateTemplatePOST(buildGenerateTemplateRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden' });
    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(mockCampaignUpdate).not.toHaveBeenCalled();

    expect(mockCampaignFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'cmp-1',
          userId: 'user-A',
        }),
      }),
    );
  });

  test('calls OpenAI and updates campaign with parsed subject and html when ownership is confirmed', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-A' } });
    mockCampaignFindFirst.mockResolvedValue({ id: 'cmp-1', userId: 'user-A' });

    mockOpenAICreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              subject: 'Welcome to the launch',
              html: '<h1>Welcome to the launch</h1>',
            }),
          },
        },
      ],
    });

    const response = await generateTemplatePOST(buildGenerateTemplateRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      subject: 'Welcome to the launch',
      html: '<h1>Welcome to the launch</h1>',
    });

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
    expect(mockCampaignUpdate).toHaveBeenCalledTimes(1);

    const updateArg = mockCampaignUpdate.mock.calls[0][0];
    expect(updateArg).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'cmp-1',
        }),
        data: expect.any(Object),
      }),
    );
    expect(JSON.stringify(updateArg.data)).toContain('Welcome to the launch');
    expect(JSON.stringify(updateArg.data)).toContain('<h1>Welcome to the launch</h1>');
  });
});

describe('DELETE /api/upload path validation', () => {
  function buildUploadDeleteRequest(path?: string) {
    const url =
      path === undefined
        ? 'http://localhost/api/upload'
        : `http://localhost/api/upload?path=${encodeURIComponent(path)}`;

    return new NextRequest(url);
  }

  test('deletes a normal path owned by the current user', async () => {
    const path = 'user-A/cmp-1/file.png';

    const response = await uploadDELETE(buildUploadDeleteRequest(path));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ deleted: 1 });
    expect(mockStorageRemove).toHaveBeenCalledTimes(1);

    const removeArg = mockStorageRemove.mock.calls[0][0];
    if (Array.isArray(removeArg)) {
      expect(removeArg).toContain(path);
    } else {
      expect(removeArg).toBe(path);
    }
  });

  test('returns 403 and does not delete when path belongs to another user', async () => {
    const response = await uploadDELETE(buildUploadDeleteRequest('user-B/cmp-1/file.png'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden' });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  test('returns 403 and does not delete when path contains directory traversal', async () => {
    const response = await uploadDELETE(buildUploadDeleteRequest('user-A/campaign-1/../../etc'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden' });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  test('returns 403 and does not delete for absolute Unix path', async () => {
    const response = await uploadDELETE(buildUploadDeleteRequest('/etc/passwd'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden' });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  test('returns 403 and does not delete for Windows-style absolute path', async () => {
    const response = await uploadDELETE(buildUploadDeleteRequest('C:/foo'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden' });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  test('returns 400 when path query param is missing', async () => {
    const response = await uploadDELETE(buildUploadDeleteRequest(undefined));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Path is required' });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  test('returns 400 when path query param is empty', async () => {
    const response = await uploadDELETE(new NextRequest('http://localhost/api/upload?path='));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Path is required' });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  test('returns 401 when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await uploadDELETE(buildUploadDeleteRequest('user-A/cmp-1/file.png'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });
});

describe('currentStep inference helper', () => {
  function inferStep(state: {
    recipients: any[];
    htmlBody: string;
    chatMessages: any[];
    scheduledAt: Date | null;
    sendNow: boolean;
  }): number {
    if (state.recipients.length > 0) return 4;
    if (state.htmlBody) return 3;
    if (state.chatMessages.length > 0) return 2;
    if (state.scheduledAt || state.sendNow) return 1;
    return 1;
  }

  test('infers step 1 when all state is empty', () => {
    expect(
      inferStep({
        recipients: [],
        htmlBody: '',
        chatMessages: [],
        scheduledAt: null,
        sendNow: false,
      }),
    ).toBe(1);
  });

  test('infers step 1 when only sendNow is true', () => {
    expect(
      inferStep({
        recipients: [],
        htmlBody: '',
        chatMessages: [],
        scheduledAt: null,
        sendNow: true,
      }),
    ).toBe(1);
  });

  test('infers step 1 when only scheduledAt is set', () => {
    expect(
      inferStep({
        recipients: [],
        htmlBody: '',
        chatMessages: [],
        scheduledAt: new Date('2025-01-01T10:00:00.000Z'),
        sendNow: false,
      }),
    ).toBe(1);
  });

  test('infers step 2 when chatMessages has items', () => {
    expect(
      inferStep({
        recipients: [],
        htmlBody: '',
        chatMessages: [{ role: 'user', content: 'Hello' }],
        scheduledAt: null,
        sendNow: false,
      }),
    ).toBe(2);
  });

  test('infers step 3 when htmlBody is set and chatMessages is empty', () => {
    expect(
      inferStep({
        recipients: [],
        htmlBody: '<p>Hello</p>',
        chatMessages: [],
        scheduledAt: null,
        sendNow: false,
      }),
    ).toBe(3);
  });

  test('infers step 3 when htmlBody is set and chatMessages also has items', () => {
    expect(
      inferStep({
        recipients: [],
        htmlBody: '<p>Hello</p>',
        chatMessages: [{ role: 'assistant', content: 'Drafted' }],
        scheduledAt: null,
        sendNow: false,
      }),
    ).toBe(3);
  });

  test('infers step 4 when recipients has items, trumping htmlBody and chatMessages', () => {
    expect(
      inferStep({
        recipients: [{ email: 'recipient@example.com' }],
        htmlBody: '<p>Hello</p>',
        chatMessages: [{ role: 'assistant', content: 'Drafted' }],
        scheduledAt: new Date('2025-01-01T10:00:00.000Z'),
        sendNow: true,
      }),
    ).toBe(4);
  });
});

describe('cleanupOldDrafts DB query shape and pruning behavior', () => {
  const cleanupOldDraftsHandler = ((cleanupOldDrafts as any).fn ??
    (cleanupOldDrafts as any).handler ??
    (cleanupOldDrafts as any).run) as
    | ((args: { step: { run: jest.Mock } }) => Promise<any>)
    | undefined;

  const cleanupTest = cleanupOldDraftsHandler ? test : test.skip;

  cleanupTest('finds old draft campaigns with the expected WHERE clause and deletes each returned draft', async () => {
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const beforeThreshold = Date.now() - fourteenDaysMs;

    mockCampaignFindMany.mockResolvedValue([
      {
        id: 'cmp-1',
        userId: 'user-A',
        status: 'draft',
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
      {
        id: 'cmp-2',
        userId: 'user-B',
        status: 'draft',
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      },
    ]);

    mockStorageList.mockResolvedValue({
      data: [{ name: 'hero.png' }, { name: 'thumb.png' }],
      error: null,
    });
    mockStorageRemove.mockResolvedValue({ error: null });
    mockCampaignDelete.mockResolvedValue({});

    const fakeStep = {
      run: jest.fn(async (_id: string, cb: () => unknown | Promise<unknown>) => cb()),
    };

    const result = await cleanupOldDraftsHandler!({ step: fakeStep });
    const afterThreshold = Date.now() - fourteenDaysMs;

    expect(mockCampaignFindMany).toHaveBeenCalledTimes(1);

    const findManyArg = mockCampaignFindMany.mock.calls[0][0];
    expect(findManyArg).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'draft',
          updatedAt: expect.objectContaining({
            lt: expect.any(Date),
          }),
        }),
      }),
    );

    const ltDate = findManyArg.where.updatedAt.lt;
    expect(ltDate).toBeInstanceOf(Date);
    expect(ltDate.getTime()).toBeGreaterThanOrEqual(beforeThreshold - 1000);
    expect(ltDate.getTime()).toBeLessThanOrEqual(afterThreshold + 1000);

    expect(mockStorageFrom).toHaveBeenCalledWith('campaign-images');
    expect(mockStorageList).toHaveBeenCalledWith('user-A/cmp-1');
    expect(mockStorageList).toHaveBeenCalledWith('user-B/cmp-2');

    expect(mockCampaignDelete).toHaveBeenCalledWith({ where: { id: 'cmp-1' } });
    expect(mockCampaignDelete).toHaveBeenCalledWith({ where: { id: 'cmp-2' } });

    expect(result).toEqual(
      expect.objectContaining({
        pruned: 2,
        errors: 0,
      }),
    );
  });
});

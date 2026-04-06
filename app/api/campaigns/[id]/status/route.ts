import { NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        userId: true,
        status: true,
        sent: true,
        failed: true,
        recipientCount: true,
        scheduledAt: true,
        sendNow: true,
      },
    });

    if (!campaign || campaign.userId !== session.user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: campaign.id,
      status: campaign.status,
      sent: campaign.sent,
      failed: campaign.failed,
      recipientCount: campaign.recipientCount,
      scheduledAt: campaign.scheduledAt,
      sendNow: campaign.sendNow,
    });
  } catch (error) {
    console.error('Campaign status error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaign status' }, { status: 500 });
  }
}

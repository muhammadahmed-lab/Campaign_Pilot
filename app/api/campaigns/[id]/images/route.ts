import { NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { supabase } from '@/app/lib/supabase';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const campaignId = params.id;

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId },
      select: { id: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { data: files } = await supabase.storage
      .from('campaign-images')
      .list(`${userId}/${campaignId}`);

    if (!files || files.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const paths = files.map((f) => `${userId}/${campaignId}/${f.name}`);
    await supabase.storage.from('campaign-images').remove(paths);

    return NextResponse.json({ deleted: paths.length });
  } catch (error) {
    console.error('Delete campaign images error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

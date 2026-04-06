import { NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { supabase } from '@/app/lib/supabase';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const campaignIdRaw = formData.get('campaignId');
    const campaignId =
      typeof campaignIdRaw === 'string' && campaignIdRaw.trim().length > 0
        ? campaignIdRaw.trim()
        : 'general';

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!file.type?.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are allowed' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size must be 5MB or less' }, { status: 400 });
    }

    const safeFilename = sanitizeFilename(file.name || 'image');
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `${userId}/${campaignId}/${Date.now()}-${safeFilename}`;

    const { error: uploadError } = await supabase.storage
      .from('campaign-images')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || 'Failed to upload image' },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage.from('campaign-images').getPublicUrl(path);

    return NextResponse.json({ url: urlData.publicUrl, path });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

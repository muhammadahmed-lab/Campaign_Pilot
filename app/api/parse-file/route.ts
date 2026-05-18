import { NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { extractText, getDocumentProxy } from 'unpdf';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Node runtime (not edge) so we have the full Buffer / Uint8Array story.
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 413 });
    }

    // Only handle PDFs server-side. HTML / TXT / MD are read on the client.
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files supported by this endpoint' }, { status: 400 });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    // mergePages: true → text is a single string (one per page joined).
    const { text, totalPages } = await extractText(pdf, { mergePages: true });

    return NextResponse.json({
      name: file.name,
      text: text || '',
      pages: totalPages,
    });
  } catch (error) {
    console.error('parse-file error:', error);
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 });
  }
}

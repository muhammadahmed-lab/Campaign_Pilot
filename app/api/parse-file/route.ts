import { NextResponse } from 'next/server';
import { auth } from '@/app/lib/auth';
import { PDFParse } from 'pdf-parse';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return NextResponse.json({
        name: file.name,
        text: result.text || '',
        pages: result.total,
      });
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch (error) {
    console.error('parse-file error:', error);
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 });
  }
}

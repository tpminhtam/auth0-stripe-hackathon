import { NextResponse } from 'next/server';
import { getServerAuthContext } from '@/lib/server-auth';
import { synthesizeSpeech } from '@/lib/tts';

export const maxDuration = 30;

export async function POST(request: Request) {
  const authContext = await getServerAuthContext();
  if (!authContext.userId) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim().slice(0, 600);
  if (!text) {
    return NextResponse.json({ error: 'Nothing to say.' }, { status: 400 });
  }

  const audio = await synthesizeSpeech(text);
  if (!audio) {
    return NextResponse.json({ error: 'Speech synthesis is unavailable.' }, { status: 503 });
  }

  return new NextResponse(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}

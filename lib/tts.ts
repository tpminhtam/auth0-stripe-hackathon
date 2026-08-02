const DEFAULT_VOICE_ID = 'IKne3meq5aSn9XLyUdCD';

export async function synthesizeSpeech(text: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const baseUrl = (process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io').replace(/\/$/, '');
  const voiceId = process.env.SAYSO_TTS_VOICE || DEFAULT_VOICE_ID;
  const modelId = process.env.SAYSO_TTS_MODEL || 'eleven_turbo_v2_5';

  const response = await fetch(
    `${baseUrl}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, model_id: modelId }),
    },
  );

  if (!response.ok) {
    return null;
  }

  return response.arrayBuffer();
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const AUDIO_DIR = path.resolve(import.meta.dirname, '../../../data/audio');
fs.mkdirSync(AUDIO_DIR, { recursive: true });

export async function tts(text: string, voice: 'grandma' | 'scammer' = 'grandma'): Promise<string | null> {
  const voiceId = voice === 'grandma' ? process.env.VOICE_GRANDMA : process.env.VOICE_SCAMMER;
  const id = crypto.createHash('sha1').update(voice + (voiceId ?? '') + text).digest('hex').slice(0, 16) + '.mp3';
  const file = path.join(AUDIO_DIR, id);
  if (fs.existsSync(file)) return '/audio/' + id;
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId + '?output_format=mp3_22050_32', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', language_code: 'ko' }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200));
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    return '/audio/' + id;
  } catch (e) {
    console.warn('[tts] failed', (e as Error).message);
    return null;
  }
}

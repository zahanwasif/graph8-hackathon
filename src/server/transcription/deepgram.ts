import 'server-only';

/**
 * Speech-to-text via Deepgram's pre-recorded API. Plain `fetch` rather than the SDK: it's one
 * request, and this keeps the dependency surface small.
 * https://developers.deepgram.com/reference/speech-to-text-api/listen
 */

const DEEPGRAM_LISTEN_URL = 'https://api.deepgram.com/v1/listen';

export interface Transcription {
  /** The whole recording as one string. Empty when nothing intelligible was said. */
  transcript: string;
  durationSec: number | null;
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
}

/** Transcribes an audio or video file (Deepgram extracts the audio track from video itself). */
export async function transcribe(audio: ArrayBuffer, mimeType: string): Promise<Transcription> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set');

  const query = new URLSearchParams({ model: 'nova-3', smart_format: 'true' });
  const response = await fetch(`${DEEPGRAM_LISTEN_URL}?${query}`, {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': mimeType },
    body: audio,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Deepgram transcription failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as DeepgramResponse;
  // Mono voice notes have one channel; for multi-channel audio the first is the primary track.
  const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  return { transcript: transcript.trim(), durationSec: data.metadata?.duration ?? null };
}

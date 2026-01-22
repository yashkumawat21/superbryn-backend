import { createClient, DeepgramClient } from '@deepgram/sdk';
import dotenv from 'dotenv';
import { addCost } from './tools.js';

dotenv.config();

/* ---------------- Deepgram (STT) ---------------- */

const deepgram: DeepgramClient = createClient(
  process.env.DEEPGRAM_API_KEY!
);

export async function transcribeAudio(
  audioBuffer: Buffer
): Promise<string> {
  try {
    addCost('deepgram_stt', 0.0043, 'minute');

    const response = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-2',
        language: 'en-US',
        punctuate: true,
        smart_format: true,
        diarize: false,
      }
    );

    return (
      response?.result?.results?.channels?.[0]?.alternatives?.[0]
        ?.transcript ?? ''
    );
  } catch (error) {
    console.error('Deepgram transcription error:', error);
    throw error;
  }
}

/* ---------------- Cartesia (TTS via REST) ---------------- */

export async function synthesizeSpeech(
  text: string,
  voiceId?: string
): Promise<Buffer> {
  try {
    addCost('cartesia_tts', text.length * 0.0001, 'character');

    const response = await fetch('https://api.cartesia.ai/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CARTESIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voiceId: voiceId || process.env.CARTESIA_VOICE_ID || 'default',
        modelId: 'sonic',
        outputFormat: 'pcm16',
        sampleRate: 24000,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Cartesia TTS failed: ${await response.text()}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Cartesia TTS error:', error);
    throw error;
  }
}

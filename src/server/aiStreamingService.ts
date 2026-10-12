import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6JwVMkh_vfRYqLbn7I5BOU_bUfHEx1RJ_-imWBzd9sS7Q';

let geminiClient: GoogleGenAI | null = null;
try {
  if (GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
} catch (err: any) {
  console.warn('[AIStreamingService] Gemini client initialization note:', err?.message || err);
}

export interface StreamAiOptions {
  systemInstruction?: string;
  language?: 'bn' | 'en';
  temperature?: number;
}

/**
 * Streams AI response chunk-by-chunk using the official Google GenAI streaming API.
 * Uses gemini-3.1-flash-lite with ThinkingLevel.MINIMAL for ultra-low Time-To-First-Token (TTFT),
 * with automatic fallback to gemini-3.8-flash (ThinkingLevel.LOW) if needed.
 */
export async function streamAiResponse(
  prompt: string,
  options: StreamAiOptions = {},
  onChunk: (chunkText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!geminiClient) {
    throw new Error('Gemini API client is not initialized. Please verify GEMINI_API_KEY.');
  }

  const { systemInstruction, temperature = 0.3 } = options;

  async function getStream(modelName: string) {
    const isLite = modelName.includes('lite');
    return await geminiClient!.models.generateContentStream({
      model: modelName,
      contents: prompt,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        temperature,
        thinkingConfig: {
          thinkingLevel: isLite ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
        },
      },
    });
  }

  let responseStream: any;
  try {
    // Primary: gemini-3.1-flash-lite with minimal thinking for sub-second TTFT
    responseStream = await getStream('gemini-3.1-flash-lite');
  } catch (err: any) {
    console.warn('[AIStreamingService] gemini-3.1-flash-lite attempt failed, attempting gemini-3.8-flash fallback...', err?.message || err);
    try {
      responseStream = await getStream('gemini-3.8-flash');
    } catch (fallbackErr: any) {
      console.error('[AIStreamingService] All streaming model attempts failed:', fallbackErr?.message || fallbackErr);
      throw fallbackErr;
    }
  }

  let accumulatedText = '';

  for await (const chunk of responseStream) {
    if (signal?.aborted) {
      console.log('[AIStreamingService] Client aborted streaming request.');
      break;
    }

    const chunkText = chunk.text;
    if (chunkText) {
      accumulatedText += chunkText;
      onChunk(chunkText);
    }
  }

  return accumulatedText;
}

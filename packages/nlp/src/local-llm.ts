import { createOllama } from 'ollama-ai-provider-v2';
import { google } from '@ai-sdk/google';

export interface AIProviderConfig {
  provider?: 'local' | 'gemini' | 'auto' | 'rules';
  model?: string;
  ollamaBaseUrl?: string;
}

export interface LocalModelInfo {
  name: string;
  size?: string;
  modifiedAt?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyModel = any;

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

/**
 * Checks if local Ollama server is running and returns installed models.
 */
export async function getOllamaStatus(baseUrl = DEFAULT_OLLAMA_URL): Promise<{
  online: boolean;
  models: LocalModelInfo[];
}> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { online: false, models: [] };
    const data = (await res.json()) as { models?: Array<{ name: string; size?: number; modified_at?: string }> };
    const models: LocalModelInfo[] = (data.models || []).map((m) => ({
      name: m.name,
      size: m.size ? `${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB` : undefined,
      modifiedAt: m.modified_at,
    }));
    return { online: true, models };
  } catch {
    return { online: false, models: [] };
  }
}

/**
 * Resolves the language model based on user configuration.
 * Gracefully cascades from Local Ollama -> Gemini Cloud.
 */
export async function getAIModel(config?: AIProviderConfig): Promise<{
  model: AnyModel;
  provider: 'local' | 'gemini';
  modelName: string;
}> {
  const ollamaUrl = config?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;
  const requestedProvider = config?.provider || 'auto';

  if (requestedProvider === 'local' || requestedProvider === 'auto') {
    const status = await getOllamaStatus(ollamaUrl);
    if (status.online) {
      const chosenModel =
        config?.model && !config.model.includes('gemini')
          ? config.model
          : (status.models.length > 0 ? status.models[0]!.name : 'llama3.2');

      const ollama = createOllama({
        baseURL: `${ollamaUrl}/api`,
      });

      return {
        model: ollama(chosenModel),
        provider: 'local',
        modelName: chosenModel,
      };
    }
  }

  // Fallback to Gemini
  const geminiModel = config?.model?.includes('gemini') ? config.model : 'gemini-2.5-flash';
  return {
    model: google(geminiModel),
    provider: 'gemini',
    modelName: geminiModel,
  };
}


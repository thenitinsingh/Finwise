// Server configuration, read from environment variables.
// A git-ignored `server/.env` file is loaded by src/index.js (see .env.example).
// SAFETY: the API key is only ever read here and handed to the AI service.
// It is never logged and never sent to the client.

export const PLACEHOLDER_KEY = 'replace_me';
export const DEFAULT_CLIENT_ORIGIN = 'http://localhost:5173';
export const DEFAULT_PORT = 8000;
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

export function loadConfig(env = process.env) {
  const rawKey = (env.AI_API_KEY ?? '').trim();
  const origins = (env.CLIENT_ORIGIN ?? DEFAULT_CLIENT_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const port = process.env.PORT || Number.parseInt(env.PORT ?? '', 10);

  return {
    port: Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT,
    aiApiKey: rawKey,
    // Empty or the old placeholder falls back to Gemini 3.5 Flash-Lite.
    aiModel: (() => {
      const model = (env.AI_MODEL ?? '').trim();
      return !model || model === 'your-model-name' ? DEFAULT_MODEL : model;
    })(),
    clientOrigins: origins.length > 0 ? origins : [DEFAULT_CLIENT_ORIGIN],
  };
}

// "Configured" means a key is present and it is not the placeholder value.
export function isAiKeyConfigured(config) {
  return Boolean(config.aiApiKey) && config.aiApiKey !== PLACEHOLDER_KEY;
}

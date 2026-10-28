// Server entry point: `npm start` (or `npm run dev` to restart on file changes).

// override: true makes server/.env win over any stale AI_MODEL / AI_API_KEY set in the OS or terminal.
import dotenv from 'dotenv';

dotenv.config({ override: true, quiet: true });

import { createApp } from './app.js';
import { isAiKeyConfigured, loadConfig } from './config.js';

const config = loadConfig();
const app = createApp(config, { logRequests: true });

const server = app.listen(config.port, () => {
  console.log(`Finwise server listening on http://localhost:${config.port}`);
  console.log(`AI model in use: ${config.aiModel}`);
  console.log(`Allowed client origins: ${config.clientOrigins.join(', ')}`);
  console.log(
    isAiKeyConfigured(config)
      ? `Gemini key detected (model: ${config.aiModel}).`
      : 'AI key missing - set AI_API_KEY in server/.env. Extraction and chat return 503 until then.',
  );
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Set PORT in server/.env and update SERVER_URL in client/.env.`);
  } else {
    console.error('Server failed to start:', error.message);
  }
  process.exit(1);
});

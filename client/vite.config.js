import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// SERVER_URL (the server's base URL) is exposed to the client through
// `envPrefix`, so client/.env can use the spec's variable name directly.
// CLIENT_PORT changes the dev server port (default 5173).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number.parseInt(env.CLIENT_PORT ?? '', 10) || 5173;

  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'SERVER_'],
    server: { port, strictPort: false },
    preview: { port },
  };
});

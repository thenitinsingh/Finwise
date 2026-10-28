// Express application factory. Kept separate from src/index.js so tests can
// create an app with their own config and (optionally) a fake AI service.

import cors from 'cors';
import express from 'express';
import multer from 'multer';

import { AiService } from './ai/aiService.js';
import { createApiRouter } from './api/routes.js';
import { SessionStore } from './api/sessionStore.js';
import { HttpError } from './errors.js';

export function createApp(config, { aiService = new AiService(config), store = new SessionStore(), logRequests = false } = {}) {
  const app = express();
  app.disable('x-powered-by');

  // SECURITY: CORS only for origins listed in CLIENT_ORIGIN. Requests without
  // an Origin header (curl, server-side tests) are not browser requests and pass.
  const allowed = new Set(config.clientOrigins);
  app.use(
    cors({
      origin(origin, callback) {
        // Listed origins, plus any localhost / 127.0.0.1 port (Vite moves to 5174, 5175...
        // when 5173 is busy). Remote sites are still blocked.
        const isLocal = Boolean(origin) && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        callback(null, !origin || allowed.has(origin) || isLocal);
      },
    }),
  );

  app.use(express.json({ limit: '2mb' }));

  if (logRequests) {
    // PRIVACY: log method, path, status and timing only — never bodies, files or keys.
    app.use((req, res, next) => {
      const started = Date.now();
      res.on('finish', () => {
        console.log(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - started} ms)`);
      });
      next();
    });
  }

  app.use('/api', createApiRouter({ aiService, store }));

  app.use('/api', (req, res) => {
    res.status(404).json({ detail: 'Not found.' });
  });

  app.get('/', (req, res) => {
    res.json({ name: 'Finwise server', docs: 'See README.md for the API endpoint table.', health: '/api/health' });
  });

  // Central error handler → {"detail": "..."}
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ detail: error.detail });
    }
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ detail: 'Please use a file smaller than 12 MB for this classroom demo.' });
      }
      if (error.code === 'LIMIT_FIELD_VALUE') {
        return res.status(413).json({ detail: 'The pasted text is too long for this classroom demo.' });
      }
      return res.status(400).json({ detail: `Upload error: ${error.message}` });
    }
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ detail: 'Request body must be valid JSON.' });
    }
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ detail: 'Request body is too large.' });
    }
    console.error('Unexpected server error:', error?.message ?? error);
    return res.status(500).json({ detail: 'Unexpected server error.' });
  });

  return app;
}
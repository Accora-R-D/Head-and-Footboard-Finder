// Application entry point: an Express server that hosts the static UI and the finder API.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config, checkOnshapeConfig } from './config.js';
import { router as finderRouter } from './routes/finder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // API routes.
  app.use('/api', finderRouter);

  // Lightweight health/readiness endpoint that also reports config status.
  app.get('/api/health', (_req, res) => {
    const cfg = checkOnshapeConfig();
    res.json({ status: 'ok', onshapeConfigured: cfg.ok, missing: cfg.missing });
  });

  // Static frontend.
  app.use(express.static(publicDir));

  return app;
}

// Only start listening when run directly (not when imported by tests).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = createApp();
  app.listen(config.port, () => {
    const cfg = checkOnshapeConfig();
    console.log(`Head and Footboard Finder running at http://localhost:${config.port}`);
    if (cfg.ok) {
      console.log('Onshape integration: configured.');
    } else {
      console.warn(
        `Onshape integration: NOT configured. Missing ${cfg.missing.join(', ')}. ` +
          'The UI will load, but exports will fail until you complete your .env file.',
      );
    }
  });
}

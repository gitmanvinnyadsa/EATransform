import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initDb } from './db.js';
import { createApp } from './app.js';

initDb();
const app = createApp();

// Serve the built client in production if it exists.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`EATransform API listening on http://localhost:${config.port}`);
  console.log(
    config.ai.apiKey
      ? `AI provider: ${config.ai.provider} (${config.ai.model})`
      : 'AI provider: not configured — copy .env.example to .env and add AI_API_KEY to activate AI features (mock provider available for offline demo).'
  );
});

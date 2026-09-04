// HTTP routes for the finder.
//
// - GET /api/options            -> dropdown data for the frontend.
// - GET /api/finder/stream      -> Server-Sent Events streaming live progress, ending
//                                  with a `done` event carrying a short-lived jobId.
// - GET /api/finder/result/:id  -> streams the buffered PDF as a file download.

import crypto from 'node:crypto';
import express from 'express';
import { getOptions, analyseSpec, ValidationError, FIELD_ORDER } from '../finder.js';
import { config, checkPipelineConfig } from '../config.js';
import { createOnshapeClient, OnshapeApiError } from '../onshapeClient.js';
import { buildConfiguration, templateForBoard, DrawingConfigError } from '../drawingConfig.js';

export const router = express.Router();

/**
 * Extract a raw spec from the request query, reading exactly the configured fields so it
 * stays correct if the field set changes (e.g. the added `board` field).
 * @param {import('express').Request} req
 * @returns {Record<string, unknown>}
 */
function specFromQuery(req) {
  const raw = {};
  for (const id of FIELD_ORDER) raw[id] = req.query[id];
  return raw;
}

// Short-lived store for finished PDFs, keyed by a random jobId. Entries self-expire so
// the process never accumulates memory. A production deployment might use Redis or a
// temp file store; in-memory is sufficient for this single-node app.
const RESULT_TTL_MS = 5 * 60 * 1000;
/** @type {Map<string, {buffer: Buffer, filename: string, expires: number}>} */
const results = new Map();

function storeResult(buffer, filename) {
  const jobId = crypto.randomUUID();
  results.set(jobId, { buffer, filename, expires: Date.now() + RESULT_TTL_MS });
  return jobId;
}

function pruneResults() {
  const now = Date.now();
  for (const [id, entry] of results) {
    if (entry.expires <= now) results.delete(id);
  }
}
const pruneTimer = setInterval(pruneResults, 60 * 1000);
if (typeof pruneTimer.unref === 'function') pruneTimer.unref();

// The pipeline reconfigures a single shared scratch workspace, so runs must be serialized
// to avoid clobbering each other's configuration. This is a simple in-process FIFO lock.
let pipelineLock = Promise.resolve();
function withPipelineLock(task) {
  const run = pipelineLock.then(task, task);
  // Keep the chain alive regardless of this task's outcome.
  pipelineLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// The lazily-created scratch workspace id, cached for the process lifetime. Pin
// ONSHAPE_SCRATCH_WORKSPACE_ID to avoid re-creating one after a restart.
let cachedScratchWid = null;
async function resolveScratchWorkspace(client) {
  if (config.onshape.scratchWorkspaceId) return config.onshape.scratchWorkspaceId;
  if (cachedScratchWid) return cachedScratchWid;
  cachedScratchWid = await client.createBranch('finder-scratch');
  console.warn(
    `[finder] created scratch workspace ${cachedScratchWid}. ` +
      'Set ONSHAPE_SCRATCH_WORKSPACE_ID to this id to reuse it across restarts.',
  );
  return cachedScratchWid;
}

router.get('/options', (_req, res) => {
  res.json({ fields: getOptions() });
});

// Compute the deterministic drawing key + keywords for a (possibly partial) selection.
// Used by the UI to show a live "name your drawing this" preview. Returns 200 with the
// key once all four fields are valid, or { complete: false } while still choosing.
router.get('/key', (req, res) => {
  const raw = specFromQuery(req);
  try {
    const { key, keywords, spec } = analyseSpec(raw);
    res.json({ complete: true, key, keywords, spec });
  } catch (err) {
    if (err instanceof ValidationError) {
      res.json({ complete: false, message: err.message });
    } else {
      res.status(500).json({ complete: false, message: 'Could not compute the drawing key.' });
    }
  }
});

/**
 * The progress pipeline as an SSE stream. Steps are emitted as named events so the UI
 * can render a live checklist; a terminal `error` or `done` event ends the stream.
 */
router.get('/finder/stream', async (req, res) => {
  // SSE headers.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  /**
   * Emit a single SSE event.
   * @param {string} event
   * @param {object} data
   */
  const send = (event, data) => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const fail = (message, step) => {
    send('error', { message, step });
    res.end();
  };

  try {
    // Step 1 — validate the specification and derive the key (used for the filename).
    send('progress', { step: 'validating', status: 'active', message: 'Validating specification…' });
    const { spec, key } = analyseSpec(specFromQuery(req));
    send('progress', { step: 'validating', status: 'done', message: 'Specification is valid.' });

    // Step 2 — build the Onshape configuration string and pick the template drawing.
    // Raises a clear message for combinations not modelled in the assembly yet.
    const configuration = buildConfiguration(spec);
    const templateEid = templateForBoard(spec);
    send('progress', {
      step: 'key',
      status: 'done',
      message: `Drawing key: ${key}`,
      key,
      spec,
      configuration,
    });

    // Guard — the full pipeline (workspace, assembly, templates) must be configured.
    const cfg = checkPipelineConfig();
    if (!cfg.ok) {
      return fail(
        `Onshape is not fully configured. Set ${cfg.missing.join(', ')} in your .env file (see .env.example).`,
        'preparing',
      );
    }

    const client = createOnshapeClient();
    const { masterAssemblyEid } = config.onshape;

    // Step 3 — resolve the shared scratch workspace (created lazily, reused thereafter).
    send('progress', { step: 'preparing', status: 'active', message: 'Preparing the workspace…' });
    const scratchWid = await resolveScratchWorkspace(client);
    if (closed) return undefined;
    send('progress', { step: 'preparing', status: 'done', message: 'Workspace ready.' });

    // Steps 4-7 run under a lock: the scratch workspace is shared, so only one request may
    // reconfigure + export at a time. Concurrent requests queue rather than clobber.
    await withPipelineLock(async () => {
      if (closed) return;

      // Step 4 — re-point the template's assembly reference at the selected configuration.
      send('progress', { step: 'configuring', status: 'active', message: 'Applying configuration…' });
      const ref = await client.findReferenceTo(scratchWid, templateEid, masterAssemblyEid);
      await client.setReferenceConfiguration(scratchWid, templateEid, ref.referenceId, configuration);
      if (closed) return;
      send('progress', { step: 'configuring', status: 'done', message: 'Configuration applied to the drawing.' });

      // Step 5 — start the PDF export from the scratch workspace.
      send('progress', { step: 'exporting', status: 'active', message: 'Requesting PDF export…' });
      const translationId = await client.startPdfExport(templateEid, { workspaceId: scratchWid });
      if (closed) return;
      send('progress', { step: 'exporting', status: 'done', message: 'Export requested.' });

      // Step 6 — wait for the asynchronous translation to finish.
      send('progress', { step: 'polling', status: 'active', message: 'Waiting for the export to complete…' });
      const externalDataIds = await client.waitForTranslation(translationId, (state) => {
        send('progress', { step: 'polling', status: 'active', message: `Export status: ${state}…` });
      });
      if (closed) return;
      send('progress', { step: 'polling', status: 'done', message: 'Export complete.' });

      // Step 7 — download the finished PDF.
      send('progress', { step: 'downloading', status: 'active', message: 'Downloading PDF…' });
      const buffer = await client.downloadExternalData(externalDataIds[0]);
      if (closed) return;

      const filename = `${key}.pdf`;
      const jobId = storeResult(buffer, filename);
      send('progress', {
        step: 'downloading',
        status: 'done',
        message: `Downloaded ${(buffer.length / 1024).toFixed(1)} KB.`,
      });

      // Terminal — hand the browser a URL to fetch the buffered file.
      send('done', {
        message: 'Your drawing is ready.',
        jobId,
        filename,
        downloadUrl: `/api/finder/result/${jobId}`,
        key,
        configuration,
      });
    });
    res.end();
  } catch (err) {
    const isUserError = err instanceof ValidationError || err instanceof DrawingConfigError;
    let message;
    if (isUserError) {
      message = err.message;
    } else if (err instanceof OnshapeApiError) {
      // Prefer the plain-English form; the hand-written Onshape errors have no userMessage
      // because their own message is already written for the user.
      message = err.userMessage || err.message;
    } else {
      message = 'An unexpected error occurred. Please try again.';
    }
    if (!isUserError) {
      // Log unexpected failures server-side for diagnosis; the client sees a friendly message.
      console.error('[finder] pipeline failed:', err);
    }
    if (!closed) fail(message);
  }
});

/**
 * Serve a buffered PDF once, as a browser download.
 */
router.get('/finder/result/:jobId', (req, res) => {
  const entry = results.get(req.params.jobId);
  if (!entry || entry.expires <= Date.now()) {
    results.delete(req.params.jobId);
    return res.status(404).json({ error: 'This download has expired. Please generate the drawing again.' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
  res.setHeader('Content-Length', String(entry.buffer.length));
  return res.end(entry.buffer);
});

// Exported for tests.
export const _internal = { results, storeResult };

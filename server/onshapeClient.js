// Secure client for the PTC Onshape REST API.
//
// Every request is signed with Onshape's documented API-key HMAC-SHA256 scheme, so the
// secret key never travels over the wire — only a per-request signature does. The client
// exposes the four operations the finder pipeline needs: locate a drawing element,
// export it to PDF, poll the async translation, and download the finished PDF.

import crypto from 'node:crypto';
import { config, getWorkspaceOrVersion } from './config.js';
import { pickBestDrawing } from './finder.js';

const NONCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Error thrown when the Onshape API returns a non-2xx response.
 *
 * `message` is the diagnostic form (method, path, status) written to the server log.
 * `userMessage`, when set, is the plain-English form shown in the browser — the raw
 * message names internal endpoints and means nothing to the person using the app.
 */
export class OnshapeApiError extends Error {
  constructor(message, status, body, userMessage) {
    super(message);
    this.name = 'OnshapeApiError';
    this.status = status || 502;
    this.body = body;
    this.userMessage = userMessage;
  }
}

/**
 * Translate an Onshape HTTP status into something a non-developer can act on.
 * @param {number} status
 * @returns {string}
 */
export function describeOnshapeStatus(status) {
  switch (status) {
    case 400:
      return 'Onshape rejected the request as invalid. This usually means the configuration '
        + 'sent for this specification no longer matches the master assembly.';
    case 401:
      return 'Onshape rejected the API credentials. Check ONSHAPE_ACCESS_KEY and '
        + 'ONSHAPE_SECRET_KEY in the server’s .env file.';
    case 403:
      return 'Your Onshape account does not have permission to do this. Check your access '
        + 'to the configured document.';
    case 402:
    case 429:
      return 'Onshape’s API rate limit has been reached. Wait a few minutes and try again.';
    case 404:
      return 'Onshape could not find the requested document, drawing or workspace. Check the '
        + 'ids configured in .env.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Onshape is currently unavailable or did not respond in time. Please try again '
        + 'shortly.';
    default:
      return `Onshape returned an unexpected error (${status}). Please try again.`;
  }
}

/**
 * Create a 25-character alphanumeric nonce, as required by the signing scheme.
 * @returns {string}
 */
export function createNonce() {
  const bytes = crypto.randomBytes(25);
  let nonce = '';
  for (let i = 0; i < 25; i += 1) {
    nonce += NONCE_ALPHABET[bytes[i] % NONCE_ALPHABET.length];
  }
  return nonce;
}

/**
 * Build the signed request headers for an Onshape API call. Pure and deterministic given
 * its `date` and `nonce` inputs, which makes it straightforward to unit test.
 *
 * @param {Object} params
 * @param {string} params.method HTTP method (e.g. "GET", "POST").
 * @param {string} params.pathname Full URL pathname, e.g. "/api/v10/documents/...".
 * @param {string} params.query Query string WITHOUT the leading "?", or "".
 * @param {string} params.accessKey Onshape access key.
 * @param {string} params.secretKey Onshape secret key.
 * @param {string} [params.contentType] Content-Type used for signing.
 * @param {string} [params.accept] Accept header for the response.
 * @param {string} [params.date] RFC1123 date; defaults to now (override for tests).
 * @param {string} [params.nonce] Nonce; defaults to a fresh one (override for tests).
 * @returns {Record<string, string>}
 */
export function buildSignedHeaders({
  method,
  pathname,
  query = '',
  accessKey,
  secretKey,
  contentType = 'application/json',
  accept = 'application/json',
  date = new Date().toUTCString(),
  nonce = createNonce(),
}) {
  const stringToSign = [
    method,
    nonce,
    date,
    contentType,
    pathname,
    query,
    '',
  ].join('\n').toLowerCase();

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(stringToSign)
    .digest('base64');

  return {
    'Content-Type': contentType,
    Accept: accept,
    Date: date,
    'On-Nonce': nonce,
    Authorization: `On ${accessKey}:HmacSHA256:${signature}`,
  };
}

export class OnshapeClient {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.baseUrl]
   * @param {string} [opts.accessKey]
   * @param {string} [opts.secretKey]
   * @param {typeof fetch} [opts.fetch] Injectable fetch (for tests).
   * @param {number} [opts.pollIntervalMs]
   * @param {number} [opts.exportTimeoutMs]
   */
  constructor(opts = {}) {
    this.baseUrl = (opts.baseUrl ?? config.onshape.baseUrl).replace(/\/+$/, '');
    this.accessKey = opts.accessKey ?? config.onshape.accessKey;
    this.secretKey = opts.secretKey ?? config.onshape.secretKey;
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.pollIntervalMs = opts.pollIntervalMs ?? config.onshape.pollIntervalMs;
    this.exportTimeoutMs = opts.exportTimeoutMs ?? config.onshape.exportTimeoutMs;
    if (typeof this.fetch !== 'function') {
      throw new Error('global fetch is unavailable; Node 18+ is required.');
    }
  }

  /**
   * Construct a URL object from a path and optional query parameters.
   * @param {string} path Path relative to the base URL, starting with "/".
   * @param {Record<string, string|number|boolean|undefined>} [query]
   * @returns {URL}
   */
  buildUrl(path, query) {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    return url;
  }

  /**
   * Perform a signed request and return the raw Response.
   * @param {Object} params
   * @param {string} params.method
   * @param {string} params.path
   * @param {Record<string, any>} [params.query]
   * @param {any} [params.body] JSON-serializable body.
   * @param {string} [params.accept]
   * @returns {Promise<Response>}
   */
  async request({ method, path, query, body, accept = 'application/json' }) {
    const url = this.buildUrl(path, query);
    const headers = buildSignedHeaders({
      method,
      pathname: url.pathname,
      query: url.search.startsWith('?') ? url.search.slice(1) : '',
      accessKey: this.accessKey,
      secretKey: this.secretKey,
      accept,
    });

    const response = await this.fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'follow',
    });
    return response;
  }

  /**
   * Perform a signed request expecting a JSON response, throwing on non-2xx.
   * @returns {Promise<any>}
   */
  async requestJson(params) {
    const response = await this.request(params);
    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (!response.ok) {
      const detail = parsed?.message || parsed?.raw || response.statusText;
      throw new OnshapeApiError(
        `Onshape API ${params.method} ${params.path} failed (${response.status}): ${detail}`,
        response.status,
        parsed,
        describeOnshapeStatus(response.status),
      );
    }
    return parsed;
  }

  /**
   * List every element in the configured document, optionally filtered by type.
   * @param {'DRAWING'|'PARTSTUDIO'|'ASSEMBLY'|undefined} [elementType]
   * @returns {Promise<Array<{id: string, name: string, elementType: string, dataType?: string}>>}
   */
  async listElements(elementType) {
    const wv = getWorkspaceOrVersion();
    if (!wv) throw new OnshapeApiError('No workspace or version configured.', 500);
    const { documentId } = config.onshape;
    const query = elementType ? { elementType } : undefined;
    const elements = await this.requestJson({
      method: 'GET',
      path: `/documents/d/${documentId}/${wv.wv}/${wv.wvid}/elements`,
      query,
    });
    return Array.isArray(elements) ? elements : [];
  }

  /**
   * List every drawing in the configured document. Onshape drawings come in two forms:
   * legacy native drawings (`elementType === 'DRAWING'`) and modern app drawings
   * (`elementType === 'APPLICATION'` with `dataType === 'onshape-app/drawing'`). Both
   * are exportable via the drawings translation endpoint, so we detect both.
   * @returns {Promise<Array<{id: string, name: string, elementType: string, dataType?: string}>>}
   */
  async listDrawings() {
    const elements = await this.listElements();
    return elements.filter(
      (e) => e.elementType === 'DRAWING' || e.dataType === 'onshape-app/drawing',
    );
  }

  /**
   * Locate the best-matching drawing element for the given key/keywords.
   * @param {string} key
   * @param {string[]} keywords
   * @returns {Promise<{id: string, name: string, score: number}>}
   * @throws {OnshapeApiError} when no drawing matches.
   */
  async findDrawing(key, keywords) {
    const drawings = await this.listDrawings();
    if (drawings.length === 0) {
      throw new OnshapeApiError(
        'No drawing elements were found in the configured Onshape document.',
        404,
      );
    }
    const best = pickBestDrawing(drawings, key, keywords);
    if (!best) {
      throw new OnshapeApiError(
        `No drawing matched specification "${key}". Checked ${drawings.length} drawing(s).`,
        404,
      );
    }
    return { id: best.element.id, name: best.element.name, score: best.score };
  }

  // --- Configuration-driven pipeline -----------------------------------------

  /**
   * Create a throwaway branch (workspace) off the current state, used to re-configure a
   * drawing in isolation without touching the main workspace.
   * @param {string} name
   * @returns {Promise<string>} the new workspace id.
   */
  async createBranch(name) {
    const { documentId } = config.onshape;
    const branch = await this.requestJson({
      method: 'POST',
      path: `/documents/d/${documentId}/workspaces`,
      body: { name, isPublic: false },
    });
    if (!branch.id) throw new OnshapeApiError('Onshape did not return a new workspace id.', 502, branch);
    return branch.id;
  }

  /**
   * Delete a workspace (branch). Best-effort; never throws.
   * @param {string} workspaceId
   * @returns {Promise<boolean>} whether the delete succeeded.
   */
  async deleteWorkspace(workspaceId) {
    const { documentId } = config.onshape;
    try {
      const res = await this.request({
        method: 'DELETE',
        path: `/documents/d/${documentId}/workspaces/${workspaceId}`,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * List an app element's external references (e.g. a drawing's reference to an assembly).
   * @param {string} workspaceId
   * @param {string} elementId
   * @returns {Promise<Array<object>>}
   */
  async getReferences(workspaceId, elementId) {
    const { documentId } = config.onshape;
    const refs = await this.requestJson({
      method: 'GET',
      path: `/appelements/d/${documentId}/w/${workspaceId}/e/${elementId}/references`,
    });
    return Array.isArray(refs) ? refs : [];
  }

  /**
   * Find the reference from a drawing to a specific target element (the master assembly).
   * @param {string} workspaceId
   * @param {string} drawingEid
   * @param {string} targetElementId
   * @returns {Promise<{referenceId: string, targetConfiguration: string}>}
   */
  async findReferenceTo(workspaceId, drawingEid, targetElementId) {
    const refs = await this.getReferences(workspaceId, drawingEid);
    const ref = refs.find((r) => r.targetElementId === targetElementId);
    if (!ref) {
      throw new OnshapeApiError(
        'The template drawing does not reference the configured master assembly.',
        500,
      );
    }
    return ref;
  }

  /**
   * Re-point a drawing's reference to a new configuration of the same target.
   * @param {string} workspaceId
   * @param {string} drawingEid
   * @param {string} referenceId
   * @param {string} configuration Plain configuration string, e.g. "List_x=Val;List_y=Val".
   * @returns {Promise<object>}
   */
  async setReferenceConfiguration(workspaceId, drawingEid, referenceId, configuration) {
    const { documentId } = config.onshape;
    return this.requestJson({
      method: 'POST',
      path: `/appelements/d/${documentId}/w/${workspaceId}/e/${drawingEid}/references/${referenceId}`,
      body: { referenceId, targetConfiguration: configuration },
    });
  }

  /**
   * Start an asynchronous PDF export (translation) of a drawing element.
   * @param {string} elementId
   * @param {{workspaceId?: string}} [opts] Export from this workspace instead of the default.
   * @returns {Promise<string>} the translation id.
   */
  async startPdfExport(elementId, opts = {}) {
    const { documentId } = config.onshape;
    let wvSegment;
    if (opts.workspaceId) {
      wvSegment = `w/${opts.workspaceId}`;
    } else {
      const wv = getWorkspaceOrVersion();
      if (!wv) throw new OnshapeApiError('No workspace or version configured.', 500);
      wvSegment = `${wv.wv}/${wv.wvid}`;
    }
    const result = await this.requestJson({
      method: 'POST',
      path: `/drawings/d/${documentId}/${wvSegment}/e/${elementId}/translations`,
      body: {
        formatName: 'PDF',
        storeInDocument: false,
      },
    });
    if (!result.id) {
      throw new OnshapeApiError('Onshape did not return a translation id for the export.', 502, result);
    }
    return result.id;
  }

  /**
   * Retrieve the status of a translation.
   * @param {string} translationId
   * @returns {Promise<{requestState: string, resultExternalDataIds?: string[], failureReason?: string}>}
   */
  async getTranslation(translationId) {
    return this.requestJson({
      method: 'GET',
      path: `/translations/${translationId}`,
    });
  }

  /**
   * Poll a translation until it completes, fails, or the timeout elapses.
   * @param {string} translationId
   * @param {(state: string) => void} [onTick] Optional progress callback.
   * @returns {Promise<string[]>} the result external data ids.
   */
  async waitForTranslation(translationId, onTick) {
    const deadline = Date.now() + this.exportTimeoutMs;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const status = await this.getTranslation(translationId);
      const state = status.requestState;
      if (onTick) onTick(state);

      if (state === 'DONE') {
        const ids = status.resultExternalDataIds || [];
        if (ids.length === 0) {
          throw new OnshapeApiError('Export finished but produced no downloadable file.', 502, status);
        }
        return ids;
      }
      if (state === 'FAILED') {
        throw new OnshapeApiError(
          `Onshape PDF export failed: ${status.failureReason || 'unknown reason'}.`,
          502,
          status,
        );
      }
      if (Date.now() > deadline) {
        throw new OnshapeApiError(
          `Timed out after ${Math.round(this.exportTimeoutMs / 1000)}s waiting for the PDF export.`,
          504,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  /**
   * Download a completed export's binary data as a PDF buffer.
   * @param {string} externalDataId
   * @returns {Promise<Buffer>}
   */
  async downloadExternalData(externalDataId) {
    const { documentId } = config.onshape;
    const response = await this.request({
      method: 'GET',
      path: `/documents/d/${documentId}/externaldata/${externalDataId}`,
      accept: 'application/octet-stream',
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new OnshapeApiError(
        `Failed to download the exported PDF (${response.status}): ${text || response.statusText}`,
        response.status,
        undefined,
        `The exported PDF could not be downloaded. ${describeOnshapeStatus(response.status)}`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

/**
 * Build an OnshapeClient from the process configuration.
 * @returns {OnshapeClient}
 */
export function createOnshapeClient() {
  return new OnshapeClient();
}

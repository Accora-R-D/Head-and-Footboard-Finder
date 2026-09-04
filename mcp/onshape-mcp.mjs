#!/usr/bin/env node
// Onshape MCP server
// -----------------------------------------------------------------------------
// Exposes the Accora Onshape REST API to MCP clients (Claude Code, etc.) as a
// set of tools. Every request is signed with Onshape's documented API-key
// HMAC-SHA256 scheme, so the secret key never leaves this process.
//
// Credentials are read from the project's .env (ONSHAPE_ACCESS_KEY /
// ONSHAPE_SECRET_KEY / ONSHAPE_DOCUMENT_ID / ONSHAPE_WORKSPACE_ID). Nothing
// secret is stored in the MCP configuration.
//
// Transport: stdio. Launched by the MCP client via .mcp.json.

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Load .env from the project root (one level up from this file).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ACCESS_KEY = process.env.ONSHAPE_ACCESS_KEY;
const SECRET_KEY = process.env.ONSHAPE_SECRET_KEY;
// Default REST host. The .env base points at cad.onshape.com, but the same keys
// authenticate against the Accora enterprise host too; callers can override the
// host per-request with the `host` argument (e.g. "accora.onshape.com").
const DEFAULT_HOST = (process.env.ONSHAPE_BASE_URL || 'https://cad.onshape.com/api/v10')
  .replace(/^https?:\/\//, '')
  .replace(/\/.*/, '');
const API_VERSION = 'v10';

const DEFAULT_DID = process.env.ONSHAPE_DOCUMENT_ID || '';
const DEFAULT_WID = process.env.ONSHAPE_WORKSPACE_ID || '';
const DEFAULT_VID = process.env.ONSHAPE_VERSION_ID || '';

if (!ACCESS_KEY || !SECRET_KEY) {
  // Written to stderr so it surfaces in the MCP client log without corrupting
  // the stdio JSON-RPC stream.
  console.error('[onshape-mcp] Missing ONSHAPE_ACCESS_KEY / ONSHAPE_SECRET_KEY in .env');
}

const NONCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function createNonce() {
  const bytes = crypto.randomBytes(25);
  let nonce = '';
  for (let i = 0; i < 25; i += 1) nonce += NONCE_ALPHABET[bytes[i] % NONCE_ALPHABET.length];
  return nonce;
}

function buildSignedHeaders({ method, pathname, query = '', host, accept = 'application/json', contentType = 'application/json' }) {
  const date = new Date().toUTCString();
  const nonce = createNonce();
  const stringToSign = [method, nonce, date, contentType, pathname, query, ''].join('\n').toLowerCase();
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(stringToSign).digest('base64');
  return {
    'Content-Type': contentType,
    Accept: accept,
    Date: date,
    'On-Nonce': nonce,
    Authorization: `On ${ACCESS_KEY}:HmacSHA256:${signature}`,
  };
}

/**
 * Perform a signed Onshape API request.
 * @param {string} method  HTTP method.
 * @param {string} apiPath Path under /api/{version}, e.g. "/users/sessioninfo".
 * @param {object} [opts]
 * @param {Record<string,string|number|boolean>} [opts.query]
 * @param {any} [opts.body]
 * @param {string} [opts.host] Override host (defaults to DEFAULT_HOST).
 */
async function onshape(method, apiPath, { query, body, host = DEFAULT_HOST } = {}) {
  const cleanPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const pathname = `/api/${API_VERSION}${cleanPath}`;
  const url = new URL(`https://${host}${pathname}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const headers = buildSignedHeaders({
    method,
    pathname,
    query: url.search.startsWith('?') ? url.search.slice(1) : '',
    host,
  });
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'follow',
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const detail = parsed?.message || parsed?.raw || res.statusText;
    throw new Error(`Onshape ${method} ${pathname} failed (${res.status}): ${detail}`);
  }
  return parsed;
}

// Wrap a handler so any thrown error becomes a proper MCP tool error result.
function toolResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function toolError(err) {
  return { isError: true, content: [{ type: 'text', text: String(err?.message || err) }] };
}

const server = new McpServer({ name: 'onshape', version: '1.0.0' });

const hostArg = z
  .string()
  .optional()
  .describe(`Onshape REST host without scheme (default "${DEFAULT_HOST}"). Use "accora.onshape.com" for enterprise documents.`);

server.registerTool(
  'onshape_session_info',
  {
    title: 'Onshape session info',
    description: 'Return the authenticated Onshape user/session (GET /users/sessioninfo). Use to verify the API keys work.',
    inputSchema: { host: hostArg },
  },
  async ({ host }) => {
    try {
      return toolResult(await onshape('GET', '/users/sessioninfo', { host }));
    } catch (e) {
      return toolError(e);
    }
  },
);

server.registerTool(
  'onshape_request',
  {
    title: 'Onshape signed request',
    description:
      'Perform an arbitrary signed Onshape REST call. `path` is relative to /api/v10 (e.g. "/documents/d/{did}/w/{wid}/elements"). Returns the JSON response. Use this for any endpoint without a dedicated tool.',
    inputSchema: {
      method: z.enum(['GET', 'POST', 'DELETE', 'PUT', 'PATCH']).default('GET'),
      path: z.string().describe('Path relative to /api/v10, starting with "/".'),
      query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe('Query parameters.'),
      body: z.any().optional().describe('JSON body for POST/PUT/PATCH.'),
      host: hostArg,
    },
  },
  async ({ method, path: apiPath, query, body, host }) => {
    try {
      return toolResult(await onshape(method, apiPath, { query, body, host }));
    } catch (e) {
      return toolError(e);
    }
  },
);

server.registerTool(
  'onshape_list_elements',
  {
    title: 'List document elements',
    description:
      'List elements (tabs) in a document workspace/version. Defaults to the document/workspace configured in .env. Optionally filter by elementType (DRAWING, PARTSTUDIO, ASSEMBLY).',
    inputSchema: {
      documentId: z.string().optional().describe(`Document id (default ${DEFAULT_DID || 'unset'}).`),
      workspaceId: z.string().optional().describe(`Workspace id (default ${DEFAULT_WID || 'unset'}).`),
      versionId: z.string().optional().describe('Version id (use instead of workspaceId for a release).'),
      elementType: z.enum(['DRAWING', 'PARTSTUDIO', 'ASSEMBLY']).optional(),
      host: hostArg,
    },
  },
  async ({ documentId, workspaceId, versionId, elementType, host }) => {
    try {
      const did = documentId || DEFAULT_DID;
      const vid = versionId || (workspaceId ? '' : DEFAULT_VID);
      const wid = versionId ? '' : workspaceId || (vid ? '' : DEFAULT_WID);
      const wv = vid ? `v/${vid}` : `w/${wid}`;
      if (!did || (!wid && !vid)) throw new Error('documentId and a workspaceId or versionId are required.');
      const data = await onshape('GET', `/documents/d/${did}/${wv}/elements`, {
        query: elementType ? { elementType } : undefined,
        host,
      });
      return toolResult(data);
    } catch (e) {
      return toolError(e);
    }
  },
);

server.registerTool(
  'onshape_get_metadata',
  {
    title: 'Get element metadata',
    description:
      'Fetch metadata (Part number, Category, revision-managed flag, etc.) for one element. GET /metadata/d/{did}/{wv}/{wvid}/e/{eid}.',
    inputSchema: {
      elementId: z.string().describe('Element (tab) id.'),
      documentId: z.string().optional().describe(`Document id (default ${DEFAULT_DID || 'unset'}).`),
      workspaceId: z.string().optional().describe(`Workspace id (default ${DEFAULT_WID || 'unset'}).`),
      versionId: z.string().optional(),
      depth: z.number().optional().describe('Metadata depth (default 1).'),
      host: hostArg,
    },
  },
  async ({ elementId, documentId, workspaceId, versionId, depth, host }) => {
    try {
      const did = documentId || DEFAULT_DID;
      const vid = versionId || (workspaceId ? '' : DEFAULT_VID);
      const wid = versionId ? '' : workspaceId || (vid ? '' : DEFAULT_WID);
      const wv = vid ? `v/${vid}` : `w/${wid}`;
      if (!did || (!wid && !vid)) throw new Error('documentId and a workspaceId or versionId are required.');
      const data = await onshape('GET', `/metadata/d/${did}/${wv}/e/${elementId}`, {
        query: { depth: depth ?? 1 },
        host,
      });
      return toolResult(data);
    } catch (e) {
      return toolError(e);
    }
  },
);

server.registerTool(
  'onshape_get_bom',
  {
    title: 'Get assembly BOM',
    description: 'Return the (indented) bill of materials for an assembly element.',
    inputSchema: {
      elementId: z.string().describe('Assembly element id.'),
      documentId: z.string().optional().describe(`Document id (default ${DEFAULT_DID || 'unset'}).`),
      workspaceId: z.string().optional().describe(`Workspace id (default ${DEFAULT_WID || 'unset'}).`),
      versionId: z.string().optional(),
      indented: z.boolean().optional().describe('Indented (multi-level) BOM. Default true.'),
      host: hostArg,
    },
  },
  async ({ elementId, documentId, workspaceId, versionId, indented, host }) => {
    try {
      const did = documentId || DEFAULT_DID;
      const vid = versionId || (workspaceId ? '' : DEFAULT_VID);
      const wid = versionId ? '' : workspaceId || (vid ? '' : DEFAULT_WID);
      const wv = vid ? `v/${vid}` : `w/${wid}`;
      if (!did || (!wid && !vid)) throw new Error('documentId and a workspaceId or versionId are required.');
      const data = await onshape('GET', `/assemblies/d/${did}/${wv}/e/${elementId}/bom`, {
        query: { indented: indented ?? true },
        host,
      });
      return toolResult(data);
    } catch (e) {
      return toolError(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[onshape-mcp] server ready (stdio)');

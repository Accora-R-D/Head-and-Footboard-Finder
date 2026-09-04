// Environment configuration loading and validation.
//
// Loads variables from `.env` (via dotenv) and exposes a typed config object plus a
// helper that reports whether the Onshape integration is fully configured. Missing
// credentials do NOT crash the server — the static UI still loads and the API endpoints
// return a clear, actionable error instead.

import 'dotenv/config';

const DEFAULT_BASE_URL = 'https://cad.onshape.com/api/v10';

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: intFromEnv('PORT', 3000),
  onshape: {
    baseUrl: (process.env.ONSHAPE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    accessKey: process.env.ONSHAPE_ACCESS_KEY || '',
    secretKey: process.env.ONSHAPE_SECRET_KEY || '',
    documentId: process.env.ONSHAPE_DOCUMENT_ID || '',
    workspaceId: process.env.ONSHAPE_WORKSPACE_ID || '',
    versionId: process.env.ONSHAPE_VERSION_ID || '',
    exportTimeoutMs: intFromEnv('ONSHAPE_EXPORT_TIMEOUT_MS', 120_000),
    pollIntervalMs: intFromEnv('ONSHAPE_POLL_INTERVAL_MS', 1_500),
    // A persistent scratch branch (workspace) the pipeline reconfigures per request.
    // Pin one here so it is reused across restarts; if empty, one is created lazily.
    // (The API key can create/edit workspaces but not DELETE them, so we reuse one
    // rather than branch-per-request.)
    scratchWorkspaceId: process.env.ONSHAPE_SCRATCH_WORKSPACE_ID || '',
    // The configurable master assembly the drawings reference.
    masterAssemblyEid: process.env.ONSHAPE_MASTER_ASSEMBLY_EID || '',
    // Optional: parameter id of a COMBINED board+accessory assembly input. When set, the
    // pipeline drives that single input (e.g. "HB_Fabric") instead of separate Part +
    // Accessories inputs. Leave empty to keep the separate-input behaviour.
    combinedParamId: process.env.ONSHAPE_COMBINED_PARAM_ID || '',
    // The authored template drawings (with dimensions) per board type. The pipeline
    // copies one of these into a throwaway branch and re-points its assembly reference
    // at the selected configuration before exporting.
    templateHeadboardEid: process.env.ONSHAPE_TEMPLATE_HEADBOARD_EID || '',
    templateFootboardEid: process.env.ONSHAPE_TEMPLATE_FOOTBOARD_EID || '',
  },
};

/**
 * Determine whether the Onshape integration has everything it needs.
 * @returns {{ok: boolean, missing: string[]}}
 */
export function checkOnshapeConfig() {
  const { onshape } = config;
  const missing = [];
  if (!onshape.accessKey) missing.push('ONSHAPE_ACCESS_KEY');
  if (!onshape.secretKey) missing.push('ONSHAPE_SECRET_KEY');
  if (!onshape.documentId) missing.push('ONSHAPE_DOCUMENT_ID');
  if (!onshape.workspaceId && !onshape.versionId) {
    missing.push('ONSHAPE_WORKSPACE_ID or ONSHAPE_VERSION_ID');
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Determine whether the configuration-driven drawing pipeline has what it needs. This
 * requires a live workspace (branches cannot be created from a version), the master
 * assembly, and at least one template drawing.
 * @returns {{ok: boolean, missing: string[]}}
 */
export function checkPipelineConfig() {
  const base = checkOnshapeConfig();
  const missing = [...base.missing];
  const { onshape } = config;
  if (!onshape.workspaceId) missing.push('ONSHAPE_WORKSPACE_ID (a live workspace is required)');
  if (!onshape.masterAssemblyEid) missing.push('ONSHAPE_MASTER_ASSEMBLY_EID');
  if (!onshape.templateHeadboardEid && !onshape.templateFootboardEid) {
    missing.push('ONSHAPE_TEMPLATE_HEADBOARD_EID or ONSHAPE_TEMPLATE_FOOTBOARD_EID');
  }
  return { ok: missing.length === 0, missing };
}

/**
 * The workspace/version path segment used in Onshape element URLs, e.g. "w/abc" or
 * "v/def". Workspace takes precedence when both are configured.
 * @returns {{wv: 'w'|'v', wvid: string} | null}
 */
export function getWorkspaceOrVersion() {
  const { workspaceId, versionId } = config.onshape;
  if (workspaceId) return { wv: 'w', wvid: workspaceId };
  if (versionId) return { wv: 'v', wvid: versionId };
  return null;
}

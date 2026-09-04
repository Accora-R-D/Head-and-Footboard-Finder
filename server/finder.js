// Core domain logic for the Head and Footboard Finder.
//
// This module is the single source of truth for the four dropdowns. It is a pure,
// dependency-free module so it can be unit tested in isolation and reused by both the
// HTTP layer (server-side validation) and the frontend (via GET /api/options).

/**
 * @typedef {Object} OptionField
 * @property {string} id     Machine field name used in requests.
 * @property {string} label  Human label for the dropdown.
 * @property {Array<{value: string, code: string}>} options Allowed values + short codes.
 */

/**
 * The allowed dropdown options. `value` is what the user sees and sends; `code` is the
 * short, stable token used to build the deterministic drawing key.
 * @type {OptionField[]}
 */
// The field order here defines the order of codes in the drawing key
// (MODEL_BOARD_STYLE_WIDTH_ACCESSORIES) and the order of dropdowns in the UI, so it must
// match the Onshape drawing naming convention, e.g. "EMP_HB_CUS_UKW_FSR".
export const FIELDS = [
  {
    id: 'model',
    label: 'Bed model',
    options: [
      { value: 'Empresa', code: 'EMP' },
      { value: 'Altida', code: 'ALT' },
      { value: 'Contesa', code: 'CON' },
      { value: 'Presto', code: 'PRE' },
    ],
  },
  {
    id: 'board',
    label: 'Head or Footboard',
    options: [
      { value: 'Headboard', code: 'HB' },
      { value: 'Footboard', code: 'FB' },
    ],
  },
  {
    id: 'style',
    label: 'Style',
    options: [
      { value: 'Arc', code: 'ARC' },
      { value: 'Skandi', code: 'SKA' },
      { value: 'Belgrave', code: 'BEL' },
      { value: 'Carlton', code: 'CAR' },
      { value: 'Grosvenor', code: 'GRO' },
      { value: 'Custom', code: 'CUS' },
    ],
  },
  {
    id: 'width',
    label: 'Bed width',
    options: [
      { value: 'UK standard', code: 'UKS' },
      { value: 'UK wide', code: 'UKW' },
      { value: 'US standard', code: 'USS' },
      { value: 'US wide', code: 'USW' },
    ],
  },
  {
    id: 'accessories',
    label: 'Accessories',
    options: [
      { value: 'None', code: 'STD' },
      { value: 'Side panels', code: 'SP' },
      { value: 'Folding siderails', code: 'FSR' },
      { value: 'Fabric siderails', code: 'FBR' },
    ],
  },
];

/** Delimiter joining the codes in a drawing key, matching the Onshape naming convention. */
export const KEY_DELIMITER = '_';

/** Ordered list of field ids, used to keep the key/keywords deterministic. */
export const FIELD_ORDER = FIELDS.map((f) => f.id);

/** Lookup: fieldId -> Map(value -> code). Built once at module load. */
const CODE_LOOKUP = new Map(
  FIELDS.map((f) => [f.id, new Map(f.options.map((o) => [o.value, o.code]))]),
);

/**
 * An error type carrying an HTTP-friendly status and a user-facing message.
 */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/**
 * Shape of the option data returned to the frontend so dropdowns never drift from the
 * server's validation rules.
 * @returns {{id: string, label: string, options: string[]}[]}
 */
export function getOptions() {
  return FIELDS.map((f) => ({
    id: f.id,
    label: f.label,
    options: f.options.map((o) => o.value),
  }));
}

/**
 * Validate a raw specification coming from the client.
 * @param {Record<string, unknown>} raw
 * @returns {{model: string, width: string, style: string, accessories: string}} normalized spec
 * @throws {ValidationError} when a field is missing or not an allowed value.
 */
export function validateSpec(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('A bed specification object is required.');
  }

  /** @type {Record<string, string>} */
  const normalized = {};

  for (const field of FIELDS) {
    const value = raw[field.id];

    if (value === undefined || value === null || value === '') {
      throw new ValidationError(`Please choose a ${field.label.toLowerCase()}.`);
    }
    if (typeof value !== 'string') {
      throw new ValidationError(`${field.label} must be a text value.`);
    }
    if (!CODE_LOOKUP.get(field.id).has(value)) {
      const allowed = field.options.map((o) => o.value).join(', ');
      throw new ValidationError(
        `"${value}" is not a valid ${field.label.toLowerCase()}. Allowed values: ${allowed}.`,
      );
    }
    normalized[field.id] = value;
  }

  return /** @type {any} */ (normalized);
}

/**
 * Build the deterministic drawing lookup key, e.g. "EMP_HB_CUS_UKW_FSR".
 * The same normalized spec always produces the same key.
 * @param {Record<string, string>} spec A spec already passed through validateSpec.
 * @returns {string}
 */
export function buildDrawingKey(spec) {
  return FIELD_ORDER.map((id) => {
    const code = CODE_LOOKUP.get(id).get(spec[id]);
    if (!code) {
      throw new ValidationError(`Cannot build a drawing key: invalid ${id} "${spec[id]}".`);
    }
    return code;
  }).join(KEY_DELIMITER);
}

/**
 * Build the ordered, de-duplicated list of search keywords used to match an Onshape
 * drawing element by name. Includes the composed key, the individual short codes, and
 * the human labels (and their whitespace-free variants) so a wide range of drawing
 * naming conventions can be matched.
 * @param {Record<string, string>} spec A spec already passed through validateSpec.
 * @returns {string[]}
 */
export function buildKeywords(spec) {
  const key = buildDrawingKey(spec);
  const keywords = [key];

  for (const id of FIELD_ORDER) {
    const value = spec[id];
    const code = CODE_LOOKUP.get(id).get(value);
    keywords.push(code, value);
    const compact = value.replace(/\s+/g, '');
    if (compact !== value) keywords.push(compact);
  }

  // De-duplicate while preserving order.
  return [...new Set(keywords)];
}

/**
 * Convenience helper that validates a raw spec and returns everything the pipeline
 * needs downstream.
 * @param {Record<string, unknown>} raw
 * @returns {{spec: Record<string,string>, key: string, keywords: string[]}}
 */
export function analyseSpec(raw) {
  const spec = validateSpec(raw);
  return { spec, key: buildDrawingKey(spec), keywords: buildKeywords(spec) };
}

/**
 * Score how well a drawing element name matches the generated keywords. Higher is
 * better; 0 means no signal. Used to pick the best drawing from a document's elements.
 *
 * Scoring favours (in order): an exact drawing-key hit, then the number of distinct
 * keyword tokens present in the name.
 * @param {string} elementName The Onshape drawing element name.
 * @param {string} key The deterministic drawing key.
 * @param {string[]} keywords The generated keywords.
 * @returns {number}
 */
export function scoreDrawingName(elementName, key, keywords) {
  if (!elementName || typeof elementName !== 'string') return 0;
  const haystack = elementName.toLowerCase();

  let score = 0;

  // A direct hit on the full deterministic key is the strongest signal.
  if (haystack.includes(key.toLowerCase())) {
    score += 100;
  }

  // Count distinct keyword tokens present. Skip the full key (already scored) and very
  // short tokens that would match too loosely.
  const seen = new Set();
  for (const kw of keywords) {
    if (kw === key) continue;
    const token = kw.toLowerCase();
    if (token.length < 2 || seen.has(token)) continue;
    seen.add(token);
    if (haystack.includes(token)) score += 10;
  }

  return score;
}

/**
 * Choose the best-matching drawing element from a list of Onshape elements.
 * @param {Array<{id: string, name: string, elementType?: string, type?: string}>} elements
 * @param {string} key
 * @param {string[]} keywords
 * @returns {{element: object, score: number} | null} best match, or null if none score > 0.
 */
export function pickBestDrawing(elements, key, keywords) {
  let best = null;
  for (const element of elements || []) {
    const score = scoreDrawingName(element.name, key, keywords);
    if (score > 0 && (!best || score > best.score)) {
      best = { element, score };
    }
  }
  return best;
}

// Maps a validated bed specification to an Onshape configuration string for the master
// assembly, and selects which template drawing to use.
//
// The master assembly (see MEMORY / onshape-drawing-config-pipeline) exposes configuration
// parameters. Not every dropdown value is modelled yet — unmapped values raise a clear,
// user-facing error rather than producing a wrong drawing. `model` has no assembly
// parameter at all, so it does not affect the geometry today.
//
// Two modes are supported for board + accessories:
//  - Separate mode (default): board and accessories are two independent assembly inputs.
//  - Combined mode: when ONSHAPE_COMBINED_PARAM_ID is set, board + accessories are driven
//    by ONE combined assembly input (e.g. "HB_Fabric"). This matches the combined-input
//    restructure that makes two-input feature suppression reliable. See MEMORY.

import { config } from './config.js';

/**
 * Error for a selection that is valid in the UI but not yet modelled in the assembly.
 */
export class DrawingConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DrawingConfigError';
    this.status = 422;
  }
}

/**
 * Assembly configuration parameters, in the order they appear in the configuration string.
 * `field` is the dropdown id; `map` translates a dropdown value to the Onshape option token.
 */
export const ASSEMBLY_PARAMS = [
  {
    field: 'style',
    paramId: 'List_58mnZtVQkd93nm',
    label: 'Style',
    map: { Arc: 'Default', Carlton: 'Carlton', Custom: 'Custom' },
  },
  {
    field: 'width',
    paramId: 'List_AUAYvYYY28u7rc',
    label: 'Bed width',
    map: { 'UK standard': 'Default', 'UK wide': 'UK_Wide_width' },
  },
  {
    field: 'board',
    paramId: 'List_B7W0UrnQ4iBu7g',
    label: 'Head or Footboard',
    map: { Headboard: 'Default', Footboard: 'Footboard' },
  },
  {
    field: 'accessories',
    paramId: 'List_ksfpT5kdVZ96mX',
    label: 'Accessories',
    map: {
      None: 'None',
      'Side panels': 'Default',
      'Folding siderails': 'Folding_Siderail',
      'Fabric siderails': 'Fabric_Side_Rail',
    },
  },
];

// Combined-input mode: board + accessories collapse into one option token, e.g.
// "HB_Fabric". These must match the option values of the combined assembly input.
const COMBINED_BOARD = { Headboard: 'HB', Footboard: 'FB' };
const COMBINED_ACCESSORY = {
  None: 'None',
  'Side panels': 'Sidepanel',
  'Folding siderails': 'Folding',
  'Fabric siderails': 'Fabric',
};

/**
 * Build the Onshape configuration string for a validated spec.
 * In separate mode: "List_58mnZtVQkd93nm=Custom;List_AUAYvYYY28u7rc=UK_Wide_width;...".
 * In combined mode: style + width separately, plus one combined param, e.g.
 * "List_58mnZtVQkd93nm=Custom;List_AUAYvYYY28u7rc=UK_Wide_width;<combined>=HB_Fabric".
 * @param {Record<string, string>} spec
 * @returns {string}
 * @throws {DrawingConfigError} when a selected value has no modelled configuration option.
 */
export function buildConfiguration(spec) {
  const notModelled = [];
  const combinedParamId = config.onshape.combinedParamId;
  const parts = [];

  for (const p of ASSEMBLY_PARAMS) {
    // In combined mode, board + accessories are emitted as one param below, not here.
    if (combinedParamId && (p.field === 'board' || p.field === 'accessories')) continue;
    const value = spec[p.field];
    const token = p.map[value];
    if (token === undefined) {
      notModelled.push(`${p.label} "${value}"`);
    } else {
      parts.push(`${p.paramId}=${token}`);
    }
  }

  if (combinedParamId) {
    const b = COMBINED_BOARD[spec.board];
    const a = COMBINED_ACCESSORY[spec.accessories];
    if (b === undefined) notModelled.push(`Head or Footboard "${spec.board}"`);
    if (a === undefined) notModelled.push(`Accessories "${spec.accessories}"`);
    if (b !== undefined && a !== undefined) parts.push(`${combinedParamId}=${b}_${a}`);
  }

  if (notModelled.length > 0) {
    throw new DrawingConfigError(
      `This combination is not modelled in Onshape yet: ${notModelled.join(', ')} ` +
        'is not available in the master assembly configuration.',
    );
  }
  return parts.join(';');
}

/**
 * The template drawing element id for the chosen board type.
 * @param {Record<string, string>} spec
 * @returns {string}
 * @throws {DrawingConfigError} when the required template is not configured.
 */
export function templateForBoard(spec) {
  const { templateHeadboardEid, templateFootboardEid } = config.onshape;
  if (spec.board === 'Footboard') {
    if (!templateFootboardEid) {
      throw new DrawingConfigError('No footboard template configured (ONSHAPE_TEMPLATE_FOOTBOARD_EID).');
    }
    return templateFootboardEid;
  }
  if (!templateHeadboardEid) {
    throw new DrawingConfigError('No headboard template configured (ONSHAPE_TEMPLATE_HEADBOARD_EID).');
  }
  return templateHeadboardEid;
}

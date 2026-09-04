import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOptions,
  validateSpec,
  buildDrawingKey,
  buildKeywords,
  analyseSpec,
  scoreDrawingName,
  pickBestDrawing,
  ValidationError,
} from '../server/finder.js';

const VALID = {
  model: 'Empresa',
  board: 'Headboard',
  style: 'Arc',
  width: 'UK standard',
  accessories: 'None',
};

test('getOptions returns all five fields with their values', () => {
  const options = getOptions();
  assert.equal(options.length, 5);
  const byId = Object.fromEntries(options.map((f) => [f.id, f]));
  assert.deepEqual(byId.model.options, ['Empresa', 'Altida', 'Contesa', 'Presto']);
  assert.deepEqual(byId.board.options, ['Headboard', 'Footboard']);
  assert.deepEqual(byId.width.options, ['UK standard', 'UK wide', 'US standard', 'US wide']);
  assert.deepEqual(byId.style.options, ['Arc', 'Skandi', 'Belgrave', 'Carlton', 'Grosvenor', 'Custom']);
  assert.deepEqual(byId.accessories.options, [
    'None',
    'Side panels',
    'Folding siderails',
    'Fabric siderails',
  ]);
});

test('getOptions orders fields model, board, style, width, accessories', () => {
  assert.deepEqual(
    getOptions().map((f) => f.id),
    ['model', 'board', 'style', 'width', 'accessories'],
  );
});

test('validateSpec accepts a fully-specified valid spec', () => {
  const spec = validateSpec(VALID);
  assert.deepEqual(spec, VALID);
});

test('validateSpec rejects a missing field', () => {
  assert.throws(() => validateSpec({ ...VALID, style: '' }), ValidationError);
  assert.throws(() => validateSpec({ ...VALID, style: undefined }), ValidationError);
});

test('validateSpec rejects an unknown value', () => {
  assert.throws(
    () => validateSpec({ ...VALID, model: 'Zephyr' }),
    (err) => err instanceof ValidationError && /not a valid bed model/i.test(err.message),
  );
});

test('validateSpec rejects non-object input', () => {
  assert.throws(() => validateSpec(null), ValidationError);
  assert.throws(() => validateSpec('nope'), ValidationError);
});

test('buildDrawingKey is deterministic and matches the underscore convention', () => {
  assert.equal(buildDrawingKey(VALID), 'EMP_HB_ARC_UKS_STD');
  // Same input -> same key, always.
  assert.equal(buildDrawingKey(VALID), buildDrawingKey({ ...VALID }));
  // The real drawing the user created.
  assert.equal(
    buildDrawingKey({
      model: 'Empresa',
      board: 'Headboard',
      style: 'Custom',
      width: 'UK wide',
      accessories: 'Folding siderails',
    }),
    'EMP_HB_CUS_UKW_FSR',
  );
  assert.equal(
    buildDrawingKey({
      model: 'Contesa',
      board: 'Footboard',
      style: 'Grosvenor',
      width: 'US wide',
      accessories: 'Fabric siderails',
    }),
    'CON_FB_GRO_USW_FBR',
  );
});

test('buildKeywords includes the key, codes, labels and compact labels, de-duplicated', () => {
  const keywords = buildKeywords(VALID);
  assert.ok(keywords.includes('EMP_HB_ARC_UKS_STD'));
  assert.ok(keywords.includes('EMP'));
  assert.ok(keywords.includes('Empresa'));
  assert.ok(keywords.includes('HB'));
  assert.ok(keywords.includes('Headboard'));
  assert.ok(keywords.includes('UK standard'));
  assert.ok(keywords.includes('UKstandard'));
  // No duplicates.
  assert.equal(keywords.length, new Set(keywords).size);
});

test('analyseSpec returns spec, key and keywords together', () => {
  const { spec, key, keywords } = analyseSpec(VALID);
  assert.deepEqual(spec, VALID);
  assert.equal(key, 'EMP_HB_ARC_UKS_STD');
  assert.ok(Array.isArray(keywords) && keywords.length > 0);
});

test('scoreDrawingName rewards a full-key hit over partial keyword hits', () => {
  const key = 'EMP_HB_ARC_UKS_STD';
  const keywords = buildKeywords(VALID);
  const exact = scoreDrawingName('DWG EMP_HB_ARC_UKS_STD headboard', key, keywords);
  const partial = scoreDrawingName('Empresa Arc headboard', key, keywords);
  const none = scoreDrawingName('Some unrelated drawing', key, keywords);
  assert.ok(exact > partial);
  assert.ok(partial > 0);
  assert.equal(none, 0);
});

test("scoreDrawingName matches the user's real drawing name", () => {
  const { key, keywords } = analyseSpec({
    model: 'Empresa',
    board: 'Headboard',
    style: 'Custom',
    width: 'UK wide',
    accessories: 'Folding siderails',
  });
  assert.ok(scoreDrawingName('EMP_HB_CUS_UKW_FSR', key, keywords) >= 100);
});

test('pickBestDrawing selects the highest-scoring element', () => {
  const key = 'EMP_HB_ARC_UKS_STD';
  const keywords = buildKeywords(VALID);
  const elements = [
    { id: '1', name: 'Random assembly drawing' },
    { id: '2', name: 'Empresa Arc footboard' },
    { id: '3', name: 'EMP_HB_ARC_UKS_STD head and footboard' },
  ];
  const best = pickBestDrawing(elements, key, keywords);
  assert.equal(best.element.id, '3');
});

test('pickBestDrawing returns null when nothing matches', () => {
  const key = 'EMP_HB_ARC_UKS_STD';
  const keywords = buildKeywords(VALID);
  const best = pickBestDrawing([{ id: '1', name: 'Totally unrelated' }], key, keywords);
  assert.equal(best, null);
});

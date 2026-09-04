import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config.js';
import {
  buildConfiguration,
  templateForBoard,
  DrawingConfigError,
} from '../server/drawingConfig.js';

test('buildConfiguration produces the assembly configuration string for a modelled spec', () => {
  const cfg = buildConfiguration({
    model: 'Empresa',
    board: 'Headboard',
    style: 'Custom',
    width: 'UK wide',
    accessories: 'Folding siderails',
  });
  assert.equal(
    cfg,
    'List_58mnZtVQkd93nm=Custom;List_AUAYvYYY28u7rc=UK_Wide_width;List_B7W0UrnQ4iBu7g=Default;List_ksfpT5kdVZ96mX=Folding_Siderail',
  );
});

test('buildConfiguration maps default-token values correctly', () => {
  const cfg = buildConfiguration({
    model: 'Altida',
    board: 'Footboard',
    style: 'Arc',
    width: 'UK standard',
    accessories: 'Side panels',
  });
  assert.equal(
    cfg,
    'List_58mnZtVQkd93nm=Default;List_AUAYvYYY28u7rc=Default;List_B7W0UrnQ4iBu7g=Footboard;List_ksfpT5kdVZ96mX=Default',
  );
});

test('buildConfiguration rejects a style not modelled in the assembly', () => {
  assert.throws(
    () =>
      buildConfiguration({
        model: 'Empresa',
        board: 'Headboard',
        style: 'Skandi',
        width: 'UK standard',
        accessories: 'None',
      }),
    (err) => err instanceof DrawingConfigError && /Skandi/.test(err.message),
  );
});

test('buildConfiguration rejects a width not modelled in the assembly', () => {
  assert.throws(
    () =>
      buildConfiguration({
        model: 'Empresa',
        board: 'Headboard',
        style: 'Arc',
        width: 'US wide',
        accessories: 'None',
      }),
    (err) => err instanceof DrawingConfigError && /US wide/.test(err.message),
  );
});

test('combined mode drives one board+accessory param plus style and width', () => {
  const saved = config.onshape.combinedParamId;
  try {
    config.onshape.combinedParamId = 'List_COMBINED';
    const cfg = buildConfiguration({
      model: 'Empresa',
      board: 'Headboard',
      style: 'Custom',
      width: 'UK wide',
      accessories: 'Fabric siderails',
    });
    assert.equal(
      cfg,
      'List_58mnZtVQkd93nm=Custom;List_AUAYvYYY28u7rc=UK_Wide_width;List_COMBINED=HB_Fabric',
    );

    const fb = buildConfiguration({
      model: 'Contesa',
      board: 'Footboard',
      style: 'Arc',
      width: 'UK standard',
      accessories: 'None',
    });
    assert.equal(
      fb,
      'List_58mnZtVQkd93nm=Default;List_AUAYvYYY28u7rc=Default;List_COMBINED=FB_None',
    );
  } finally {
    config.onshape.combinedParamId = saved;
  }
});

test('combined mode still rejects an unmodelled style/width', () => {
  const saved = config.onshape.combinedParamId;
  try {
    config.onshape.combinedParamId = 'List_COMBINED';
    assert.throws(
      () =>
        buildConfiguration({
          model: 'Empresa',
          board: 'Headboard',
          style: 'Skandi',
          width: 'UK standard',
          accessories: 'Side panels',
        }),
      DrawingConfigError,
    );
  } finally {
    config.onshape.combinedParamId = saved;
  }
});

test('templateForBoard returns the configured template id and errors when missing', () => {
  const savedHb = config.onshape.templateHeadboardEid;
  const savedFb = config.onshape.templateFootboardEid;
  try {
    config.onshape.templateHeadboardEid = 'HB_EID';
    config.onshape.templateFootboardEid = 'FB_EID';
    assert.equal(templateForBoard({ board: 'Headboard' }), 'HB_EID');
    assert.equal(templateForBoard({ board: 'Footboard' }), 'FB_EID');

    config.onshape.templateFootboardEid = '';
    assert.throws(() => templateForBoard({ board: 'Footboard' }), DrawingConfigError);
  } finally {
    config.onshape.templateHeadboardEid = savedHb;
    config.onshape.templateFootboardEid = savedFb;
  }
});

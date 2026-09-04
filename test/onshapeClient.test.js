import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { config } from '../server/config.js';
import {
  OnshapeClient,
  OnshapeApiError,
  buildSignedHeaders,
  createNonce,
} from '../server/onshapeClient.js';

const KEYS = { accessKey: 'ACCESS123', secretKey: 'SECRET456' };

test('createNonce produces a 25-char alphanumeric string', () => {
  const nonce = createNonce();
  assert.equal(nonce.length, 25);
  assert.match(nonce, /^[A-Za-z0-9]{25}$/);
});

test('buildSignedHeaders matches the Onshape HMAC-SHA256 scheme', () => {
  const date = 'Mon, 20 Jul 2026 10:00:00 GMT';
  const nonce = 'abcdefghij0123456789ABCDE';
  const headers = buildSignedHeaders({
    method: 'GET',
    pathname: '/api/v10/documents/d/DID/w/WID/elements',
    query: 'elementType=DRAWING',
    ...KEYS,
    date,
    nonce,
  });

  // Recompute the expected signature independently.
  const stringToSign = [
    'GET',
    nonce,
    date,
    'application/json',
    '/api/v10/documents/d/DID/w/WID/elements',
    'elementType=DRAWING',
    '',
  ].join('\n').toLowerCase();
  const expected = crypto.createHmac('sha256', KEYS.secretKey).update(stringToSign).digest('base64');

  assert.equal(headers.Authorization, `On ${KEYS.accessKey}:HmacSHA256:${expected}`);
  assert.equal(headers['On-Nonce'], nonce);
  assert.equal(headers.Date, date);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers.Accept, 'application/json');
});

test('buildSignedHeaders is deterministic for identical date/nonce and varies by method', () => {
  const base = {
    pathname: '/api/v10/translations/T1',
    query: '',
    ...KEYS,
    date: 'Mon, 20 Jul 2026 10:00:00 GMT',
    nonce: 'abcdefghij0123456789ABCDE',
  };
  const a = buildSignedHeaders({ method: 'GET', ...base });
  const b = buildSignedHeaders({ method: 'GET', ...base });
  const c = buildSignedHeaders({ method: 'POST', ...base });
  assert.equal(a.Authorization, b.Authorization);
  assert.notEqual(a.Authorization, c.Authorization);
});

/** Build a fetch stub that returns queued responses and records requests. */
function stubFetch(queue) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error('stubFetch: no more queued responses');
    const body = typeof next.body === 'string' ? next.body : JSON.stringify(next.body ?? {});
    return new Response(body, { status: next.status ?? 200 });
  };
  fn.calls = calls;
  return fn;
}

function makeClient(fetchImpl, extra = {}) {
  return new OnshapeClient({ ...KEYS, baseUrl: 'https://cad.onshape.com/api/v10', fetch: fetchImpl, ...extra });
}

test('buildUrl composes base, path and query', () => {
  const client = makeClient(stubFetch([]));
  const url = client.buildUrl('/documents/d/DID/w/WID/elements', { elementType: 'DRAWING' });
  assert.equal(url.pathname, '/api/v10/documents/d/DID/w/WID/elements');
  assert.equal(url.searchParams.get('elementType'), 'DRAWING');
});

test('requestJson signs the request and throws OnshapeApiError on non-2xx', async () => {
  const fetchImpl = stubFetch([{ status: 403, body: { message: 'Forbidden' } }]);
  const client = makeClient(fetchImpl);
  await assert.rejects(
    () => client.requestJson({ method: 'GET', path: '/translations/T1' }),
    (err) => err instanceof OnshapeApiError && err.status === 403 && /Forbidden/.test(err.message),
  );
  // Verify the request carried a signed Authorization header.
  assert.equal(fetchImpl.calls.length, 1);
  assert.match(fetchImpl.calls[0].init.headers.Authorization, /^On ACCESS123:HmacSHA256:/);
});

test('findDrawing lists DRAWING elements and picks the best match', async () => {
  config.onshape.documentId = 'DID';
  config.onshape.workspaceId = 'WID';
  config.onshape.versionId = '';

  const fetchImpl = stubFetch([
    {
      status: 200,
      body: [
        { id: 'e1', name: 'Random drawing', elementType: 'DRAWING' },
        { id: 'e2', name: 'EMP-UKS-ARC-STD headboard', elementType: 'DRAWING' },
      ],
    },
  ]);
  const client = makeClient(fetchImpl);
  const keywords = ['EMP-UKS-ARC-STD', 'EMP', 'Empresa', 'ARC', 'Arc'];
  const drawing = await client.findDrawing('EMP-UKS-ARC-STD', keywords);
  assert.equal(drawing.id, 'e2');
  // The elements request lists the document's elements (drawings are filtered client-side).
  assert.match(fetchImpl.calls[0].url, /\/documents\/d\/DID\/w\/WID\/elements$/);
});

test('listDrawings detects both native and modern app drawings', async () => {
  config.onshape.documentId = 'DID';
  config.onshape.workspaceId = 'WID';
  const fetchImpl = stubFetch([
    {
      status: 200,
      body: [
        { id: 'p1', name: 'Style_Arc', elementType: 'PARTSTUDIO', dataType: 'onshape/partstudio' },
        { id: 'd1', name: 'Legacy drawing', elementType: 'DRAWING', dataType: 'onshape/drawing' },
        { id: 'd2', name: 'DWG_HB_ Belong', elementType: 'APPLICATION', dataType: 'onshape-app/drawing' },
      ],
    },
  ]);
  const client = makeClient(fetchImpl);
  const drawings = await client.listDrawings();
  assert.deepEqual(drawings.map((d) => d.id).sort(), ['d1', 'd2']);
});

test('findDrawing throws a 404 when no drawing matches', async () => {
  config.onshape.documentId = 'DID';
  config.onshape.workspaceId = 'WID';
  const fetchImpl = stubFetch([
    { status: 200, body: [{ id: 'e1', name: 'Unrelated', elementType: 'DRAWING' }] },
  ]);
  const client = makeClient(fetchImpl);
  await assert.rejects(
    () => client.findDrawing('EMP-UKS-ARC-STD', ['EMP-UKS-ARC-STD']),
    (err) => err instanceof OnshapeApiError && err.status === 404,
  );
});

test('startPdfExport returns the translation id', async () => {
  config.onshape.documentId = 'DID';
  config.onshape.workspaceId = 'WID';
  const fetchImpl = stubFetch([{ status: 200, body: { id: 'TR-1', requestState: 'ACTIVE' } }]);
  const client = makeClient(fetchImpl);
  const id = await client.startPdfExport('e2');
  assert.equal(id, 'TR-1');
  assert.equal(fetchImpl.calls[0].init.method, 'POST');
  assert.match(fetchImpl.calls[0].url, /\/drawings\/d\/DID\/w\/WID\/e\/e2\/translations$/);
});

test('createBranch posts a new workspace and returns its id', async () => {
  config.onshape.documentId = 'DID';
  const fetchImpl = stubFetch([{ status: 200, body: { id: 'BRANCH-1', name: 'x' } }]);
  const client = makeClient(fetchImpl);
  const wid = await client.createBranch('finder-tmp');
  assert.equal(wid, 'BRANCH-1');
  assert.equal(fetchImpl.calls[0].init.method, 'POST');
  assert.match(fetchImpl.calls[0].url, /\/documents\/d\/DID\/workspaces$/);
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), { name: 'finder-tmp', isPublic: false });
});

test('findReferenceTo returns the reference matching the target element', async () => {
  config.onshape.documentId = 'DID';
  const fetchImpl = stubFetch([
    {
      status: 200,
      body: [
        { referenceId: 'r1', targetElementId: 'other', targetConfiguration: 'a=b' },
        { referenceId: 'r2', targetElementId: 'ASM', targetConfiguration: 'List_x=Custom' },
      ],
    },
  ]);
  const client = makeClient(fetchImpl);
  const ref = await client.findReferenceTo('BRANCH-1', 'DWG', 'ASM');
  assert.equal(ref.referenceId, 'r2');
  assert.match(fetchImpl.calls[0].url, /\/appelements\/d\/DID\/w\/BRANCH-1\/e\/DWG\/references$/);
});

test('setReferenceConfiguration posts the new configuration to the reference', async () => {
  config.onshape.documentId = 'DID';
  const fetchImpl = stubFetch([{ status: 200, body: {} }]);
  const client = makeClient(fetchImpl);
  await client.setReferenceConfiguration('BRANCH-1', 'DWG', 'r2', 'List_x=Carlton');
  const call = fetchImpl.calls[0];
  assert.equal(call.init.method, 'POST');
  assert.match(call.url, /\/appelements\/d\/DID\/w\/BRANCH-1\/e\/DWG\/references\/r2$/);
  assert.deepEqual(JSON.parse(call.init.body), {
    referenceId: 'r2',
    targetConfiguration: 'List_x=Carlton',
  });
});

test('startPdfExport can target a specific workspace', async () => {
  config.onshape.documentId = 'DID';
  const fetchImpl = stubFetch([{ status: 200, body: { id: 'TR-9' } }]);
  const client = makeClient(fetchImpl);
  const id = await client.startPdfExport('DWG', { workspaceId: 'BRANCH-1' });
  assert.equal(id, 'TR-9');
  assert.match(fetchImpl.calls[0].url, /\/drawings\/d\/DID\/w\/BRANCH-1\/e\/DWG\/translations$/);
});

test('waitForTranslation polls until DONE and returns external data ids', async () => {
  const fetchImpl = stubFetch([
    { status: 200, body: { requestState: 'ACTIVE' } },
    { status: 200, body: { requestState: 'DONE', resultExternalDataIds: ['FD-9'] } },
  ]);
  const client = makeClient(fetchImpl, { pollIntervalMs: 0, exportTimeoutMs: 5000 });
  const ticks = [];
  const ids = await client.waitForTranslation('TR-1', (s) => ticks.push(s));
  assert.deepEqual(ids, ['FD-9']);
  assert.deepEqual(ticks, ['ACTIVE', 'DONE']);
});

test('waitForTranslation throws when the translation FAILED', async () => {
  const fetchImpl = stubFetch([
    { status: 200, body: { requestState: 'FAILED', failureReason: 'bad element' } },
  ]);
  const client = makeClient(fetchImpl, { pollIntervalMs: 0 });
  await assert.rejects(
    () => client.waitForTranslation('TR-1'),
    (err) => err instanceof OnshapeApiError && /bad element/.test(err.message),
  );
});

test('downloadExternalData returns a Buffer of the response body', async () => {
  config.onshape.documentId = 'DID';
  const fetchImpl = stubFetch([{ status: 200, body: '%PDF-1.7 fake pdf bytes' }]);
  const client = makeClient(fetchImpl);
  const buf = await client.downloadExternalData('FD-9');
  assert.ok(Buffer.isBuffer(buf));
  assert.match(buf.toString('utf8'), /^%PDF-1\.7/);
  assert.equal(fetchImpl.calls[0].init.headers.Accept, 'application/octet-stream');
});

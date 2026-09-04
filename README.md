# Head and Footboard Finder

A production-quality browser application for exporting bed head/footboard drawings from
PTC Onshape as PDFs. A user selects a bed specification from four dropdowns; the server
validates it, derives a deterministic drawing key, locates the matching Onshape **Drawing**
element, exports it to PDF, waits for the asynchronous export, and streams the finished PDF
back to the browser — with live progress and clear error states throughout.

## How it works

The app drives a **configurable master assembly**: the five dropdowns select an Onshape
configuration, which is applied to an authored **template drawing** (with real dimensions)
before it is exported to PDF. Dimensions follow the configuration automatically, so one
template covers many variants.

```
Browser (dropdowns)
   │  GET /api/finder/stream?model=…&board=…&style=…&width=…&accessories=…   (SSE)
   ▼
Server pipeline
   1. Validate specification             → server/finder.js       (validateSpec)
   2. Build configuration + pick template→ server/drawingConfig.js (buildConfiguration / templateForBoard)
   3. Prepare a scratch workspace        → server/onshapeClient.js (createBranch, reused)
   4. Apply the configuration to the ref → server/onshapeClient.js (setReferenceConfiguration)
   5. Start PDF export (translation)     → server/onshapeClient.js (startPdfExport)
   6. Poll until DONE/FAILED             → server/onshapeClient.js (waitForTranslation)
   7. Download the external data (PDF)   → server/onshapeClient.js (downloadExternalData)
   8. Buffer + return a download URL     → server/routes/finder.js
   ▼
Browser downloads  GET /api/finder/result/:jobId
```

Steps 4–7 run under an in-process lock: the scratch workspace is shared, so requests are
serialized to avoid clobbering each other's configuration. Every Onshape request is signed
with Onshape's **API-key HMAC-SHA256** scheme, so the secret key never leaves the server.

The deterministic key (e.g. `EMP_HB_CUS_UKW_FSR`) is still generated — it names the
downloaded PDF file. `model` has no assembly parameter yet, so it appears in the filename
but does not change the geometry. Combinations not modelled in the assembly (e.g. Skandi,
US widths) return a clear "not modelled yet" message.

### Deterministic drawing key

Each dropdown value maps to a short, stable code; the codes are joined with underscores in
a fixed field order — `MODEL_BOARD_STYLE_WIDTH_ACCESSORIES` — matching the Onshape drawing
naming convention:

| Bed model  |     | Head/Footboard |    | Style     |     | Bed width   |     | Accessories       |     |
| ---------- | --- | -------------- | -- | --------- | --- | ----------- | --- | ----------------- | --- |
| Empresa    | EMP | Headboard      | HB | Arc       | ARC | UK standard | UKS | None              | STD |
| Altida     | ALT | Footboard      | FB | Skandi    | SKA | UK wide     | UKW | Side panels       | SP  |
| Contesa    | CON |                |    | Belgrave  | BEL | US standard | USS | Folding siderails | FSR |
| Presto     | PRE |                |    | Carlton   | CAR | US wide     | USW | Fabric siderails  | FBR |
|            |     |                |    | Grosvenor | GRO |             |     |                   |     |
|            |     |                |    | Custom    | CUS |             |     |                   |     |

Example: Empresa / Headboard / Custom / UK wide / Folding siderails → key
`EMP_HB_CUS_UKW_FSR`. Name each Onshape drawing to **contain** its key (case-insensitive;
extra text such as `DWG_` or `Headboard` is fine). The keyword list (key + codes + human
labels) is scored against each drawing element's name; an exact key hit scores highest, and
individual codes also score, so matching is tolerant of surrounding text and minor ordering
differences.

## Prerequisites

- **Node.js 18.17+** (uses the built-in `fetch` and `node:test`).
- An Onshape account with an **API key pair** (create one at
  <https://dev-portal.onshape.com>).
- An Onshape **document** containing your bed drawings, named so the keyword scoring can
  match them (e.g. a drawing element named `EMP-UKS-ARC-STD head and footboard`).

## Setup

```bash
npm install
cp .env.example .env   # then edit .env with your credentials
```

Fill in `.env`:

| Variable                 | Required | Notes                                              |
| ------------------------ | -------- | -------------------------------------------------- |
| `ONSHAPE_ACCESS_KEY`     | yes      | Onshape API access key.                            |
| `ONSHAPE_SECRET_KEY`     | yes      | Onshape API secret key.                            |
| `ONSHAPE_DOCUMENT_ID`    | yes      | Document holding the drawings.                     |
| `ONSHAPE_WORKSPACE_ID`   | one of   | Live workspace id (takes precedence).              |
| `ONSHAPE_VERSION_ID`     | one of   | Immutable version id (used if no workspace).       |
| `ONSHAPE_MASTER_ASSEMBLY_EID` | yes | The configurable master assembly element id.       |
| `ONSHAPE_TEMPLATE_HEADBOARD_EID` | one | Authored headboard template drawing element id.  |
| `ONSHAPE_TEMPLATE_FOOTBOARD_EID` | one | Authored footboard template drawing element id.  |
| `ONSHAPE_SCRATCH_WORKSPACE_ID` | rec | Persistent scratch branch reused per request (see below). |
| `ONSHAPE_BASE_URL`       | no       | Defaults to `https://cad.onshape.com/api/v10`.     |
| `PORT`                   | no       | Defaults to `3000`.                                |
| `ONSHAPE_EXPORT_TIMEOUT_MS` | no    | Max wait for the export (default 120000).          |
| `ONSHAPE_POLL_INTERVAL_MS` | no     | Poll cadence (default 1500).                       |

The pipeline reconfigures a drawing in a scratch branch off your main workspace. Because
the API key can create/edit but **not delete** workspaces, the app reuses one persistent
scratch branch instead of creating a throwaway per request. Pin its id in
`ONSHAPE_SCRATCH_WORKSPACE_ID`; if left empty, one is created on first use and its id is
logged so you can pin it.

The ids come from a document URL:
`https://cad.onshape.com/documents/<DOCUMENT_ID>/w/<WORKSPACE_ID>/e/<ELEMENT_ID>`.

## Run

```bash
npm start        # http://localhost:3000
npm run dev      # same, with auto-reload (node --watch)
```

The static UI loads even without credentials, so you can inspect it; export requests will
return a clear "credentials not configured" error until `.env` is complete.

## Test

```bash
npm test
```

Unit tests (Node's built-in runner, no live credentials needed) cover:

- specification validation and error messages,
- deterministic key / keyword generation,
- drawing-name keyword scoring and best-match selection,
- Onshape HMAC-SHA256 signature construction, and
- the export → poll → download client flow (with `fetch` stubbed).

## End-to-end verification (requires real credentials)

1. Complete `.env` with valid keys and a document containing matching drawings.
2. `npm start`, open the app, pick a value in each of the four dropdowns.
3. Click **Find drawing & export PDF** and watch the live progress checklist.
4. The matching PDF downloads automatically; a manual download link is also shown.

## Project structure

```
server/
  index.js          Express bootstrap + static hosting
  config.js         env loading/validation (+ checkPipelineConfig)
  finder.js         options, validation, deterministic key (pure, tested)
  drawingConfig.js  spec -> Onshape configuration string + template selection (tested)
  onshapeClient.js  HMAC signing + Onshape operations (branch, references, export)
  routes/finder.js  /api/options, /api/key, SSE stream, PDF download
public/
  index.html  styles.css  app.js
test/
  finder.test.js  onshapeClient.test.js
```

## Security notes

- Secrets are read from the environment only; `.env` is git-ignored and never shipped.
- The secret key is used solely to compute per-request HMAC signatures server-side.
- Finished PDFs are buffered in memory with a short TTL and served once via an opaque
  job id.

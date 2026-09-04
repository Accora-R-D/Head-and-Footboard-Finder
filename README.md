# Head and Footboard Finder

Finds released standard inventory items in PTC Arena and returns the released,
revision-managed PDF. See `CLAUDE.md` for the full architecture and the phased
plan; this README covers what currently exists and how to run it.

## What is built

The Arena service — the first slice of the standard item path described in
`CLAUDE.md` section 4.2.

```
services/arena/
    config.py        Loads and validates config/arena.yaml
    client.py        Session handling, retries, error mapping
    items.py         Released-item search and dropdown options
    attachments.py   Released PDF retrieval
    models.py        Item, Dimension, ReleasedDocument
    transport.py     HTTP transport, plus a fake for testing
    errors.py
```

There is no UI yet, and no Onshape integration. Those come later in the plan.

## Running it today, without Arena access

```bash
python3 scripts/demo_search.py --demo
```

This runs the whole path against a built-in fake Arena holding invented items.
It shows the dropdowns narrowing over released data, a search, and a PDF
retrieval, and it demonstrates that an in-work item never appears.

```bash
python3 -m unittest discover -s tests -t .
```

38 tests, no dependencies beyond `PyYAML`. Nothing here touches the network.

## Running it against real Arena

Two things are needed, and neither can be guessed.

### 1. Configuration

```bash
cp config/arena.example.yaml config/arena.yaml
```

The example file ships with **every value blank on purpose**. `CLAUDE.md`
forbids inventing Arena API endpoints and guessing Arena attribute names, so
the loader refuses to start until a human fills it in, and names each missing
field:

```
ArenaConfigError: Arena config at config/arena.yaml is incomplete or unverified:
  - api.base_url is blank. Take it from the Arena REST API documentation.
  - api.endpoints.login is blank. Take the path from the Arena REST API
    documentation; do not guess it.
  - lifecycle.released_states is empty. Until it lists the Arena lifecycle
    states that count as released, no item can be treated as findable.
  - attributes.width.arena_name is blank. Confirm the attribute in Arena, or
    remove the parameter so it is not offered as a dropdown.
```

You need, from the Arena REST API documentation:

* The API base URL.
* The six endpoint paths.
* The session token header name.

And from your own Arena workspace:

* Which lifecycle state names count as released.
* The attribute holding each searchable parameter, and its unit where
  dimensional.

### 2. Credentials

```bash
cp .env.example .env
```

Then export them; they are read from the environment and never from the repo.

```bash
python3 scripts/demo_search.py --family Inventory --type Headboard --download
```

## Rules the code enforces

These come from `CLAUDE.md` and are covered by tests:

| Rule | Where |
| --- | --- |
| Only released items are returned | `items.py`, `test_items.py` |
| An Arena failure is never reported as "no results" | `client.py`, `test_items.py` |
| Several matches are all shown, never narrowed to one | `models.py`, `test_items.py` |
| Matching is on structured attributes, never on descriptions | `items.py` |
| Dimensional values carry units; a bare number is rejected | `models.py`, `test_items.py` |
| Units are never silently converted | `items.py`, `test_items.py` |
| An unreleased item is never served through this route | `attachments.py`, `test_attachments.py` |
| A released PDF is passed through byte for byte | `attachments.py`, `test_attachments.py` |
| A released item with no PDF is a reported fault | `attachments.py`, `test_attachments.py` |
| Several PDFs with no rule is ambiguous, not a guess | `attachments.py`, `test_attachments.py` |
| A superseded revision is labelled in the filename | `models.py`, `test_attachments.py` |

## Known gaps

* **Every Arena API detail is unverified.** Endpoint paths, the login response
  shape, the search response envelope, and the attribute payload shape are all
  placeholders or best-effort tolerant parsing. Expect to adjust
  `config/arena.yaml` and possibly the response readers once the real API is in
  front of you.
* **Which attachment is the drawing PDF** is unresolved where an item has
  several. The code raises rather than choosing; set `files.drawing_category`
  once the rule is agreed.
* **No caching yet.** Every dropdown interaction currently hits Arena. The
  caching strategy is an open decision in `CLAUDE.md`.
* **No role handling.** `include_unreleased` and `allow_unreleased` exist for
  the historical-revision view but nothing checks a user's role yet.

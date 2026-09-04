# Fixings by expression — simple step-by-step

Goal: the fixings appear only when the board is **upholstered** and the **accessory** calls for
them — written as **one formula per fastener**, so new veneered styles need no changes. Bolts stay
top-level, so the **BOM is untouched**.

Mechanism: Onshape **dynamic suppression** — you give an instance a suppression *expression*
instead of ticking table rows. When the expression is **true, the part is suppressed**.

> Prototype on ONE bolt first (steps 1–4 below), toggle the dropdowns to confirm it behaves, then
> repeat for the rest. Expression suppression works in assemblies, but confirm it in your tier
> before rolling out.

---

## The simple example (do this first)

Rule in plain English: **show the socket screws only when the style is upholstered AND
Accessories = Default.**

### Step 1 — give the options readable ids
Configure `MASTER_ASSEMBLIES`. For the **Style** and **Accessories** inputs, make sure each option
has a clean id (Edit input → the id field): `Style` → `Carlton`, `Custom`, `Belong`, `Arc`;
`Accessories` → `Default`, `None`, etc. (Rename the current `Default` style to `Arc` while you're
here — it *is* the veneered one.)

### Step 2 — add a logic variable
Configure → **Add configuration variable** → name it `upholstered`, type it as a boolean/expression,
and set its value to the list of upholstered styles:

```
Style == Carlton || Style == Custom || Style == Belong
```

Anything not in that list (Arc, and every future veneered style) is automatically **not**
upholstered — that's what makes it future-proof.

### Step 3 — put an expression on the bolt's suppression
Right-click a `Socket button head screw` instance → **Suppress → convert to expression** (a.k.a.
dynamic suppression). Enter:

```
!( upholstered && Accessories == Default )
```

The leading `!` means "suppress when NOT (upholstered and standard fixings)". Do the same for the
other 3 screws and the 4 `P164-018`.

### Step 4 — test
Toggle the dropdowns:
- Arc + anything → screws **gone**.
- Custom/Carlton/Belong + Accessories=Default → screws **present**.
- Any style + None/Fabric/Folding → screws **gone**.

If it behaves inverted (present when it should hide), just remove the leading `!`.

That's the whole idea. Everything below is only to match the finer per-style behaviour you already
have.

---

## The exact formulas per fastener (from your current model)

Your fixings aren't uniform — the measured behaviour is below, written as ready expressions.
Reference options by their ids; use the expression editor's picker to insert exact tokens.
Operators: `&&` = and, `||` = or, `!` = not.

Helper variable (from Step 2):
```
upholstered =  Style == Carlton || Style == Custom || Style == Belong
```

**Socket screws + P164-018** — headboards of any upholstered style, but only *Belong* footboards,
and only with standard fixings:
```
suppress =  !(  upholstered
             && Accessories == Default
             && ( HeadOrFootboard == Default || Style == Belong )  )
```

**M6 × 9mm Tee nut** — only the Custom style (any accessory, either board):
```
suppress =  !( Style == Custom )
```

**M8 × 11mm Tee nut** — only footboards, Custom or Belong:
```
suppress =  !( HeadOrFootboard == Footboard && ( Style == Custom || Style == Belong ) )
```

**M6 / M8 threaded inserts** — these were inactive in every combination I sampled, so they're
likely driven by another input (e.g. Bed width) or unused. Leave their current config, or tell me
and I'll map them.

> Replace `HeadOrFootboard` / `Accessories` / `Style` with the exact input names/ids as they appear
> in your Configure dialog. The input ids in this document are:
> Style = `List_58mnZtVQkd93nm`, Accessories = `List_ksfpT5kdVZ96mX`, Head/Footboard = `List_B7W0UrnQ4iBu7g`.

---

## Why this is the one to use

- **BOM unchanged** — the fixings are still top-level instances, just suppressed by formula.
- **Future-proof** — a new veneered style is simply absent from the `upholstered` list, so every
  fixing expression already excludes it. Zero edits. (A new *upholstered* style just gets added to
  that one list.)
- **Auditable** — one readable formula per fastener instead of a growing tick matrix.

## Before you start
Fix the broken `HB_Arc_Core <1>` instance (dangling reference) so the veneered/Arc result — and its
BOM row — is clean. Then build Step 1–4 on a single bolt and confirm before doing the rest.

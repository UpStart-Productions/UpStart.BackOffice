# Upstart state library: batch for review

Status: **FOR REVIEW**. The visual system is approved; these 30 new design families and their individual choreography are candidates awaiting Jeff's review. Existing approved invoice, success, and error files in the parent `states` directory are unchanged.

## Open the batch

Open `index.html` in a browser, or use `/illustrations/states/review/index.html` while the existing Upstart app is running. The gallery is self-contained and also opens offline. Choose a design using the dropdown or thumbnail grid, then Replay animation. The selected large illustration and its 24/32/48 px compact versions replay together.

The 30 designs cover the app inventory through reusable families. `manifest.json` lists the intended locations and the motion description for each family. `placement-map.md` includes the specific reuse and text-only decisions.

## Files and naming

- `assets/empty-<subject>.svg`: new self-contained animated SVGs. All animations are CSS keyframes inside the vector, play once, and settle. There is no external runtime dependency for these new files.
- `assets/empty-<subject>-compact.svg`: simplified small-placement version with its own short animation.
- `static/`: matching SVGs with animation styles removed, for stable thumbnails and static fallbacks.
- `index.html`: review gallery with all animation data embedded, no network calls, replay, and actual-size compact previews.
- `manifest.json`: design identifier, category, status, filenames, motion description, and intended placements.
- `build-library.py`: editable vector-authoring source. Re-running creates the animated artwork and manifest; static exports and gallery assembly are separate packaging steps.
- `contact-sheet-1.png` through `contact-sheet-3.png`, `compact-review.png`, `dark-review.png`: visual QA renders.
- `validation.json`: file validation results and timing ranges.

## Design decisions

Use the approved crisp flat treatment: thin ink outlines, white foreground objects, pale lavender organic backing shape, violet, mint, and blue-gray accents. Color and silhouette carry identity together. Objects vary by purpose: a ledger is an open book; an account is a building; a person is a profile card; tasks use a clipboard; a pipeline uses lanes; a search uses a lens. Compact artwork is separately simplified rather than shrinking a detailed scene.

The outer canvases are transparent; intentional pale backing shapes remain part of the artwork. Large viewBoxes are 320 × 240. Compact viewBoxes are 32 × 32. Shapes are named and grouped in the vector source. Key details draw or assemble in order; clocks, gears, bells, and lenses have object-specific motion. Decorative elements resolve once rather than loop. Longest new scene: 2.85 seconds. The approved invoice timing remains unchanged in the parent directory.

## For Claude: integration after approval

These candidates have **not** been wired into the app. Do not replace every existing empty message with a large illustration. Use the placement map to select large, compact, reused, or text-only treatment. The shared `app-empty-state` component already accepts content projected as `[emptyArt]`.

Once a candidate is approved, it can be displayed with a normal image, for example:

```html
<img src="/illustrations/states/review/assets/empty-tasks.svg"
     width="240" height="180" alt="" />
```

Use empty alt text when nearby app copy already fully explains the state. Otherwise provide an appropriate short alt. Keep the action button and explanation in the app. Do not claim that a file loaded or an invoice saved based on the animation completing; application state must drive status feedback.

The new files honor `prefers-reduced-motion` and show the finished drawing instead of movement. `static/` also provides an unconditional no-motion option. Avoid remounting images on ordinary refreshes or keystrokes, which would replay an entrance unnecessarily. Avoid scaling compact icons below their reviewed 24 px size without another legibility check.

The original approved assets use the separate parent `approved-state-motion.js` and reference preview. Their runtime is distinct from the self-contained new SVGs. Nothing in this batch changes those approved files or their timings.

## Validation and limits

All 60 animated vectors and 60 static counterparts were XML-parsed; all 120 were rendered. Checks cover transparency, self-containment, absence of raster embeds/scripts, one-shot animation definitions, normalized stroke paths, reduced-motion declarations, and timing ranges. Rendered review covered all large artwork on light and dark backgrounds and all compact artwork at 24, 32, and 48 px. Small speech bubbles and document folds were corrected after that review.

The gallery selection and replay behavior was exercised for all 30 families using a DOM-based runtime check. Actual animation playback and responsive layout were not browser-verified in this batch. No Upstart development server was started, restarted, or stopped, no login was opened, and no live application interaction or integration was tested. No full builds, commits, or deployment were performed.

## Approval handling

After Jeff's review, record any approvals or requested changes in `manifest.json` before promoting candidates out of `review`. A family is not approved solely because it uses the approved palette and style. Keep the already approved parent assets intact.

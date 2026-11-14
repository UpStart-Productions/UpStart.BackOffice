# Upstart approved interface state library

Jeff approved this batch in the chat, subject to four requested changes, which are included: varied account types, gentle team-circle movement after entrance, a corrected dollar sign on expenses, and an inbox that draws before papers fill it.

## Where everything is

This folder is `admin/public/illustrations/states/` in Upstart Back Office. Angular already copies `admin/public` to the web root.

- `index.html`: the full 30-family gallery, with replay and large/compact previews. Opens offline, or at `/illustrations/states/index.html` while the existing app is running.
- `manifest.json`: all 30 new families, marked Approved, with direct SVG filenames, motion descriptions, and intended placements.
- `empty-<subject>.svg`: 30 large self-contained animated SVGs, including accounts, team, expenses, and inbox with the requested changes.
- `empty-<subject>-compact.svg`: 30 separately simplified compact animated versions.
- `static/`: matching still versions for all 60 new SVGs.
- `placement-map.md`: maps app screens and conditions to the artwork. Use compact or text-only treatments where specified.
- `source/build-library.py`: editable authoring source for the new batch. This generates a staging set beside the script; it is not an Angular runtime dependency. Publication adjusts manifest paths and records approvals separately.
- `qa/`: contact sheets, actual-size compact checks, dark-background check, revised-design preview, and validation results.
- `review/`: the prior candidate handoff, retained as history. The root files and manifest are the current approved handoff.

## The original three approvals remain intact

The pre-existing files below retain their approved artwork and timing; their former ink outlines now use the shared dark-purple color:

- `empty-invoices.svg`
- `status-success.svg` and `status-success-compact.svg`
- `status-error.svg` and `status-error-compact.svg`
- `approved-state-motion.js` and `approved-preview.html`

Those original SVGs use their separate approved animation script. The new 30-family batch embeds CSS animation in its SVG files and needs no external animation player. Do not change the original invoice speed or success/error choreography when integrating this batch.

## For Claude: integrate the approved files

The artwork is saved, but no app screens have been changed. Use the existing shared `app-empty-state` content slot `[emptyArt]` where appropriate. A new-family animation can be used as a normal image:

```html
<ng-container ngProjectAs="[emptyArt]">
  <img src="/illustrations/states/empty-tasks.svg"
       width="240" height="180" alt="" />
</ng-container>
```

Use the `-compact` file for small panels, dropdowns, and inline feedback. Compact artwork was checked at 24, 32, and 48 px. A 32 × 32 viewBox does not mean a large composition was merely shrunk; these are separate simplified drawings. Main viewBoxes are 320 × 240. Outer canvases are transparent; pale backing shapes belong to the illustration.

Use an empty alt when adjacent copy fully explains the state; otherwise write an appropriate short alternative. Keep headings, explanations, action buttons, and status announcements in the app. Use precise first-run, filtered-results, completed-work, and failed-load messages. Do not use a first-use illustration for a failed request.

Animations run once and settle. Team circles make two slow, low-amplitude drift cycles after arrival, then stop. Other scenes finish in roughly three seconds or less. Reduced-motion preferences show the final static state, and `static/` provides unconditional stills. Avoid remounting images on ordinary data refreshes or keystrokes. Prefer static compact art over multiple simultaneous animations on dense dashboards.

The inbox deliberately fills with papers as Jeff requested; its accompanying copy must still clearly explain the empty queue. Accounts depict a company and a smaller house slightly overlapping it, with three standard outlined user badges to the right. Two badges overlap; the third is separate. The vendor parcel has been removed.

## Verification

All vectors were parsed and rendered; transparent corners, nonblank content, self-containment, and reduced-motion declarations were checked. Visual inspection covered the four changed large designs and compact variants, the whole library contact sheets, dark-background output, and compact sizes. Gallery selection and replay logic was exercised for all 30 families using a DOM runtime check. Browser animation playback and live Angular integration were not verified. No app server was started, restarted, or stopped; no login, full build, commit, or deployment was performed.

Accounts timing adjustment: all accounts animation durations and delays are reduced by 20 percent, including the compact version. Other states are unchanged.

## Shared outline color

All former ink/black artwork outlines now use Upstart brand violet 900, `#4C1D95` (`--brand-violet-900`). This includes the invoice, success/error outlines, all 30 state families, compact versions, static fallbacks, embedded gallery artwork, and authoring source. Semantic green/coral strokes, pale detail strokes, fills, layout, and motion timing are preserved. The prior `review/` directory remains historical.

## Decorative accents update

Every full-size illustration now has two additional four-point stars and two additional dots, spaced around the composition and appearing in staggered entrances. Compact icons retain their simplified silhouettes for small-size legibility. The approved original invoice and status preview/runtime includes the added accents too. Main object geometry and motion timings are unchanged.

## Invoice converted to self-contained CSS (Nov 2026)

`empty-invoices.svg` now carries its own CSS animation, like the 30-family batch, so it plays as a normal `<img>`. The approved sequence and timing from `approved-state-motion.js` were baked in (including its 0.8x speed and the tray clip mask). The original script-driven file is kept at `review/empty-invoices.script-driven.svg`; `static/empty-invoices.svg` is the still fallback. `status-success` / `status-error` are still script-driven.

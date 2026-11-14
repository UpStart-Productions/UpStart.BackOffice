# Approved state illustrations: Claude handoff

Jeff approved the current full library for integration into Upstart Back Office first-start screens.

Use the files directly in this directory, not the historical `review/` directory. Read `README.md`, `manifest.json`, and `placement-map.md` before integrating.

## Current final direction

- Dark purple outlines: `#4C1D95`, Upstart brand violet 900.
- Every full-size illustration includes two additional stars and two additional dots with staggered entrances.
- Accounts: no parcel; smaller house overlapping the office; three standard outlined user badges on the right, two overlapping and one separate. Accounts timing is reduced by 20 percent.
- Team circles have two slow drift cycles after arrival, then settle.
- Expenses have a correctly oriented dollar sign.
- Inbox draws its box, then fills with papers.
- Preserve the separately approved invoice rising-page / individual-detail sequence and success/error timings.

## Assets and implementation

There are 33 large SVGs and 32 compact SVGs: 30 new families with both sizes, plus the original invoice and original success/error assets. `static/` contains still fallbacks for the 30 new families in both sizes.

The 30 new families animate on their own when used as SVG images. The original invoice and success/error SVGs use `approved-state-motion.js`; follow `approved-preview.html` for their approved behavior. That script is reference implementation code tied to the preview structure, so adapt its initialization and cleanup to Angular rather than loading it blindly on app pages.

`index.html` is the current complete new-family replay gallery. The original three animations remain in `approved-preview.html`. While the existing app is running, these are served at `/illustrations/states/index.html` and `/illustrations/states/approved-preview.html`.

Project a suitable illustration into the existing `app-empty-state` component using its `[emptyArt]` slot. Choose large vs compact according to the placement map. Keep useful first-step headings, explanations and actions in the app, outside the artwork. Distinguish first use from filtered results, completed work and failed requests. Honor reduced motion and avoid replay on routine refresh. Prefer static compact art on dense dashboards.

Only asset preparation was performed here. No app-screen integration, server restart, sign-in, full build, commit or deployment has been performed.

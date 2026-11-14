# Approved Upstart interface state artwork and motion

Approved by Jeff in this chat, November 14, 2026. These files preserve the approved visuals and final timing. This is an asset handoff; no app screens or components have been changed.

## Files

| Filename | Intended placement |
|---|---|
| `empty-invoices.svg` | Invoice empty screen or panel |
| `status-success.svg` | Larger successful-action confirmation |
| `status-error.svg` | Larger failed-action message |
| `status-success-compact.svg` | Small success icon in a toast or inline feedback |
| `status-error-compact.svg` | Small error icon in a toast or inline feedback |
| `approved-preview.html` | Reference playback of all approved animations |
| `approved-state-motion.js` | Exact animation source used by the approved preview |

All SVGs are true vectors with transparent outer canvases. Pale colored backing shapes are intentional artwork. Main illustrations have 320 × 240 viewBoxes; compact icons have 32 × 32 viewBoxes.

## For Claude: preserve the approved behavior

The SVG files provide static artwork. Their animation lives in `approved-state-motion.js`; a plain `<img src="...svg">` displays the static illustration only. Do not present the SVG files alone as self-animating assets.

Use `approved-preview.html` as the visual and behavioral reference. It contains the approved SVG markup inline, with unique IDs and `data-part` attributes for animation targets. The script mounts the preview under `#upstart-motion-preview`, with `.up-state[data-state="invoice|success|failure"]`, `.up-art`, optional compact artwork under `.up-small`, and replay buttons. This is reference code, not an Angular component: adapt its initialization/cleanup to the app lifecycle when integrating. Preserve its timing, masking, sequencing, and artwork. Prefix IDs per instance to avoid collisions, scope selectors to each instance, cancel animations and remove listeners/timers on destruction, and honor reduced motion. The current script expects the complete preview structure; do not load it globally on unrelated pages.

Invoice: the paper rises out of the tray behind a clip mask. Header bars, invoice rows, amounts, and the total appear individually after the page emerges. The final approved change reduced all invoice durations and delays by 20 percent (`invoice` time multiplier 0.8). Success/error timing remains at multiplier 1.8. Success resolves into a drawn check; error draws the cross sequentially. Supporting foliage and sparkles move in the invoice scene. Animations run once and rest; replay is for review. Do not add continuous looping to the app.

Keep the source SVG fallbacks for reduced motion. Text, status messages, and actionable buttons belong in the app rather than inside the artwork. Actual success or failure events must drive the corresponding feedback.

## Paths

Project location: `admin/public/illustrations/states/`.

The existing Angular build copies `admin/public` to the web root. Once served by the app, the reference preview is `/illustrations/states/approved-preview.html`; asset URLs are `/illustrations/states/<filename>`.

No component integration, server restart, build, commit, or deployment is part of this handoff.

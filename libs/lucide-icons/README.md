> Copied from GrovLink (Nonprofit.Mobile.Platform/libs/lucide-icons) — keep the two in sync by copying.
> Import as `@upstart/back-office/lucide-icons`. The generated assets live in `admin/public/lucide/`.

# lucide-icons

Portable Lucide icon components for GrovLink admin: a sprite-based `<nmp-lucide-icon>` renderer and a
searchable, lazy-loaded `<nmp-lucide-icon-picker>` form control, plus the CDK-dialog wrapper the Quill
icon-embed toolbar button uses.

This library is deliberately dependency-light — only `@angular/common`, `@angular/core`, and `@angular/cdk`
(for the overlay, dialog, and virtual-scroll used by the picker). No PrimeNG dependency, so the whole
`libs/lucide-icons` folder can be copied into another Angular/Ionic project as-is.

## What's generated vs. hand-written

`src/lib/lucide-icon-paths.generated.ts`, `admin/public/lucide/lucide-sprite.svg`, and
`admin/public/lucide/lucide-icons-index.json` are **generated** by `scripts/sync-lucide-icons.mjs`
from the `lucide-static` npm package — do not hand-edit them.

## Storage formats

- **Quill inline icons** — saved as self-contained HTML inside rich-text fields (`<span class="ql-lucide-icon" data-icon="phone"><svg>…paths…</svg></span>`). Mobile renders via `innerHTML`; no sprite required.
- **Standalone picker (`valueFormat="inline-svg"`)** — same HTML string stored in a dedicated DB column (e.g. `Theme.iconSvg`).
- **Picker preview** — still uses the lazy-loaded sprite in admin; only persisted values use inline paths from `lucide-icon-paths.generated.ts`.

```sh
node libs/lucide-icons/scripts/sync-lucide-icons.mjs
```

This also regenerates `libs/shared/src/lib/lucide-icon-names.ts`, the flat name list the API uses to validate
`iconKey` values server-side.

## Why a sprite, not per-icon imports

Every icon ships once, as an SVG `<symbol>` in one sprite file, referenced at render time by name
(`<use href="#icon-name">`). No `import { Home } from '...'` per icon, no bundler code-splitting per icon —
the app can render *any* Lucide icon an admin picks, including ones nobody has picked yet, without a rebuild.

## Lazy loading

Nothing about the icon set loads eagerly. `LucideIconRegistryService` fetches the sprite and the search
index the first time either is actually needed (first `<nmp-lucide-icon>` render, or first picker open), and
shares one in-flight request across concurrent callers. The picker's icon grid uses
`@angular/cdk/scrolling`'s virtual scroll viewport, so regardless of how many icons match a search (up to all
~1,776), only the visible rows ever exist as real DOM nodes.

## Running unit tests

Run `nx test lucide-icons` to execute the unit tests.

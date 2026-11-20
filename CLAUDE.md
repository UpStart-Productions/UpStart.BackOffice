# UpStart Back Office: notes for Claude

Follow the rules in `.cursor/rules/*.mdc`. They apply to Claude as well as Cursor.

## UI rules that must never be broken

- **NEVER use a colored left border (accent stripe)** on cards, panels, banners, list rows or callouts. Use a colored icon, a tinted background, a `p-tag`, or the 30px icon rail (`app-queue-card` with `accent`) instead. See `.cursor/rules/no-colored-left-borders.mdc`.
- **A person is a person: one display.** A contact, user or team member shown as a row or card is always `app-person-card` (`admin/src/app/ui/record-card/person-card.component.ts`). An inline name in a table cell or timeline line is `app-person`; an avatar on its own (stacks, pickers) is `app-tm-avatar`. Never build a new person widget or hand-roll an avatar or contact block. See `.cursor/rules/people-display.mdc`.
- **Always use what already exists instead of inventing new styles.** Use the shared app styles and components (count numbers: the global `.count-badge`) and PrimeNG components (`p-tag`, `p-button`, …) first. Only hand-style something when nothing existing fits, and say so.

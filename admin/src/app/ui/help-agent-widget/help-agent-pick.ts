import { normalizeHelpLabel, type HelpAgentTarget, type HelpAgentTargetKind } from '@upstart/back-office/shared';

/** What the widget shows in its chip and sends as `target`. */
export interface PickedContext {
  target: HelpAgentTarget;
  /** Highlighted text that isn't a known label: it is not sent, and the chip says so. */
  withheld?: boolean;
  /** Chip text, built only from allowlisted labels and icon names. */
  display: string;
}

/** Elements that count as one control when something inside them is clicked. */
const CONTROL_SELECTOR = [
  'button',
  'a[href]',
  'p-button',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '.p-tab',
  'label',
  'input',
  'select',
  'textarea',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'th',
  '.card-title',
].join(', ');

/** Panels and dialogs whose title names the area. Cards are the shared panel markup. */
const CONTAINER_SELECTOR = '.card, .p-dialog, [role="dialog"], .p-drawer';
const CONTAINER_TITLE_SELECTOR = '.card-title, .p-dialog-title, .p-drawer-title, .card-header h2, .card-header h3';
const LABEL_MAX = 80;
const IGNORED_ICON_CLASSES = new Set(['pi-fw', 'pi-spin']);

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function kindOf(control: HTMLElement, clicked: HTMLElement): HelpAgentTargetKind {
  if (control.matches('button, p-button, [role="button"], [role="menuitem"]')) return 'button';
  if (control.matches('a[href]')) return 'link';
  if (control.matches('[role="tab"], .p-tab')) return 'tab';
  if (control.matches('label, input, select, textarea')) return 'field';
  if (control.matches('h1, h2, h3, h4, h5, h6, th, .card-title')) return 'heading';
  if (clicked.matches('i.pi')) return 'icon';
  return control.matches(CONTAINER_SELECTOR) ? 'area' : 'text';
}

function iconOf(control: HTMLElement, clicked: HTMLElement): string | undefined {
  const iconEl = clicked.matches('i.pi') ? clicked : control.querySelector('i.pi, .p-button-icon');
  for (const cls of Array.from(iconEl?.classList ?? [])) {
    const m = /^pi-([a-z0-9-]+)$/.exec(cls);
    if (m && !IGNORED_ICON_CLASSES.has(cls)) return m[1];
  }
  return undefined;
}

/** Candidate labels for a control, best first. Only ones on the allowlist are ever used. */
function labelCandidates(control: HTMLElement): string[] {
  const out = [
    control.getAttribute('aria-label'),
    control.getAttribute('label'),
    control.getAttribute('title'),
    control.getAttribute('ptooltip'),
    textOf(control.querySelector('.p-button-label')),
  ];
  if (control.matches('input, select, textarea')) {
    const id = control.id;
    const forLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    out.push(textOf(forLabel ?? control.closest('.form-field')?.querySelector('label')));
    out.push(control.getAttribute('placeholder'));
  } else {
    const own = textOf(control);
    if (own.length <= LABEL_MAX) out.push(own);
  }
  return out.filter((t): t is string => !!t && t.trim().length > 0);
}

function firstKnown(candidates: string[], labels: ReadonlySet<string>): string | undefined {
  return candidates
    .map((c) => c.replace(/\s+/g, ' ').trim())
    .find((c) => c.length <= LABEL_MAX && labels.has(normalizeHelpLabel(c)));
}

/**
 * Turns the clicked page element into guide context. Only fixed UI labels (on the allowlist), icon
 * names and help keys come out; record data (names, emails, values) never does. A control whose
 * label is built from data, e.g. "Remove Jane Doe", is described by its icon and panel instead.
 */
export function describePickedElement(
  clicked: HTMLElement,
  labels: ReadonlySet<string>,
): { context: PickedContext; highlight: HTMLElement } {
  const control = (clicked.closest(CONTROL_SELECTOR) as HTMLElement | null) ?? clicked;
  const container = control.closest(CONTAINER_SELECTOR) as HTMLElement | null;
  const kind = kindOf(control, clicked);
  const icon = iconOf(control, clicked);

  const titleEl = container?.querySelector(CONTAINER_TITLE_SELECTOR);
  const panel = firstKnown([textOf(titleEl)], labels);
  // A heading that is the panel's own title is the panel, not a separate label.
  const onTitle = !!titleEl && (titleEl === control || titleEl.contains(control) || control.contains(titleEl));
  const ownLabel = onTitle ? undefined : firstKnown(labelCandidates(control), labels);
  // Plain text with no known label (often record data, e.g. a person's name) picks the whole panel.
  const isPanelTitle = onTitle || (!!container && !ownLabel && !icon && (kind === 'text' || kind === 'area'));
  const label = isPanelTitle ? undefined : ownLabel;

  const helpKey =
    control.querySelector('[data-help-key]')?.getAttribute('data-help-key') ??
    (isPanelTitle ? undefined : control.closest('.form-field')?.querySelector('[data-help-key]')?.getAttribute('data-help-key')) ??
    (isPanelTitle ? titleEl?.querySelector('[data-help-key]')?.getAttribute('data-help-key') : undefined) ??
    undefined;

  const target: HelpAgentTarget = {
    kind: isPanelTitle ? 'heading' : kind,
    ...(panel ? { panel } : {}),
    ...(label ? { label } : {}),
    ...(icon && !isPanelTitle ? { icon } : {}),
    ...(helpKey ? { helpKey } : {}),
  };

  const what = isPanelTitle
    ? `${panel ?? 'This'} panel`
    : label
      ? `${label} ${target.kind === 'heading' || target.kind === 'text' ? '' : target.kind}`.trim()
      : icon
        ? `${capitalize(icon.replace(/-/g, ' '))} ${target.kind}`
        : `A ${target.kind}`;
  const display = !isPanelTitle && panel ? `${what} · ${panel} panel` : what;

  return { context: { target, display }, highlight: isPanelTitle && container ? container : control };
}

/**
 * Turns highlighted text into guide context. Text that is a fixed UI label (on the allowlist)
 * becomes the label. Anything else is treated as record data: the text itself is never sent, only
 * the panel it sits in and `withheld: true`, so the guide can say it can't answer about that item.
 */
export function describeSelection(selection: Selection, labels: ReadonlySet<string>): PickedContext | null {
  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (!text || selection.rangeCount === 0) return null;
  const node = selection.getRangeAt(0).commonAncestorContainer;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  if (!el) return null;

  const around = describePickedElement(el, labels).context.target;
  const panel = around.panel;
  const known = text.length <= LABEL_MAX && labels.has(normalizeHelpLabel(text));
  const where = panel ? ` · ${panel} panel` : '';

  if (known) {
    const kind: HelpAgentTargetKind = around.kind === 'area' ? 'text' : around.kind;
    return {
      target: { kind, label: text, ...(panel ? { panel } : {}), ...(around.helpKey ? { helpKey: around.helpKey } : {}) },
      display: `"${text}"${where}`,
    };
  }
  return {
    target: { kind: 'text', withheld: true, ...(panel ? { panel } : {}) },
    display: `Selected text not shared${where}`,
    withheld: true,
  };
}

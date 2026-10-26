import type { Popover } from 'primeng/popover';

const VIEWPORT_PAD = 8;
const ARROW_EDGE_INSET = 16;

/** Button, link, or the raw target Prime stored on toggle. */
export function resolvePopoverTrigger(target: unknown): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return (
    target.closest('button,a,[role="button"],.p-button,.tm-icon-btn,.row-actions-trigger') ?? target
  );
}

export function popoverGutter(container: HTMLElement): number {
  const cs = getComputedStyle(container);
  return (
    parseFloat(cs.getPropertyValue('--p-popover-gutter')) ||
    parseFloat(cs.getPropertyValue('--p-anchor-gutter')) ||
    10
  );
}

export function setPopoverArrowLeft(container: HTMLElement, px: number): void {
  for (let i = 0; i < container.style.length; i++) {
    const name = container.style[i];
    if (name.includes('arrow') && name.includes('left')) {
      container.style.setProperty(name, `${px}px`);
      return;
    }
  }
  container.style.setProperty('--p-popover-arrow-left', `${px}px`);
}

/**
 * Position an appended popover so the caret points at the horizontal center of the trigger.
 * Prime's default align() anchors the panel to the target's left edge and aims the caret there too.
 */
export function layoutPopoverCentered(container: HTMLElement, trigger: HTMLElement): void {
  const tr = trigger.getBoundingClientRect();
  const targetCenterX = tr.left + tr.width / 2;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const vw = document.documentElement.clientWidth;

  const panelW = container.offsetWidth;
  const panelH = container.offsetHeight;
  const gutter = popoverGutter(container);
  const flip =
    container.classList.contains('p-popover-flipped') ||
    container.hasAttribute('data-p-popover-flipped');

  const top = flip ? tr.top + scrollY - panelH - gutter : tr.bottom + scrollY + gutter;

  let left = targetCenterX + scrollX - panelW / 2;
  left = Math.min(scrollX + vw - panelW - VIEWPORT_PAD, Math.max(scrollX + VIEWPORT_PAD, left));

  container.style.top = `${top}px`;
  container.style.left = `${left}px`;
  container.style.marginTop = '0';
  container.style.marginBlockStart = flip ? '0' : '';

  const panelLeft = container.getBoundingClientRect().left;
  const radius = parseFloat(getComputedStyle(container).borderRadius) || 0;
  const arrowLeft = targetCenterX - panelLeft - radius * 2;
  setPopoverArrowLeft(container, Math.max(ARROW_EDGE_INSET, Math.min(panelW - ARROW_EDGE_INSET, arrowLeft)));
}

/** Run after Prime's align() (onShow), once layout is stable. */
export function queuePopoverCenterLayout(popover: Popover): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const container = popover.container as HTMLElement | undefined;
      const trigger = resolvePopoverTrigger(popover.target);
      if (container && trigger) layoutPopoverCentered(container, trigger);
    });
  });
}

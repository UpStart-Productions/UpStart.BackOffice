import { createLucideIconBlot } from './quill-icon.blot';
import { quillIconInjector } from './quill-icon-injector';

/**
 * Lazy Quill setup for the Lucide "insert icon" toolbar button + inline icon embed (ported from
 * GrovLink). Loaded through ngx-quill `customModules` (see app.config.ts) so Quill, the blot and the
 * generated icon paths stay out of the initial bundle.
 */
export async function loadLucideIconBlot(): Promise<unknown> {
  const Quill = (await import('quill')).default;
  const Toolbar = Quill.import('modules/toolbar') as { DEFAULTS: { handlers?: Record<string, unknown> } };
  const handlers = (Toolbar.DEFAULTS.handlers ??= {});
  handlers['lucideIcon'] = function (this: { quill: InstanceType<typeof Quill> }) {
    const quill = this.quill;
    void import('./quill-icon-coordinator.service').then(({ QuillIconCoordinator }) => {
      quillIconInjector()?.get(QuillIconCoordinator).handleToolbarClick(quill);
    });
  };
  return createLucideIconBlot(Quill);
}

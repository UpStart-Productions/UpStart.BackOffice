import { registerPersonCardClipboard } from './quill-person-card-clipboard';
import { createPersonCardBlot } from './quill-person-card.blot';
import { quillIconInjector } from './quill-icon-injector';

/** Lazy toolbar handler + personCard embed (same registration model as lucideIcon). */
export async function loadPersonCardBlot(): Promise<unknown> {
  const Quill = (await import('quill')).default;
  registerPersonCardClipboard(Quill);
  const Toolbar = Quill.import('modules/toolbar') as { DEFAULTS: { handlers?: Record<string, unknown> } };
  const handlers = (Toolbar.DEFAULTS.handlers ??= {});
  handlers['personCard'] = function (this: { quill: InstanceType<typeof Quill> }) {
    const quill = this.quill;
    void import('./quill-person-card-coordinator.service').then(({ QuillPersonCardCoordinator }) => {
      quillIconInjector()?.get(QuillPersonCardCoordinator).handleToolbarClick(quill);
    });
  };
  return createPersonCardBlot(Quill);
}

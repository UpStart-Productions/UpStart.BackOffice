import { QuillService } from 'ngx-quill';
import { firstValueFrom } from 'rxjs';
import { registerContentFileBlot } from './quill-file.blot';
import type { QuillFileUploadService } from './quill-file-upload.service';

/** Inline file attachment blot + toolbar handler. */
export function quillFileUploadInitializer(
  fileUpload: QuillFileUploadService,
  quillService: QuillService,
): () => Promise<void> {
  return async () => {
    const Quill = await firstValueFrom(quillService.getQuill());
    registerContentFileBlot(Quill);
    const Toolbar = Quill.import('modules/toolbar') as {
      DEFAULTS: { handlers?: Record<string, unknown> };
    };
    const handlers = (Toolbar.DEFAULTS.handlers ??= {});
    handlers['contentFile'] = function (this: { quill: InstanceType<typeof Quill> }) {
      fileUpload.handleToolbarClick(this.quill);
    };
  };
}

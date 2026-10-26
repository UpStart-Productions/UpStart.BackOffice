import { QuillService } from 'ngx-quill';
import { firstValueFrom } from 'rxjs';
import type { QuillImageUploadService } from './quill-image-upload.service';

/** Upload images to storage via the API instead of base64 or external URLs. */
export function quillImageUploadInitializer(
  imageUpload: QuillImageUploadService,
  quillService: QuillService,
): () => Promise<void> {
  return async () => {
    const Quill = await firstValueFrom(quillService.getQuill());
    const Toolbar = Quill.import('modules/toolbar') as {
      DEFAULTS: { handlers?: Record<string, unknown> };
    };
    const handlers = (Toolbar.DEFAULTS.handlers ??= {});
    handlers['image'] = function (this: { quill: InstanceType<typeof Quill> }) {
      imageUpload.handleToolbarClick(this.quill);
    };
  };
}

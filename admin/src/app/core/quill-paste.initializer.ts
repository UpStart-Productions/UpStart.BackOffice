import { QuillService } from 'ngx-quill';
import { firstValueFrom } from 'rxjs';
import { registerQuillPasteClipboard } from './quill-paste-clipboard';
import type { QuillPasteService } from './quill-paste.service';

export function quillPasteInitializer(
  paste: QuillPasteService,
  quillService: QuillService,
): () => Promise<void> {
  return async () => {
    const Quill = await firstValueFrom(quillService.getQuill());
    registerQuillPasteClipboard(Quill, paste);
  };
}

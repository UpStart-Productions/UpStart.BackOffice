import { Injectable } from '@angular/core';
import { QuillEditorBase, QuillService } from 'ngx-quill';
import { firstValueFrom } from 'rxjs';
import { patchNgxQuillBreakableSpaces, patchQuillBreakableSpaces } from './quill-utils';

/**
 * Loads and patches Quill on first editor use instead of at app bootstrap,
 * keeping quill out of the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class QuillBootstrapService {
  private ready: Promise<void> | null = null;
  private hookInstalled = false;

  constructor(private readonly quillService: QuillService) {}

  /** Patches ngx-quill so the first editor awaits patches before initializing. */
  installLazyHook(): void {
    if (this.hookInstalled) {
      return;
    }
    this.hookInstalled = true;
    const bootstrap = this;
    const prototype = QuillEditorBase.prototype as { ngOnInit?: () => void };
    const original = prototype.ngOnInit;
    prototype.ngOnInit = function () {
      void bootstrap.ensureReady().then(() => original?.call(this));
    };
  }

  ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.initialize();
    }
    return this.ready;
  }

  private async initialize(): Promise<void> {
    patchNgxQuillBreakableSpaces(QuillEditorBase);
    const Quill = await firstValueFrom(this.quillService.getQuill());
    patchQuillBreakableSpaces(Quill);
  }
}

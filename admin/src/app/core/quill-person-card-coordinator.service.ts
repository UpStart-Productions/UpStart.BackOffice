import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { inject, Injectable, Injector } from '@angular/core';
import type Quill from 'quill';
import { insertPersonCardInQuill } from './quill-person-card-insert';
import { QuillPersonCardPeopleService } from './quill-person-card-people.service';
import { QuillPersonCardPickerComponent } from './quill-person-card-picker.component';
import { EditorOverlayDismissGuard } from './editor-overlay-dismiss-guard.service';
import { resolveQuillPersonCardScope } from './quill-person-card-scope';
import type { QuillPersonCardPick } from './quill-person-card.types';

@Injectable({ providedIn: 'root' })
export class QuillPersonCardCoordinator {
  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);
  private readonly people = inject(QuillPersonCardPeopleService);
  private readonly dismissGuard = inject(EditorOverlayDismissGuard);
  private openRef: OverlayRef | null = null;

  handleToolbarClick(quill: Quill): void {
    this.close();
    this.dismissGuard.suppressParentPaneDismissal();

    const origin = this.toolbarButton(quill);
    if (!origin) return;

    const scope = resolveQuillPersonCardScope(quill);
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(origin)
      .withPush(true)
      .withViewportMargin(8)
      .withPositions([
        { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 6 },
        { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -6 },
      ]);

    const overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      panelClass: 'quill-person-card-picker-panel',
    });
    this.openRef = overlayRef;

    const portal = new ComponentPortal(QuillPersonCardPickerComponent, null, this.injector);
    const ref = overlayRef.attach(portal);
    ref.setInput('loading', true);
    ref.setInput('people', []);
    ref.setInput('onPick', (pick: QuillPersonCardPick) => this.applyPick(quill, pick));
    ref.setInput('onCancel', () => this.close());

    overlayRef.backdropClick().subscribe(() => this.close());

    void this.people.load(scope).then((list) => {
      if (this.openRef !== overlayRef) return;
      ref.setInput('loading', false);
      ref.setInput('people', list);
      ref.instance.focusSearch();
    });
  }

  private applyPick(quill: Quill, pick: QuillPersonCardPick): void {
    try {
      insertPersonCardInQuill(quill, this.people.toEmbedValue(pick));
    } finally {
      this.close();
    }
  }

  private toolbarButton(quill: Quill): HTMLElement | null {
    const toolbar = quill.getModule('toolbar') as { container?: HTMLElement } | undefined;
    return toolbar?.container?.querySelector('.ql-personCard') ?? null;
  }

  private close(): void {
    this.openRef?.dispose();
    this.openRef = null;
    this.dismissGuard.suppressParentPaneDismissal();
  }
}

import { Component, signal, viewChild } from '@angular/core';
import { AppDialogModule } from '../../core/app-dialog.module';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { ContactSummary } from '../../core/communications.api';
import { CreatedPerson, CreatePersonFormComponent } from './create-person-form.component';

export type CreatePersonModalOptions = {
  clientId?: string | null;
  linkClientRole?: string;
  /** On a saved project: offer "Make lead". */
  offerLead?: boolean;
};

@Component({
  selector: 'app-create-person-modal',
  standalone: true,
  imports: [AppDialogModule, CreatePersonFormComponent],
  template: `
    <p-dialog
      header="New person"
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="!personForm()?.saving()"
      [style]="{ width: 'min(32rem, 96vw)' }"
      appendTo="body"
      (onShow)="onShow()"
    >
      <app-create-person-form
        #form
        [defaultClientId]="defaultClientId()"
        [defaultRole]="defaultRole()"
        [showOrgPicker]="showOrgPicker()"
        [showLeadOption]="offerLead()"
        (created)="close($event)"
        (cancelled)="close(null)"
      />
    </p-dialog>
  `,
})
export class CreatePersonModalComponent {
  protected readonly personForm = viewChild<CreatePersonFormComponent>('form');

  readonly visible = signal(false);
  readonly defaultClientId = signal<string | null>(null);
  readonly defaultRole = signal('');
  readonly showOrgPicker = signal(true);
  readonly offerLead = signal(false);

  private resolve: ((value: CreatedPerson | null) => void) | null = null;

  open(options: CreatePersonModalOptions = {}): Promise<CreatedPerson | null> {
    this.defaultClientId.set(options.clientId ?? null);
    this.defaultRole.set(options.linkClientRole ?? '');
    this.showOrgPicker.set(options.clientId === undefined);
    this.offerLead.set(!!options.offerLead);
    this.visible.set(true);
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  onShow() {
    this.personForm()?.reset();
  }

  onVisibleChange(visible: boolean) {
    if (!visible) this.close(null);
  }

  close(result: CreatedPerson | null) {
    this.visible.set(false);
    this.resolve?.(result);
    this.resolve = null;
  }
}

export function contactAvatarUrl(c: ContactSummary): string | null {
  return resolveAssetUrl(c.avatarUrl ?? null);
}

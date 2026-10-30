import { inject, Injectable } from '@angular/core';
import { ConfirmationService } from 'primeng/api';

export type ConfirmDeleteOptions = {
  message: string;
  header?: string;
  /** Text on the confirm button (PrimeNG's default otherwise). */
  acceptLabel?: string;
  accept: () => void | Promise<void>;
};

/**
 * Standard delete confirmation. Use for every destructive delete unless explicitly told otherwise.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDeleteService {
  private readonly confirmation = inject(ConfirmationService);

  confirm(options: ConfirmDeleteOptions): void {
    this.confirmation.confirm({
      header: options.header ?? 'Confirm delete',
      message: options.message,
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary',
      ...(options.acceptLabel ? { acceptLabel: options.acceptLabel } : {}),
      accept: options.accept,
    });
  }
}

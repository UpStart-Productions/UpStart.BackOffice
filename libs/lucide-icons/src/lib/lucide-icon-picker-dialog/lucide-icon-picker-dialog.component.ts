import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { LucideIconPickerPanelComponent } from '../lucide-icon-picker-panel/lucide-icon-picker-panel.component';

/**
 * CDK Dialog wrapper around the shared search/grid panel, used by the Quill "insert icon" toolbar
 * button (see admin/src/app/core/quill-icon-coordinator.service.ts) — same picker UI as the
 * standalone form control, just returned via DialogRef.close(name) instead of ControlValueAccessor.
 */
@Component({
  selector: 'nmp-lucide-icon-picker-dialog',
  standalone: true,
  imports: [LucideIconPickerPanelComponent],
  templateUrl: './lucide-icon-picker-dialog.component.html',
  styleUrl: './lucide-icon-picker-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LucideIconPickerDialogComponent {
  readonly ref = inject(DialogRef<string | undefined>);

  onSelect(name: string): void {
    this.ref.close(name);
  }

  cancel(): void {
    this.ref.close(undefined);
  }
}

import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { formatRelativeTime } from '../../core/relative-time-format';

@Component({
  standalone: true,
  selector: 'app-notification-relative-time',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <small class="text-color-secondary" [attr.title]="iso">{{ text }}</small>
  `,
})
export class NotificationRelativeTimeComponent {
  iso = '';
  protected text = '—';

  @Input({ required: true })
  set createdAt(value: string) {
    const v = value ?? '';
    this.iso = v;
    this.text = formatRelativeTime(v);
  }
}

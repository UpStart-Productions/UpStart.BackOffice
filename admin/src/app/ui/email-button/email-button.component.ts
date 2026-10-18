import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { MenuItem, MessageService } from 'primeng/api';
import { SplitButtonModule } from 'primeng/splitbutton';
import { TooltipModule } from 'primeng/tooltip';
import { CommunicationsApi } from '../../core/communications.api';

/**
 * Opens a new message in the person's own mail app with the UBO capture address on CC,
 * so the thread is logged and stays logged on every reply-all.
 */
@Component({
  selector: 'app-email-button',
  standalone: true,
  imports: [SplitButtonModule, TooltipModule],
  template: `
    <span
      [pTooltip]="address() ? 'Opens your mail app with UBO on CC' : 'No UBO address yet'"
      tooltipPosition="top"
    >
      <p-splitbutton
        label="Email"
        icon="pi pi-envelope"
        size="small"
        severity="secondary"
        [model]="menu()"
        [disabled]="!address()"
        (onClick)="openMailApp()"
      />
    </span>
  `,
})
export class EmailButtonComponent implements OnInit {
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);

  to = input<string | null | undefined>();
  subject = input<string | null | undefined>();

  address = signal<string | null>(null);

  readonly menu = computed<MenuItem[]>(() => [
    { label: 'Open in Gmail', icon: 'pi pi-external-link', command: () => this.openGmail() },
    { label: 'Copy UBO address', icon: 'pi pi-copy', command: () => void this.copyAddress() },
  ]);

  async ngOnInit() {
    this.address.set(await this.comms.captureAddress());
  }

  openMailApp() {
    const cc = this.address();
    if (!cc) return;
    const params = [`cc=${encodeURIComponent(cc)}`];
    const subject = this.subject()?.trim();
    if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
    window.location.href = `mailto:${encodeURIComponent(this.to()?.trim() ?? '')}?${params.join('&')}`;
  }

  openGmail() {
    const cc = this.address();
    if (!cc) return;
    const q = new URLSearchParams({ view: 'cm', fs: '1', to: this.to()?.trim() ?? '', cc });
    const subject = this.subject()?.trim();
    if (subject) q.set('su', subject);
    window.open(`https://mail.google.com/mail/?${q.toString()}`, '_blank', 'noopener');
  }

  async copyAddress() {
    const cc = this.address();
    if (!cc) return;
    try {
      await navigator.clipboard.writeText(cc);
      this.toast.add({ severity: 'success', summary: 'Copied', detail: cc });
    } catch {
      this.toast.add({ severity: 'warn', summary: 'Copy failed', detail: cc });
    }
  }
}

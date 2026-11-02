import { Component, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';

/** A saved Social Security number as text: ***-**-**** until the eye shows it. */
@Component({
  selector: 'app-ssn-text',
  standalone: true,
  imports: [ButtonModule],
  template: `
    <span class="ssn-text">
      <span>{{ revealed() ? value() : '***-**-****' }}</span>
      <p-button
        [icon]="revealed() ? 'pi pi-eye-slash' : 'pi pi-eye'"
        [text]="true"
        severity="secondary"
        size="small"
        [ariaLabel]="revealed() ? 'Hide number' : 'Show number'"
        (onClick)="revealed.set(!revealed())"
      />
    </span>
  `,
  styles: `
    .ssn-text {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
  `,
})
export class SsnTextComponent {
  readonly value = input<string>('');
  protected readonly revealed = signal(false);
}

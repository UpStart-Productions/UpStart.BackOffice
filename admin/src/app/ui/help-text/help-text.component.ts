import { Component, inject, input } from '@angular/core';
import { TooltipModule } from 'primeng/tooltip';
import { HelpTextService } from '../../core/help-text.service';

@Component({
  selector: 'app-help-text',
  standalone: true,
  imports: [TooltipModule],
  template: `
    @if (helpText()) {
      <i
        class="pi pi-question-circle help-icon ml-1"
        [pTooltip]="helpText()"
        [attr.aria-label]="'Help: ' + helpText()"
        role="img"
      ></i>
    }
  `,
  styles: [
    `
      .help-icon {
        cursor: help;
      }
    `,
  ],
})
export class HelpTextComponent {
  private readonly help = inject(HelpTextService);
  key = input.required<string>();

  helpText = () => this.help.get(this.key());
}

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
      :host {
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
        line-height: 1;
      }
      .help-icon {
        cursor: help;
        font-size: 0.92em;
        line-height: 1;
      }
    `,
  ],
})
export class HelpTextComponent {
  private readonly help = inject(HelpTextService);
  key = input.required<string>();

  helpText = () => this.help.get(this.key());
}

import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MessageModule } from 'primeng/message';
import type { FormStaffPreviewDto } from '@upstart/back-office/shared';
import { FormsApi } from '../../core/forms.api';
import { FormRespondViewComponent } from '../../ui/form-respond-view/form-respond-view.component';

/** Staff preview tab: form only, no Back Office chrome. Refresh the browser tab to reload the draft. */
@Component({
  selector: 'app-form-preview-page',
  standalone: true,
  imports: [MessageModule, FormRespondViewComponent],
  styleUrls: ['../task-form/task-form.page.scss'],
  template: `
    <div class="form-preview-page">
      @if (error()) {
        <p-message severity="error" styleClass="w-full mb-3" [text]="error()!" />
      } @else if (data(); as d) {
        <app-form-respond-view
          [formName]="d.formName"
          [description]="d.description"
          [descriptionHtml]="d.descriptionHtml"
          [layout]="d.layout"
          [sections]="d.sections"
          [ask]="d.ask"
          [preview]="true"
          idPrefix="form-preview-tab"
        />
      } @else if (loading()) {
        <p class="form-preview-loading text-color-secondary"><i class="pi pi-spin pi-spinner"></i></p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: var(--surface-ground, var(--color-background));
    }

    .form-preview-page {
      box-sizing: border-box;
      width: 100%;
      max-width: 56rem;
      margin: 0 auto;
      padding: 2rem clamp(1.25rem, 4vw, 2.5rem) 3rem;
    }

    .form-preview-loading {
      text-align: center;
      margin: 4rem 0;
    }
  `,
})
export class FormPreviewPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly forms = inject(FormsApi);
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  data = signal<FormStaffPreviewDto | null>(null);
  error = signal<string | null>(null);
  loading = signal(true);

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await this.forms.preview(this.id));
    } catch (err) {
      this.data.set(null);
      this.error.set(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      this.loading.set(false);
    }
  }
}

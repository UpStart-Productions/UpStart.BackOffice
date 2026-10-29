import { Component, computed, inject, input, model, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ApiService } from '../../core/api.service';

/**
 * Searchable organization picker (the organizations the user can reach). Value is the organization id.
 * Same control as the Link to an organization picker; use this one for new screens.
 */
@Component({
  selector: 'app-organization-select',
  standalone: true,
  imports: [FormsModule, SelectModule],
  template: `
    <p-select
      [inputId]="inputId()"
      [options]="options()"
      optionLabel="name"
      optionValue="id"
      [ngModel]="value()"
      (ngModelChange)="value.set($event)"
      [filter]="true"
      filterBy="name"
      filterPlaceholder="Search…"
      [showClear]="true"
      [loading]="loading()"
      placeholder="Search and select…"
      styleClass="w-full"
      appendTo="body"
    />
  `,
})
export class OrganizationSelectComponent implements OnInit {
  private readonly api = inject(ApiService);

  value = model<string | null>(null);
  inputId = input<string | undefined>(undefined);
  /** Organizations to leave out (e.g. ones that already have this form). */
  exclude = input<string[]>([]);

  private all = signal<{ id: string; name: string }[]>([]);
  loading = signal(true);
  options = computed(() => {
    const skip = new Set(this.exclude());
    return this.all().filter((o) => !skip.has(o.id));
  });

  async ngOnInit() {
    try {
      const rows = await this.api.get<{ id: string; name: string }[]>('/clients');
      this.all.set([...rows].sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      this.all.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}

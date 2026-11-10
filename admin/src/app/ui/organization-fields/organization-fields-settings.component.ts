import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { DIMENSION_TAG_KEY, type DimensionCatalogGroupDto, type DimensionCatalogItemDto, type DimensionEntity } from '@upstart/back-office/shared';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { UBO_DARK_TOOLTIP_SHOW_DELAY_MS } from '../../core/ubo-dark-tooltip';
import { DimensionsApi } from '../../core/dimensions.api';
import {
  FindOrCreatePickerComponent,
  type FindOrCreateOption,
  type FindOrCreatePick,
} from '../find-or-create-picker/find-or-create-picker.component';
import { chipColors } from '../../task-manager/core/tm-format.util';
import { TmStoreService } from '../../task-manager/core/tm-store.service';

type PickListSection = {
  id: string;
  heading: string;
  entity: DimensionEntity;
  groups: DimensionCatalogGroupDto[];
};

const PICK_LIST_SECTIONS: { id: string; heading: string; entity: DimensionEntity }[] = [
  { id: 'organizations', heading: 'Organizations', entity: 'CLIENT' },
  { id: 'people', heading: 'People', entity: 'CONTACT' },
  { id: 'tasks', heading: 'Tasks', entity: 'TASK' },
];

@Component({
  selector: 'app-organization-fields-settings',
  standalone: true,
  imports: [ButtonModule, MessageModule, ProgressSpinnerModule, TooltipModule, FindOrCreatePickerComponent],
  styles: `
    .pick-lists-section-title {
      font-size: var(--fs-base);
      font-weight: 600;
      margin: 1.25rem 0 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .pick-lists-section-title:first-child {
      margin-top: 0;
    }
    .pick-lists-section + .pick-lists-section {
      margin-top: 0.5rem;
    }
    .pick-list-group + .pick-list-group {
      margin-top: 1rem;
    }
    .pick-list-group-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .pick-list-group-label {
      margin: 0;
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--text-color-secondary);
    }
    .pick-list-group-cluster {
      padding: 0.625rem 0.75rem;
      border: 1px solid var(--surface-border);
      border-radius: var(--p-content-border-radius, 8px);
      background: var(--surface-card);
    }
    .pick-list-empty {
      margin: 0;
      font-size: var(--fs-sm);
      color: var(--text-color-secondary);
    }
    .pick-lists-loading {
      display: flex;
      justify-content: center;
      padding: 1.5rem;
    }
  `,
  template: `
    @if (error()) {
      <p-message severity="error" [text]="error()!" class="mb-3 block" />
    } @else if (loading()) {
      <div class="pick-lists-loading">
        <p-progressSpinner strokeWidth="4" ariaLabel="Loading pick lists" />
      </div>
    } @else {
      @for (section of sections(); track section.id) {
        <div class="pick-lists-section">
          <h3 class="pick-lists-section-title">{{ section.heading }}</h3>
          @for (group of section.groups; track group.key) {
            <div class="pick-list-group">
              <div class="pick-list-group-head">
                <p class="pick-list-group-label">{{ group.label }}</p>
                <p-button
                  type="button"
                  icon="pi pi-plus"
                  label="Add"
                  size="small"
                  [text]="true"
                  [attr.aria-label]="'Add ' + group.label"
                  (onClick)="openAdd($event, group)"
                />
              </div>
              @if (group.items.length) {
                <div class="ubo-tag-field ubo-tag-field--cluster pick-list-group-cluster">
                  @for (item of group.items; track item.name) {
                    <span
                      class="ubo-tag-pill"
                      [class.ubo-tag-pill--hidden]="item.hiddenFromSuggestions"
                    >
                      <span class="ubo-tag-pill-label">{{ item.name }}</span>
                      @if (item.recordCount > 0) {
                        <span class="count-badge count-badge--muted">{{ item.recordCount }}</span>
                      }
                      @if (item.hiddenFromSuggestions) {
                        <button
                          type="button"
                          class="ubo-tag-pill-remove"
                          [attr.aria-label]="'Show ' + item.name + ' in suggestions'"
                          pTooltip="Show in pick list suggestions again"
                          tooltipPosition="top"
                          [showDelay]="actionTooltipDelayMs"
                          tooltipStyleClass="ubo-dark-tooltip"
                          appendTo="body"
                          (click)="restore(group, item)"
                        >
                          <i class="pi pi-eye" aria-hidden="true"></i>
                        </button>
                      } @else {
                        <button
                          type="button"
                          class="ubo-tag-pill-remove"
                          [attr.aria-label]="'Hide ' + item.name + ' from suggestions'"
                          pTooltip="Hide from pick list suggestions"
                          tooltipPosition="top"
                          [showDelay]="actionTooltipDelayMs"
                          tooltipStyleClass="ubo-dark-tooltip"
                          appendTo="body"
                          (click)="hide(group, item)"
                        >
                          <i class="pi pi-eye-slash" aria-hidden="true"></i>
                        </button>
                      }
                      <button
                        type="button"
                        class="ubo-tag-pill-remove"
                        [attr.aria-label]="'Delete ' + item.name"
                        pTooltip="Delete from all records and pick lists"
                        tooltipPosition="top"
                        [showDelay]="actionTooltipDelayMs"
                        tooltipStyleClass="ubo-dark-tooltip"
                        appendTo="body"
                        (click)="confirmPurge(group, item)"
                      >
                        <i class="pi pi-times" aria-hidden="true"></i>
                      </button>
                    </span>
                  }
                </div>
              } @else {
                <p class="pick-list-empty">Nothing in this list yet.</p>
              }
            </div>
          }
        </div>
      }
    }
    <app-find-or-create-picker
      #addPicker
      placeholder="Find or create a value"
      createKind="value"
      emptyHint="Type to add a value"
      [options]="pickerOptions()"
      [pillStyle]="pickerPillStyle"
      (picked)="onPickListAdd($event)"
    />
  `,
})
export class OrganizationFieldsSettingsComponent implements OnInit {
  /** Hover delay before dark action hints on pick-list pill controls. */
  readonly actionTooltipDelayMs = UBO_DARK_TOOLTIP_SHOW_DELAY_MS;

  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);
  private readonly dimensionsApi = inject(DimensionsApi);
  private readonly tmStore = inject(TmStoreService);
  private readonly addPicker = viewChild.required(FindOrCreatePickerComponent);

  readonly sections = signal<PickListSection[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly addTarget = signal<DimensionCatalogGroupDto | null>(null);

  readonly pickerOptions = computed((): FindOrCreateOption[] => {
    const g = this.addTarget();
    if (!g) return [];
    const byKey = new Map<string, FindOrCreateOption>();
    for (const item of g.items) {
      byKey.set(item.name.toLowerCase(), { id: item.name.toLowerCase(), name: item.name });
    }
    if (g.entity === 'TASK' && g.key === DIMENSION_TAG_KEY) {
      for (const t of this.tmStore.tags()) {
        byKey.set(t.id, { id: t.id, name: t.name, color: t.color });
      }
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly pickerPillStyle = (opt: FindOrCreateOption) => {
    const g = this.addTarget();
    if (g?.entity === 'TASK' && g.key === DIMENSION_TAG_KEY && opt.color) {
      return chipColors(opt.color);
    }
    return null;
  };

  async ngOnInit() {
    await this.load();
  }

  sectionEntity(group: DimensionCatalogGroupDto): DimensionEntity {
    return group.entity ?? 'CLIENT';
  }

  async load() {
    this.loading.set(true);
    this.sections.set([]);
    try {
      const loaded = await Promise.all(
        PICK_LIST_SECTIONS.map(async (spec) => {
          const raw = await this.api.get<DimensionCatalogGroupDto[]>(
            `/dimensions/catalog/manage?entity=${spec.entity}`,
          );
          const rows = Array.isArray(raw) ? raw : [];
          const groups = rows
            .filter((g): g is DimensionCatalogGroupDto => !!g?.key)
            .map((g) => ({
              ...g,
              entity: spec.entity,
              items: Array.isArray(g.items) ? g.items : [],
            }));
          return { ...spec, groups };
        }),
      );
      this.sections.set(loaded.filter((s): s is PickListSection => !!s?.id && Array.isArray(s.groups)));
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load pick lists');
    } finally {
      this.loading.set(false);
    }
  }

  async openAdd(event: Event, group: DimensionCatalogGroupDto) {
    this.addTarget.set(group);
    if (group.entity === 'TASK' && group.key === DIMENSION_TAG_KEY) {
      await this.tmStore.loadTags();
    }
    this.addPicker().open(event);
  }

  onPickListAdd(pick: FindOrCreatePick) {
    const group = this.addTarget();
    if (!group) return;
    const entity = this.sectionEntity(group);
    const name =
      'name' in pick
        ? pick.name
        : this.pickerOptions().find((o) => o.id === pick.id)?.name ?? pick.id;
    if (!name.trim()) return;

    const existing = group.items.find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (existing?.hiddenFromSuggestions) {
      void this.restoreValue(entity, group.key, existing.name);
      return;
    }
    if (existing) {
      this.toast.add({ severity: 'info', summary: 'Already in list', detail: `"${existing.name}" is already in this pick list.` });
      return;
    }

    void this.addValue(entity, group.key, name);
  }

  hide(group: DimensionCatalogGroupDto, row: DimensionCatalogItemDto) {
    void this.hideValue(this.sectionEntity(group), group.key, row.name);
  }

  restore(group: DimensionCatalogGroupDto, row: DimensionCatalogItemDto) {
    void this.restoreValue(this.sectionEntity(group), group.key, row.name);
  }

  confirmPurge(group: DimensionCatalogGroupDto, row: DimensionCatalogItemDto) {
    const detail =
      row.recordCount > 0
        ? `Delete "${row.name}" from all ${row.recordCount} record(s) and from suggestion lists?`
        : `Delete "${row.name}" from suggestion lists?`;
    this.confirm.confirm({
      message: `${detail} This cannot be undone.`,
      accept: () => void this.purge(this.sectionEntity(group), group.key, row.name),
    });
  }

  private async addValue(entity: DimensionEntity, key: string, name: string) {
    try {
      await this.api.post('/dimensions/catalog/add', { entity, key, name });
      await this.afterChange();
      this.toast.add({ severity: 'success', summary: 'Added', detail: `"${name}" is in suggestion lists.` });
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not add',
        detail: err instanceof Error ? err.message : 'Failed',
      });
    }
  }

  private async hideValue(entity: DimensionEntity, key: string, name: string) {
    try {
      await this.api.post('/dimensions/catalog/hide', { entity, key, name });
      await this.afterChange();
      this.toast.add({ severity: 'success', summary: 'Hidden', detail: `"${name}" will not appear in pick lists.` });
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not hide',
        detail: err instanceof Error ? err.message : 'Failed',
      });
    }
  }

  private async restoreValue(entity: DimensionEntity, key: string, name: string) {
    try {
      await this.api.post('/dimensions/catalog/restore', { entity, key, name });
      await this.afterChange();
      this.toast.add({ severity: 'success', summary: 'Restored', detail: `"${name}" is in suggestion lists again.` });
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not restore',
        detail: err instanceof Error ? err.message : 'Failed',
      });
    }
  }

  private async purge(entity: DimensionEntity, key: string, name: string) {
    try {
      await this.api.post('/dimensions/catalog/purge', { entity, key, name });
      await this.afterChange();
      this.toast.add({ severity: 'success', summary: 'Deleted', detail: `"${name}" was removed everywhere.` });
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not delete',
        detail: err instanceof Error ? err.message : 'Failed',
      });
    }
  }

  private async afterChange() {
    await this.load();
    await this.dimensionsApi.reloadClientDefinitions();
  }
}

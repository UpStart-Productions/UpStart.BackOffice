import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import type { FormAttachInfoDto, FormAttachTargetDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ClientFormsApi } from '../../core/client-forms.api';

export type AcceptResponseChoice = { mode: 'new' | 'existing'; newKind?: 'client' | 'organization'; name?: string; clientId?: string };

type Kind = 'clients' | 'organizations' | 'all';
type Step = 'pick' | 'confirm';

/** A record's status for the picker: Client, Prospect, or its first tag (Partner, Vendor…) for other organizations. */
export function targetStatus(t: Pick<FormAttachTargetDto, 'journey' | 'tags'>): string {
  if (t.journey === 'CLIENT') return 'Client';
  if (t.journey === 'PROSPECT') return 'Prospect';
  return t.tags[0] ?? 'Organization';
}

/**
 * The one dialog for putting a form response on a record: Attach (a submission) or Move (a result to another record).
 * Suggestions only select; the picker filters by Clients / Organizations / All and shows each record's status (and a
 * client's people); New client / New pipeline card (Attach only). Nothing is saved until the confirmation step, which
 * names the record and says who will be able to see the response. The caller does the API call.
 */
@Component({
  selector: 'app-accept-response-dialog',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, SelectModule, SelectButtonModule, TagModule, AppDialogModule],
  template: `
    <p-dialog [header]="move() ? 'Move response' : 'Attach response'" [(visible)]="visible" [modal]="true" [style]="{ width: 'min(34rem, 96vw)' }">
      @if (step() === 'pick') {
        @if (!newKind()) {
          <div class="form-field">
            <p-selectbutton [options]="kindOptions" optionLabel="label" optionValue="value" [ngModel]="kind()" (ngModelChange)="kind.set($event)" [allowEmpty]="false" />
          </div>
          <div class="form-field mt-3">
            <label for="arTarget">{{ kind() === 'clients' ? 'Client' : kind() === 'organizations' ? 'Organization' : 'Client or organization' }}</label>
            <p-select
              inputId="arTarget"
              [options]="shown()"
              optionLabel="name"
              optionValue="clientId"
              [ngModel]="selected()?.clientId ?? null"
              (ngModelChange)="selectId($event)"
              [filter]="true"
              filterBy="name,peopleText"
              filterPlaceholder="Search…"
              placeholder="Search and select…"
              [loading]="loadingTargets()"
              styleClass="w-full"
              appendTo="body"
            >
              <ng-template pTemplate="item" let-t>
                <div class="ar-option">
                  <span>{{ t.name }} <span class="text-color-secondary">({{ status(t) }})</span></span>
                  @if (t.people.length) {
                    <span class="ar-option-people">{{ t.people.join(', ') }}</span>
                  }
                </div>
              </ng-template>
            </p-select>
          </div>
          @if (!move()) {
            <div class="flex gap-2 mt-3">
              <p-button label="New client" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" (onClick)="startNew('client')" />
              <p-button label="New pipeline card" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" (onClick)="startNew('organization')" />
            </div>
          }
        } @else {
          <div class="form-field">
            <label for="arName">{{ newKind() === 'client' ? 'New client name' : 'Organization name' }}</label>
            <input pInputText id="arName" class="w-full" [(ngModel)]="name" />
            <small class="text-color-secondary">
              {{ newKind() === 'client' ? 'Creates a client, with the sender as its person.' : 'Adds an Inbound card to your pipeline, with the sender on it and a link back to this response. No organization list entry until you Make client or attach it to an existing one.' }}
            </small>
          </div>
          <p-button label="Pick an existing one instead" [text]="true" size="small" (onClick)="newKind.set(null)" />
        }
      } @else {
        <p class="mt-0">
          {{ move() ? 'Move' : 'Attach' }} <strong>{{ formName() }}</strong>@if (sender()) { from <em>{{ sender() }}</em>}
          to <strong>{{ targetName() }}</strong> ({{ targetKindLabel() }}).
        </p>
        <p class="mb-1"><strong>Who will be able to see it</strong></p>
        @if (info(); as i) {
          @if (i.visibility.roles.length) {
            <ul class="ar-roles">
              <li>Admins</li>
              @for (r of i.visibility.roles; track r.name) {
                <li>{{ r.name }} ({{ r.level === 'edit' ? 'Edit' : 'Read' }})</li>
              }
            </ul>
          } @else {
            <p class="mt-0">Admins only.</p>
          }
          @if (i.visibility.limitedToAssigned) {
            <p class="text-color-secondary mt-0">People whose role doesn't have Organizations: All only see it if they're assigned to {{ targetName() }}.</p>
          }
        }
      }
      <ng-template pTemplate="footer">
        @if (step() === 'pick') {
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="busy()" (onClick)="visible.set(false)" />
          <p-button label="Next" icon="pi pi-arrow-right" iconPos="right" [disabled]="!canNext()" (onClick)="step.set('confirm')" />
        } @else {
          <p-button label="Back" severity="secondary" [text]="true" [disabled]="busy()" (onClick)="step.set('pick')" />
          <p-button [label]="newKind() === 'organization' ? 'Add to pipeline' : (move() ? 'Move to ' : 'Attach to ') + targetName()" icon="pi pi-check" [loading]="busy()" (onClick)="submit()" />
        }
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .ar-option {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .ar-option-people {
      color: var(--text-color-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ar-roles {
      margin: 0 0 0.75rem;
      padding-left: 1.25rem;
    }
  `,
})
export class AcceptResponseDialogComponent {
  private readonly api = inject(ClientFormsApi);

  readonly kindOptions = [
    { value: 'clients', label: 'Clients' },
    { value: 'organizations', label: 'Organizations' },
    { value: 'all', label: 'All' },
  ];

  visible = model(false);
  /** Move (an attached result to another record): no suggestions, no New. */
  move = input(false);
  formName = input('');
  /** Who sent it (name or email), shown in the confirmation. */
  sender = input<string | null>(null);
  /** Client forms start on Clients, others on Organizations. */
  isClientForm = input(false);
  /** Prefills a new record's name. */
  defaultName = input('');
  /** Suggestions and visibility (loaded by the caller when it opens the dialog). */
  info = input<FormAttachInfoDto | null>(null);
  /** The record it's on now (Move): left out of the picker. */
  excludeId = input<string | null>(null);
  busy = input(false);
  accept = output<AcceptResponseChoice>();

  readonly step = signal<Step>('pick');
  readonly kind = signal<Kind>('clients');
  readonly selected = signal<FormAttachTargetDto | null>(null);
  readonly newKind = signal<'client' | 'organization' | null>(null);
  readonly loadingTargets = signal(false);
  private readonly targets = signal<(FormAttachTargetDto & { peopleText: string })[]>([]);
  name = '';

  readonly shown = computed(() =>
    this.targets().filter(
      (t) =>
        t.clientId !== this.excludeId() &&
        (this.kind() === 'all' || (this.kind() === 'clients' ? t.journey === 'CLIENT' : t.journey !== 'CLIENT')),
    ),
  );

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        this.step.set('pick');
        this.kind.set(this.isClientForm() ? 'clients' : 'organizations');
        this.selected.set(null);
        this.newKind.set(null);
        this.name = this.defaultName();
        void this.loadTargets();
      });
    });
  }

  private async loadTargets() {
    this.loadingTargets.set(true);
    try {
      this.targets.set((await this.api.targets()).map((t) => ({ ...t, peopleText: t.people.join(' ') })));
    } catch {
      this.targets.set([]);
    } finally {
      this.loadingTargets.set(false);
    }
  }

  status(t: FormAttachTargetDto) {
    return targetStatus(t);
  }

  /** A suggestion only selects it (and shows its kind); attaching happens after the confirmation. */
  select(t: FormAttachTargetDto) {
    this.newKind.set(null);
    this.selected.set(t);
    if (this.kind() !== 'all') this.kind.set(t.journey === 'CLIENT' ? 'clients' : 'organizations');
  }

  selectId(id: string | null) {
    this.selected.set(this.targets().find((t) => t.clientId === id) ?? null);
  }

  startNew(kind: 'client' | 'organization') {
    this.selected.set(null);
    this.newKind.set(kind);
  }

  canNext() {
    return this.newKind() ? !!this.name.trim() : !!this.selected();
  }

  targetName() {
    return this.newKind() ? this.name.trim() : (this.selected()?.name ?? '');
  }

  targetKindLabel() {
    if (this.newKind() === 'client') return 'new client';
    if (this.newKind() === 'organization') return 'new pipeline card';
    const s = this.selected();
    return s ? targetStatus(s) : '';
  }

  submit() {
    const nk = this.newKind();
    this.accept.emit(nk ? { mode: 'new', newKind: nk, name: this.name.trim() } : { mode: 'existing', clientId: this.selected()?.clientId });
  }
}

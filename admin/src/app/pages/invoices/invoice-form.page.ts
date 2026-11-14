import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { areaLevel, type RecordAttributionDto } from '@upstart/back-office/shared';
import { RecordAttributionComponent } from '../../ui/record-attribution/record-attribution.component';
import { SessionService } from '../../core/session.service';
import { TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import { APP_QUILL_IMPORTS } from '../../core/quill-editor.imports';
import { ApiService } from '../../core/api.service';
import { richTextOrUndefined } from '../../core/rich-text.util';
import { bindQuillPersonCardScope } from '../../core/quill-person-card-scope';
import type Quill from 'quill';
import { PageComponent } from '../../ui/layout/page.component';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { PeriodPickerComponent } from '../../ui/period-picker/period-picker.component';
import { defaultPeriod } from '../../core/period.util';
import { InvoiceSendDialogService } from './invoice-send-dialog.service';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { TenantBrandingService } from '../../core/tenant-branding.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import {
  RowActionsMenuComponent,
  type RowActionItem,
} from '../../ui/row-actions-menu/row-actions-menu.component';
import { DecimalInputComponent } from '../../ui/decimal-input/decimal-input.component';

type Client = { id: string; name: string };
type Project = { id: string; name: string; clientId: string | null };
type BillTo = 'CLIENT' | 'TENANT';
type BillToFields = { name: string; email: string | null; address: string | null };

type LineItem = {
  projectId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  timeEntryIds: string[];
  /** Reimbursable expenses (invoices billed to the business only). */
  expenseIds: string[];
  projectName?: string;
};


type InvoicePreviewLine = {
  projectId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  timeEntryIds: string[];
  expenseIds?: string[];
  startedAt: string;
};

type InvoicePreview = {
  period: { label: string };
  projects: Array<{
    projectId: string | null;
    projectName: string;
    lines: InvoicePreviewLine[];
  }>;
  /** Unbilled reimbursable expenses; only when billing the business. */
  expenses: InvoicePreviewLine[];
  canGenerate: boolean;
  missingRates: Array<{
    entryId: string;
    projectName: string;
    taskName: string | null;
    startedAt: string;
  }>;
};

type LineItemRow = { item: LineItem; index: number };

@Component({
  selector: 'app-invoice-form-page',
  standalone: true,
  imports: [HelpTextComponent, PeriodPickerComponent, 
    FormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TextareaModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    ...APP_QUILL_IMPORTS,
    PageComponent,
    DateInputComponent,
    RecordAttributionComponent,
    RowActionsMenuComponent,
    DecimalInputComponent,
  ],
  templateUrl: './invoice-form.page.html',
  styleUrl: './invoice-form.page.scss',
  host: { class: 'invoice-form-page' },
})
export class InvoiceFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invoiceSendDialog = inject(InvoiceSendDialogService);
  private readonly session = inject(SessionService);
  private readonly tenantBranding = inject(TenantBrandingService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  readonly billToOptions = computed(() => {
    const tenant = this.tenantBranding.companyName().trim() || 'organization';
    return [
      { label: 'To a client', value: 'CLIENT' as BillTo },
      { label: `To ${tenant}`, value: 'TENANT' as BillTo },
    ];
  });


  id = signal<string | null>(null);
  displayNumber = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  generating = signal(false);
  /** Set only when loading an existing draft fails (replaces the whole form). */
  loadError = signal<string | null>(null);
  generateMessage = signal<string | null>(null);
  missingRates = signal<InvoicePreview['missingRates']>([]);
  clients = signal<Client[]>([]);
  projects = signal<Project[]>([]);
  filteredProjects = signal<Project[]>([]);

  /** Generate from time: the period (app-period-picker) and an optional project. */
  period = signal(defaultPeriod());
  generate = {
    projectId: '' as string,
  };

  form = {
    /** Who the invoice is addressed to: a client, or the business (e.g. a caregiver billing for their hours). */
    billTo: 'CLIENT' as BillTo,
    clientId: '',
    billToName: '',
    billToEmail: '',
    billToAddress: '',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    notes: '',
    /** Percent for display (e.g. 8.75); converted to/from API decimal on save/load. */
    taxRate: null as number | null,
  };

  lineItems = signal<LineItem[]>([]);
  readonly attribution = signal<RecordAttributionDto | null>(null);

  readonly lineItemRows = computed((): LineItemRow[] =>
    this.lineItems().map((item, index) => ({ item, index })),
  );

  readonly draftHeaderActions = computed((): RowActionItem[] => {
    if (!this.isDraftEdit) return [];
    const actions: RowActionItem[] = [
      {
        id: 'pdf',
        label: 'Download PDF',
        icon: 'pi pi-file-pdf',
        command: () => void this.downloadPdf(),
      },
      {
        id: 'send',
        label: 'Send',
        icon: 'pi pi-send',
        command: () => void this.sendToClient(),
      },
    ];
    if (this.session.can('invoices', 'delete')) {
      actions.push({
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDeleteDraft(),
      });
    }
    return actions;
  });

  get isNew() { return !this.id(); }
  get isDraftEdit() { return !!this.id(); }

  /** Draft as last loaded or saved; Save stays off until something differs. */
  private savedSnapshot = '';

  private snapshot() {
    return JSON.stringify({ form: this.form, lines: this.lineItems() });
  }

  isDirty() {
    return this.snapshot() !== this.savedSnapshot;
  }
  get canEditLines() { return this.isNew || this.isDraftEdit; }
  /** Hide per-row project when Generate from time already filters to one project. */
  get hideLineProjectColumn() { return !!this.generate.projectId; }
  get subtotal() { return this.lineItems().reduce((s, i) => s + i.amount, 0); }
  get taxAmount() {
    const rate = this.taxRateDecimalFromForm();
    return rate ? this.subtotal * rate : 0;
  }
  get total() { return this.subtotal + this.taxAmount; }

  async ngOnInit() {
    const [clients, projects] = await Promise.all([
      this.api.get<Client[]>('/clients/lookup').catch(() => [] as Client[]),
      this.api.get<Project[]>('/projects').catch(() => [] as Project[]),
    ]);
    this.clients.set(clients);
    this.projects.set(projects);
    this.filteredProjects.set(projects);

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.id.set(id);
      try {
        const inv = await this.api.get<{
          status: string;
          displayNumber: string;
          billTo: BillTo;
          clientId: string | null;
          billToName?: string | null;
          billToEmail?: string | null;
          billToAddress?: string | null;
          issueDate: string;
          dueDate?: string;
          notes?: string;
          taxRate?: number;
          subtotal: number;
          taxAmount?: number | null;
          total: number;
          lineItems: Array<LineItem & { project?: { name: string } | null }>;
          attribution?: RecordAttributionDto;
        }>(`/invoices/${id}`);
        this.attribution.set(inv.attribution ?? null);
        if (inv.status !== 'DRAFT') {
          await this.router.navigate(['/invoices', id]);
          return;
        }
        this.displayNumber.set(inv.displayNumber);
        this.form = {
          billTo: inv.billTo ?? 'CLIENT',
          clientId: inv.clientId ?? '',
          billToName: inv.billToName ?? '',
          billToEmail: inv.billToEmail ?? '',
          billToAddress: inv.billToAddress ?? '',
          issueDate: inv.issueDate.slice(0, 10),
          dueDate: inv.dueDate?.slice(0, 10) ?? '',
          notes: inv.notes ?? '',
          taxRate: this.taxRatePercentFromApi(inv.taxRate),
        };
        this.lineItems.set(
          inv.lineItems.map((li) => ({
            projectId: li.projectId ?? null,
            projectName: li.project?.name,
            description: li.description,
            quantity: Number(li.quantity),
            unitPrice: Number(li.unitPrice),
            amount: Number(li.amount),
            timeEntryIds: li.timeEntryIds ?? [],
            expenseIds: li.expenseIds ?? [],
          })),
        );
        this.onClientChange();
        this.savedSnapshot = this.snapshot();
      } catch (err) {
        this.loadError.set(err instanceof Error ? err.message : 'Failed to load invoice');
      }
    } else {
      // Roles limited to their own invoices (e.g. caregivers) usually bill the business; so does anyone with no clients.
      const ownOnly = areaLevel(this.session.me(), 'invoices') === 'own';
      if (ownOnly || clients.length === 0) await this.onBillToChange('TENANT');
      // New invoice from an account or project page: ?clientId= / ?projectId= start it filled in.
      const qp = this.route.snapshot.queryParamMap;
      const fromProject = qp.get('projectId') ? projects.find((p) => p.id === qp.get('projectId')) : undefined;
      const clientId = fromProject?.clientId ?? qp.get('clientId');
      if (!this.billingTenant && clientId && clients.some((c) => c.id === clientId)) {
        this.form.clientId = clientId;
        this.onClientChange();
        if (fromProject) this.generate.projectId = fromProject.id;
      }
      this.savedSnapshot = this.snapshot();
    }
    this.loading.set(false);
  }

  get billingTenant() { return this.form.billTo === 'TENANT'; }

  /** API stores 0.0875 for 8.75%. */
  private taxRatePercentFromApi(decimal: number | null | undefined): number | null {
    if (decimal == null) return null;
    return Math.round(Number(decimal) * 10000) / 100;
  }

  private taxRateDecimalFromForm(): number | undefined {
    const raw = this.form.taxRate;
    if (raw == null) return undefined;
    const percent = Number(raw);
    if (!Number.isFinite(percent) || percent <= 0) return undefined;
    return percent / 100;
  }

  /** Switching to the business prefills its bill-to (editable); switching to a client clears it (the client's details are used). */
  async onBillToChange(billTo: BillTo) {
    this.form.billTo = billTo;
    if (billTo === 'TENANT') {
      const d = await this.api.get<BillToFields>('/invoices/tenant-bill-to').catch(() => null);
      this.form.billToName = d?.name ?? '';
      this.form.billToEmail = d?.email ?? '';
      this.form.billToAddress = d?.address ?? '';
    } else {
      this.form.billToName = '';
      this.form.billToEmail = '';
      this.form.billToAddress = '';
    }
    this.onClientChange();
  }

  onClientChange() {
    this.filteredProjects.set(
      this.form.clientId ? this.projects().filter((p) => p.clientId === this.form.clientId) : this.projects(),
    );
    if (this.generate.projectId) {
      const ok = this.filteredProjects().some((p) => p.id === this.generate.projectId);
      if (!ok) this.generate.projectId = '';
    }
  }

  addLine() {
    const projectId = this.generate.projectId || null;
    this.lineItems.update((items) => [
      ...items,
      { projectId, description: '', quantity: 0, unitPrice: 0, amount: 0, timeEntryIds: [], expenseIds: [] },
    ]);
  }

  removeLine(i: number) {
    this.lineItems.update((items) => items.filter((_, idx) => idx !== i));
  }

  calcLine(item: LineItem) {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    item.amount = Math.round(quantity * unitPrice * 100) / 100;
  }

  async generateFromTime() {
    if (!this.billingTenant && !this.form.clientId) {
      this.toast.add({ severity: 'warn', summary: 'Client required', detail: 'Select a client before generating from time.' });
      return;
    }
    const period = this.period();
    if (period.periodType === 'custom' && (!period.from || !period.to)) {
      this.toast.add({ severity: 'warn', summary: 'Date range required', detail: 'Select a custom date range.' });
      return;
    }

    this.generating.set(true);
    this.generateMessage.set(null);
    this.missingRates.set([]);

    try {
      const params = new URLSearchParams({
        billTo: this.form.billTo,
        ...(this.form.clientId ? { clientId: this.form.clientId } : {}),
        periodType: period.periodType,
        year: String(period.year),
      });
      if (period.periodType === 'month') {
        params.set('month', String(period.month));
      } else if (period.periodType === 'quarter') {
        params.set('quarter', String(period.quarter));
      } else {
        params.set('from', period.from);
        params.set('to', period.to);
      }
      if (this.generate.projectId) {
        params.set('projectId', this.generate.projectId);
      }

      const preview = await this.api.get<InvoicePreview>(`/invoices/preview?${params}`);
      this.missingRates.set(preview.missingRates);

      if (!preview.canGenerate) {
        if (preview.missingRates.length) {
          this.generateMessage.set(
            `${preview.missingRates.length} time entr${preview.missingRates.length === 1 ? 'y' : 'ies'} missing an hourly rate. Add a rate on the entry, project, or user before generating.`,
          );
        } else {
          this.generateMessage.set(
            this.billingTenant
              ? 'No uninvoiced time or reimbursable expenses found for this period.'
              : 'No billable, uninvoiced time or expenses found for this period.',
          );
        }
        return;
      }

      const toLine = (line: InvoicePreviewLine): LineItem => ({
        projectId: line.projectId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        timeEntryIds: line.timeEntryIds,
        expenseIds: line.expenseIds ?? [],
      });
      const timeLines = preview.projects
        .flatMap((project) => project.lines)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map(toLine);
      // Expenses follow the time, newest first.
      const expenseLines = (preview.expenses ?? []).map(toLine);
      const flat = [...timeLines, ...expenseLines];
      this.lineItems.set(flat);
      const expenseNote = expenseLines.length
        ? ` and ${expenseLines.length} expense${expenseLines.length === 1 ? '' : 's'}`
        : '';
      this.generateMessage.set(
        `Loaded ${timeLines.length} time line${timeLines.length === 1 ? '' : 's'}${expenseNote} (${preview.period.label}). Review and edit before saving.`,
      );
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Generate failed',
        detail: err instanceof Error ? err.message : 'Failed to generate from time',
      });
    } finally {
      this.generating.set(false);
    }
  }

  formatMissingDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async save() {
    this.saving.set(true);
    try {
      const lineItems = this.lineItems().map((li, i) => ({
        projectId: li.projectId || undefined,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        sortOrder: i,
        timeEntryIds: li.timeEntryIds.length ? li.timeEntryIds : undefined,
        expenseIds: li.expenseIds.length ? li.expenseIds : undefined,
      }));

      if (this.isNew) {
        const created = await this.api.post<{ id: string }>('/invoices', {
          billTo: this.form.billTo,
          clientId: this.billingTenant ? undefined : this.form.clientId,
          ...this.billToPayload(),
          issueDate: this.form.issueDate,
          dueDate: this.form.dueDate || undefined,
          notes: richTextOrUndefined(this.form.notes),
          taxRate: this.taxRateDecimalFromForm(),
          lineItems,
        });
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Invoice created successfully.',
        });
        await this.router.navigate(['/invoices', created.id, 'edit'], { replaceUrl: true });
      } else {
        const invoiceId = this.id()!;
        const updated = await this.api.put<{ attribution?: RecordAttributionDto }>(`/invoices/${invoiceId}`, {
          ...this.billToPayload(),
          notes: richTextOrUndefined(this.form.notes) ?? '',
          dueDate: this.form.dueDate || undefined,
          taxRate: this.taxRateDecimalFromForm(),
          lineItems,
        });
        if (updated?.attribution) {
          this.attribution.set(updated.attribution);
        } else {
          const refetched = await this.api.get<{ attribution?: RecordAttributionDto }>(`/invoices/${invoiceId}`);
          this.attribution.set(refetched.attribution ?? null);
        }
        this.savedSnapshot = this.snapshot();
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Invoice saved successfully.',
        });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Save failed';
      this.toast.add({ severity: 'error', summary: 'Save failed', detail });
    } finally { this.saving.set(false); }
  }

  /** Bill-to fields as typed; blank on a client invoice means "use the client's details". */
  private billToPayload() {
    if (!this.billingTenant && !this.form.billToName && !this.form.billToEmail && !this.form.billToAddress) return {};
    return {
      billToName: this.form.billToName,
      billToEmail: this.form.billToEmail,
      billToAddress: this.form.billToAddress,
    };
  }

  formatCurrency(n: number): string {
    return '$' + n.toFixed(2);
  }

  async downloadPdf() {
    const id = this.id();
    const number = this.displayNumber();
    if (!id || !number) return;
    try {
      await this.api.downloadPdf(`/invoices/${id}/pdf`, `${number}.pdf`);
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Download failed',
        detail: err instanceof Error ? err.message : 'PDF download failed',
      });
    }
  }

  async sendToClient() {
    const id = this.id();
    const number = this.displayNumber();
    if (!id || !number) return;

    const result = await this.invoiceSendDialog.open({
      invoiceId: id,
      displayNumber: number,
      resend: false,
    });
    if (result?.sent) {
      this.toast.add({
        severity: 'success',
        summary: 'Invoice sent',
        detail: `${number} was emailed to ${result.to}.`,
        life: 6000,
      });
      await this.router.navigate(['/invoices', id]);
    }
  }

  confirmDeleteDraft() {
    const id = this.id();
    const number = this.displayNumber();
    if (!id || !number) return;
    this.confirmDelete.confirm({
      message: `Delete invoice ${number}? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/invoices/${id}`);
          await this.router.navigate(['/invoices']);
        } catch (err) {
          this.toast.add({
            severity: 'error',
            summary: 'Delete failed',
            detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Delete failed',
          });
        }
      },
    });
  }

  onNotesEditor(quill: Quill) {
    bindQuillPersonCardScope(quill, () => {
      const clientId = this.form.clientId?.trim();
      return clientId ? { type: 'client', clientId } : { type: 'crm' };
    });
  }
}

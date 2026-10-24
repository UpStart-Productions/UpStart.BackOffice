import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { areaLevel } from '@upstart/back-office/shared';
import { SessionService } from '../../core/session.service';
import { TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import { QuillModule } from 'ngx-quill';
import { ApiService } from '../../core/api.service';
import { richTextOrUndefined } from '../../core/rich-text.util';
import { PageComponent } from '../../ui/layout/page.component';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { InvoiceSendDialogService } from './invoice-send-dialog.service';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';

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
  projectName?: string;
};

type PeriodType = 'month' | 'quarter' | 'custom';

type InvoicePreview = {
  period: { label: string };
  projects: Array<{
    projectId: string | null;
    projectName: string;
    lines: Array<{
      projectId: string | null;
      description: string;
      quantity: number;
      unitPrice: number;
      amount: number;
      timeEntryIds: string[];
      startedAt: string;
    }>;
  }>;
  canGenerate: boolean;
  missingRates: Array<{
    entryId: string;
    projectName: string;
    taskName: string | null;
    startedAt: string;
  }>;
};

type LineItemRow = { item: LineItem; index: number };

const MONTHS = [
  { label: 'January', value: 1 },
  { label: 'February', value: 2 },
  { label: 'March', value: 3 },
  { label: 'April', value: 4 },
  { label: 'May', value: 5 },
  { label: 'June', value: 6 },
  { label: 'July', value: 7 },
  { label: 'August', value: 8 },
  { label: 'September', value: 9 },
  { label: 'October', value: 10 },
  { label: 'November', value: 11 },
  { label: 'December', value: 12 },
];

const QUARTERS = [
  { label: 'Q1 (Jan – Mar)', value: 1 },
  { label: 'Q2 (Apr – Jun)', value: 2 },
  { label: 'Q3 (Jul – Sep)', value: 3 },
  { label: 'Q4 (Oct – Dec)', value: 4 },
];

@Component({
  selector: 'app-invoice-form-page',
  standalone: true,
  imports: [HelpTextComponent, 
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TextareaModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    QuillModule,
    PageComponent,
    DateInputComponent,
  ],
  templateUrl: './invoice-form.page.html',
  styleUrl: './invoice-form.page.scss',
})
export class InvoiceFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invoiceSendDialog = inject(InvoiceSendDialogService);
  private readonly session = inject(SessionService);

  readonly billToOptions = [
    { label: 'A client', value: 'CLIENT' as BillTo },
    { label: 'Our organization', value: 'TENANT' as BillTo },
  ];

  readonly months = MONTHS;
  readonly quarters = QUARTERS;

  id = signal<string | null>(null);
  displayNumber = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  generating = signal(false);
  error = signal<string | null>(null);
  generateMessage = signal<string | null>(null);
  missingRates = signal<InvoicePreview['missingRates']>([]);
  periodLabel = signal<string | null>(null);
  clients = signal<Client[]>([]);
  projects = signal<Project[]>([]);
  filteredProjects = signal<Project[]>([]);

  private readonly now = new Date();
  readonly yearOptions = [
    this.now.getFullYear() - 1,
    this.now.getFullYear(),
    this.now.getFullYear() + 1,
  ];

  generate = {
    periodType: 'month' as PeriodType,
    month: this.now.getMonth() + 1,
    year: this.now.getFullYear(),
    quarter: Math.floor(this.now.getMonth() / 3) + 1,
    from: '',
    to: '',
    projectId: '' as string,
  };

  form = {
    /** Who the invoice is addressed to: a client, or the organization (e.g. a caregiver billing for their hours). */
    billTo: 'CLIENT' as BillTo,
    clientId: '',
    billToName: '',
    billToEmail: '',
    billToAddress: '',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    notes: '',
    taxRate: null as number | null,
  };

  lineItems = signal<LineItem[]>([]);

  readonly lineItemRows = computed((): LineItemRow[] =>
    this.lineItems().map((item, index) => ({ item, index })),
  );

  get isNew() { return !this.id(); }
  get isDraftEdit() { return !!this.id(); }
  get canEditLines() { return this.isNew || this.isDraftEdit; }
  /** Hide per-row project when Generate from time already filters to one project. */
  get hideLineProjectColumn() { return !!this.generate.projectId; }
  get subtotal() { return this.lineItems().reduce((s, i) => s + i.amount, 0); }
  get taxAmount() { return this.form.taxRate ? this.subtotal * this.form.taxRate : 0; }
  get total() { return this.subtotal + this.taxAmount; }
  get periodTypeOptions() {
    return [
      { label: 'Month', value: 'month' as PeriodType },
      { label: 'Quarter', value: 'quarter' as PeriodType },
      { label: 'Custom range', value: 'custom' as PeriodType },
    ];
  }

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
        }>(`/invoices/${id}`);
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
          taxRate: inv.taxRate ?? null,
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
          })),
        );
        this.onClientChange();
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load invoice');
      }
    } else {
      // Roles limited to their own invoices (e.g. caregivers) usually bill the organization; so does anyone with no clients.
      const ownOnly = areaLevel(this.session.me(), 'invoices') === 'own';
      if (ownOnly || clients.length === 0) await this.onBillToChange('TENANT');
    }
    this.loading.set(false);
  }

  get billingTenant() { return this.form.billTo === 'TENANT'; }

  /** Switching to the organization prefills its bill-to (editable); switching to a client clears it (the client's details are used). */
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
      { projectId, description: '', quantity: 0, unitPrice: 0, amount: 0, timeEntryIds: [] },
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
      this.error.set('Select a client before generating from time');
      return;
    }
    if (this.generate.periodType === 'custom' && (!this.generate.from || !this.generate.to)) {
      this.error.set('Select a custom date range');
      return;
    }

    this.generating.set(true);
    this.error.set(null);
    this.generateMessage.set(null);
    this.missingRates.set([]);

    try {
      const params = new URLSearchParams({
        billTo: this.form.billTo,
        ...(this.form.clientId ? { clientId: this.form.clientId } : {}),
        periodType: this.generate.periodType,
        year: String(this.generate.year),
      });
      if (this.generate.periodType === 'month') {
        params.set('month', String(this.generate.month));
      } else if (this.generate.periodType === 'quarter') {
        params.set('quarter', String(this.generate.quarter));
      } else {
        params.set('from', this.generate.from);
        params.set('to', this.generate.to);
      }
      if (this.generate.projectId) {
        params.set('projectId', this.generate.projectId);
      }

      const preview = await this.api.get<InvoicePreview>(`/invoices/preview?${params}`);
      this.periodLabel.set(preview.period.label);
      this.missingRates.set(preview.missingRates);

      if (!preview.canGenerate) {
        if (preview.missingRates.length) {
          this.generateMessage.set(
            `${preview.missingRates.length} time entr${preview.missingRates.length === 1 ? 'y' : 'ies'} missing an hourly rate. Add a rate on the entry, project, or user before generating.`,
          );
        } else {
          this.generateMessage.set('No billable, uninvoiced time found for this period.');
        }
        return;
      }

      const flat = preview.projects
        .flatMap((project) => project.lines)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map((line) => ({
          projectId: line.projectId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: line.amount,
          timeEntryIds: line.timeEntryIds,
        }));
      this.lineItems.set(flat);
      this.generateMessage.set(
        `Loaded ${flat.length} line${flat.length === 1 ? '' : 's'} from time (${preview.period.label}). Review and edit before saving.`,
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to generate from time');
    } finally {
      this.generating.set(false);
    }
  }

  formatMissingDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async save() {
    if (!this.billingTenant && !this.form.clientId) { this.error.set('Client is required'); return; }
    if (this.billingTenant && !this.form.billToName.trim()) { this.error.set('Bill-to name is required'); return; }
    if (this.lineItems().length === 0) { this.error.set('At least one line item is required'); return; }
    for (const li of this.lineItems()) {
      if (!li.description.trim()) { this.error.set('Each line item needs a description'); return; }
      if (li.quantity <= 0) { this.error.set('Each line item needs hours greater than zero'); return; }
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const lineItems = this.lineItems().map((li, i) => ({
        projectId: li.projectId || undefined,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        sortOrder: i,
        timeEntryIds: li.timeEntryIds.length ? li.timeEntryIds : undefined,
      }));

      if (this.isNew) {
        const created = await this.api.post<{ id: string }>('/invoices', {
          billTo: this.form.billTo,
          clientId: this.billingTenant ? undefined : this.form.clientId,
          ...this.billToPayload(),
          issueDate: this.form.issueDate,
          dueDate: this.form.dueDate || undefined,
          notes: richTextOrUndefined(this.form.notes),
          taxRate: this.form.taxRate || undefined,
          lineItems,
        });
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Invoice created successfully.',
        });
        await this.router.navigate(['/invoices', created.id, 'edit'], { replaceUrl: true });
      } else {
        await this.api.put(`/invoices/${this.id()}`, {
          ...this.billToPayload(),
          notes: richTextOrUndefined(this.form.notes) ?? '',
          dueDate: this.form.dueDate || undefined,
          taxRate: this.form.taxRate ?? undefined,
          lineItems,
        });
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Invoice saved successfully.',
        });
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
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
      this.error.set(err instanceof Error ? err.message : 'PDF download failed');
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
}

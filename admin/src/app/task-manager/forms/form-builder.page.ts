import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';
import { TmApiService } from '../core/tm-api.service';
import { TmStoreService } from '../core/tm-store.service';
import { FormAccess, FormQuestion, FormQuestionType, Person, TmForm, TmProject } from '../core/tm.types';
import { TmProjectIconComponent } from '../ui/tm-project-icon.component';
import { ACCESS_OPTIONS, formApiUrl, formPageUrl } from './form-links';

const TYPE_OPTIONS: { value: FormQuestionType; label: string }[] = [
  { value: 'SHORT_TEXT', label: 'Short text' },
  { value: 'LONG_TEXT', label: 'Paragraph' },
  { value: 'SELECT', label: 'Dropdown' },
  { value: 'MULTI_SELECT', label: 'Multiple choice' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATE', label: 'Date' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'CHECKBOX', label: 'Checkbox' },
  { value: 'FILE', label: 'File upload' },
];

const FIELD_TYPE_TO_QUESTION: Record<string, FormQuestionType> = {
  TEXT: 'SHORT_TEXT',
  NUMBER: 'NUMBER',
  DATE: 'DATE',
  SINGLE_SELECT: 'SELECT',
  MULTI_SELECT: 'MULTI_SELECT',
  CHECKBOX: 'CHECKBOX',
};

type Draft = {
  name: string;
  slug: string;
  description: string;
  access: FormAccess;
  isActive: boolean;
  sectionId: string | null;
  assigneeId: string | null;
  tagIds: string[];
  confirmationMessage: string;
  questions: (FormQuestion & { optionsText?: string })[];
};

/** Build a form: questions on the left, settings (access, where tasks land, API key) on the right. */
@Component({
  selector: 'app-tm-form-builder-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    TextareaModule,
    ToggleSwitchModule,
    TooltipModule,
    TmProjectIconComponent,
  ],
  templateUrl: './form-builder.page.html',
})
export class FormBuilderPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(TmApiService);
  readonly store = inject(TmStoreService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly projectId = toSignal(this.route.paramMap.pipe(map((p) => p.get('projectId')!)), {
    initialValue: this.route.snapshot.paramMap.get('projectId')!,
  });
  readonly formId = this.route.snapshot.paramMap.get('formId')!;

  project = signal<TmProject | null>(null);
  form = signal<TmForm | null>(null);
  draft = signal<Draft | null>(null);
  people = signal<Person[]>([]);
  loading = signal(true);
  saving = signal(false);
  dirty = signal(false);
  newKey = signal<string | null>(null);
  error = signal<string | null>(null);

  readonly typeOptions = TYPE_OPTIONS;
  readonly accessOptions = ACCESS_OPTIONS;
  readonly canEdit = computed(() => !!this.project()?.permissions.canEdit);
  readonly sections = computed(() => [...(this.project()?.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
  readonly sectionOptions = computed(() => [{ id: null as string | null, name: 'First section' }, ...this.sections()]);
  readonly assigneeOptions = computed(() => [{ id: null as string | null, name: 'Unassigned' }, ...this.people()]);
  readonly pageUrl = computed(() => formPageUrl(this.form()?.slug ?? ''));
  readonly apiUrl = computed(() => formApiUrl(this.form()?.slug ?? ''));
  readonly targetOptions = computed(() => [
    { value: 'DESCRIPTION', label: 'Task description' },
    { value: 'NAME', label: 'Task name' },
    ...(this.project()?.customFields ?? []).map((f) => ({ value: `FIELD:${f.id}`, label: `Field: ${f.name}` })),
  ]);
  readonly curlExample = computed(() => {
    const f = this.form();
    const d = this.draft();
    if (!f || !d) return '';
    const answers = Object.fromEntries(
      d.questions
        .filter((q) => q.type !== 'FILE')
        .map((q) => [q.key || '(saved key)', q.type === 'SELECT' ? (q.options?.[0] ?? '') : q.type === 'NUMBER' ? 1 : q.type === 'CHECKBOX' ? true : '…']),
    );
    const body = JSON.stringify(
      { answers, submitter: { email: 'person@example.org', name: 'Pat Example' }, context: { app: 'GrovLink', appVersion: '1.2.3' } },
      null,
      2,
    );
    return `curl -X POST '${formApiUrl(f.slug)}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-Form-Key: ${this.newKey() ?? f.apiKeyHint ?? 'ubof_…'}' \\\n  -d '${body}'`;
  });

  constructor() {
    void this.load();
    void this.store.loadTags();
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.dirty()) event.preventDefault();
  }

  async load() {
    this.loading.set(true);
    try {
      const [project, form] = await Promise.all([this.api.getProject(this.projectId()), this.api.getForm(this.formId)]);
      this.project.set(project);
      this.setForm(form);
      this.people.set(await this.store.people(this.projectId()));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not load the form');
    } finally {
      this.loading.set(false);
    }
  }

  private setForm(form: TmForm) {
    this.form.set(form);
    this.draft.set({
      name: form.name,
      slug: form.slug,
      description: form.description ?? '',
      access: form.access,
      isActive: form.isActive,
      sectionId: form.sectionId,
      assigneeId: form.assigneeId,
      tagIds: [...form.tagIds],
      confirmationMessage: form.confirmationMessage ?? '',
      questions: form.questions.map((q) => ({ ...q, optionsText: (q.options ?? []).join('\n') })),
    });
    this.dirty.set(false);
  }

  /** Mutate the draft and mark it dirty. */
  patch(fn: (d: Draft) => void) {
    const d = this.draft();
    if (!d) return;
    const next = structuredClone(d);
    fn(next);
    this.draft.set(next);
    this.dirty.set(true);
  }

  set<K extends keyof Draft>(key: K, value: Draft[K]) {
    this.patch((d) => {
      d[key] = value;
    });
  }

  setQ<K extends keyof FormQuestion>(index: number, key: K, value: FormQuestion[K]) {
    this.patch((d) => {
      d.questions[index][key] = value;
    });
  }

  // ── Questions ───────────────────────────────────────────────────────────

  targetValue(q: FormQuestion): string {
    return q.target === 'FIELD' ? `FIELD:${q.fieldId}` : q.target;
  }

  setTarget(index: number, value: string) {
    this.patch((d) => {
      const q = d.questions[index];
      if (value === 'NAME') {
        // Only one question can be the task name.
        d.questions.forEach((other, i) => {
          if (i !== index && other.target === 'NAME') other.target = 'DESCRIPTION';
        });
        q.target = 'NAME';
        q.type = 'SHORT_TEXT';
        q.required = true;
        delete q.fieldId;
      } else if (value.startsWith('FIELD:')) {
        const field = this.project()?.customFields.find((f) => `FIELD:${f.id}` === value);
        q.target = 'FIELD';
        q.fieldId = field?.id;
        q.type = FIELD_TYPE_TO_QUESTION[field?.type ?? 'TEXT'] ?? 'SHORT_TEXT';
        q.options = field?.options.map((o) => o.label);
        q.optionsText = (q.options ?? []).join('\n');
      } else {
        q.target = 'DESCRIPTION';
        delete q.fieldId;
      }
    });
  }

  typeLocked(q: FormQuestion): boolean {
    return q.target === 'NAME' || q.target === 'FIELD';
  }

  hasChoices(q: FormQuestion): boolean {
    return q.type === 'SELECT' || q.type === 'MULTI_SELECT';
  }

  setOptionsText(index: number, text: string) {
    this.patch((d) => {
      d.questions[index].optionsText = text;
      d.questions[index].options = text.split('\n').map((s) => s.trim()).filter(Boolean);
    });
  }

  addQuestion() {
    this.patch((d) =>
      d.questions.push({ id: crypto.randomUUID(), key: '', label: 'New question', type: 'SHORT_TEXT', required: false, target: 'DESCRIPTION', optionsText: '' }),
    );
  }

  moveQuestion(index: number, delta: number) {
    this.patch((d) => {
      const to = index + delta;
      if (to < 0 || to >= d.questions.length) return;
      const [q] = d.questions.splice(index, 1);
      d.questions.splice(to, 0, q);
    });
  }

  removeQuestion(index: number) {
    this.patch((d) => d.questions.splice(index, 1));
  }

  // ── Save / delete ───────────────────────────────────────────────────────

  async save() {
    const d = this.draft();
    const f = this.form();
    if (!d || !f) return;
    if (!d.questions.some((q) => q.target === 'NAME')) {
      this.toast.add({ severity: 'warn', summary: 'Pick a task name', detail: 'Set one question to go to “Task name”.' });
      return;
    }
    this.saving.set(true);
    try {
      const saved = await this.api.updateForm(f.id, {
        name: d.name,
        slug: d.slug,
        description: d.description || null,
        access: d.access,
        isActive: d.isActive,
        sectionId: d.sectionId,
        assigneeId: d.assigneeId,
        tagIds: d.tagIds,
        confirmationMessage: d.confirmationMessage || null,
        questions: d.questions.map(({ optionsText: _t, ...q }) => q),
      });
      this.setForm(saved);
      this.toast.add({ severity: 'success', summary: 'Form saved', life: 2000 });
    } catch (err) {
      this.fail(err);
    } finally {
      this.saving.set(false);
    }
  }

  discard() {
    const f = this.form();
    if (f) this.setForm(f);
  }

  remove() {
    const f = this.form();
    if (!f) return;
    this.confirm.confirm({
      header: 'Delete form?',
      message: `“${f.name}” will stop accepting submissions. Tasks it already created stay in the project.`,
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      accept: async () => {
        try {
          await this.api.deleteForm(f.id);
          this.dirty.set(false);
          await this.router.navigate(['/tasks/projects', this.projectId(), 'forms']);
        } catch (err) {
          this.fail(err);
        }
      },
    });
  }

  // ── API key ─────────────────────────────────────────────────────────────

  rotateKey() {
    const f = this.form();
    if (!f) return;
    const go = async () => {
      try {
        const { key, hint } = await this.api.rotateFormKey(f.id);
        this.newKey.set(key);
        this.form.set({ ...f, hasApiKey: true, apiKeyHint: hint });
      } catch (err) {
        this.fail(err);
      }
    };
    if (!f.hasApiKey) {
      void go();
      return;
    }
    this.confirm.confirm({
      header: 'Replace API key?',
      message: 'The current key stops working immediately. Apps using it will need the new one.',
      acceptLabel: 'Replace key',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      accept: go,
    });
  }

  async copy(text: string, what = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.add({ severity: 'success', summary: what, life: 2000 });
    } catch {
      this.toast.add({ severity: 'info', summary: what, detail: text });
    }
  }

  private fail(err: unknown) {
    this.toast.add({ severity: 'error', summary: 'Something went wrong', detail: err instanceof Error ? err.message : String(err) });
  }
}

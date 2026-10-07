import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { environment } from '../../../environments/environment';
import { AuthStoreService } from '../../core/auth-store.service';
import { CognitoAuthService } from '../../core/cognito-auth.service';
import { TmApiService } from '../../task-manager/core/tm-api.service';
import { FormDefinition, FormSubmitResult } from '../../task-manager/core/tm.types';

type Question = NonNullable<FormDefinition['questions']>[number];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Public form page (/f/:slug). Open forms work for anyone (email required); collaborator forms send
 * people to sign in and back. Each submission becomes a task.
 */
@Component({
  selector: 'app-task-form-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    SelectModule,
    TextareaModule,
  ],
  styleUrls: ['../login/login.page.scss', './task-form.page.scss'],
  templateUrl: './task-form.page.html',
})
export class TaskFormPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStoreService);
  private readonly cognito = inject(CognitoAuthService);
  private readonly tm = inject(TmApiService);

  readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';
  def = signal<FormDefinition | null>(null);
  loading = signal(true);
  loadError = signal<string | null>(null);
  needsSignIn = signal(false);
  signedIn = signal(false);
  submitting = signal(false);
  submitError = signal<string | null>(null);
  result = signal<FormSubmitResult | null>(null);

  answers: Record<string, unknown> = {};
  dates: Record<string, Date | null> = {};
  files: Record<string, File[]> = {};
  email = '';
  name = '';
  website = '';

  readonly visibleQuestions = computed(() => (this.def()?.questions ?? []).filter((q) => !q.hidden));

  async ngOnInit() {
    await this.load();
  }

  private async isSignedIn(): Promise<boolean> {
    if (this.cognito.useCognito) return !!(await this.cognito.getIdToken().catch(() => null));
    return !!this.auth.baseEmail;
  }

  async load() {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const res = await fetch(`${environment.apiBaseUrl}/forms/${encodeURIComponent(this.slug)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || 'This form is not available');
      let def = body as FormDefinition;
      if (def.access === 'API_KEY') throw new Error('This form is not available');
      if (def.requiresSignIn) {
        this.signedIn.set(await this.isSignedIn());
        if (!this.signedIn()) {
          this.def.set(def);
          this.needsSignIn.set(true);
          return;
        }
        def = await this.tm.collaboratorForm(this.slug);
      }
      this.def.set(def);
      this.reset();
    } catch (err) {
      this.loadError.set((err instanceof Error ? err.message : String(err)).replace(/^API error \d+: /, ''));
    } finally {
      this.loading.set(false);
    }
  }

  signIn() {
    try {
      sessionStorage.setItem('ubo_return_url', this.router.url);
    } catch {
      /* ignore */
    }
    void this.router.navigate(['/login']);
  }

  reset() {
    const params = this.route.snapshot.queryParamMap;
    this.answers = {};
    this.dates = {};
    this.files = {};
    for (const q of this.def()?.questions ?? []) {
      // Prefill (and hidden values) from the link: /f/slug?key=value
      const v = params.get(q.key);
      if (v !== null) this.answers[q.key] = q.type === 'MULTI_SELECT' ? v.split(',') : q.type === 'CHECKBOX' ? v === 'true' : v;
      if (q.type === 'CHECKBOX' && this.answers[q.key] === undefined) this.answers[q.key] = false;
    }
    this.result.set(null);
    this.submitError.set(null);
  }

  onFiles(q: Question, event: Event) {
    const input = event.target as HTMLInputElement;
    this.files[q.key] = Array.from(input.files ?? []);
  }

  fileNames(q: Question): string {
    return (this.files[q.key] ?? []).map((f) => f.name).join(', ');
  }

  async submit() {
    const def = this.def();
    if (!def) return;
    this.submitError.set(null);
    for (const [key, d] of Object.entries(this.dates)) this.answers[key] = d ? dateKey(d) : null;

    const allFiles = Object.values(this.files).flat();
    const maxFiles = def.maxFiles ?? 5;
    const maxBytes = def.maxFileBytes ?? 10 * 1024 * 1024;
    if (allFiles.length > maxFiles) return this.submitError.set(`Attach at most ${maxFiles} files.`);
    if (allFiles.some((f) => f.size > maxBytes)) return this.submitError.set(`Each file must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);

    const body = new FormData();
    body.append('answers', JSON.stringify(this.answers));
    if (def.requiresEmail) body.append('submitter', JSON.stringify({ email: this.email.trim(), name: this.name.trim() }));
    if (this.website) body.append('website', this.website);
    for (const f of allFiles) body.append('files', f, f.name);

    this.submitting.set(true);
    try {
      let result: FormSubmitResult;
      if (def.access === 'COLLABORATORS') {
        result = await this.tm.submitCollaboratorForm(this.slug, body);
      } else {
        const res = await fetch(`${environment.apiBaseUrl}/forms/${encodeURIComponent(this.slug)}/submit`, { method: 'POST', body });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.message || 'Could not submit the form');
        result = json as FormSubmitResult;
      }
      this.result.set(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      this.submitError.set((err instanceof Error ? err.message : String(err)).replace(/^API error \d+: /, ''));
    } finally {
      this.submitting.set(false);
    }
  }

  openTask() {
    const route = this.result()?.route;
    if (route) void this.router.navigate(['/', ...route]);
  }
}

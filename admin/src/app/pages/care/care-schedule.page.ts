import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { WEEKDAY_SHORT, type CareShiftDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CareApi } from '../../core/care.api';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { dateKey } from '../../core/date.util';
import { SessionService } from '../../core/session.service';
import { browserTimeZone, timeKey } from '../../ui/care-forms/care.types';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { InlineCalendarPopoverComponent } from '../../ui/inline-calendar-popover/inline-calendar-popover.component';
import { PageComponent } from '../../ui/layout/page.component';
import { OrganizationSelectComponent } from '../../ui/organization-select/organization-select.component';
import { PeopleSelectComponent } from '../../ui/people-select/people-select.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { PeopleDirectoryOption, teamUsersToOptions } from '../projects/people-directory.util';

/** Monday 00:00 (local) of the week containing d. */
function weekStartOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Care → Schedule: a week of shifts per account and worker, one-off or repeating weekly. */
@Component({
  selector: 'app-care-schedule-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    InputTextModule,
    MessageModule,
    SelectButtonModule,
    TagModule,
    TextareaModule,
    AppDialogModule,
    DateInputComponent,
    HelpTextComponent,
    InlineCalendarPopoverComponent,
    OrganizationSelectComponent,
    PageComponent,
    PeopleSelectComponent,
    RowActionsMenuComponent,
  ],
  templateUrl: './care-schedule.page.html',
  styleUrl: './care-schedule.page.scss',
})
export class CareSchedulePage implements OnInit {
  private readonly care = inject(CareApi);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);

  readonly todayKey = dateKey(new Date());
  readonly weekdayOptions = [1, 2, 3, 4, 5, 6, 0].map((value) => ({ value, label: WEEKDAY_SHORT[value] }));

  weekStart = signal(weekStartOf(new Date()));
  shifts = signal<CareShiftDto[]>([]);
  workers = signal<PeopleDirectoryOption[]>([]);
  workerId = signal<string | null>(null);
  /** ?clientId= presets the filter (from a client's Care tab). */
  clientId = signal<string | null>(this.route.snapshot.queryParamMap.get('clientId'));
  error = signal<string | null>(null);
  saving = signal(false);

  readonly seeAll = computed(() => this.session.me()?.role === 'ADMIN' || this.session.me()?.permissions?.schedule === 'all');
  readonly canCreate = computed(() => this.session.can('schedule', 'create'));
  readonly canEdit = computed(() => this.session.can('schedule', 'edit'));
  readonly canDelete = computed(() => this.session.can('schedule', 'delete'));

  readonly weekLabel = computed(() => {
    const s = this.weekStart();
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    const fmt = (d: Date, withYear: boolean) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
    return `${fmt(s, false)} – ${fmt(e, true)}`;
  });

  /** Anchor for the week calendar popover (Monday of the visible week). */
  readonly weekPickerDate = computed(() => new Date(this.weekStart()));

  readonly isThisCalendarWeek = computed(() => dateKey(this.weekStart()) === dateKey(weekStartOf(new Date())));

  readonly days = computed(() => {
    const byDay = new Map<string, CareShiftDto[]>();
    for (const s of this.shifts()) {
      const k = dateKey(new Date(s.startAt));
      byDay.set(k, [...(byDay.get(k) ?? []), s]);
    }
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(this.weekStart());
      date.setDate(date.getDate() + i);
      const key = dateKey(date);
      const shifts = (byDay.get(key) ?? []).slice().sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      return { key, date, shifts };
    });
  });

  dialogVisible = false;
  editing: CareShiftDto | null = null;
  fClientId: string | null = null;
  fWorkerId: string | null = null;
  fDate = '';
  fStart = '09:00';
  fEnd = '13:00';
  fRepeat = false;
  fWeekdays: number[] = [];
  fUntil = '';
  fNotes = '';

  constructor() {
    effect(() => {
      this.weekStart();
      this.workerId();
      this.clientId();
      void this.load();
    });
  }

  async ngOnInit() {
    // ?new=1 opens Add shift (from a client's Care tab).
    if (this.route.snapshot.queryParamMap.get('new') && this.canCreate()) this.openNew();
    if (this.seeAll()) {
      try {
        this.workers.set(teamUsersToOptions(await this.care.workers()));
      } catch {
        this.workers.set([]);
      }
    }
  }

  async load() {
    const from = this.weekStart();
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    try {
      this.shifts.set(
        await this.care.shifts({ from: from.toISOString(), to: to.toISOString(), userId: this.workerId(), clientId: this.clientId() }),
      );
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load the schedule');
    }
  }

  moveWeek(n: number) {
    const d = new Date(this.weekStart());
    d.setDate(d.getDate() + 7 * n);
    this.weekStart.set(d);
  }

  thisWeek() {
    this.weekStart.set(weekStartOf(new Date()));
  }

  jumpToWeek(selected: Date, popover: InlineCalendarPopoverComponent) {
    this.weekStart.set(weekStartOf(selected));
    popover.hide();
  }

  rowActions(s: CareShiftDto): RowActionItem[] {
    const me = this.session.me()?.id;
    const items: RowActionItem[] = [];
    if (s.visitId) {
      items.push({ id: 'visit', label: 'Open visit', icon: 'pi pi-arrow-right', command: () => void this.router.navigate(['/care/visits', s.visitId]) });
    } else if (s.status === 'SCHEDULED' && s.worker?.id === me && this.session.can('visits', 'create')) {
      items.push({ id: 'start', label: 'Start visit', icon: 'pi pi-play', command: () => void this.startVisit(s) });
    }
    if (this.canEdit()) {
      items.push({ id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openEdit(s) });
      items.push(
        s.status === 'SCHEDULED'
          ? { id: 'cancel', label: 'Cancel shift', icon: 'pi pi-ban', severity: 'warn', command: () => void this.setCancelled(s, true) }
          : { id: 'restore', label: 'Restore shift', icon: 'pi pi-replay', command: () => void this.setCancelled(s, false) },
      );
    }
    if (this.canDelete()) {
      if (!s.visitId) items.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete(s, false) });
      if (s.seriesId) items.push({ id: 'delete-following', label: 'Delete this and following', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete(s, true) });
    }
    return items;
  }

  /** @param dayKey YYYY-MM-DD for that column; defaults to today-or-first day in view. */
  openNew(dayKey?: string) {
    this.editing = null;
    this.fClientId = this.clientId();
    this.fWorkerId = this.seeAll() ? this.workerId() : (this.session.me()?.id ?? null);
    const fallback = this.days().find((d) => d.key >= this.todayKey)?.key ?? this.days()[0].key;
    this.fDate = dayKey ?? fallback;
    this.fStart = '09:00';
    this.fEnd = '13:00';
    this.fRepeat = false;
    this.fWeekdays = [];
    this.fUntil = '';
    this.fNotes = '';
    this.dialogVisible = true;
  }

  openEdit(s: CareShiftDto) {
    this.editing = s;
    this.fClientId = s.clientId;
    this.fWorkerId = s.worker?.id ?? null;
    const start = new Date(s.startAt);
    this.fDate = dateKey(start);
    this.fStart = timeKey(start);
    this.fEnd = timeKey(new Date(s.endAt));
    this.fRepeat = false;
    this.fNotes = s.notes ?? '';
    this.dialogVisible = true;
  }

  canSave() {
    if (!this.fClientId || !this.fDate || !this.fStart || !this.fEnd) return false;
    if (!this.editing && this.fRepeat && !this.fWeekdays.length) return false;
    return true;
  }

  async save() {
    this.saving.set(true);
    try {
      const base = {
        clientId: this.fClientId!,
        userId: this.seeAll() ? this.fWorkerId : (this.session.me()?.id ?? null),
        date: this.fDate,
        startTime: this.fStart,
        endTime: this.fEnd,
        timezone: browserTimeZone(),
        notes: this.fNotes.trim() || null,
      };
      const res = this.editing
        ? await this.care.updateShift(this.editing.id, base)
        : await this.care.createShift({ ...base, ...(this.fRepeat ? { repeat: { weekdays: this.fWeekdays, ...(this.fUntil ? { until: this.fUntil } : {}) } } : {}) });
      this.dialogVisible = false;
      if (res.conflicts) {
        this.toast.add({
          severity: 'warn',
          summary: 'Overlapping shifts',
          detail: `${res.shift.worker?.name ?? 'This worker'} has ${res.conflicts} other ${res.conflicts === 1 ? 'shift' : 'shifts'} at the same time.`,
          life: 8000,
        });
      }
      await this.load();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.saving.set(false);
    }
  }

  async setCancelled(s: CareShiftDto, cancelled: boolean) {
    try {
      if (cancelled) await this.care.cancelShift(s.id);
      else await this.care.restoreShift(s.id);
      await this.load();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not update', detail: err instanceof Error ? err.message : 'Failed' });
    }
  }

  confirmDelete(s: CareShiftDto, following: boolean) {
    this.confirm.confirm({
      message: following
        ? `Delete this shift and every later shift in the series (${s.repeatLabel})? Shifts that already have a visit stay. This cannot be undone.`
        : `Delete this shift at ${s.clientName}? This cannot be undone.`,
      accept: async () => {
        try {
          await this.care.deleteShift(s.id, following);
          await this.load();
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
        }
      },
    });
  }

  async startVisit(s: CareShiftDto) {
    try {
      const visit = await this.care.createVisit({ clientId: s.clientId, shiftId: s.id });
      await this.router.navigate(['/care/visits', visit.id]);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not start the visit', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    }
  }
}

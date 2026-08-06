import {
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { Popover, PopoverModule } from 'primeng/popover';
import { PageComponent } from '../../ui/layout/page.component';
import { TimeEntryModalComponent } from './time-entry-modal.component';
import type { Project, TimeEntry } from './time-entry.types';
import {
  addDays,
  dateKey,
  dayLabel,
  endOfWeek,
  formatDayHeading,
  formatDurationMin,
  formatElapsed,
  isSameDay,
  isToday,
  startOfWeek,
  weekDays,
} from './timesheet.utils';

@Component({
  selector: 'app-time-entry-list-page',
  standalone: true,
  imports: [
    ButtonModule,
    DatePickerModule,
    FormsModule,
    PageComponent,
    PopoverModule,
    TimeEntryModalComponent,
  ],
  templateUrl: './time-entry-list.page.html',
  styleUrl: './time-entry-list.page.scss',
})
export class TimeEntryListPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly modal = viewChild.required(TimeEntryModalComponent);

  @ViewChild('csvFileInput') csvFileInput?: ElementRef<HTMLInputElement>;

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private readonly tick = signal(0);

  entries = signal<TimeEntry[]>([]);
  projects = signal<Project[]>([]);
  asanaConnected = signal(false);
  loading = signal(true);
  importing = signal(false);
  error = signal<string | null>(null);
  saving = signal(false);

  selectedDay = signal(new Date());
  private loadedWeekKey = signal(dateKey(startOfWeek(new Date())));

  readonly weekStart = computed(() => startOfWeek(this.selectedDay()));
  readonly days = computed(() => weekDays(this.weekStart()));
  readonly isSelectedToday = computed(() => isToday(this.selectedDay()));
  readonly dayHeading = computed(() => formatDayHeading(this.selectedDay()));

  readonly runningEntry = computed(() => {
    this.tick();
    return this.entries().find((e) => !e.stoppedAt) ?? null;
  });

  readonly runningElapsedMin = computed(() => {
    const running = this.runningEntry();
    if (!running) return 0;
    const ms = Date.now() - new Date(running.startedAt).getTime();
    return Math.round(ms / 60_000);
  });

  readonly dayEntries = computed(() => {
    const key = dateKey(this.selectedDay());
    const running = this.runningEntry();
    return this.entries()
      .filter((e) => {
        if (dateKey(new Date(e.startedAt)) !== key) return false;
        if (!e.stoppedAt && running && e.id !== running.id) return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      );
  });

  readonly dayTotalMin = computed(() => {
    const running = this.runningEntry();
    const key = dateKey(this.selectedDay());
    let total = 0;
    for (const e of this.entries()) {
      if (dateKey(new Date(e.startedAt)) !== key) continue;
      if (!e.stoppedAt) {
        if (e.id === running?.id) total += this.runningElapsedMin();
      } else {
        total += e.durationMin ?? 0;
      }
    }
    return total;
  });

  readonly weekTotalMin = computed(() => {
    const running = this.runningEntry();
    const weekKeys = new Set(this.days().map((d) => dateKey(d)));
    let total = 0;
    for (const e of this.entries()) {
      const key = dateKey(new Date(e.startedAt));
      if (!weekKeys.has(key)) continue;
      if (!e.stoppedAt) {
        if (e.id === running?.id) {
          total += this.runningElapsedMin();
        }
      } else {
        total += e.durationMin ?? 0;
      }
    }
    return total;
  });

  ngOnInit() {
    this.timerInterval = setInterval(() => this.tick.update((n) => n + 1), 1000);
    void this.init();
  }

  ngOnDestroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  private async init() {
    await Promise.all([this.loadProjects(), this.loadAsanaStatus()]);
    await this.loadWeek();
  }

  async loadAsanaStatus() {
    try {
      const status = await this.api.get<{ connected: boolean }>('/asana/status');
      this.asanaConnected.set(status.connected);
    } catch {
      this.asanaConnected.set(false);
    }
  }

  async loadProjects() {
    try {
      const data = await this.api.get<Project[]>('/projects');
      this.projects.set(data);
    } catch {
      /* ignore */
    }
  }

  async loadWeek() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const from = this.weekStart().toISOString();
      const to = endOfWeek(this.weekStart()).toISOString();
      let data = await this.api.get<TimeEntry[]>(
        `/time-entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (!data.some((e) => !e.stoppedAt)) {
        const all = await this.api.get<TimeEntry[]>('/time-entries');
        const active = all.find((e) => !e.stoppedAt);
        if (active && !data.some((e) => e.id === active.id)) {
          data = [active, ...data];
        }
      }
      this.entries.set(data);
      this.loadedWeekKey.set(dateKey(startOfWeek(this.selectedDay())));
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Failed to load timesheet',
      );
    } finally {
      this.loading.set(false);
    }
  }

  prevDay() {
    this.selectedDay.set(addDays(this.selectedDay(), -1));
    void this.loadWeekIfNeeded();
  }

  nextDay() {
    this.selectedDay.set(addDays(this.selectedDay(), 1));
    void this.loadWeekIfNeeded();
  }

  goToToday() {
    this.selectedDay.set(new Date());
    void this.loadWeek();
  }

  selectDay(d: Date) {
    this.selectedDay.set(new Date(d));
    void this.loadWeekIfNeeded();
  }

  jumpToDay(date: Date, popover: Popover) {
    this.selectedDay.set(new Date(date));
    popover.hide();
    void this.loadWeekIfNeeded();
  }

  private async loadWeekIfNeeded() {
    const key = dateKey(startOfWeek(this.selectedDay()));
    if (key !== this.loadedWeekKey()) {
      await this.loadWeek();
    }
  }

  isDaySelected(d: Date): boolean {
    return isSameDay(d, this.selectedDay());
  }

  isDayToday(d: Date): boolean {
    return isToday(d);
  }

  isDayRunning(d: Date): boolean {
    const running = this.runningEntry();
    if (!running) return false;
    return dateKey(d) === dateKey(new Date(running.startedAt));
  }

  dayKey(d: Date): string {
    return dateKey(d);
  }

  dayShortLabel(d: Date): string {
    return dayLabel(d).short;
  }

  dayTotalFor(d: Date): number {
    const key = dateKey(d);
    const running = this.runningEntry();
    let total = 0;
    for (const e of this.entries()) {
      if (dateKey(new Date(e.startedAt)) !== key) continue;
      if (!e.stoppedAt) {
        if (e.id === running?.id) total += this.runningElapsedMin();
      } else {
        total += e.durationMin ?? 0;
      }
    }
    return total;
  }

  entryDurationLabel(entry: TimeEntry): string {
    if (!entry.stoppedAt) {
      const ms = Date.now() - new Date(entry.startedAt).getTime();
      const min = Math.max(0, Math.round(ms / 60_000));
      return formatDurationMin(min);
    }
    return formatDurationMin(entry.durationMin ?? 0);
  }

  projectTitle(entry: TimeEntry): string {
    return `${entry.project.name} (${entry.project.client.name})`;
  }

  async openTrackTimeModal() {
    const result = await this.modal().open({
      day: this.selectedDay(),
      projects: this.projects(),
      asanaConnected: this.asanaConnected(),
    });
    if (result !== 'cancelled') await this.loadWeek();
  }

  triggerCsvPicker() {
    this.csvFileInput?.nativeElement.click();
  }

  async onCsvSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.importing.set(true);
    this.error.set(null);
    try {
      const fileBase64 = await this.fileToBase64(file);
      const result = await this.api.post<{ imported: number; total: number }>(
        '/time-entries/import',
        { fileBase64 },
      );
      this.toast.add({
        severity: 'success',
        summary: 'Import complete',
        detail: `Imported ${result.imported} time entr${result.imported === 1 ? 'y' : 'ies'}.`,
        life: 6000,
      });
      await this.loadWeek();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Import failed');
    } finally {
      this.importing.set(false);
      input.value = '';
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.includes(',') ? result.split(',')[1]! : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  async openEditModal(entry: TimeEntry) {
    const result = await this.modal().open({
      day: this.selectedDay(),
      projects: this.projects(),
      asanaConnected: this.asanaConnected(),
      entry,
    });
    if (result !== 'cancelled') await this.loadWeek();
  }

  async startFromEntry(entry: TimeEntry) {
    if (this.runningEntry()) {
      this.error.set('Stop the current timer first.');
      return;
    }
    if (!entry.stoppedAt) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const updated = await this.api.post<TimeEntry>(
        `/time-entries/${entry.id}/restart`,
        {},
      );
      this.entries.update((list) =>
        list.map((e) => (e.id === updated.id ? updated : e)),
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to start timer');
      await this.loadWeek();
    } finally {
      this.saving.set(false);
    }
  }

  async stopTimer() {
    const running = this.runningEntry();
    if (!running) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.post(`/time-entries/${running.id}/stop`);
      await this.loadWeek();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to stop timer');
    } finally {
      this.saving.set(false);
    }
  }

  formatMin(min: number): string {
    return formatDurationMin(min);
  }
}

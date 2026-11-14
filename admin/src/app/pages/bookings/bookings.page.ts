import { ButtonModule } from 'primeng/button';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { SelectModule } from 'primeng/select';
import { TabsModule } from 'primeng/tabs';
import { ApiService } from '../../core/api.service';
import { LIST_VIEW_KEYS, listViewFilterString, readListViewPrefs } from '../../core/list-view-prefs.storage';
import { saveListFilter } from '../../core/list-view-prefs.util';
import { SessionService } from '../../core/session.service';
import { PageComponent } from '../../ui/layout/page.component';
import { BookingTypesListPanelComponent } from './booking-types-list-panel.component';
import { BookingsListPanelComponent } from './bookings-list-panel.component';

type BookingsTab = 'bookings' | 'types';
type BookingTypeOption = { id: string; name: string; slug: string };

@Component({
  selector: 'app-bookings-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    SelectModule,
    TabsModule,
    PageComponent,
    BookingsListPanelComponent,
    BookingTypesListPanelComponent,
  ],
  templateUrl: './bookings.page.html',
  styles: `
    :host ::ng-deep .bookings-tabs .p-tablist {
      display: flex;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 0.25rem 0.5rem;
    }
    :host ::ng-deep .bookings-tabs .p-tablist .bookings-tablist-filter {
      margin-left: auto;
      margin-bottom: 0.35rem;
      min-width: 14rem;
      max-width: 18rem;
      flex: 0 1 14rem;
    }
    :host ::ng-deep .bookings-tabs .p-tablist .bookings-tablist-filter .p-select {
      width: 100%;
    }
  `,
})
export class BookingsPage implements OnInit {
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);

  activeTab = signal<BookingsTab>('bookings');
  types = signal<BookingTypeOption[]>([]);
  filterTypeId = signal('');

  /** Booking types are setup: shown to anyone whose role has Bookings > Setup. */
  isAdmin = computed(() => !!this.session.me() && this.session.can('bookings', 'setup'));

  ngOnInit() {
    const prefs = readListViewPrefs(this.session.me()?.id, LIST_VIEW_KEYS.bookings);
    const typeId = listViewFilterString(prefs, 'bookingTypeId');
    if (typeId) this.filterTypeId.set(typeId);
    void this.loadTypes();
    this.syncTabFromUrl(this.router.url);
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e) => this.syncTabFromUrl(e.urlAfterRedirects));
  }

  onFilterTypeChange(typeId: string | null) {
    const id = typeId ?? '';
    this.filterTypeId.set(id);
    saveListFilter(this.session, LIST_VIEW_KEYS.bookings, 'bookingTypeId', id || null);
  }

  private async loadTypes() {
    try {
      const data = await this.api.get<BookingTypeOption[]>('/booking/admin/types');
      this.types.set(data.map((t) => ({ id: t.id, name: t.name, slug: t.slug })));
    } catch {
      this.types.set([]);
    }
  }

  onTabChange(value: string | number | undefined) {
    const tab = value === 'types' ? 'types' : 'bookings';
    if (tab === 'types' && !this.isAdmin()) {
      void this.router.navigate(['/bookings']);
      return;
    }
    this.activeTab.set(tab);
    void this.router.navigate(tab === 'types' ? ['/bookings/types'] : ['/bookings']);
  }

  private syncTabFromUrl(url: string) {
    if (url.startsWith('/bookings/types') && !url.startsWith('/bookings/types/new') && !this.isTypeFormUrl(url)) {
      if (this.isAdmin()) {
        this.activeTab.set('types');
      } else {
        void this.router.navigate(['/bookings'], { replaceUrl: true });
      }
      return;
    }
    this.activeTab.set('bookings');
  }

  private isTypeFormUrl(url: string): boolean {
    const match = url.match(/^\/bookings\/types\/([^/?#]+)/);
    if (!match) return false;
    return match[1] !== 'new';
  }
}

import { ButtonModule } from 'primeng/button';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { TabsModule } from 'primeng/tabs';
import { SessionService } from '../../core/session.service';
import { PageComponent } from '../../ui/layout/page.component';
import { BookingTypesListPanelComponent } from './booking-types-list-panel.component';
import { BookingsListPanelComponent } from './bookings-list-panel.component';

type BookingsTab = 'bookings' | 'types';

@Component({
  selector: 'app-bookings-page',
  standalone: true,
  imports: [
    RouterLink,
    ButtonModule,
    TabsModule,
    PageComponent,
    BookingsListPanelComponent,
    BookingTypesListPanelComponent,
  ],
  templateUrl: './bookings.page.html',
})
export class BookingsPage implements OnInit {
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);

  activeTab = signal<BookingsTab>('bookings');

  /** Booking types are setup: shown to anyone whose role has Bookings > Setup. */
  isAdmin = computed(() => !!this.session.me() && this.session.can('bookings', 'setup'));

  ngOnInit() {
    this.syncTabFromUrl(this.router.url);
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e) => this.syncTabFromUrl(e.urlAfterRedirects));
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

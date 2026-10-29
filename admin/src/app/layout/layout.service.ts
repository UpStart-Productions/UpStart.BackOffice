import { computed, Injectable, signal } from '@angular/core';
import { readNavPrefs, writeNavPrefs } from './nav-prefs.storage';

export interface LayoutState {
  staticMenuDesktopInactive: boolean;
  overlayMenuActive: boolean;
  mobileMenuActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly menuMode: 'static' | 'overlay' = 'static';

  private readonly prefsUserId = signal<string | null>(null);

  layoutState = signal<LayoutState>({
    staticMenuDesktopInactive: false,
    overlayMenuActive: false,
    mobileMenuActive: false,
  });

  /** Icon rail on non–Task Manager routes. */
  readonly navCompact = signal(false);

  /** Full main nav on Task Manager routes (default rail). */
  readonly tasksNavExpanded = signal(false);

  /** Collapsed nav section labels (CRM, Office, …). */
  readonly collapsedNavSections = signal<Set<string>>(new Set());

  readonly sidebarHidden = computed(() => this.layoutState().staticMenuDesktopInactive);

  isOverlay = computed(() => this.menuMode === 'overlay');

  /** Call when session user is known so prefs load from localStorage. */
  setPrefsUserId(userId: string | null): void {
    if (this.prefsUserId() === userId) return;
    this.prefsUserId.set(userId);
    this.applyStoredPrefs();
  }

  private applyStoredPrefs(): void {
    const prefs = readNavPrefs(this.prefsUserId());
    this.navCompact.set(!!prefs.compact);
    this.tasksNavExpanded.set(!!prefs.tasksNavExpanded);
    this.collapsedNavSections.set(new Set(prefs.collapsedSections ?? []));
    this.layoutState.update((prev) => ({
      ...prev,
      staticMenuDesktopInactive: !!prefs.hidden,
    }));
  }

  isNavSectionCollapsed(sectionLabel: string): boolean {
    return this.collapsedNavSections().has(sectionLabel);
  }

  toggleNavSection(sectionLabel: string): void {
    const next = new Set(this.collapsedNavSections());
    if (next.has(sectionLabel)) next.delete(sectionLabel);
    else next.add(sectionLabel);
    this.collapsedNavSections.set(next);
    writeNavPrefs(this.prefsUserId(), { collapsedSections: [...next] });
  }

  private persistLayoutPrefs(): void {
    writeNavPrefs(this.prefsUserId(), {
      hidden: this.layoutState().staticMenuDesktopInactive,
      compact: this.navCompact(),
    });
  }

  onMenuToggle(): void {
    if (this.isDesktop()) {
      this.layoutState.update((prev) => ({
        ...prev,
        staticMenuDesktopInactive: !prev.staticMenuDesktopInactive,
      }));
      this.persistLayoutPrefs();
    } else {
      this.layoutState.update((prev) => ({
        ...prev,
        mobileMenuActive: !prev.mobileMenuActive,
      }));
    }
  }

  setNavCompact(compact: boolean): void {
    this.navCompact.set(compact);
    writeNavPrefs(this.prefsUserId(), { compact });
  }

  toggleNavCompact(): void {
    this.setNavCompact(!this.navCompact());
  }

  setTasksNavExpanded(expanded: boolean): void {
    this.tasksNavExpanded.set(expanded);
    writeNavPrefs(this.prefsUserId(), { tasksNavExpanded: expanded });
  }

  toggleTasksNavExpanded(): void {
    this.setTasksNavExpanded(!this.tasksNavExpanded());
  }

  closeMobileMenu(): void {
    this.layoutState.update((prev) => ({
      ...prev,
      mobileMenuActive: false,
      overlayMenuActive: false,
    }));
  }

  isDesktop(): boolean {
    return window.innerWidth > 991;
  }
}

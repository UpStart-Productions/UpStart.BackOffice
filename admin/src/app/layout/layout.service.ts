import { computed, Injectable, signal } from '@angular/core';

export interface LayoutState {
  staticMenuDesktopInactive: boolean;
  overlayMenuActive: boolean;
  mobileMenuActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly menuMode: 'static' | 'overlay' = 'static';

  layoutState = signal<LayoutState>({
    staticMenuDesktopInactive: false,
    overlayMenuActive: false,
    mobileMenuActive: false,
  });

  isOverlay = computed(() => this.menuMode === 'overlay');

  onMenuToggle(): void {
    if (this.isDesktop()) {
      this.layoutState.update((prev) => ({
        ...prev,
        staticMenuDesktopInactive: !prev.staticMenuDesktopInactive,
      }));
    } else {
      this.layoutState.update((prev) => ({
        ...prev,
        mobileMenuActive: !prev.mobileMenuActive,
      }));
    }
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

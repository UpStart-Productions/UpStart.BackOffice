import { Component, inject, input, viewChild } from '@angular/core';
import { Popover } from 'primeng/popover';
import type { AttributionUserDto, RecordAttributionDto } from '@upstart/back-office/shared';
import { AppPopoverModule } from '../../core/app-popover.module';
import { formatAttributionWhen } from '../../core/relative-time-format';
import { SessionService } from '../../core/session.service';
import { resolveAssetUrl } from '../../core/asset-url.util';

@Component({
  selector: 'app-record-attribution',
  standalone: true,
  imports: [AppPopoverModule],
  template: `
    @if (show()) {
      <button
        type="button"
        class="record-attribution-pill"
        aria-haspopup="true"
        [attr.aria-label]="pillAriaLabel()"
        (mouseenter)="openDetails($event)"
        (mouseleave)="scheduleHideDetails()"
        (focus)="openDetails($event)"
        (blur)="scheduleHideDetails()"
      >
        <i class="pi pi-clock record-attribution-pill__icon" aria-hidden="true"></i>
        @if (avatarUsers().length > 0) {
          <span class="record-attribution-avatars" aria-hidden="true">
            @for (user of avatarUsers(); track user.id; let i = $index) {
              @if (photoUrl(user); as src) {
                <img
                  class="record-attribution-avatar"
                  [src]="src"
                  [alt]=""
                  [style.z-index]="avatarUsers().length - i"
                  referrerpolicy="no-referrer"
                  (error)="onPhotoError(src)"
                />
              } @else {
                <span
                  class="record-attribution-avatar record-attribution-avatar--initials"
                  [style.z-index]="avatarUsers().length - i"
                >
                  <small>{{ initials(user) }}</small>
                </span>
              }
            }
          </span>
        }
      </button>
      <p-popover
        #detailPopover
        appendTo="body"
        appCenterPopoverCaret
        styleClass="ubo-attribution-popover"
        (mouseenter)="cancelHideDetails()"
        (mouseleave)="scheduleHideDetails()"
      >
        <div class="record-attribution-popover-body">
          @if (createdCopy(); as created) {
            <div class="record-attribution-popover-row">
              @if (attribution()?.createdBy; as user) {
                @if (photoUrl(user); as src) {
                  <img
                    class="record-attribution-popover-avatar"
                    [src]="src"
                    [alt]=""
                    referrerpolicy="no-referrer"
                    (error)="onPhotoError(src)"
                  />
                } @else {
                  <span class="record-attribution-popover-avatar record-attribution-popover-avatar--initials">
                    <small>{{ initials(user) }}</small>
                  </span>
                }
              }
              <p class="m-0">{{ created }}</p>
            </div>
          }
          @if (updatedCopy(); as updated) {
            <div class="record-attribution-popover-row">
              @if (attribution()?.updatedBy; as user) {
                @if (photoUrl(user); as src) {
                  <img
                    class="record-attribution-popover-avatar"
                    [src]="src"
                    [alt]=""
                    referrerpolicy="no-referrer"
                    (error)="onPhotoError(src)"
                  />
                } @else {
                  <span class="record-attribution-popover-avatar record-attribution-popover-avatar--initials">
                    <small>{{ initials(user) }}</small>
                  </span>
                }
              }
              <p class="m-0">{{ updated }}</p>
            </div>
          }
        </div>
      </p-popover>
    }
  `,
})
export class RecordAttributionComponent {
  attribution = input<RecordAttributionDto | null | undefined>(null);
  private readonly session = inject(SessionService);
  private readonly detailPopover = viewChild<Popover>('detailPopover');
  private readonly failedPhotos = new Set<string>();
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  show(): boolean {
    const a = this.attribution();
    return !!(a && (a.createdBy || a.updatedBy || a.createdAt || a.updatedAt));
  }

  avatarUsers(): AttributionUserDto[] {
    const a = this.attribution();
    if (!a) return [];
    const users: AttributionUserDto[] = [];
    const add = (user: AttributionUserDto | null | undefined) => {
      if (!user?.id) return;
      if (!users.some((u) => u.id === user.id)) users.push(user);
    };
    add(a.createdBy);
    if (wasEdited(a)) add(a.updatedBy);
    return users;
  }

  pillAriaLabel(): string {
    return [this.createdCopy(), this.updatedCopy()].filter(Boolean).join('. ') || 'Record history';
  }

  createdCopy(): string | null {
    const a = this.attribution();
    if (!a) return null;
    const who = personLabel(a.createdBy);
    const when = formatAttributionWhen(a.createdAt);
    if (!who && !when) return null;
    if (who && when) return `Created ${when} by ${who}`;
    if (who) return `Created by ${who}`;
    if (when) return `Created ${when}`;
    return null;
  }

  updatedCopy(): string | null {
    const a = this.attribution();
    if (!a || !wasEdited(a)) return null;
    const who = personLabel(a.updatedBy);
    const when = formatAttributionWhen(a.updatedAt);
    if (!who && !when) return null;
    if (who && when) return `Last saved ${when} by ${who}`;
    if (who) return `Last saved by ${who}`;
    return `Last saved ${when}`;
  }

  initials(user: AttributionUserDto): string {
    const label = personLabel(user) ?? '';
    const parts = label.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (label[0] ?? '?').toUpperCase();
  }

  photoUrl(user: AttributionUserDto): string | null {
    const fromRecord = resolveAssetUrl(user.avatarUrl);
    if (fromRecord && !this.failedPhotos.has(fromRecord)) return fromRecord;
    const me = this.session.me();
    const fromSession = me && me.id === user.id ? resolveAssetUrl(me.avatarUrl ?? null) : null;
    if (fromSession && !this.failedPhotos.has(fromSession)) return fromSession;
    return null;
  }

  onPhotoError(url: string): void {
    this.failedPhotos.add(url);
  }

  openDetails(event: Event): void {
    this.cancelHideDetails();
    const trigger = event.currentTarget;
    if (trigger instanceof HTMLElement) {
      this.detailPopover()?.show(event, trigger);
      return;
    }
    this.detailPopover()?.show(event);
  }

  scheduleHideDetails(): void {
    this.cancelHideDetails();
    this.hideTimer = setTimeout(() => this.detailPopover()?.hide(), 120);
  }

  cancelHideDetails(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}

function personLabel(user: AttributionUserDto | null | undefined): string | null {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.name || user.email || null;
}

function wasEdited(a: RecordAttributionDto): boolean {
  if (a.createdAt && a.updatedAt) {
    return new Date(a.updatedAt).getTime() - new Date(a.createdAt).getTime() > 2000;
  }
  return !!(a.updatedBy && a.createdBy?.id && a.createdBy.id !== a.updatedBy.id);
}

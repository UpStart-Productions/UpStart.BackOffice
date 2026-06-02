import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthStoreService } from '../core/auth-store.service';
import { CognitoAuthService } from '../core/cognito-auth.service';
import { ApiService } from '../core/api.service';

type Me = { firstName?: string; lastName?: string; email: string; workspaces: { slug: string; name: string }[] };

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  private readonly auth = inject(AuthStoreService);
  private readonly cognito = inject(CognitoAuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  me = signal<Me | null>(null);
  workspaceSlug = signal('');

  navItems = [
    { label: 'Time Entry', icon: 'pi-clock', route: '/time-entry' },
    { label: 'Invoices', icon: 'pi-file-invoice', route: '/invoices' },
    { label: 'Clients', icon: 'pi-users', route: '/clients' },
    { label: 'Projects', icon: 'pi-briefcase', route: '/projects' },
  ];

  async ngOnInit() {
    this.workspaceSlug.set(this.auth.workspaceSlug);
    try {
      const me = await this.api.get<Me>('/users/me');
      this.me.set(me);
      if (!this.auth.workspaceSlug && me.workspaces.length > 0) {
        this.auth.workspaceSlug = me.workspaces[0].slug;
        this.workspaceSlug.set(me.workspaces[0].slug);
      }
    } catch { /* ignore */ }
  }

  get displayName(): string {
    const m = this.me();
    if (!m) return '';
    if (m.firstName || m.lastName) return `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();
    return m.email;
  }

  async signOut() {
    this.auth.clear();
    if (this.cognito.useCognito) await this.cognito.signOut();
    else this.router.navigate(['/login']);
  }
}

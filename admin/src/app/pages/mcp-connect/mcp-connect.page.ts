import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { AuthStoreService } from '../../core/auth-store.service';
import { CognitoAuthService } from '../../core/cognito-auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-mcp-connect-page',
  standalone: true,
  imports: [ButtonModule, MessageModule],
  templateUrl: './mcp-connect.page.html',
  styleUrl: './mcp-connect.page.scss',
})
export class McpConnectPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthStoreService);
  private readonly cognito = inject(CognitoAuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  clientName = 'Claude';
  email = '';
  state = '';
  error = '';
  loading = false;

  ngOnInit() {
    const state = this.route.snapshot.queryParamMap.get('state')?.trim() ?? '';
    const client = this.route.snapshot.queryParamMap.get('client')?.trim() ?? '';
    this.state = state;
    this.clientName = sanitizeClientName(client);
    if (!state) {
      this.error = 'This connect link is invalid or expired. Close this window and try again from Claude.';
    }
    void this.loadEmail();
  }

  async allow() {
    if (!this.state || this.loading) return;
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();
    try {
      const idToken = this.cognito.useCognito ? await this.cognito.getIdToken() : null;
      if (!idToken) {
        this.error = 'Could not read your Back Office session. Sign in again and retry.';
        return;
      }
      postToMcp({
        state: this.state,
        id_token: idToken,
        refresh_token: this.cognito.getRefreshToken(),
      });
    } catch {
      this.error = 'Could not connect. Close this window and try again from Claude.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  cancel() {
    if (!this.state) {
      window.close();
      return;
    }
    const url = new URL('/oauth/ubo/complete', environment.mcpPublicUrl);
    url.searchParams.set('state', this.state);
    url.searchParams.set('error', 'access_denied');
    url.searchParams.set('error_description', 'The user cancelled');
    window.location.assign(url.toString());
  }

  private async loadEmail() {
    this.email =
      (this.cognito.useCognito ? await this.cognito.getEmailFromSession() : null) ||
      this.auth.baseEmail ||
      '';
    this.cdr.detectChanges();
  }
}

function sanitizeClientName(raw: string): string {
  const cleaned = raw.replace(/[^\w\s.&+-]/g, '').trim().slice(0, 40);
  return cleaned || 'Claude';
}

function postToMcp(fields: { state: string; id_token: string; refresh_token?: string }): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = new URL('/oauth/ubo/complete', environment.mcpPublicUrl).toString();
  form.style.display = 'none';
  for (const [name, value] of Object.entries(fields)) {
    if (!value) continue;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

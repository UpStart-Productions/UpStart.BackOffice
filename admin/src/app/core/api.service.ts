import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStoreService } from './auth-store.service';
import { CognitoAuthService } from './cognito-auth.service';
import { environment } from '../../environments/environment';

const FRIENDLY: Record<number, string> = {
  401: 'Not authorized. Please log in again.',
  403: 'You do not have access to this resource.',
  404: 'Not found.',
  409: 'A record with this information already exists.',
};

function extractMessage(status: number, bodyText: string): string {
  try {
    const body = JSON.parse(bodyText) as { message?: string };
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
  } catch { /* ignore */ }
  return FRIENDLY[status] ?? 'Request failed';
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly auth = inject(AuthStoreService);
  private readonly cognito = inject(CognitoAuthService);
  private readonly router = inject(Router);
  private readonly base = environment.apiBaseUrl;
  private signingOut = false;

  resetSigningOut() { this.signingOut = false; }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (this.signingOut) return new Promise<T>(() => {});

    const options: RequestInit = { method };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }
    const finalOptions = await this.auth.getHeaders(options);
    if (body !== undefined) {
      (finalOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${this.base}${path}`, finalOptions);
    const text = await res.text();

    if (!res.ok) {
      if (res.status === 401 && !this.signingOut) {
        this.signingOut = true;
        this.auth.clear();
        sessionStorage.setItem('ubo_auth_error', 'Session expired. Please sign in again.');
        this.router.navigate(['/login']);
        if (this.cognito.useCognito) this.cognito.signOut().catch(() => {});
        return new Promise<T>(() => {});
      }
      throw new Error(`API error ${res.status}: ${extractMessage(res.status, text)}`);
    }

    if (!text) return undefined as T;
    try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
  }

  get<T>(path: string): Promise<T> { return this.request<T>('GET', path); }
  post<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('POST', path, body); }
  put<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('PUT', path, body); }
  patch<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('PATCH', path, body); }
  delete<T>(path: string): Promise<T> { return this.request<T>('DELETE', path); }

  /** Multipart upload; do not set Content-Type so the browser sets the boundary. */
  async uploadFile<T>(path: string, file: File, fieldName = 'file'): Promise<T> {
    if (this.signingOut) return new Promise<T>(() => {});

    const formData = new FormData();
    formData.append(fieldName, file);
    const options = await this.auth.getHeaders({ method: 'POST', body: formData });
    const headers = options.headers as Record<string, string>;
    delete headers['Content-Type'];

    const res = await fetch(`${this.base}${path}`, options);
    const text = await res.text();

    if (!res.ok) {
      if (res.status === 401 && !this.signingOut) {
        this.signingOut = true;
        this.auth.clear();
        sessionStorage.setItem('ubo_auth_error', 'Session expired. Please sign in again.');
        this.router.navigate(['/login']);
        if (this.cognito.useCognito) this.cognito.signOut().catch(() => {});
        return new Promise<T>(() => {});
      }
      throw new Error(`API error ${res.status}: ${extractMessage(res.status, text)}`);
    }

    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  async downloadPdf(path: string, filename: string): Promise<void> {
    const options = await this.auth.getHeaders({ method: 'GET' });
    const res = await fetch(`${this.base}${path}`, options);
    if (!res.ok) throw new Error(`PDF download failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}

import { inject, Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStoreService } from './auth-store.service';
import { CognitoAuthService } from './cognito-auth.service';
import { SessionService } from './session.service';
import { environment } from '../../environments/environment';

const FRIENDLY: Record<number, string> = {
  401: 'Not authorized. Please log in again.',
  403: 'You do not have access to this resource.',
  404: 'Not found.',
  409: 'A record with this information already exists.',
};

const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';

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
  private readonly injector = inject(Injector);
  private readonly base = environment.apiBaseUrl;
  private redirectToLoginPromise: Promise<void> | null = null;

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retriedAfterRefresh = false,
  ): Promise<T> {
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
      if (res.status === 401) {
        if (!retriedAfterRefresh && this.cognito.useCognito) {
          const refreshed = await this.cognito.refreshSession();
          if (refreshed) {
            return this.request<T>(method, path, body, true);
          }
        }
        await this.redirectToLoginOnAuthFailure();
      }
      throw new Error(`API error ${res.status}: ${extractMessage(res.status, text)}`);
    }

    if (!text) return undefined as T;
    try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
  }

  /**
   * Clears the local session and navigates to login when auth has expired mid-session.
   * Skipped on the login page so sign-in / provisioning errors can surface normally.
   */
  private async redirectToLoginOnAuthFailure(): Promise<void> {
    if (this.router.url.startsWith('/login')) return;

    if (!this.redirectToLoginPromise) {
      this.redirectToLoginPromise = (async () => {
        this.auth.clear();
        this.injector.get(SessionService).reset();
        if (this.cognito.useCognito) await this.cognito.clearLocalSession();
        sessionStorage.setItem('ubo_auth_error', SESSION_EXPIRED_MESSAGE);
        await this.router.navigate(['/login']);
      })().finally(() => {
        this.redirectToLoginPromise = null;
      });
    }

    await this.redirectToLoginPromise;
  }

  get<T>(path: string): Promise<T> { return this.request<T>('GET', path); }
  post<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('POST', path, body); }
  put<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('PUT', path, body); }
  patch<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('PATCH', path, body); }
  delete<T>(path: string): Promise<T> { return this.request<T>('DELETE', path); }

  /** JSON base64 avatar upload (avoids multipart issues with CloudFront/WAF). */
  async uploadAvatar<T>(path: string, file: File): Promise<T> {
    const fileBase64 = await this.fileToBase64(file);
    return this.post<T>(path, { fileBase64, mimeType: file.type });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1]! : result;
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /** Multipart upload; do not set Content-Type so the browser sets the boundary. */
  async uploadFile<T>(
    path: string,
    file: File,
    fieldName = 'file',
    retriedAfterRefresh = false,
  ): Promise<T> {
    const formData = new FormData();
    formData.append(fieldName, file);
    const options = await this.auth.getHeaders({ method: 'POST', body: formData });
    const headers = options.headers as Record<string, string>;
    delete headers['Content-Type'];

    const res = await fetch(`${this.base}${path}`, options);
    const text = await res.text();

    if (!res.ok) {
      if (res.status === 401) {
        if (!retriedAfterRefresh && this.cognito.useCognito) {
          const refreshed = await this.cognito.refreshSession();
          if (refreshed) {
            return this.uploadFile<T>(path, file, fieldName, true);
          }
        }
        await this.redirectToLoginOnAuthFailure();
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

  async fetchPdfBlob(path: string, retriedAfterRefresh = false): Promise<Blob> {
    const options = await this.auth.getHeaders({ method: 'GET' });
    const res = await fetch(`${this.base}${path}`, options);
    if (!res.ok) {
      if (res.status === 401) {
        if (!retriedAfterRefresh && this.cognito.useCognito) {
          const refreshed = await this.cognito.refreshSession();
          if (refreshed) {
            return this.fetchPdfBlob(path, true);
          }
        }
        await this.redirectToLoginOnAuthFailure();
      }
      throw new Error(`PDF load failed: ${res.status}`);
    }
    return res.blob();
  }

  async downloadPdf(path: string, filename: string): Promise<void> {
    const blob = await this.fetchPdfBlob(path);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

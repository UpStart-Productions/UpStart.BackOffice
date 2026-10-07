import { environment } from '../../../environments/environment';
import { FormAccess } from '../core/tm.types';

/** Shareable page for open / collaborator forms. */
export function formPageUrl(slug: string): string {
  return `${location.origin}/f/${slug}`;
}

/** API endpoint for API-key (and open) forms. */
export function formApiUrl(slug: string): string {
  const base = new URL(environment.apiBaseUrl, location.origin).toString().replace(/\/$/, '');
  return `${base}/forms/${slug}/submit`;
}

export const ACCESS_OPTIONS: { value: FormAccess; label: string; hint: string; icon: string }[] = [
  { value: 'COLLABORATORS', label: 'Project collaborators', hint: 'Signed-in people on this project', icon: 'pi-users' },
  { value: 'OPEN', label: 'Anyone with the link', hint: 'No sign-in; email required', icon: 'pi-globe' },
  { value: 'API_KEY', label: 'API key', hint: 'Apps and servers post with a secret key', icon: 'pi-key' },
];

export function accessLabel(access: FormAccess): string {
  return ACCESS_OPTIONS.find((o) => o.value === access)?.label ?? access;
}

export function accessIcon(access: FormAccess): string {
  return ACCESS_OPTIONS.find((o) => o.value === access)?.icon ?? 'pi-file';
}

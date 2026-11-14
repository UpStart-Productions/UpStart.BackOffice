import { normalizeAppLinkPath } from './simple-markdown.pipe';

export type AppRecordRef =
  | { kind: 'task'; projectId: string; taskId: string }
  | { kind: 'tmProject'; projectId: string }
  | { kind: 'crmProject'; projectId: string }
  | { kind: 'client'; clientId: string }
  | { kind: 'invoice'; invoiceId: string }
  | { kind: 'contact'; contactId: string };

function parseRoute(raw: string): { pathname: string; search: string } | null {
  const cleaned = raw.trim().replace(/&amp;/g, '&');
  if (!cleaned) return null;

  let route: string;
  try {
    const url = new URL(cleaned, window.location.origin);
    route = `${url.pathname}${url.search}`;
  } catch {
    route = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  }

  const normalized = normalizeAppLinkPath(route.split('#')[0]);
  try {
    const parsed = new URL(normalized, window.location.origin);
    return { pathname: parsed.pathname, search: parsed.search };
  } catch {
    return null;
  }
}

/** Parse Back Office record URLs (absolute or path-only). */
export function parseAppRecordDeepLink(raw: string): AppRecordRef | null {
  const route = parseRoute(raw);
  if (!route) return null;
  const { pathname, search } = route;

  const taskFromQuery = new URLSearchParams(search).get('task')?.trim();
  const tmProject = pathname.match(/^\/tasks\/projects\/([^/]+)(?:\/board)?$/);
  if (tmProject && taskFromQuery) {
    return { kind: 'task', projectId: tmProject[1], taskId: taskFromQuery };
  }

  const nestedTask = pathname.match(/^\/tasks\/projects\/([^/]+)(?:\/board)?\/tasks\/([^/]+)$/);
  if (nestedTask) {
    return { kind: 'task', projectId: nestedTask[1], taskId: nestedTask[2] };
  }

  if (tmProject) {
    return { kind: 'tmProject', projectId: tmProject[1] };
  }

  const crmProject = pathname.match(/^\/projects\/([^/]+)$/);
  if (crmProject && crmProject[1] !== 'new') {
    return { kind: 'crmProject', projectId: crmProject[1] };
  }

  const client =
    pathname.match(/^\/(?:accounts|clients|organizations|network)\/([^/]+)$/) ??
    null;
  if (client && client[1] !== 'new') {
    return { kind: 'client', clientId: client[1] };
  }

  const invoice = pathname.match(/^\/invoices\/([^/]+)(?:\/edit)?$/);
  if (invoice && invoice[1] !== 'new') {
    return { kind: 'invoice', invoiceId: invoice[1] };
  }

  const person = pathname.match(/^\/(?:people|contacts)\/([^/]+)$/);
  if (person && person[1] !== 'new') {
    return { kind: 'contact', contactId: person[1] };
  }

  return null;
}

export function recordDisplayPath(ref: AppRecordRef): string {
  switch (ref.kind) {
    case 'task':
      return `/tasks/projects/${ref.projectId}?task=${ref.taskId}`;
    case 'tmProject':
      return `/tasks/projects/${ref.projectId}`;
    case 'crmProject':
      return `/projects/${ref.projectId}`;
    case 'client':
      return `/accounts/${ref.clientId}`;
    case 'invoice':
      return `/invoices/${ref.invoiceId}`;
    case 'contact':
      return `/people/${ref.contactId}`;
  }
}

export function placeholderRecordTitle(ref: AppRecordRef): string {
  switch (ref.kind) {
    case 'task':
      return 'Task';
    case 'tmProject':
    case 'crmProject':
      return 'Project';
    case 'client':
      return 'Account';
    case 'invoice':
      return 'Invoice';
    case 'contact':
      return 'Person';
  }
}

/** True when anchor text is just the URL (or empty) — not a human title. */
export function anchorTextLooksLikeUrl(text: string, href: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (href && (t === href.trim() || href.includes(t) || t.includes('/tasks/') || t.includes('/clients/') || t.includes('/accounts/'))) {
    return true;
  }
  return false;
}

import { BadGatewayException } from '@nestjs/common';

const ASANA_API_BASE = 'https://app.asana.com/api/1.0';
const ASANA_TOKEN_URL = 'https://app.asana.com/-/oauth_token';

export type AsanaResource = { gid: string; name: string };

export type AsanaOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type AsanaListResponse<T> = { data: T[] };
type AsanaItemResponse<T> = { data: T };

type AsanaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  data?: {
    gid: string;
    name: string;
    email?: string;
    workspaces?: AsanaResource[];
  };
};

type AsanaTask = {
  gid: string;
  name: string;
  completed: boolean;
};

type AsanaTaskMembership = {
  project?: { gid: string };
  section?: { gid: string; name: string };
};

type AsanaTaskWithMemberships = {
  memberships?: AsanaTaskMembership[];
};

type AsanaPaginatedResponse<T> = AsanaListResponse<T> & {
  next_page?: { offset: string };
};

async function parseAsanaError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { errors?: { message?: string }[] };
    const msg = body.errors?.[0]?.message;
    if (msg) return msg;
  } catch { /* ignore */ }
  return `Asana API error (${res.status})`;
}

export function defaultAsanaRedirectUri(): string {
  const apiBase = process.env.API_BASE_URL?.trim().replace(/\/$/, '');
  if (apiBase) return `${apiBase}/asana/callback`;
  const port = process.env.PORT?.trim() || '3001';
  return `http://localhost:${port}/api/asana/callback`;
}

/** Read-only scopes for listing workspaces, projects, sections, and tasks. */
export const ASANA_OAUTH_SCOPES = [
  'projects:read',
  'tasks:read',
  'users:read',
  'workspaces:read',
].join(' ');

export function buildAsanaAuthorizeUrl(config: AsanaOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state,
    scope: ASANA_OAUTH_SCOPES,
  });
  return `https://app.asana.com/-/oauth_authorize?${params.toString()}`;
}

export async function exchangeAsanaCode(
  config: AsanaOAuthConfig,
  code: string,
): Promise<AsanaTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
  });
  const res = await fetch(ASANA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new BadGatewayException(await parseAsanaError(res));
  }
  return res.json() as Promise<AsanaTokenResponse>;
}

export async function refreshAsanaToken(
  config: AsanaOAuthConfig,
  refreshToken: string,
): Promise<AsanaTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(ASANA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new BadGatewayException(await parseAsanaError(res));
  }
  return res.json() as Promise<AsanaTokenResponse>;
}

export class AsanaApiClient {
  constructor(private readonly accessToken: string) {}

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${ASANA_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      throw new BadGatewayException(await parseAsanaError(res));
    }
    return res.json() as Promise<T>;
  }

  private listItems<T extends AsanaResource>(result: AsanaListResponse<T>): T[] {
    return (result.data ?? []).filter((item): item is T => !!item?.gid);
  }

  async listWorkspaces(): Promise<AsanaResource[]> {
    const me = await this.request<AsanaItemResponse<{ workspaces: AsanaResource[] }>>(
      '/users/me?opt_fields=workspaces,workspaces.name',
    );
    return me.data.workspaces ?? [];
  }

  async listProjects(workspaceGid: string): Promise<AsanaResource[]> {
    const result = await this.request<AsanaListResponse<AsanaResource>>(
      `/workspaces/${encodeURIComponent(workspaceGid)}/projects?archived=false&opt_fields=name`,
    );
    return this.listItems(result).sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
    );
  }

  async listSections(projectGid: string): Promise<AsanaResource[]> {
    try {
      const direct = await this.fetchSectionsDirect(projectGid);
      if (direct.length > 0) return direct;
    } catch {
      // Granular OAuth may not allow GET /projects/{gid}/sections — fall back below.
    }
    try {
      const derived = await this.listSectionsFromProjectTasks(projectGid);
      if (derived.length > 0) return derived;
    } catch {
      // tasks-based discovery failed — return empty or retry direct once below.
    }
    try {
      return await this.fetchSectionsDirect(projectGid);
    } catch {
      return [];
    }
  }

  private async fetchSectionsDirect(projectGid: string): Promise<AsanaResource[]> {
    const result = await this.request<AsanaListResponse<AsanaResource>>(
      `/projects/${encodeURIComponent(projectGid)}/sections?opt_fields=name`,
    );
    return this.listItems(result).sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
    );
  }

  private async listSectionsFromProjectTasks(projectGid: string): Promise<AsanaResource[]> {
    const sections = new Map<string, string>();
    let offset: string | undefined;

    do {
      const params = new URLSearchParams({
        opt_fields: 'memberships.project.gid,memberships.section.gid,memberships.section.name',
        limit: '100',
      });
      if (offset) params.set('offset', offset);

      const result = await this.request<AsanaPaginatedResponse<AsanaTaskWithMemberships>>(
        `/projects/${encodeURIComponent(projectGid)}/tasks?${params.toString()}`,
      );

      for (const task of result.data ?? []) {
        for (const membership of task.memberships ?? []) {
          if (membership.project?.gid !== projectGid) continue;
          if (membership.section?.gid && membership.section.name) {
            sections.set(membership.section.gid, membership.section.name);
          }
        }
      }

      offset = result.next_page?.offset;
    } while (offset);

    return Array.from(sections, ([gid, name]) => ({ gid, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async listSectionTasks(sectionGid: string): Promise<AsanaTask[]> {
    const result = await this.request<AsanaListResponse<AsanaTask>>(
      `/sections/${encodeURIComponent(sectionGid)}/tasks?opt_fields=name,completed`,
    );
    return this.listItems(result).filter((t) => !t.completed);
  }

  async getTaskNotes(taskGid: string): Promise<{ notes: string | null; permalinkUrl: string | null }> {
    const result = await this.request<AsanaItemResponse<{ notes?: string; permalink_url?: string }>>(
      `/tasks/${encodeURIComponent(taskGid)}?opt_fields=notes,permalink_url`,
    );
    const notes = result.data.notes?.trim() || null;
    const permalinkUrl = result.data.permalink_url?.trim() || null;
    return { notes, permalinkUrl };
  }
}

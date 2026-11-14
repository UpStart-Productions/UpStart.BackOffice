import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

/** Records a screen may need before it is useful (see app-empty-state `requires`). */
export type FirstRunPrereq = 'accounts' | 'projects' | 'bookingTypes' | 'taskProjects';

/** Where to create each prerequisite, and what the link says. */
export const FIRST_RUN_PREREQS: Record<FirstRunPrereq, { label: string; link: string }> = {
  accounts: { label: 'Add your first account', link: '/accounts/new' },
  projects: { label: 'Add your first project', link: '/projects/new' },
  bookingTypes: { label: 'Set up a booking type', link: '/bookings/types/new' },
  taskProjects: { label: 'Create a project', link: '/tasks/projects' },
};

const ENDPOINTS: Record<FirstRunPrereq, string> = {
  accounts: '/clients',
  projects: '/projects',
  bookingTypes: '/booking/admin/types',
  taskProjects: '/tm/projects',
};

/**
 * Answers "does this workspace have any X yet?" for first-run empty states.
 * Only asked when a screen is already empty, so it stays cheap. A "yes" is cached for the session;
 * a "no" is re-checked next time so it clears as soon as the user creates the record.
 * If the check fails (e.g. no permission), it answers "yes" so we never nag about something we can't see.
 */
@Injectable({ providedIn: 'root' })
export class FirstRunService {
  private readonly api = inject(ApiService);
  private readonly known = new Set<FirstRunPrereq>();

  async has(kind: FirstRunPrereq): Promise<boolean> {
    if (this.known.has(kind)) return true;
    try {
      const rows = await this.api.get<unknown[]>(ENDPOINTS[kind]);
      const has = Array.isArray(rows) ? rows.length > 0 : true;
      if (has) this.known.add(kind);
      return has;
    } catch {
      return true;
    }
  }
}

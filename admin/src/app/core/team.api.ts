import { inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Person } from '../task-manager/core/tm.types';

/** Staff on a client or project (People panel). Project staff are its members, the same list as its task board. */
export type TeamMember = Person & {
  /** Removable here: on the project, or assigned to the client directly. */
  direct: boolean;
  /** Client panel: the client's projects this person is on. */
  projects: { id: string; name: string }[];
  /** Project panel: the project's Lead (sees everyone's time, expenses and invoices on it, manages its people). */
  isLead?: boolean;
};

export type TeamScope = { kind: 'clients' | 'projects'; id: string };

@Injectable({ providedIn: 'root' })
export class TeamApi {
  private readonly api = inject(ApiService);

  candidates(kind: TeamScope['kind']) {
    return this.api.get<Person[]>(`/${kind}/team/candidates`);
  }
  list(scope: TeamScope) {
    return this.api.get<TeamMember[]>(`/${scope.kind}/${scope.id}/team`);
  }
  add(scope: TeamScope, userId: string) {
    return this.api.post<TeamMember[]>(`/${scope.kind}/${scope.id}/team`, { userId });
  }
  /**
   * Projects only: give this email the project's Lead. A new email becomes a Guest user and gets an invite;
   * an existing user keeps their role and is added (or promoted) as Lead.
   */
  inviteLead(projectId: string, email: string) {
    return this.api.post<{ team: TeamMember[]; invited: boolean; emailed: boolean }>(`/projects/${projectId}/team/invite`, { email, isLead: true });
  }
  /** Projects only: make someone the Lead, or back to Member. */
  setLead(projectId: string, userId: string, isLead: boolean) {
    return this.api.patch<TeamMember[]>(`/projects/${projectId}/team/${userId}`, { isLead });
  }
  remove(scope: TeamScope, userId: string) {
    return this.api.delete<TeamMember[]>(`/${scope.kind}/${scope.id}/team/${userId}`);
  }
}

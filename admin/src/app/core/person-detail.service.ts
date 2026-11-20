import { Injectable, signal } from '@angular/core';

/** A person to show in the person detail modal: a contact (loaded from People) or a user (shown from what's known). */
export type PersonDetailTarget =
  | { kind: 'contact'; id: string }
  | { kind: 'user'; id: string; name: string; email?: string | null; phone?: string | null; avatarUrl?: string | null; title?: string | null };

/** Opens the one person detail modal (mounted in the shell). Every person name in the app calls this. */
@Injectable({ providedIn: 'root' })
export class PersonDetailService {
  readonly target = signal<PersonDetailTarget | null>(null);

  open(target: PersonDetailTarget) {
    this.target.set({ ...target });
  }

  close() {
    this.target.set(null);
  }
}

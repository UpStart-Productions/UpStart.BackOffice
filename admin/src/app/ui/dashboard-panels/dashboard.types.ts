import type { PermissionArea } from '@upstart/back-office/shared';
import type { RecordCardTone } from '../record-card/record-card.component';
import type { Person } from '../../task-manager/core/tm.types';

export type DashRow = {
  key: string;
  title: string;
  subtitle?: string;
  link?: unknown[] | string | null;
  query?: Record<string, string> | null;
  icon?: string;
  tone?: RecordCardTone;
  person?: Person | null;
  badge?: { label: string; severity: 'success' | 'info' | 'warn' | 'danger' | 'secondary'; hint?: string };
  action?: { label: string; link: unknown[] | string; query?: Record<string, string> | null; primary?: boolean };
  done?: () => Promise<void>;
  open?: () => void;
  isNew?: boolean;
  at?: string;
};

export type PanelId = 'money' | 'jd' | 'today' | 'work' | 'pipeline' | 'feed' | 'time' | 'shifts';
export type PanelSize = 'full' | 'twoThirds' | 'half' | 'third';

export type Panel = { id: PanelId; size: PanelSize; visible: (host: DashboardPanelHost) => boolean };

/** Permissions and flags the dashboard grid needs to decide which cards exist. */
export type DashboardPanelHost = {
  can(area: PermissionArea): boolean;
  guideReady(): boolean;
};

export type Section<T> = { loading: boolean; error: string | null; data: T };

export type FinRange = 'month' | '3m' | '6m' | 'ytd' | '12m';
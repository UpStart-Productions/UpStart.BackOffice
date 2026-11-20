import { HELP_AGENT_NAME } from '@upstart/back-office/shared';
import type { DashboardPanelColor } from '../dashboard-panel/dashboard-panel.component';
import type { Panel, PanelId } from './dashboard.types';

/** Default order and widths. The grid back-fills gaps so rows stay full after a drag. */
export const DASHBOARD_PANELS: Panel[] = [
  { id: 'money', size: 'twoThirds', visible: (d) => d.can('invoices') },
  { id: 'jd', size: 'third', visible: (d) => d.guideReady() && (d.can('inbox') || d.can('invoices')) },
  { id: 'today', size: 'half', visible: (d) => d.can('tasks') || d.can('inbox') || d.can('bookings') || d.can('forms') || d.can('schedule') },
  { id: 'work', size: 'half', visible: (d) => d.can('tasks') },
  { id: 'pipeline', size: 'third', visible: (d) => d.can('pipeline') || d.can('inbox') },
  { id: 'feed', size: 'third', visible: (d) => d.can('invoices') || d.can('inbox') || d.can('forms') || d.can('bookings') || d.can('tasks') },
  { id: 'time', size: 'third', visible: (d) => d.can('time') },
  { id: 'visits', size: 'third', visible: (d) => d.can('schedule') },
];

export function dashboardPanelLabel(id: PanelId): string {
  switch (id) {
    case 'money':
      return 'Financial health';
    case 'jd':
      return `${HELP_AGENT_NAME} suggests`;
    case 'today':
      return 'Today';
    case 'work':
      return 'My work';
    case 'pipeline':
      return 'Pipeline & relationships';
    case 'feed':
      return 'Since last time';
    case 'time':
      return 'My time';
    case 'visits':
      return 'My visits';
  }
}

export function dashboardPanelColor(id: PanelId): DashboardPanelColor {
  return id === 'money' || id === 'time' || id === 'visits' ? 'success' : id === 'today' ? 'warning' : id === 'feed' ? 'neutral' : 'info';
}
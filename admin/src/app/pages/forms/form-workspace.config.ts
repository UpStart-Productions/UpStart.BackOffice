import type { FormsApi } from '../../core/forms.api';
import type { WorkspaceConfig } from '../../core/form-workspace.service';

/** A Forms form in the workspace: Settings, Scoring, Links and Submissions under its sections. */
export function freeFormWorkspace(forms: FormsApi, id: string): WorkspaceConfig {
  return {
    base: ['/forms', id],
    tools: [
      { id: 'settings', label: 'Settings', icon: 'pi-cog' },
      { id: 'scoring', label: 'Scoring', icon: 'pi-chart-bar' },
      { id: 'links', label: 'Links', icon: 'pi-link' },
      { id: 'submissions', label: 'Submissions', icon: 'pi-inbox', route: ['/forms', id, 'submissions'] },
    ],
    emptyView: 'settings',
    load: () => forms.form(id),
    addSection: async (name) => (await forms.addSection(id, name)).id,
    reorderSections: async (ids) => {
      await forms.reorderSections(id, ids);
    },
  };
}

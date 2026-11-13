import type { FormsApi } from '../../core/forms.api';
import type { WorkspaceConfig } from '../../core/form-workspace.service';

/** A Forms form in the workspace: Settings, Scoring, Links and Who can use it (client forms) under its sections. (Submissions are a separate workflow, from the Forms list.) */
export function freeFormWorkspace(forms: FormsApi, id: string): WorkspaceConfig {
  return {
    base: ['/forms', id],
    tools: [
      { id: 'settings', label: 'Settings', icon: 'pi-cog' },
      { id: 'scoring', label: 'Scoring', icon: 'pi-chart-bar' },
      { id: 'links', label: 'Links', icon: 'pi-link' },
      { id: 'access', label: 'Who can use it', icon: 'pi-users' },
    ],
    emptyView: 'settings',
    load: () => forms.form(id),
    addSection: async (name, description) => (await forms.addSection(id, name, description)).id,
    reorderSections: async (ids) => {
      await forms.reorderSections(id, ids);
    },
  };
}

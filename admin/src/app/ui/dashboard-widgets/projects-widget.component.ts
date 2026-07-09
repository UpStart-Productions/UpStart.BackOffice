import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DashboardWidgetContentComponent } from '../dashboard-widget/dashboard-widget-content.component';

type Project = {
  id: string;
  name: string;
  client: { id: string; name: string };
  isActive?: boolean;
};

@Component({
  selector: 'app-dashboard-projects-widget',
  standalone: true,
  imports: [RouterLink, ButtonModule, DashboardWidgetContentComponent],
  template: `
    <app-dashboard-widget-content
      [loading]="loading()"
      [error]="error()"
      [empty]="activeProjects().length === 0"
      emptyMessage="No active projects."
    >
      <div dashboardWidgetEmptyAction class="widget-footer">
        <a pButton label="New project" icon="pi pi-plus" routerLink="/projects/new"></a>
      </div>

      <ul class="dashboard-list">
        @for (project of activeProjects(); track project.id) {
          <li class="dashboard-list-item">
            <a [routerLink]="['/projects', project.id]" class="dashboard-list-link">
              <span class="dashboard-list-title">{{ project.name }}</span>
              <span class="text-muted">{{ project.client.name }}</span>
            </a>
          </li>
        }
      </ul>
    </app-dashboard-widget-content>
  `,
})
export class DashboardProjectsWidgetComponent {
  projects = input<Project[]>([]);
  loading = input(false);
  error = input<string | null>(null);

  readonly activeProjects = computed(() =>
    this.projects()
      .filter((p) => p.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8),
  );
}

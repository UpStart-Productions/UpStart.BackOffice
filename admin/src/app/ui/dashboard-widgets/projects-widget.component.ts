import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

type Project = {
  id: string;
  name: string;
  client: { id: string; name: string };
  isActive?: boolean;
};

@Component({
  selector: 'app-dashboard-projects-widget',
  standalone: true,
  imports: [RouterLink, ButtonModule],
  template: `
    @if (loading()) {
      <p class="text-muted mb-0">Loading…</p>
    } @else if (error()) {
      <p class="mb-0" role="alert">{{ error() }}</p>
    } @else if (activeProjects().length === 0) {
      <p class="text-muted mb-0">No active projects.</p>
      <div class="widget-footer">
        <a pButton label="New project" icon="pi pi-plus" routerLink="/projects/new"></a>
      </div>
    } @else {
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

      <div class="widget-footer">
        <a pButton label="View all projects" icon="pi pi-arrow-right" iconPos="right" routerLink="/projects"></a>
      </div>
    }
  `,
  styles: [
    `
      .dashboard-list {
        list-style: none;
        margin: 0 0 1rem;
        padding: 0;
      }

      .dashboard-list-item {
        padding: 0.625rem 0;
        border-bottom: 1px solid var(--color-border);
      }

      .dashboard-list-item:last-child {
        border-bottom: none;
      }

      .dashboard-list-link {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        color: inherit;
        text-decoration: none;
      }

      .dashboard-list-link:hover .dashboard-list-title {
        color: var(--brand-primary);
      }

      .dashboard-list-title {
        font-weight: 600;
        font-size: 0.875rem;
      }

      .widget-footer {
        margin-top: auto;
        padding-top: 0.5rem;
      }
    `,
  ],
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

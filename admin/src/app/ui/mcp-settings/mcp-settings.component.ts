import { Component, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

/** Production MCP endpoint (Streamable HTTP). Shown in Settings for all environments. */
export const MCP_SERVER_URL = 'https://mcp.heyupstart.com/mcp';

/** Settings > MCP server: connect desktop AI clients and what the server can do. */
@Component({
  selector: 'app-mcp-settings',
  standalone: true,
  imports: [AccordionModule, ButtonModule, InputTextModule],
  template: `
    <p-accordion class="mcp-sub-accordion" [multiple]="true" [(value)]="openPanels">
      <p-accordion-panel value="capabilities">
        <p-accordion-header>What the MCP server can do</p-accordion-header>
        <p-accordion-content>
          <div class="mcp-instructions text-sm">
            <p>
              Tools use the same API as this app. Your role controls which tools appear; the API enforces permissions
              on every write.
            </p>
            <p class="mb-2">Includes session, search, organizations, people, projects, time, expenses, tasks, and draft/send/paid invoices.</p>
            <p class="mb-0">
              Not available via MCP today: Bookings, Inbox filing, accounting, pipeline setup, receipt upload, browser
              extension capture.
            </p>
          </div>
        </p-accordion-content>
      </p-accordion-panel>

      <p-accordion-panel value="server-url">
        <p-accordion-header>Server URL</p-accordion-header>
        <p-accordion-content>
          <p class="mcp-instructions text-sm text-color-secondary">
            Paste as a remote MCP server (Streamable HTTP). No client ID or secret; the server registers the app on
            first connect.
          </p>
          <div class="field-action-row">
            <input
              pInputText
              [value]="mcpEndpoint"
              readonly
              class="flex-1 mcp-url"
              aria-label="MCP server URL"
            />
            <p-button label="Copy" icon="pi pi-copy" severity="secondary" size="small" (onClick)="copy(mcpEndpoint)" />
          </div>
        </p-accordion-content>
      </p-accordion-panel>

      <p-accordion-panel value="claude">
        <p-accordion-header>Connect Claude</p-accordion-header>
        <p-accordion-content>
          <p class="mcp-instructions text-sm mb-0">
            Claude → Settings → Connectors → Add custom connector / MCP server → paste URL → Authenticate with UpStart
            Back Office → Allow.
          </p>
        </p-accordion-content>
      </p-accordion-panel>

      <p-accordion-panel value="chatgpt">
        <p-accordion-header>Connect ChatGPT</p-accordion-header>
        <p-accordion-content>
          <p class="mcp-instructions text-sm mb-0">
            ChatGPT desktop app → Settings → Connectors (or Apps &amp; connectors) → add MCP → paste URL → sign in and
            Allow. Mobile app does not support MCP connectors.
          </p>
        </p-accordion-content>
      </p-accordion-panel>

      <p-accordion-panel value="codex">
        <p-accordion-header>Connect OpenAI Codex (VS Code / desktop)</p-accordion-header>
        <p-accordion-content>
          <p class="mcp-instructions text-sm mb-0">
            Codex settings → MCP Servers → add Streamable HTTP server with this URL → authenticate when prompted.
          </p>
        </p-accordion-content>
      </p-accordion-panel>

      <p-accordion-panel value="cursor">
        <p-accordion-header>Connect Cursor and other MCP clients</p-accordion-header>
        <p-accordion-content>
          <p class="mcp-instructions text-sm mb-0">
            Add a remote MCP server URL in MCP settings (Streamable HTTP with OAuth, not a local stdio command). Complete
            login and Allow in the browser. Stdio-only clients cannot use this server.
          </p>
        </p-accordion-content>
      </p-accordion-panel>
    </p-accordion>
  `,
  styles: `
    .mcp-sub-accordion {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .mcp-instructions {
      line-height: 1.5;
      color: var(--text-color);
    }

    .mcp-instructions p {
      margin: 0 0 0.75rem;
    }

    .mcp-url {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
  `,
})
export class McpSettingsComponent {
  private readonly toast = inject(MessageService);

  readonly mcpEndpoint = MCP_SERVER_URL;
  /** Capabilities panel open by default; other sections stay collapsed. */
  openPanels: string[] = ['capabilities'];

  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.add({ severity: 'success', summary: 'Copied', detail: text });
    } catch {
      this.toast.add({ severity: 'warn', summary: 'Copy failed', detail: 'Select and copy it manually.' });
    }
  }
}

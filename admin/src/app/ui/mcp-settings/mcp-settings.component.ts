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
    <p class="text-color-secondary mt-0 mb-3">
      The MCP server lets desktop AI apps (Claude, ChatGPT, Codex, Cursor, and others) work in
      UpStart Back Office as <strong>you</strong> — same sign-in and role as this app. Changes land
      immediately; there is no draft queue except invoices (created as drafts until you send).
    </p>

    <p-accordion class="mcp-sub-accordion" [multiple]="true" [(value)]="openPanels">
      <p-accordion-panel value="capabilities">
        <p-accordion-header>What the MCP server can do</p-accordion-header>
        <p-accordion-content>
          <p class="text-color-secondary mt-0">
            Tools call the same UpStart Back Office API as this app. Your <strong>role</strong> controls which tools
            appear — if Tasks is not allowed for you, task tools are hidden. The API still enforces permissions on
            every write.
          </p>
          <ul class="mcp-cap-list">
            <li>
              <strong>Session:</strong>
              <code>whoami</code>
              (user, tenant, role, visible areas);
              <code>use_tenant</code>
              when you belong to more than one organization or are a platform operator.
            </li>
            <li>
              <strong>Search:</strong>
              cross-entity search in CRM, projects, tasks, and related records.
            </li>
            <li>
              <strong>Organizations &amp; people:</strong>
              list, create, update; bulk create organizations or people; link or unlink people to organizations.
            </li>
            <li>
              <strong>Projects, time &amp; expenses:</strong>
              list and create/update time entries and expenses; bulk create expenses.
            </li>
            <li>
              <strong>Tasks:</strong>
              your tasks, Task Manager projects and sections, search, create (including bulk from a list or SOW),
              update, and comment.
            </li>
            <li>
              <strong>Invoices:</strong>
              list, open one invoice, preview unbilled time, create or update a <strong>draft</strong>,
              <strong>send</strong>, or mark paid — sending and marking paid only when you explicitly ask.
            </li>
          </ul>
          <p class="text-color-secondary text-sm mb-0">
            <strong>Not available via MCP today:</strong>
            Bookings, Inbox filing, accounting (chart of accounts, journal, bank import), pipeline setup, receipt
            photo upload, or the browser extension capture flow. Use UpStart Back Office for those.
          </p>
        </p-accordion-content>
      </p-accordion-panel>

      <p-accordion-panel value="server-url">
        <p-accordion-header>Server URL</p-accordion-header>
        <p-accordion-content>
          <p class="text-color-secondary mt-0 mb-2">
            Paste this into your AI app as a <strong>remote</strong> MCP server (Streamable HTTP). You do
            not need a client ID or secret; the server registers the app on first connect.
          </p>
          <div class="mcp-url-row">
            <input
              pInputText
              [value]="mcpEndpoint"
              readonly
              class="flex-1 mcp-url"
              aria-label="MCP server URL"
            />
            <p-button label="Copy" icon="pi pi-copy" severity="secondary" (onClick)="copy(mcpEndpoint)" />
          </div>
        </p-accordion-content>
      </p-accordion-panel>

      <p-accordion-panel value="claude">
        <p-accordion-header>Connect Claude</p-accordion-header>
        <p-accordion-content>
          <ol class="steps">
            <li>
              <span class="step-num" aria-hidden="true">1</span>
              <div>
                Open <strong>Claude</strong> (desktop or claude.ai with connectors, depending on your plan).
              </div>
            </li>
            <li>
              <span class="step-num" aria-hidden="true">2</span>
              <div>
                Go to <strong>Settings → Connectors</strong> (or Integrations) →
                <strong>Add custom connector</strong> / <strong>Add MCP server</strong>.
              </div>
            </li>
            <li>
              <span class="step-num" aria-hidden="true">3</span>
              <div>Paste the server URL and save.</div>
            </li>
            <li>
              <span class="step-num" aria-hidden="true">4</span>
              <div>
                Choose <strong>Authenticate</strong>. Sign in with your normal UpStart Back Office email and password
                (same as this app), then click <strong>Allow</strong> on the connect screen.
              </div>
            </li>
          </ol>
        </p-accordion-content>
      </p-accordion-panel>

      <p-accordion-panel value="chatgpt">
        <p-accordion-header>Connect ChatGPT</p-accordion-header>
        <p-accordion-content>
          <ol class="steps">
            <li>
              <span class="step-num" aria-hidden="true">1</span>
              <div>
                Use the <strong>ChatGPT desktop app</strong> (MCP connectors are not available in the mobile app).
              </div>
            </li>
            <li>
              <span class="step-num" aria-hidden="true">2</span>
              <div>
                Open <strong>Settings → Connectors</strong> (or <strong>Apps &amp; connectors</strong>, depending on
                version) → add an MCP / custom connector.
              </div>
            </li>
            <li>
              <span class="step-num" aria-hidden="true">3</span>
              <div>
                Paste the server URL and complete sign-in when prompted, then <strong>Allow</strong> on UpStart Back Office.
              </div>
            </li>
          </ol>
          <p class="text-color-secondary text-sm mb-0">
            If you do not see Connectors, update the desktop app or use Developer mode MCP settings for your
            account tier.
          </p>
        </p-accordion-content>
      </p-accordion-panel>

      <p-accordion-panel value="codex">
        <p-accordion-header>Connect OpenAI Codex (VS Code / desktop)</p-accordion-header>
        <p-accordion-content>
          <ol class="steps mb-0">
            <li>
              <span class="step-num" aria-hidden="true">1</span>
              <div>Open Codex settings → <strong>MCP Servers</strong>.</div>
            </li>
            <li>
              <span class="step-num" aria-hidden="true">2</span>
              <div>Add a server with transport <strong>Streamable HTTP</strong> and paste the server URL.</div>
            </li>
            <li>
              <span class="step-num" aria-hidden="true">3</span>
              <div>Authenticate with UpStart Back Office when prompted.</div>
            </li>
          </ol>
        </p-accordion-content>
      </p-accordion-panel>

      <p-accordion-panel value="cursor">
        <p-accordion-header>Connect Cursor and other MCP clients</p-accordion-header>
        <p-accordion-content>
          <p class="text-color-secondary mt-0">
            Any editor or agent that supports <strong>remote MCP over Streamable HTTP with OAuth</strong> can use
            the same URL. In Cursor, open MCP settings and add a remote server URL (not a local command). Complete
            the UpStart Back Office login and Allow step when the browser opens.
          </p>
          <p class="text-color-secondary text-sm mb-0">
            Clients that only support local stdio MCP cannot talk to this server; use a remote-capable client instead.
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

    .mcp-url-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .mcp-url {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .mcp-cap-list {
      padding-left: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 0 0 0.75rem;
    }

    .steps {
      list-style: none;
      padding: 0;
      margin: 0 0 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .steps li {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
    }

    .step-num {
      flex: 0 0 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--brand-primary);
      background: color-mix(in srgb, var(--brand-primary) 14%, transparent);
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

import { Component, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { HelpTextComponent } from '../help-text/help-text.component';

/** Production MCP endpoint (Streamable HTTP). Shown in Settings for all environments. */
export const MCP_SERVER_URL = 'https://mcp.heyupstart.com/mcp';

/** Settings > MCP server: connect desktop AI clients and what the server can do. */
@Component({
  selector: 'app-mcp-settings',
  standalone: true,
  imports: [AccordionModule, ButtonModule, InputTextModule, HelpTextComponent],
  template: `
    <h4 class="mt-0 mb-3 font-semibold">MCP server <app-help-text key="mcp.overview" /></h4>

    <p-accordion class="mcp-sub-accordion" [multiple]="true" [(value)]="openPanels">
      <p-accordion-panel value="capabilities">
        <p-accordion-header>What the MCP server can do <app-help-text key="mcp.capabilities" /></p-accordion-header>
        <p-accordion-content />
      </p-accordion-panel>

      <p-accordion-panel value="server-url">
        <p-accordion-header>Server URL <app-help-text key="mcp.serverUrl" /></p-accordion-header>
        <p-accordion-content>
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
        <p-accordion-header>Connect Claude <app-help-text key="mcp.claude" /></p-accordion-header>
        <p-accordion-content />
      </p-accordion-panel>

      <p-accordion-panel value="chatgpt">
        <p-accordion-header>Connect ChatGPT <app-help-text key="mcp.chatgpt" /></p-accordion-header>
        <p-accordion-content />
      </p-accordion-panel>

      <p-accordion-panel value="codex">
        <p-accordion-header>Connect OpenAI Codex (VS Code / desktop) <app-help-text key="mcp.codex" /></p-accordion-header>
        <p-accordion-content />
      </p-accordion-panel>

      <p-accordion-panel value="cursor">
        <p-accordion-header>Connect Cursor and other MCP clients <app-help-text key="mcp.cursor" /></p-accordion-header>
        <p-accordion-content />
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

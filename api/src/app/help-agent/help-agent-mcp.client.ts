import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * The Back Office guide reads records through the UBO MCP server (UpStart.BackOffice.MCP), as the person
 * asking: same tools, same role checks as Claude desktop and other MCP clients.
 */
export const HELP_AGENT_MCP_URL =
  process.env.NODE_ENV === 'production' ? 'https://mcp.heyupstart.com/mcp' : 'http://localhost:8788/mcp';

/**
 * Tools the guide may call. Read-only only: the MCP server's other tools write straight to the database.
 * The MCP server also hides tools the person's role can't use, so the guide gets the intersection.
 */
export const HELP_AGENT_READ_TOOLS: ReadonlySet<string> = new Set([
  'whoami',
  'search',
  'list_organizations',
  'list_people',
  'list_projects',
  'list_time_entries',
  'list_expenses',
  'list_invoices',
  'get_invoice',
  'preview_invoice_from_time',
  'list_my_tasks',
  'list_task_projects',
  'list_project_tasks',
  'search_tasks',
  'get_task',
  'get_task_project',
  'list_pipelines',
  'list_pipeline_cards',
  'list_forms',
  'get_form',
  'list_form_submissions',
  'get_form_submission',
]);

/**
 * Changes the guide may propose. It never runs these itself: the widget shows a confirmation card and only
 * POST /help-agent/actions/run (after the person clicks) calls them. Invoices only as new drafts: no
 * editing, sending or marking paid. Forms: build and edit (no deleting forms, sections, fields or submissions).
 * Expenses, time and pipeline changes are left out.
 */
export const HELP_AGENT_WRITE_TOOLS: Readonly<Record<string, { title: string; confirm: string }>> = {
  create_organization: { title: 'Create organization', confirm: 'Create' },
  create_organizations: { title: 'Create organizations', confirm: 'Create' },
  update_organization: { title: 'Update organization', confirm: 'Save' },
  create_person: { title: 'Create person', confirm: 'Create' },
  create_people: { title: 'Create people', confirm: 'Create' },
  update_person: { title: 'Update person', confirm: 'Save' },
  link_person_to_organization: { title: 'Link person to organization', confirm: 'Link' },
  unlink_person_from_organization: { title: 'Unlink person from organization', confirm: 'Unlink' },
  add_person_to_project: { title: 'Add person to project', confirm: 'Add' },
  create_task: { title: 'Create task', confirm: 'Create' },
  create_tasks: { title: 'Create tasks', confirm: 'Create' },
  update_task: { title: 'Update task', confirm: 'Save' },
  complete_task: { title: 'Complete task', confirm: 'Complete' },
  move_task: { title: 'Move task', confirm: 'Move' },
  comment_on_task: { title: 'Comment on task', confirm: 'Comment' },
  add_task_tags: { title: 'Tag task', confirm: 'Add tags' },
  log_activity: { title: 'Log activity', confirm: 'Log it' },
  create_invoice_from_time: { title: 'Create draft invoice from time', confirm: 'Create draft' },
  create_invoice: { title: 'Create draft invoice', confirm: 'Create draft' },
  create_form: { title: 'Create form', confirm: 'Create' },
  update_form: { title: 'Update form', confirm: 'Save' },
  set_form_scoring: { title: 'Set form scoring', confirm: 'Save' },
  publish_form: { title: 'Publish form', confirm: 'Publish' },
  unpublish_form: { title: 'Unpublish form', confirm: 'Unpublish' },
  add_form_section: { title: 'Add form section', confirm: 'Add' },
  update_form_section: { title: 'Update form section', confirm: 'Save' },
  move_form_section: { title: 'Move form section', confirm: 'Move' },
  add_form_field: { title: 'Add form field', confirm: 'Add' },
  update_form_field: { title: 'Update form field', confirm: 'Save' },
  create_form_link: { title: 'Create form link', confirm: 'Create' },
  set_form_submission_status: { title: 'Change submission status', confirm: 'Save' },
};

export const isHelpAgentWriteTool = (name: string): boolean =>
  Object.prototype.hasOwnProperty.call(HELP_AGENT_WRITE_TOOLS, name);

/** Plain-language names for the widget's "Looked up …" line. */
export const HELP_AGENT_TOOL_LABELS: Record<string, string> = {
  whoami: 'your account',
  search: 'search',
  list_organizations: 'organizations',
  list_people: 'people',
  list_projects: 'projects',
  list_time_entries: 'time entries',
  list_expenses: 'expenses',
  list_invoices: 'invoices',
  get_invoice: 'invoices',
  preview_invoice_from_time: 'unbilled time',
  list_my_tasks: 'tasks',
  list_task_projects: 'task projects',
  list_project_tasks: 'tasks',
  search_tasks: 'tasks',
  get_task: 'tasks',
  get_task_project: 'task projects',
  list_pipelines: 'pipelines',
  list_pipeline_cards: 'pipelines',
  list_forms: 'forms',
  get_form: 'forms',
  list_form_submissions: 'form submissions',
  get_form_submission: 'form submissions',
};

/** Longest tool result passed back to the model; longer ones are cut with a note. */
const TOOL_RESULT_MAX = 20_000;

/** Who the guide acts as. The same credentials the person's own request to the API carried. */
export interface HelpAgentCaller {
  /** The person's `Authorization: Bearer <Cognito ID token>` header, when signed in through Cognito. */
  authorization?: string;
  /** Dev only: the MCP server's dev mode acts as this email. */
  email?: string | null;
  /** Tenant the person is working in (their `x-tenant-slug` header). */
  tenantSlug?: string;
}

export interface HelpAgentToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface HelpAgentMcpSession {
  tools: HelpAgentToolDef[];
  call(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }>;
  close(): Promise<void>;
}

function callerHeaders(caller: HelpAgentCaller): Record<string, string> {
  const headers: Record<string, string> = {};
  if (caller.authorization) headers['Authorization'] = caller.authorization;
  if (process.env.NODE_ENV !== 'production' && caller.email) headers['x-user-email'] = caller.email;
  if (caller.tenantSlug) headers['x-tenant-slug'] = caller.tenantSlug;
  return headers;
}

/**
 * Opens one MCP session for one question (or one confirmed change), limited to the read allowlist plus,
 * when `writes` is on, the write allowlist. The MCP server also hides tools the person's role can't use.
 */
export async function openHelpAgentMcpSession(
  caller: HelpAgentCaller,
  options: { writes?: boolean } = {},
): Promise<HelpAgentMcpSession> {
  const allowed = (name: string) => HELP_AGENT_READ_TOOLS.has(name) || (!!options.writes && isHelpAgentWriteTool(name));
  const transport = new StreamableHTTPClientTransport(new URL(HELP_AGENT_MCP_URL), {
    requestInit: { headers: callerHeaders(caller) },
  });
  const client = new Client({ name: 'ubo-back-office-guide', version: '1.0.0' });
  await client.connect(transport);

  const listed = await client.listTools();
  const tools = listed.tools
    .filter((t) => allowed(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: (t.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    }));

  return {
    tools,
    async call(name, args) {
      if (!allowed(name) || !tools.some((t) => t.name === name)) {
        return { text: `The tool ${name} is not available to the guide.`, isError: true };
      }
      const result = await client.callTool({ name, arguments: args });
      const content = Array.isArray(result.content) ? result.content : [];
      let text = content
        .map((c) => (c && typeof c === 'object' && (c as { type?: string }).type === 'text' ? String((c as { text?: unknown }).text ?? '') : ''))
        .filter(Boolean)
        .join('\n');
      if (text.length > TOOL_RESULT_MAX) text = `${text.slice(0, TOOL_RESULT_MAX)}\n(Result cut short: ask a narrower question.)`;
      return { text: text || '(no result)', isError: result.isError === true };
    },
    async close() {
      try {
        await transport.terminateSession();
      } catch {
        // Older servers may not support DELETE; the session expires on its own.
      }
      await client.close().catch(() => undefined);
    },
  };
}

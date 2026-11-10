# Admin: Users, Settings, Accounting

## Users (Admin only)

**Users** has **Users** and **Roles** tabs.

- **Add User** and sort/search on the Users tab
- Use the ⋮ menu on a row to **Edit** (name, email, role, hourly rate), **Send sign-in invite**, **Disable** or **Delete**. If you fix someone's email, send them a new sign-in invite afterwards. Change your own profile from **My Account** in the avatar menu (admins editing another user can change that person's email here).
- The same email can be a user in more than one organization. Add them in each one with the role they should have there. If they already have a sign-in from another organization, they get a "you've been added" email and keep their password. They are only blocked if that email is already a user in *your* organization. Disabling or deleting them affects only your organization.
- **Roles** tab: every organization has the same three roles, and they can't be edited, added or deleted. The **Members** column shows up to three overlapping avatars and **+N** when there are more; click the cell to open the full list for that role (including **Admin**). In that list, use the copy icon beside each email; click a person to open the same edit user screen as on the Users tab.
  - **Admin**: everything, including Users, Settings, setup (pipelines, booking types, care setup), Accounting, Reports and every invoice. Only admins delete organizations, people, pipeline cards, bookings, forms and projects.
  - **Member**: the organization's own staff. Sees all of CRM (Organizations, People, Pipeline, Bookings, Activity, Forms) and can add and edit there, but not delete or change setup. Sees only the projects they are on, and only their own tasks, time, expenses and invoices, plus everything on projects they lead.
  - **Guest**: outside people such as contractors, vendors and collaborators. Sees only the projects they are on and the clients they are assigned to. No Pipeline, Bookings, Activity or Forms. Like Members, they see only their own time, expenses and invoices, plus everything on projects they lead.
  - **On a project**, each person is a **Lead** or a **Member**. People are added as Members. To bring in someone new as the Lead, use **Add new person** in the project's **People** panel and tick **Make lead** (email required): they're created as a contact, get a Guest login by email invite, and become the project's Lead. If that email already has a login in your organization, they keep their role and just become Lead. To change an existing person, use the ⋮ menu on their row (**Make lead** or **Make member**), or the task board's members dialog. A project can have more than one Lead. Only admins and the project's Leads can add, remove or change people on a project. A Lead sees everyone's time, expenses and invoices on that project and manages who is on it. A Member sees the project's tasks and files and only their own time and expenses.
  - If someone's role doesn't allow an action, the button is hidden on Pipeline, Organizations, Clients and Bookings; elsewhere they'll see "Your role can't … in this area".

Super users can impersonate a user from row actions (viewing as that user).

## Settings (Admin only)

**Settings** accordion sections include business profile, **MCP server** (connect desktop AI apps to UpStart Back Office), **Back Office guide** (whether the help chat can look up records), integrations (Asana, Google Calendar, email capture), API keys, and related tenant configuration. Expand a section to edit; save within each area. **Google Calendar** only shows when the Bookings module is on.

### MCP server

Admins use **MCP server** to connect tools like Claude, ChatGPT, OpenAI Codex, or Cursor to UpStart Back Office. The server URL is **https://mcp.heyupstart.com/mcp** (copy it from Settings → MCP server → Server URL). Open **What the MCP server can do** first, then the connect steps for each app. Add the URL as a Streamable HTTP connector in the AI app, sign in with your normal account, and click **Allow** on the connect page. Access follows your role in UpStart Back Office.

### Back Office guide

**Back Office guide** has one switch: **Let the guide look up records** (the switch label uses the guide's name). It is off by default. When on, the help chat can answer questions about your records, such as "How much have we invoiced this client since January?" or "How many open tasks does Sam have?". It only reads records (organizations, people, projects, time, expenses, invoices, tasks and pipelines), never changes them, and only sees what the person asking can see. The records it looks up are sent to Anthropic, the AI provider, to write the answer. Answers that used records show **Looked up …** underneath. Record lookups are off while a super user is impersonating someone.

### Business

The **Business** section is where admins set how your organization appears on invoices and in the top bar:

- **Company name** — shown next to your logo in the top bar when you upload one; also used on invoice PDFs.
- **Logo** — upload PNG, JPEG, GIF, or WebP (max 5 MB). When a logo is saved, it replaces the default UpStart logo in the top bar for everyone in your tenant. Use **Remove** (trash) to clear it.
- **Address**, **City**, **State**, **Zip**, **Phone**, and **Billing email** — address and phone print on invoices under your logo; billing email is the default when invoices are addressed to your organization.

Click **Save** after editing text fields. Logo upload saves immediately when you choose a file.

### Pick lists

Open **Pick lists** in Settings. Three blocks — **Organizations**, **People**, and **Tasks** — each with their own suggestion lists (organization **Tags**, **Services**, **Products**, and **Focus areas**; **Tags** for people and for tasks). **Add** on a list opens the same find-or-create control used for task tags: search existing values or type a new name and press Enter (or choose **Create value …**). The count on a pill is how many records still have that value. On each pill:

- **Hide** (eye-slash) — the name no longer appears in pick lists on records; organizations that already have it keep it.
- **Show** (eye) — brings a hidden name back to the pick lists.
- **Delete** (×) — strips the name from every record and from suggestion lists (confirm first).

Staff can still add new names while editing records; use Pick lists to add catalog entries ahead of time or to hide or remove values.

### Expenses and Invoicing

**Expenses and Invoicing** covers mileage and expense categories:

- **Mileage rate (per mile)** — what a **Mileage** expense pays (miles × rate). Changing it affects new mileage only; saved expenses keep the rate they were entered with. Click **Save Rate** next to the field after editing.
- **Categories** — the list on the **Expenses** page. Built-ins (Software, Travel, Mileage, Meals, Supplies, Contractor, Advertising, Other) can be **renamed** or **Remove**d to hide from the picker (built-ins are deactivated, not deleted). **Mileage** cannot be removed. **Add** custom names and **Restore** inactive built-ins as needed.
- **Payment methods** — how expenses were paid (Personal Card, Company Card, Cash, ePayment, and custom). Same rename, remove, add, and restore behavior as categories (except Mileage rules apply only to categories).

### Activity

**Activity** sets when **Activity → To do** flags things: **Needs reply after (days)** (default 2) is how long an email from outside waits for an answer before it is listed under Needs reply; **Gone quiet after (days)** (default 30) is how long an active client can go without contact before it is listed under Gone quiet. Click **Save**.

## Accounting (Admin only)

Under **Accounting** in the nav:

- **Chart of Accounts**
- **Journal**
- **Bank Import**
- **Accounting Reports**

Regular tenant users without Admin role do not see Accounting.

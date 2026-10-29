# Admin: Users, Settings, Accounting

## Users (Admin only)

**Users** has **Users** and **Roles** tabs.

- **Add User** and sort/search on the Users tab
- Use the ⋮ menu on a row to **Edit** (name, email, role, hourly rate), **Send sign-in invite**, **Disable** or **Delete**. If you fix someone's email, send them a new sign-in invite afterwards. You can't change your own email.
- The same email can be a user in more than one organization. Add them in each one with the role they should have there. If they already have a sign-in from another organization, they get a "you've been added" email and keep their password. They are only blocked if that email is already a user in *your* organization. Disabling or deleting them affects only your organization.
- **Roles** tab: what each role can see and do, per area. **View** is None, Own (only their own records, or clients they are assigned to) or All. Checkboxes set what they can do with what they see: **Create**, **Edit**, **Delete**, and **Setup** (Pipeline lanes and pipelines; Bookings booking types). Edit also covers actions like Make client, Archive, filing an email, or sending an invoice. Admins can do everything.
  - **Built-in roles** (marked with an amber open-box icon; hover it for details) every organization starts with. Edit them freely; once one has been changed, its menu offers **Reset to default**. They can't be deleted. The built-in roles are: **Manager** (everything, including Setup), **Team member** (CRM: see all, create and edit, no delete; their own projects, tasks, time and expenses), **Coordinator** (Activity, People, Pipeline, Bookings: create and edit, no delete; Organizations: view and edit), **Bookkeeper** (Invoices and Reports; views Time, Expenses and Organizations), **Contractor** (their own projects, tasks, time and expenses), **Guest** (only the task projects they are invited to).
  - **Add role** makes your own; those can be deleted once no one has them.
  - The **Can use** column shows one chip per area: the area name, **Own** when limited to their own records, and icons for Create (+), Edit (pencil), Delete (trash) and Setup (gear). Faded icons are not allowed; hover a chip for a plain-language summary of what that role can do there. A legend sits above the table.
  - Each role's menu shows how many people have it, e.g. **View 3 users**: their photo, name and email. A role with no one on it shows **No users yet**.
  - If someone's role doesn't allow an action, the button is hidden on Pipeline, Organizations, Clients and Bookings; elsewhere they'll see "Your role can't … in this area".

Super users can impersonate a user from row actions (viewing as that user).

## Settings (Admin only)

**Settings** accordion sections include business profile, **Client fields**, **MCP server** (connect desktop AI apps to UpStart Back Office), integrations (Asana, Google Calendar, email capture), API keys, and related tenant configuration. Expand a section to edit; save within each area. **Google Calendar** only shows when the Bookings module is on.

### MCP server

Admins use **MCP server** to connect tools like Claude, ChatGPT, OpenAI Codex, or Cursor to UpStart Back Office. The server URL is **https://mcp.heyupstart.com/mcp** (copy it from Settings → MCP server → Server URL). Open **What the MCP server can do** first, then the connect steps for each app. Add the URL as a Streamable HTTP connector in the AI app, sign in with your normal account, and click **Allow** on the connect page. Access follows your role in UpStart Back Office.

### Business

The **Business** section is where admins set how your organization appears on invoices and in the top bar:

- **Company name** — shown next to your logo in the top bar when you upload one; also used on invoice PDFs.
- **Logo** — upload PNG, JPEG, GIF, or WebP (max 5 MB). When a logo is saved, it replaces the default UpStart logo in the top bar for everyone in your tenant. Use **Remove** (trash) to clear it.
- **Address**, **City**, **State**, **Zip**, **Phone**, and **Billing email** — address and phone print on invoices under your logo; billing email is the default when invoices are addressed to your organization.

Click **Save** after editing text fields. Logo upload saves immediately when you choose a file.

### Expenses and Invoicing

**Expenses and Invoicing** covers mileage and expense categories:

- **Mileage rate (per mile)** — what a **Mileage** expense pays (miles × rate). Changing it affects new mileage only; saved expenses keep the rate they were entered with. Click **Save Rate** next to the field after editing.
- **Categories** — the list on the **Expenses** page. Built-ins (Software, Travel, Mileage, Meals, Supplies, Contractor, Advertising, Other) can be **renamed** or **Remove**d to hide from the picker (built-ins are deactivated, not deleted). **Mileage** cannot be removed. **Add** custom names and **Restore** inactive built-ins as needed.
- **Payment methods** — how expenses were paid (Personal Card, Company Card, Cash, ePayment, and custom). Same rename, remove, add, and restore behavior as categories (except Mileage rules apply only to categories).

### Client fields

**Client fields** adds your own sections and fields to every organization page, for example a profile or intake details. Type a name next to **Sections** and click **Add** to create a section, then **Add field** under it. A field has a name and a type: **Text**, **Long text**, **Number**, **Date**, **Single-select**, **Multi-select** or **Checkbox**. Select fields need at least one option; renaming an option keeps what was already picked. The type can't be changed after the field is added.

Use the ⋮ menu on a section or field to **Edit**, **Move up**, **Move down** or **Delete**. Deleting a field removes what was filled in on every organization; deleting a section also deletes its fields. **Filled in on** shows how many organizations have a value.

Edit a section and tick **Sensitive** to limit it: only admins and people assigned to the organization see and edit a sensitive section.

### Activity

**Activity** sets when **Activity → To do** flags things: **Needs reply after (days)** (default 2) is how long an email from outside waits for an answer before it is listed under Needs reply; **Gone quiet after (days)** (default 30) is how long an active client can go without contact before it is listed under Gone quiet. Click **Save**.

## Accounting (Admin only)

Under **Accounting** in the nav:

- **Chart of Accounts**
- **Journal**
- **Bank Import**
- **Accounting Reports**

Regular tenant users without Admin role do not see Accounting.

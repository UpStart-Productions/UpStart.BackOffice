# Admin: Users, Settings, Accounting

## Users (Admin only)

**Users** has **Users** and **Roles** tabs.

- **Add User** and sort/search on the Users tab
- **Roles** tab: what each role can see and do, per area. **View** is None, Own (only their own records, or clients they are assigned to) or All. Checkboxes set what they can do with what they see: **Create**, **Edit**, **Delete**, and **Setup** (Pipeline lanes and pipelines; Bookings booking types). Edit also covers actions like Make client, Archive, filing an email, or sending an invoice. Admins can do everything.
  - **Built-in roles** (marked with an amber open-box icon; hover it for details) every organization starts with. Edit them freely; once one has been changed, its menu offers **Reset to default**. They can't be deleted. The built-in roles are: **Manager** (everything, including Setup), **Team member** (CRM: see all, create and edit, no delete; their own projects, tasks, time and expenses), **Coordinator** (Inbox, Contacts, Pipeline, Bookings: create and edit, no delete; Clients: view and edit), **Bookkeeper** (Invoices and Reports; views Time, Expenses and Clients), **Contractor** (their own projects, tasks, time and expenses), **Guest** (only the task projects they are invited to).
  - **Add role** makes your own; those can be deleted once no one has them.
  - The **Can use** column shows one chip per area: the area name, **Own** when limited to their own records, and icons for Create (+), Edit (pencil), Delete (trash) and Setup (gear). Faded icons are not allowed; hover a chip for a plain-language summary of what that role can do there. A legend sits above the table.
  - Each role's menu shows how many people have it, e.g. **View 3 users**: their photo, name and email. A role with no one on it shows **No users yet**.
  - If someone's role doesn't allow an action, the button is hidden on Pipeline, Clients and Bookings; elsewhere they'll see "Your role can't … in this area".

Super users can impersonate a user from row actions (viewing as that user).

## Settings (Admin only)

**Settings** accordion sections include business profile, integrations (Asana, Google Calendar, email capture), service keys, and related tenant configuration. Expand a section to edit; save within each area.

## Accounting (Admin only)

Under **Accounting** in the nav:

- **Chart of Accounts**
- **Journal**
- **Bank Import**
- **Accounting Reports**

Regular tenant users without Admin role do not see Accounting.

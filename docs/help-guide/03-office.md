# Office (Clients, Projects, Tasks, Time, Expenses, Invoices)

## Clients

**Clients** lists the organizations you are working for (status Client). Active and Inactive show in the Status column. See the CRM guide for how clients, prospects and organizations relate.

## Projects

**Projects** lists billable work tied to clients. **New Project** creates one. Open a project to edit details, contacts, and tasks.

On a project, the **People** panel matches the client page: **Add existing person** or **Add new person**, then **Save** the project to sync details from People. Use **Open in People** on a row to edit someone. Legacy project-only contacts should be removed and re-added from People.

When the project is in **Task Manager**, a **Tasks** card appears above **Manual tasks**: up to five open tasks by due date; click a task name or **Open in Tasks** for the full project. **Manual tasks** are still the list used on timesheets (including Asana-synced names when configured).

## Tasks

**Tasks** opens Task Manager: my tasks, inbox, and projects. Tasks-only users live here exclusively. On a project, the **⋯** menu in the header includes **Project contacts** — the same client-side contact list as on the Projects page.

In a task’s detail panel, you can **edit** or **delete your own comment** for **1 hour** after you post it. **Admins** can **delete** anyone’s comment at any time (not edit others’ comments).

On a project task list, hover a row and use the **down arrow** (before the drag handle) to **move the task to another section** without dragging.

## Time

**Time** (Time entry) lists time entries. Add time from the list or related modals; tie entries to projects and tasks when applicable.

## Expenses

**Expenses** lists expenses. **New Expense** on the left; **Total** shows filtered total next to it; search on the far right.

**Mileage:** set **Category** to **Mileage** and the **Amount** field becomes **Miles**. The amount is miles times your organization's mileage rate (Settings → Business), shown under the field. A new mileage expense starts as **Reimbursable**. A saved mileage expense keeps the rate it was entered with, even if the rate changes later. If no rate is set yet, mileage can't be saved until an admin sets one.

## Invoices

**Invoices** lists invoices. **New Invoice** creates a draft. Open a row for detail; drafts open in edit mode. Overdue/due warnings may appear above the table.

### Bill to: a client or your organization

- **A client** — your organization bills a client. **Generate from time** pulls the client's uninvoiced *billable* time.
- **Our organization** — you bill your own organization for your work (for example, a contractor or caregiver submitting hours). **Generate from time** pulls *your own* uninvoiced time (billable or not) plus your uninvoiced **reimbursable** expenses, including mileage. Hours use your own hourly rate first, then the entry's or project's rate.

The two are tracked separately: the same hour can go on the client's invoice and on your invoice to your organization, but never on two invoices of the same kind. Saving a draft keeps its time and expenses attached; deleting a draft frees them up again.

### Export

**Export** (next to **New Invoice**) downloads a CSV of **Sent** and **Paid** invoices addressed to your organization with an issue date in the range you pick (defaults to last month). One row per invoice: invoice number, person, email, issue date, status, paid date, hours, time amount, reimbursements, other lines, tax and total. Use it for payroll or accounting. If your role only sees your own invoices, the export only includes yours.

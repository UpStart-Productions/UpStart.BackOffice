# Office (Clients, Projects, Tasks, Time, Expenses, Invoices, Forms)

## Clients

**Clients** lists the organizations you are working for (status Client). Active and Inactive show in the Status column. See the CRM guide for how clients, prospects and organizations relate.

## Projects

**Projects** lists billable work tied to clients. The list shows **active** projects only; turn on **Show inactive projects** above the table to include archived ones (your choice is remembered). Use the row **⋯** menu for **Make inactive** or **Make active**. **New Project** creates one. Open a project to edit details, contacts, and tasks.

Under **New expense defaults**, set **Reimbursable** and **Billable to client** for new expenses on that project. Picking the project on **New Expense** fills those toggles; you can still change them on each row.

On a project, the **People** panel matches the client page: **Add existing person** or **Add new person**, then **Save** the project to sync details from People. Use **Open in People** on a row to edit someone. Legacy project-only contacts should be removed and re-added from People.

When the project is in **Task Manager**, a **Tasks** card appears above **Manual tasks**: up to five open tasks by due date; click a task name or **Open in Tasks** for the full project. **Manual tasks** are still the list used on timesheets (including Asana-synced names when configured).

## Tasks

**Tasks** opens Task Manager: my tasks, inbox, and projects. Tasks-only users live here exclusively. On a project, the **⋯** menu in the header includes **Project contacts** — the same client-side contact list as on the Projects page.

In a task’s detail panel, you can **edit** or **delete your own comment** for **1 hour** after you post it. **Admins** can **delete** anyone’s comment at any time (not edit others’ comments).

On a project task list, hover a row and use the **down arrow** (before the drag handle) to **move the task to another section** without dragging.

## Time

**Time** (Time entry) lists time entries. Add time from the list or related modals; tie entries to projects and tasks when applicable.

## Expenses

**Expenses** shows expenses for a period. **New Expense** is at the top right.

- **Period**: Month, Quarter or Custom range, with the year and month or quarter (or From and To dates). It starts on this month.
- **Filters**: **Status**, **Client**, **Project**, **Person** (when more than one person has expenses in the period) and **Category**, plus search on the right (description, category, project, client, payment method, person or invoice number).
- **Totals** at the top, for the period and filters: **Total spent**, **Billable to clients** and **Reimbursable**. Billable and Reimbursable each have a small donut chart split by status, with each status and its amount listed beside it. Amber is Not billed / Not submitted, blue is Invoiced / Submitted, green is Client paid / Reimbursed. The list has a total row at the bottom.
- **Status** column:
  - Billable: **Not billed** → **Invoiced** (on a client invoice, draft or sent) → **Client paid** (that invoice is paid).
  - Reimbursable: **Not submitted** → **Submitted** (on the person's invoice to your organization) → **Reimbursed** (that invoice is paid).
  - An expense that is both shows both. The invoice number next to a status opens the invoice. Voiding an invoice puts its expenses back to Not billed or Not submitted.
- Click a row, or **Edit** in the row's ⋮ menu, to edit. **Delete** is in the ⋮ menu (it asks first).
- **On an invoice**: while an expense is on an invoice, its amount, category, project, Reimbursable and Billable can't change and it can't be deleted. Remove it from the invoice first (edit the draft).

**Billable** expenses are charged to the client at cost. They need a project for that client; billable expenses with no project can't go on a client invoice.

**Categories** and **payment method** use dropdowns (admins manage both lists under **Settings → Expenses and Invoicing**).

**Mileage:** choose the **Mileage** category and the **Amount** field becomes **Miles**. The amount is miles times your organization's mileage rate (**Settings → Expenses and Invoicing**), shown under the field. A new mileage expense starts as **Reimbursable** (even when the project default is off). Choosing a **Project** applies that project's **New expense defaults** to **Reimbursable** and **Billable to client** on a new expense. A saved mileage expense keeps the rate it was entered with, even if the rate changes later. If no rate is set yet, mileage can't be saved until an admin sets one.

## Invoices

**Invoices** lists invoices. **New Invoice** creates a draft. Open a row for detail; drafts open in edit mode. A sent or paid invoice opens a read-only summary with your business logo and bill-to details in the header. **View PDF** shows the stored PDF from when the invoice was sent; **Download PDF** saves that same file. Sent invoices cannot be edited. Overdue/due warnings may appear above the table.

### Bill to: a client or your organization

- **A client** — your organization bills a client. **Generate from time** pulls the client's uninvoiced *billable* time and its uninvoiced **billable** expenses (on that client's projects, at cost, one line each; mileage shows miles × rate).
- **Our organization** — you bill your own organization for your work (for example, a contractor or caregiver submitting hours). **Generate from time** pulls *your own* uninvoiced time (billable or not) plus your uninvoiced **reimbursable** expenses, including mileage. Hours use your own hourly rate first, then the entry's or project's rate.

The two are tracked separately: the same hour, or the same expense, can go on the client's invoice and on your invoice to your organization, but never on two invoices of the same kind. Saving a draft keeps its time and expenses attached; deleting a draft frees them up again. Voiding an invoice frees its expenses.

### Export

**Export** (next to **New Invoice**) downloads a CSV of **Sent** and **Paid** invoices addressed to your organization with an issue date in the range you pick (defaults to last month). One row per invoice: invoice number, person, email, issue date, status, paid date, hours, time amount, reimbursements, other lines, tax and total. Use it for payroll or accounting. If your role only sees your own invoices, the export only includes yours.

## Forms

**Forms** is the last item in the Office menu. Use it to build forms and share them with a link. See the Forms guide for how lists, links and submissions work.

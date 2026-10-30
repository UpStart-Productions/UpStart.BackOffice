# Care (module)

**Care** appears in the left menu only when the platform operator has switched the Care module on for your organization. It holds **Intake**, **Care profiles**, **Visits** and the **Schedule**. The Intake form and Care profile are forms your organization designs itself; each organization (client) has at most one copy of each, a living document you keep up to date.

## Who sees what

- The role needs the **Care** area (Users → Roles: Care **All**). **Setup** on Care lets someone change the forms and make public intake links.
- Each form has **Who can use it** (**Customize fields** on Care → Intake or Care → Care profiles): **None**, **Read** or **Edit** per role. Admins can always edit.
- People only see forms for organizations they can reach: the organizations assigned to them, unless their role has **Organizations: All**.

## Intake

**Care → Intake** lists every organization's intake form. **New intake** picks an organization and starts its form. The **Waiting for review** tab (with a count, also on the menu) lists intakes sent through a public intake link. Open one to read it, then:

- **Accept** → **New organization**: creates a Prospect organization with that name, a pipeline card, and the person who sent it as its person. **Existing organization**: attaches the intake to an organization you pick (it can't already have an intake form).
- **Dismiss** (⋮ menu): deletes it.

Only people whose role can **Edit** the Intake form and reach every organization see Waiting for review and get notified about new ones.

## Care profiles

**Care → Care profiles** lists every organization's care profile. **New care profile** picks an organization and starts one.

## A form (record) page

Shows the organization's answers grouped by section. Change answers and click **Save** at the top. **Open organization** goes to the organization. The ⋮ menu has **Delete**. The side panel shows who sent it (public intakes), the last change made through a link, and **Share link**.

The organization page has a **Care** card listing its forms: open one, or **Start** a form that doesn't exist yet.

Public intake links can also go on your website: the link's ⋮ menu → **Embed on a website** gives a one-line embed code and **Allowed websites** (see Forms → Putting a form on a website).

## Share links (one organization's form)

On a form page, **Share link → New link** makes a link to that organization's form for someone outside, such as family:

- **Check before opening**: **No check** (anyone with the link), **Passcode** (you share it separately, by phone or text), or **Emailed code** (a 6-digit code goes to the address you enter, and must be typed in before the form opens).
- **Expires after (days)**: 30 by default; empty means never.
- Changes made through the link save straight to the form. People who can edit the form and reach that organization get a notification (bell, and email unless turned off under Inbox → Notification settings).
- Use the link's ⋮ menu to **Copy link**, **Open** or **Revoke** it. A revoked link stops working right away.

## Customize fields (setup)

On **Care → Intake** and **Care → Care profiles**, people whose role has Care **Setup** see **Customize fields**. It opens that form's setup, where you can:

- Change its **Name** and **Description** (shown at the top of public links), and **Who can use it**. Click **Save** at the top for these.
- **Fields**: add a section, then **Add field** with a name, a type (Text, Long text, Number, Date, Single-select, Multi-select, Checkbox) and **Required** (required on public links; staff can save with it empty). The type can't be changed later. Drag a field by its ☰ handle to reorder it. The ⋮ menus edit or delete fields, and edit, move up or down, or delete sections. Deleting a field removes its answers from every record. Each field shows its type, whether it's required and its choices. Field changes save right away.
- **Form files** (⋮ menu at the top): **Export form file** downloads the form's sections and fields; **Import form file** adds a file's sections and fields after the form's own (nothing already there changes). Use them to copy a setup to another UBO, for example from a test site to your live one. Files from Forms work too; any scoring in them is dropped.
- **Public intake links** (Intake form only): links anyone can use to send a new intake, for example from your website. Same checks as share links; with **Emailed code**, the person enters their own email and gets a code. New-intake links don't expire unless you set days.

A Care form starts with no fields. Until it has some, opening an intake or care profile says so; people with Care **Setup** get a **Customize fields** button there.

## Public form page

People opening a link see your organization's name and the form. New intakes ask for their name and email (phone optional). Links that are revoked or expired say so. Too many attempts or submissions from one place are slowed down.

## Visits

**Care → Visits** lists visits for the period you pick, filtered by worker and organization. Roles need **Visits**: Own (only your own visits) or All (everyone's at the organizations you reach).

- **Start visit**: pick the organization; the visit starts now and opens. A banner on Visits links back to a visit in progress.
- **End visit** (on the visit page): saves the visit log and notes, sets the end to now and adds the hours to the worker's timesheet (no project, billable), so they invoice like any other time.
- **Log past visit**: a visit that already happened (date, start, end; and the worker if your role sees everyone).
- On a visit's page, change times, the visit log or notes and click **Save**; the time entry follows. An end earlier than the start counts as the next day. Once its time is on an invoice, times are locked and the visit can't be deleted. The ⋮ menu has **Delete** (also deletes its time entry).
- **Customize fields** (Care setup) sets the **visit log** checklist filled in on every visit (for example meals, activities, mood). It has no per-role access or links: Visits access decides who uses it.

## Schedule

**Care → Schedule** shows a week of shifts (arrows and **This week** to move), filtered by worker and organization. Roles need **Schedule**: Own (only your own shifts; you can only plan your own) or All.

- **Add shift**: organization, worker (empty = **open shift**), date, start and end, notes. **Repeat weekly** repeats on the days you pick at the same local time, until a date or with no end. A warning shows when the worker already has a shift at that time. The worker gets a notification (bell, and email unless turned off).
- A shift's ⋮ menu: **Edit** (that shift only), **Cancel shift** / **Restore shift**, **Delete**, **Delete this and following** (repeating shifts; shifts with a visit stay), **Start visit** (your own scheduled shift) and **Open visit**.
- Tags show **Open**, **Cancelled**, **Visit in progress** and **Visited**.

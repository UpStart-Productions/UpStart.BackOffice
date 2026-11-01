# Care (module)

**Care** appears in the left menu only when the platform operator has switched the Care module on for your organization. It holds **Intake**, **Clients** (the clients in care), **Visits** and the **Schedule**. The Intake form and Care profile are forms your organization designs itself; each organization (client) has at most one copy of each, a living document you keep up to date.

## Who sees what

- The role needs the **Care** area (Users → Roles: Care **All**). **Setup** on Care lets someone change the forms and make public intake links.
- Each form has **Who can use it** (when customizing the form): **None**, **Read** or **Edit** per role. Admins can always edit.
- People only see forms for organizations they can reach: the organizations assigned to them, unless their role has **Organizations: All**.

## Clients in care

Care is opt in per client. A client that isn't in care (for example one you only do other work for) has no Care tab and doesn't appear in Care lists.

- **Add to care**: on a client's page (organizations with status Client) or on **Care → Clients**. Needs **Edit** on the Care profile. Starting an intake or care profile for an organization, or accepting an intake into one, also puts it in care.
- **Care status**: **Active**, **Paused** or **Ended**, changed on the client's Care tab. **Not in care** takes the client out (the Care tab goes away); their forms, visits and shifts are kept.
- **Care → Clients** lists the clients in care: **Current** (Active and Paused) and **Ended**, with the care profile (started or not), the next shift and the last visit. Click a client to open their Care tab. **Customize care profile** (Care setup) changes the Care profile form.

## A client's Care tab

Clients in care get **Details** and **Care** tabs on their page. The Care tab brings the client's care together:

- **Care** card: status, next shift, last visit and hours this month.
- **Forms**: the Intake form and Care profile (**Open**, or **Start** one that's missing).
- **Visits**: the most recent visits, with **Start visit** and **Log past visit**. **View all** opens Care → Visits filtered to this client.
- **Schedule**: shifts in the next two weeks, with **Add shift**. **View all** opens Care → Schedule filtered to this client.

Each part shows only what the role allows: forms need access to that form, visits need **Visits**, shifts need **Schedule**. Someone with Visits or Schedule **Own** sees only their own visits or shifts. People see the Care tab only for clients they can reach (assigned to them unless their role has **Organizations: All**).

## Intake

**Care → Intake** lists every organization's intake form. **New intake** picks an organization and starts its form. The **Waiting for review** tab (with a count, also on the menu) lists intakes sent through a public intake link. Open one to read it, then:

- **Accept** → **New organization**: creates a Prospect organization with that name, a pipeline card, and the person who sent it as its person. **Existing organization**: attaches the intake to an organization you pick (it can't already have an intake form).
- **Dismiss** (⋮ menu): deletes it.

Only people whose role can **Edit** the Intake form and reach every organization see Waiting for review and get notified about new ones.

## Care profiles

A client's care profile opens from their Care tab (**Forms**). **Start** begins one when it's missing.

## A form (record) page

Shows the organization's answers grouped by section. Change answers and click **Save** at the top. **Open organization** goes to the organization. The ⋮ menu has **Change organization** (moves it, with its share links, to another organization that doesn't have this form yet) and **Delete** (removes this organization's copy and its answers; the form itself stays). The side panel shows who sent it (public intakes), the last change made through a link, and **Share link**.

Each client in care gets its own copy of the Intake form and the Care profile, started from their Care tab, from **New intake** or by accepting an intake.

Public intake links can also go on your website: the link's ⋮ menu → **Embed on a website** gives a one-line embed code and **Allowed websites** (see Forms → Putting a form on a website).

## Share links (one organization's form)

On a form page, **Share link → New link** makes a link to that organization's form for someone outside, such as family:

- **Check before opening**: **No check** (anyone with the link), **Passcode** (you share it separately, by phone or text), or **Emailed code** (a 6-digit code goes to the address you enter, and must be typed in before the form opens).
- **Expires after (days)**: 30 by default; empty means never.
- Changes made through the link save straight to the form. People who can edit the form and reach that organization get a notification (bell, and email unless turned off under Inbox → Notification settings).
- Use the link's ⋮ menu to **Copy link**, **Open** or **Revoke** it. A revoked link stops working right away.

## Customize form (setup)

On **Care → Intake** (**Customize form**) and **Care → Clients** (**Customize care profile**), people whose role has Care **Setup** can change the form. It opens that form's workspace, like a form in Forms: the main menu shrinks to icons and a second column lists the form's **Sections** (drag to reorder, **+** to add), then **Settings**, **Who can use it** and, on the Intake form, **Links**. Starting a new intake or care profile while the form has no fields brings you here first. There you can:

- **Settings**: its **Name** and **Description** (formatted text, shown at the top of public links). **Who can use it**: the access per role. Click **Save** at the top for these.
- **A section**: **Add text** adds a text block (formatted text people read, not a question). **Add field** with a name, a type (Text, Long text, Number, Date, Single-select, Multi-select, Checkbox) and **Required** (required on public links; staff can save with it empty). The type can't be changed later. Drag a field by its ☰ handle to reorder it. The ⋮ menus edit or delete fields, and edit, move up or down, or delete sections. Deleting a field removes its answers from every record. Each field shows its type, whether it's required and its choices. Field changes save right away.
- **Form files** (⋮ menu at the top): **Export form file** downloads the form's sections and fields; **Import form file** adds a file's sections and fields after the form's own (nothing already there changes). Use them to copy a setup to another UBO, for example from a test site to your live one. Files from Forms work too; any scoring in them is dropped.
- **Links** (Intake form only): public intake links anyone can use to send a new intake, for example from your website. Same checks as share links; with **Emailed code**, the person enters their own email and gets a code. New-intake links don't expire unless you set days.

A Care form starts with no fields. Until it has some, opening an intake or care profile says so; people with Care **Setup** get a **Customize form** button there.

## Public form page

People opening a link see your organization's name and the form. New intakes ask for their name and email (phone optional). Links that are revoked or expired say so. Too many attempts or submissions from one place are slowed down.

## Visits

**Care → Visits** lists visits for the period you pick, filtered by worker and organization. Roles need **Visits**: Own (only your own visits) or All (everyone's at the organizations you reach).

- **Start visit**: pick the organization; the visit starts now and opens. A banner on Visits links back to a visit in progress.
- **End visit** (on the visit page): saves the visit log and notes, sets the end to now and adds the hours to the worker's timesheet (no project, billable), so they invoice like any other time.
- **Log past visit**: a visit that already happened (date, start, end; and the worker if your role sees everyone).
- On a visit's page, change times, the visit log or notes and click **Save**; the time entry follows. An end earlier than the start counts as the next day. Once its time is on an invoice, times are locked and the visit can't be deleted. The ⋮ menu has **Delete** (also deletes its time entry).
- **Customize form** (Care setup) sets the **visit log** checklist filled in on every visit (for example meals, activities, mood). It has no per-role access or links: Visits access decides who uses it.

## Schedule

**Care → Schedule** shows a week of shifts (arrows and **This week** to move), filtered by worker and organization. Roles need **Schedule**: Own (only your own shifts; you can only plan your own) or All.

- **Add shift**: organization, worker (empty = **open shift**), date, start and end, notes. **Repeat weekly** repeats on the days you pick at the same local time, until a date or with no end. A warning shows when the worker already has a shift at that time. The worker gets a notification (bell, and email unless turned off).
- A shift's ⋮ menu: **Edit** (that shift only), **Cancel shift** / **Restore shift**, **Delete**, **Delete this and following** (repeating shifts; shifts with a visit stay), **Start visit** (your own scheduled shift) and **Open visit**.
- Tags show **Open**, **Cancelled**, **Visit in progress** and **Visited**.

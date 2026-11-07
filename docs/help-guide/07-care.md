# Care (module)

The Care module is switched on per organization by the platform operator. It doesn't have its own menu section. When it's on, care features appear where they belong:

- A **Care** tab on the page of each client in care (status, visits and schedule).
- **Schedule** in the Office menu, for planning everyone's shifts across clients.
- **My shifts** on the Dashboard, for caregivers.
- The **Scheduled vs actual** tab and a **Time** filter (visit time) in Reports.
- **Use as the visit checklist** in a form's Settings (Forms).

Forms about clients are ordinary **client forms** in **Forms** (see the Forms guide), so you can have as many as you need and name them anything.

## Who sees what

- **Care** area (Users → Roles): see a client's care status. **Setup** adds clients to care and changes their status.
- **Visits**: Own (only your own visits) or All (everyone's at the clients you reach).
- **Schedule**: Own (only your own shifts; you can only plan your own) or All.
- Admins and Members see every client. Guests see only the clients assigned to them, including the Care tab for those clients.

## Adding a client to care

Care is opt in per client. A client you only do other work for (training, consulting) is never in care and has no Care tab.

- **Add to care** is a button on the page of an organization with status Client, for roles with Care **Setup**. The page then gets **Details** and **Care** tabs.
- **Care status** on the Care tab: **Active**, **Paused** or **Ended**. **Not in care** takes the client out: the Care tab goes away, and their visits and shifts are kept.

## A client's Care tab

- **Care** card: status, next shift, last visit and hours this month.
- **Visits**: the most recent visits (**Show all** for every one), with **Start visit** (starts now and opens the visit) and **Log past visit** (date, start and end; and the worker, if your role sees everyone).
- **Schedule**: the client's shifts in the next two weeks. **Add shift** and **View all** open **Office → Schedule** filtered to this client.

The client's forms (intake, profile and so on) are in the **Forms** panel on the **Details** tab.

Each part shows only what the role allows: visits need **Visits**, shifts need **Schedule**. Someone with Own sees only their own visits or shifts.

## Visits

A visit's page has the time, the **visit checklist** and notes.

- **End visit**: sets the end to now and adds the hours to the worker's timesheet (no project, billable), so they invoice like any other time.
- Times, the checklist and notes save as you change them; the time entry follows. An end earlier than the start counts as the next day. Once its time is on an invoice, times are locked and the visit can't be deleted. The ⋮ menu has **Delete** (also deletes its time entry).
- **Open client** goes to the client's Care tab.

**Visit checklist**: a form in Forms with **Use as the visit checklist** turned on (Settings) is filled in on every visit, for example meals, medication reminder, mood and activities. One form at a time. With none set, visits have just the times and notes.

## Schedule

**Office → Schedule** shows a week of shifts in **seven columns** (Monday through Sunday). Use **‹** and **›**, the **calendar** button, and **Return to this week** to move around. Filter by worker and client.

- **Add shift** (header or under a day): client, worker (empty = **open shift**), date, start and end, notes. Choosing **Add shift** under a day sets that date in the form. **Repeat weekly** repeats on the days you pick at the same local time, until a date or with no end. A warning shows when the worker already has a shift at that time. The worker gets a notification (bell, and email unless turned off).
- A shift's ⋮ menu: **Edit** (that shift only), **Cancel shift** / **Restore shift**, **Delete**, **Delete this and following** (repeating shifts; shifts with a visit stay), **Start visit** (your own scheduled shift) and **Open visit**.
- Tags show **Open**, **Cancelled**, **Visit in progress** and **Visited**.
- A client's name opens their Care tab.

## Dashboard: My shifts

Caregivers (roles with Schedule) see **My shifts**: their shifts for the next week. **Start visit** shows on today's shifts and starts the visit for that shift; **Open visit** once it's started. The client's name opens their Care tab.

## Reports

- **Time** filter (Reports, when Care is on): **All time**, **Visit time** (only time from visits) or **Other time**.
- **Scheduled vs actual** tab: per worker and client, hours on scheduled shifts against hours on finished visits, the difference, **missed shifts** (ended with no visit) and **visits with no shift** behind them, with totals.

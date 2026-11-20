# Schedule

The Schedule is part of every organization. It plans **visits**: a team member going to a client at a time, for one kind of work. Visits can be anything your organization does: care shifts, service calls, check-ins, inspections.

The words used here:

- **Client**: who the visit is for.
- **Team member**: who does the visit.
- **Visit**: one scheduled time at a client.
- **Visit type**: what kind of visit it is (your own list).
- **Form**: a checklist or assessment filled in on the visit.

## Visit types

Admins keep the list in **Settings → Pick lists → Visits → Visit types**: **Add** a type (for example **Care shift**, **Care manager visit**, **Service call**). The eye button hides a type so it can't be picked for new visits; its visits stay. A type nobody has used yet can be deleted.

## Forms on visits

A form is filled in on visits by attaching it to visit types, in **Forms**: open a form, **Settings → Where submissions go**, turn on **Save submissions to a client's record**, then turn on the visit types under **Fill it in on every visit of these types**. A visit type can have several forms, and a form can be on several visit types.

Each submission belongs to the visit's client and shows on the client's **Records** tab.

## Schedule

**Office → Schedule** has two views:

- **Week**: one client or one team member by the hour, Monday through Sunday. Pick a client or team member first. Drag across empty hours to add a visit at that time; drag a planned visit to move it, or its top or bottom edge to change its times.
- **Month**: everyone's visits, one bar each. Click a bar or **+N more** to see the day; click elsewhere in a day to open that week.

Use **‹** and **›** and the calendar to move around. Filter by **Team member** and **Client**.

- **Add visit**: client, **visit type**, team member (empty = **Unassigned**), date, start and end, notes. **Repeat weekly** repeats on the days you pick at the same local time, until a date or with no end. A warning shows when the team member already has a visit at that time. The team member gets a notification (bell, and email unless turned off).
- A visit's ⋮ menu: **Open visit**, **Edit** (that visit only), **Cancel visit** / **Restore visit**, **Delete**, **Delete this and following** (repeating visits; visits already started stay).
- Tags show **Cancelled**, **In progress** and **Done**.

## A visit log

**Open visit** (from the Schedule, the Dashboard, a client's Visits or Records tab, or search) opens the visit log: what actually happened on the visit. Its title reads like "Caregiver visit log for Alliance Services on Mon, Nov 16, 7:00 AM". The log never changes the schedule.

- **Forms**: the forms of its visit type, filled in right in the log. Check **Mark submitted** when one is done; **Save** saves the answers (and submits the checked forms). A submitted form is read-only until you **Reopen** it.
- **Actual time**: starts out as the planned times. Change them to what really happened; with a start and end the visit is done and the hours go to the team member's timesheet (no project, billable), so they invoice like any other time. An end earlier than the start counts as the next day. Once its time is on an invoice, times are locked.
- **Notes** take formatting (bold, lists, links).
- **Save** keeps your changes; **Cancel** throws them away.
- The team member on the visit and admins fill in the log. Cancelling or deleting a visit is done on the Schedule.

## A client's Visits and Records tabs

Every account page has **Details**, **Visits** (roles with Schedule) and **Records** tabs.

- **Visits**: a card for each past visit, newest first, with the team member's picture: date, visit type, team member, times, status (**Done**, **In progress** or **Missed**, a planned visit that ended without being started) and the forms of its visit type. Each form shows **Submitted**, **In progress** or **Not filled in**. **Schedule** on the side is a month calendar: days with visits are tinted; click one to see that day's visits and open one. **Expand** opens the full Week/Month schedule over the page, for this client only: add, move, edit and cancel visits there, then close it to come back to the client. Cancelled visits aren't listed.
- **Records**: every form submitted for the account: client forms (intake, profile and the like), forms filled in on visits (with the visit, its type and team member) and attached public submissions, each **In progress** or **Submitted**. Show **All**, **Visit forms** or **Client forms**. **Add form** adds a client form. A visit's form is the same record on both tabs.

Emails, notes and conversations stay in **Activity** on the Details tab.

## Who sees what

- **Schedule** (Users → Roles): **Own** sees only your own visits (you can only plan your own) and **All** sees everyone's at the clients you reach.
- **Changing the plan** (Edit, dragging, Cancel visit, Delete) is for admins and whoever put the visit on the schedule. A visit someone else scheduled for you is read-only on the Schedule; you fill in its log.
- The team member on a visit can fill in its forms and see them on the client's Records tab, whatever the form's role settings.

## Dashboard: My visits

Roles with Schedule see **My visits**: their visits for the next week, each with **Open visit** (its log).

## Reports

- **Time** filter: **All time**, **Visit time** (only time from finished visits) or **Other time**.
- **Scheduled vs actual** tab: per team member and client, planned visit hours against hours worked, the difference and **missed visits** (planned visits that ended without being started), with totals.

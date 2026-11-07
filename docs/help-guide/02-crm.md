# CRM (Activity, Pipeline, Organizations, People, Bookings)

How the pieces fit:

- **Organizations** are clients, partners and other organizations you have added (not every pipeline opportunity).
- **People** are every person. A person can belong to one or more organizations, or none.
- **Pipeline** holds opportunities: organizations you are trying to win. Current clients are not on it.
- **Clients** (under **Office**) is the working list of organizations you are doing work for. It is the same records as Organizations, limited to clients.
- **Activity** opens on **All activity** (every email, call, meeting and note) and has **To do** for what needs attention. Unfiled email is a queue on **To do**. **Bookings** are appointments people booked.

Everything about one organization (people, emails, files, pipeline cards, projects) lives on that organization's page. Clicking an organization from Clients or Organizations opens the same page.

## Status and tags

Every organization has a **Status**: **Client** or **Partner / other**.

- Pipeline cards are opportunities only. Saving a card does **not** add an organization to your list.
- **Make client** on a card creates (or links) the organization as a **Client**, copies people onto it, and removes the card from the board because the opportunity is won.
- **Make partner** on a card creates the organization with the **Partner** tag and removes the card from the board.
- When status is **Client**, **Active** or **Inactive** on the Office → **Clients** list says whether you are still working together; projects and history stay either way.
- Client turns on projects, time and invoices.

**Tags** say what an organization or person is to you: Partner, Vendor, Referral source, or anything you type. Organizations and people share the same tags. Press Enter in the Tags field to add one. Tags are set by hand; nothing changes them automatically. A partner can also be a client.

## Organizations

**Organizations** (CRM menu) lists organizations you have added. Filter with the **type** dropdown (**Any Type**, Clients, Partner / other) and the tag list (for example **Partner**). The row menu has **Make client**, **Edit** and **Delete**.

**New Organization** (with a **⋮** menu attached) adds a record as **Partner / other**, or choose **Import organizations** to upload a CSV or Excel file — preview the first 10 rows, then import. Column headers are matched automatically (name, email, phone, website, address, and similar labels). Rows with a name that already exists are skipped; a **Status** column can mark rows as **Client** (otherwise they import as Partner / other). Import does not add CRM tags — set those on the record later. Use **Make client** on the organization when they become a client. For someone you are still trying to win, use **Pipeline → New Lead** instead.

On an organization's page, **Save** is at the top right with a **⋮** menu attached to it: **Make client** (for a partner or other organization), **Add to care** (Care module, clients not yet in care) and **Add to pipeline** when your role allows (same flow as invoices: pick a pipeline, first lane, one card per pipeline, Pipeline notifications). After name comes **address**, **city**, **state** and **zip**, then **Phone** and **Email** on one row and **Website** and **LinkedIn Profile** on the next. Then **Notes**, **Invoice Code** (clients only), **Services**, **Products**, **Status** (existing records), **Focus areas** and **Tags** side by side. Projects (clients), People, **Public Settings** on the right (**Public listing** for partner or network listings; for clients, **Client portal enabled** and the portal link), Activity and Files. Set the organization's **next action** on **Activity** (pick the organization at the top) or when logging activity below (**Set the next action**). **Add new person** on the People panel opens a dialog where you can create someone new or link an existing person from Back Office without leaving the page. Each linked person shows name (link to their People profile), role or title, and email; the red trash control on the right **Remove from organization** (they stay in People). Your own staff show on the People panel too, tagged **Team** (or **Guest** for outside collaborators). Pick a staff member in **Add existing person** to assign them to the organization; with Clients set to Own, that is what lets them reach it. Everyone on the organization's projects is also listed, with the projects they are on; remove them from the project instead.

**Activity** lists emails, calls, meetings and notes. **Search** and the **filters** control (sliders icon) match **Activity → All activity**: open filters for **Logged by**, **From** and **To** dates, and **Type** (All, Emails, Calls, Meetings, Notes). **Include people's activity** appears when the timeline is for an organization (on by default): it also shows calls, meetings and notes logged on this organization's people that aren't filed to any organization; those are labelled "From [name]'s activity". Below that, the quick log logs a **Note**, **Call** or **Meeting** in one line: pick the type, type what happened, **Log it**. Type **@** to mention a teammate or one of the organization's people (the full form takes @ too). Everyone mentioned is added to who was involved, and mentioned teammates get a notification. Tick **Set the next action** to set the organization's next action at the same time (same picker as Pipeline **Next Action**). **More details…** opens the full form (pick the type at the top of the dialog). An email filed to another organization never shows here, even if one of this organization's people was on it. Email threads show their newest message with "earlier messages in this thread" to expand. On a call, **Who called** is We called, They called, or Internal. The activity shows the caller, then an arrow, then who was called. On a meeting, **Where** is the place or link, such as Zoom or their office. **Notes / next steps** is a formatted note: bold, lists, and links. **Who was involved** lists **Our team** and that organization's people, so you can record who on your side talked with whom. Search and type apply together to the list. The menu on an entry can Forward it (email the people you pick, and notify teammates), Create task (pick a task project, section, title, and who it is assigned to), or Delete it after you confirm. Emails appear when the capture address is CC'd on the thread. The same panel is on a pipeline card. On a person's page, Activity uses the same search and filters (without **Include people's activity**); it shows everything that person took part in, and you can log on the person. It is filed to their organization when they belong to exactly one; otherwise it stays on the person and shows on each of their organizations with **Include people's activity** on.

## Clients

**Clients** (Office menu) shows organizations with status Client. The **Status** column is Active or Inactive. **New Client** adds an organization as a client straight away. Open opportunities stay on the Pipeline until you **Make client**.

## People

**People** lists every person, with their organizations and tags. Search matches name, email, linked organization name, and that organization's **Services** or **Products** (so you can find contacts through what their org offers). The row menu has **Delete** when your role allows it. Filter by tag with the tag list. **New Person** (with a **⋮** menu attached) adds someone one at a time, or choose **Import people** to upload a CSV or Excel file — you see a preview of the first 10 rows, then import. Column headers are matched automatically (name, email, organization, phone, and similar labels). The first sheet is used for Excel files. Rows with an email already in People are skipped. Missing organizations are created as **Partner / other** with no tags, then people are linked. **Needs review** in the **⋮** menu lists people created automatically from email (the badge shows how many are waiting); the People menu item in the nav shows the same count. **New Person** asks for first and last name, their email, phone, title, LinkedIn and personal URL (optional photo), and optionally an organization (with their role there) and tags. In the **Organization** list, **New organization** adds name, email and website for a stub organization and links this person to it. **Role** is how they relate to that organization, such as board member, case manager, or family. **Title** is their job, and it stays the same if they belong to more than one organization.

On a person's page: name, email, title, phone, LinkedIn and personal URL, **Tags**, notes, and Activity. To delete someone, use **Delete** on their row on the **People** list (when your role allows). On the right: a photo (drag or click to add one; the trash can on the photo removes it), **Email addresses** for any extra addresses (mail from any of them is matched to this person; the primary address cannot be removed), and **Organizations** (link or unlink, with a role). A person with no organization (an individual client) can become a client with **Make client from this person**.

## Pipeline

The **Pipeline** holds opportunity cards and **invoice workflow** cards. Opportunities are organizations you are trying to win; invoice cards link to a sent invoice and open that invoice when you click them. People move cards through lanes by hand (no automation when a card enters a lane).

Opportunities only: people move through lanes as conversations happen, sometimes over months. There are no won or lost lanes: when someone signs on, use **Make client** (the card leaves the board with its history kept on the organization). When a card is going nowhere, **Delete** it from the card menu.

Each opportunity card is its own record: organization name and contact details on the card, people on the **People** panel (real records in **People**). Invoice cards show the invoice number, client, status and total; drag them like any other card. **New Lead** opens the full card immediately (People included) and adds it to the first lane; enter the organization name and **Save**. Link an existing organization with **Open organization** after **Make client** or by promoting the card. Drag cards between lanes; lanes track the conversation and do not change status. A current client can get a new card later for another piece of work.

Each card leads with the **next step**: what you plan to do next and its due date, then how long since the last contact ("Contacted 12 days ago", or "No contact"). A red warning icon next to the card's menu means the next step is overdue; hover it for the date. The card menu's **View people** lists everyone at the card's organization with role, email and phone.

**Lanes on the board:**
- **Edit Lanes** at the end of the board opens a dialog to add a lane, remove lanes (when your role allows), or **Show** lanes you hid for yourself.
- **Hide lane** (closed-eye icon on a lane): hides that column on **your** board only; your choice is remembered. At least one lane stays visible.
- **Rename**: click a lane's name, type, press Enter (Esc cancels).
- **Reorder**: drag a lane by its header.
- **Remove** (in Edit Lanes): if the lane has cards, choose a lane to move them to. A pipeline always keeps at least one lane.

**Pipelines:** when your role allows setup, the **⋮** menu beside **New Lead** (top right) has **New pipeline**, **Rename pipeline** and **Delete pipeline** (only an empty pipeline can be deleted). With more than one pipeline, pick which one to view from the list in the toolbar. A second pipeline can track partners you are recruiting.

On a card's page, the main form is the **organization** (name, email, phone, website, category, service interest, next action, and dates). On the right, **Primary Contact** and **Warm Connect** are separate panels — pick or add a person in each. Person details are on the person record when you add or open them. **Category** and **Next action** are preset lists; you can type a new value and it is saved for next time. **Lane** changes the card's lane. After **Make client** or **Make partner**, **Open organization** beside the title goes to that record. **Save** is at the top right and turns on once something has changed. The **⋮** menu attached to it has **Make client**, **Make partner** and **Delete** (Delete asks first).

## Bookings

**Bookings** is a module: it only appears when it is switched on for your organization. **Bookings** manages appointment types and bookings. A booking creates or updates a pipeline card; the guest is tracked on that card and in **People**. Each booking type's **Pipeline lane** says which lane new cards go into (blank means the first lane). A card that is still in its pipeline's first lane moves to that lane when the person books; cards further along stay put. Booking types (the **Booking types** tab) are visible to roles with Bookings **Setup**. Each booking type has **Send guest confirmation email** (on by default): Back Office emails the guest a confirmation with a calendar file. Turn it off only when your website sends its own confirmation; the host still gets the new-booking email.

## Activity

**Activity** in the menu (it replaced Inbox) has two tabs: **All activity** first, then **To do**. The number on the menu item is your To do count (Needs reply, next steps overdue or due today, and Unfiled).

**To do** has four queues; click one to list it:

- **Needs reply**: the latest email on a thread came from outside and nobody has answered for 2 or more days.
- **Next steps**: every next step that is set, on organizations and pipeline cards, soonest first. Overdue ones have a red **Overdue** tag; due today has a **Due today** tag. Organizations without a next step are not listed (they don't need one).
- **Gone quiet**: active clients nobody has contacted in 30 or more days.
- **Unfiled**: captured email that could not be matched. **File…** one to an **Organization** or a **Pipeline card**; leave "Link the people on this email to the organization" on so their next email files itself.
- **Form submissions** (roles with Forms): how many submissions are waiting for review across your forms. Click it to open Forms.

**Mine** shows rows on threads you are on and next steps you own (or that have no owner); **Everyone's** shows all. Unfiled is the same for everyone. The ⋮ menu on a row: **Open timeline**, **Work on it** (shows that organization on this page with its next step), **Open pipeline card**, **No reply needed**, or **Snooze** (3 days, 1 week or 30 days). Admins change the 2 and 30 days in **Settings → Activity**.

**All activity** is every email, call, meeting and note, newest first, with the organization each belongs to. The search bar and **filters** control (sliders icon) are at the top of **All activity**; open filters for **Logged by** (which teammate saved the item—hover the **?**), **From** and **To** dates, and **type**. With an organization selected, filters also include **Include people's activity**. **Person** at the top of the page filters by a CRM contact on the thread, not the same as **Logged by**.

Pick an **Organization** or **Person** to the right of the page title to narrow both tabs to them. When an organization is selected, **Person** only lists people linked to that organization. With an organization selected, the same Activity search, filters and quick log as on **All activity** sit below those controls. Panels on the right then show, for an organization, its **Next action**, **Details** (status, tags, phone, email, website, address, last contact, notes) and **People** (view only; add or remove people on the organization's page); for a person, their **Details** and **Organizations**, each with its next step. The quick log files to that organization or person. Click the name in Details to open their page.

## Next step

Every organization can have one **next action**: what happens next, when, and who owns it. Set it on **Activity** (pick the organization at the top, or **Work on it** from **To do**), or tick **Set the next action** when logging on the organization's **Activity** panel (same searchable list as Pipeline **Next Action**). **Done** records "Done: …" on the timeline, clears it, and asks for the next one. Every next action that is set shows on **Activity → To do → Next steps**, with overdue ones tagged.

## Network and Partners

The old **Network** page is gone. Everyone who was in it is tagged **Network** (people you've talked to about something), both the people and their organizations. Open **People** and pick **Network** in the tag list, or do the same on **Organizations**.

**Partner** is a different tag: someone who does work for you or works with you. Network contacts are not partners unless you tag them so.

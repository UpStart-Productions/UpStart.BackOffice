# CRM (Activity, Pipeline, Organizations, People, Bookings)

How the pieces fit:

- **Organizations** are every organization you deal with: prospects, clients, partners and anyone else.
- **People** are every person. A person can belong to one or more organizations, or none.
- **Pipeline** holds opportunities: organizations you are trying to win. Current clients are not on it.
- **Clients** (under **Office**) is the working list of organizations you are doing work for. It is the same records as Organizations, limited to clients.
- **Activity** is what needs attention (**To do**) and every email, call, meeting and note (**All activity**). Unfiled email is a queue there. **Bookings** are appointments people booked.

Everything about one organization (people, emails, files, pipeline cards, projects) lives on that organization's page. Clicking an organization from Clients or Organizations opens the same page.

## Status and tags

Every organization has a **Status**: Prospect, Client or Other.

- A pipeline card makes its organization a **Prospect** automatically.
- **Make client** (on a pipeline card or an organization) makes it a **Client**, and any open pipeline card for it is archived, because the opportunity is won.
- When status is **Client**, **Active** or **Inactive** says whether you are still working together. Set Inactive on the organization page when the work ends; projects and history stay.
- **Other** is anyone not in a sales relationship, such as a partner or vendor.
- Client turns on projects, time and invoices.

**Tags** say what an organization or person is to you: Partner, Vendor, Referral source, or anything you type. Organizations and people share the same tags. Press Enter in the Tags field to add one. Tags are set by hand; nothing changes them automatically. A partner can also be a client.

## Organizations

**Organizations** (CRM menu) lists every organization. Filter with the **type** dropdown (**Any Type**, Prospects, Clients, Other) and the tag list (for example **Partner**). The row menu has **Make client**, **Edit** and **Delete**.

**New Organization** asks for a **Type**:

- **Prospect** also adds a card to the first lane of the pipeline.
- **Client** turns on projects, time and invoices.
- **Partner** adds the Partner tag and stays off the pipeline.

On an organization's page: Status (Prospect, Client, or Other), Active or Inactive when status is Client, Tags, Invoice Code (prepended to invoice numbers, only needed once you invoice), contact details, Notes, the Client portal link, Projects, People, Activity and Files. **Add new person** on the People panel opens a dialog where you can create someone new or link an existing person from Back Office without leaving the page. Each linked person shows name (link to their People profile), role or title, and email; the red trash control on the right **Remove from organization** (they stay in People).

**Activity** lists emails, calls, meetings and notes. The box at the top logs a **Note**, **Call** or **Meeting** in one line: pick the type, type what happened, **Log it**. Type **@** to mention a teammate or one of the organization's people (the full form takes @ too). Everyone mentioned is added to who was involved, and mentioned teammates get a notification. Tick **Set the next step** to set the organization's next step at the same time. **More details…** opens the full form (pick the type at the top of the dialog). **Include people's activity** (on by default) also shows calls, meetings and notes logged on this organization's people that aren't filed to any organization; those are labelled "From [name]'s activity". An email filed to another organization never shows here, even if one of this organization's people was on it. Email threads show their newest message with "earlier messages in this thread" to expand. **Open full view** opens Activity for this organization. On a call, **Who called** is We called, They called, or Internal. The activity shows the caller, then an arrow, then who was called. On a meeting, **Where** is the place or link, such as Zoom or their office. **Notes / next steps** is a formatted note: bold, lists, and links. **Who was involved** lists **Our team** and that organization's people, so you can record who on your side talked with whom. **All**, **Emails**, **Calls**, **Meetings** and **Notes** is a menu above the list, with Search beside it. Search looks only at the type you picked, including when nothing is logged yet. The menu on an entry can Forward it (email the people you pick, and notify teammates), Create task (pick a task project, section, title, and who it is assigned to), or Delete it after you confirm. Emails appear when the capture address is CC'd on the thread. The same panel is on a pipeline card. On a person's page, Activity shows everything that person took part in, and you can log on the person. It is filed to their organization when they belong to exactly one; otherwise it stays on the person and shows on each of their organizations with Include people's activity on.

## Clients

**Clients** (Office menu) shows organizations with status Client. The **Status** column is Active or Inactive. **New Client** adds an organization as a client straight away. Prospects are not here; they are on the Pipeline.

## People

**People** lists every person, with their organizations and tags. The row menu has **Delete** when your role allows it. Filter by tag with the tag list. **New Person** asks for first and last name, their email, phone, title, LinkedIn and personal URL (optional photo), and optionally an organization (with their role there) and tags. In the **Organization** list, **New organization** adds name, email and website for a stub organization and links this person to it. **Role** is how they relate to that organization, such as board member, case manager, or family. **Title** is their job, and it stays the same if they belong to more than one organization. **Needs review** shows people created automatically from email; the People menu item shows how many are waiting.

On a person's page: name, email, title, phone, LinkedIn and personal URL, **Tags**, notes, and Activity. To delete someone, use **Delete** on their row on the **People** list (when your role allows). On the right: a photo (drag or click to add one; the trash can on the photo removes it), **Email addresses** for any extra addresses (mail from any of them is matched to this person; the primary address cannot be removed), and **Organizations** (link or unlink, with a role). A person with no organization (an individual client) can become a client with **Make client from this person**.

## Pipeline

The **Pipeline** holds opportunities only. People move through lanes as conversations happen, sometimes over months. There are no won or lost lanes: when someone signs on, use **Make client** (the card leaves the board, archived with its history); when it is going nowhere, **Archive** the card.

Every card belongs to an organization (a new Prospect unless the name matches an existing one) and its person is a real person in People. **New Lead** adds a card to the first lane. Adding a Prospect on the Organizations page also adds a card. Drag cards between lanes; lanes track the conversation and do not change status. A current client can get a new card later, for a new piece of work.

Each card leads with the **next step**: what you plan to do next and its due date, then how long since the last contact ("Contacted 12 days ago", or "No contact"). A red warning icon next to the card's menu means the next step is overdue; hover it for the date. The card menu's **View people** lists everyone at the card's organization with role, email and phone.

**Lanes are edited right on the board:**
- **Add lane**: the column at the end of the board.
- **Rename**: click a lane's name, type, press Enter (Esc cancels).
- **Reorder**: drag a lane by its header.
- **Remove**: the **X** on the lane. If it has cards (archived ones count), choose a lane to move them to. A pipeline always keeps at least one lane, so the X is unavailable on the last lane.

**Pipelines:** the **⋮** menu at the top right has **New pipeline**, **Rename pipeline** and **Delete pipeline** (only an empty pipeline can be deleted). With more than one pipeline, pick which one to view from the list beside **Board / Archived**. A second pipeline can track partners you are recruiting.

**Archived:** switch **Board / Archived** on the left to see won and archived cards. **Restore** puts a card back on the board. **Delete** removes the card for good.

On a card's page, **Lane** changes its lane and **Open organization** (beside the title) goes to the organization. **Make client** and **Save** are at the top right; **Save** turns on once something has changed. **Archive** / **Restore** are in the ⋮ menu beside them.

## Bookings

**Bookings** is a module: it only appears when it is switched on for your organization. **Bookings** manages appointment types and bookings. A booking creates or updates a pipeline card, so the guest appears in People at a Prospect organization. Each booking type's **Pipeline lane** says which lane new cards go into (blank means the first lane). A card that is still in its pipeline's first lane moves to that lane when the person books; cards further along stay put. Booking types (the **Booking types** tab) are visible to roles with Bookings **Setup**.

## Activity

**Activity** in the menu (it replaced Inbox) has two tabs. The number on the menu item is your To do count (Needs reply, next steps overdue or due today, and Unfiled).

**To do** has four queues; click one to list it:

- **Needs reply**: the latest email on a thread came from outside and nobody has answered for 2 or more days.
- **Next steps**: every next step that is set, on organizations and pipeline cards, soonest first. Overdue ones have a red **Overdue** tag; due today has a **Due today** tag. Organizations without a next step are not listed (they don't need one).
- **Gone quiet**: active clients nobody has contacted in 30 or more days.
- **Unfiled**: captured email that could not be matched. **File…** one to an **Organization** or a **Pipeline card**; leave "Link the people on this email to the organization" on so their next email files itself.

**Mine** shows rows on threads you are on and next steps you own (or that have no owner); **Everyone's** shows all. Unfiled is the same for everyone. The ⋮ menu on a row: **Open timeline**, **Work on it** (shows that organization on this page with its next step), **Open pipeline card**, **No reply needed**, or **Snooze** (3 days, 1 week or 30 days). Admins change the 2 and 30 days in **Settings → Activity**.

**All activity** is every email, call, meeting and note, newest first, with the organization each belongs to. Filter by **Logged by**, **From** and **To** dates, type, or search.

Pick an **Organization** or **Person** to the right of the page title to narrow both tabs to them. Panels on the right then show, for an organization, its **Next step**, **Details** (status, tags, phone, email, website, address, last contact, notes) and **People** (view only; add or remove people on the organization's page); for a person, their **Details** and **Organizations**, each with its next step. The quick log files to that organization or person. Click the name in Details to open their page. **Open full view** on an organization's or person's Activity panel opens this page for them.

## Next step

Every organization can have one **next step**: what happens next, when, and who owns it. It is shown under the name at the top of the organization's page. **Set next step** or **Edit** to change it. **Done** records "Done: …" on the timeline, clears it, and asks for the next one. Every next step that is set shows on **Activity → To do → Next steps**, with overdue ones tagged.

## Network and Partners

The old **Network** page is gone. Everyone who was in it is tagged **Network** (people you've talked to about something), both the people and their organizations. Open **People** and pick **Network** in the tag list, or do the same on **Organizations**.

**Partner** is a different tag: someone who does work for you or works with you. Network contacts are not partners unless you tag them so.

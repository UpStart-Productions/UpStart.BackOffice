# CRM (Pipeline, Organizations, People, Inbox, Bookings)

How the pieces fit:

- **Organizations** are every organization you deal with: prospects, clients, past clients, partners and anyone else.
- **People** are every person. A person can belong to one or more organizations, or none.
- **Pipeline** holds opportunities: organizations you are trying to win. Current clients are not on it.
- **Clients** (under **Office**) is the working list of organizations you are doing work for. It is the same records as Organizations, limited to clients.
- **Inbox** catches email that could not be filed. **Bookings** are appointments people booked.

Everything about one organization (people, emails, files, pipeline cards, projects) lives on that organization's page. Clicking an organization from Clients or Organizations opens the same page.

## Status and tags

Every organization has a **Status**: Prospect, Client, Past client or Other.

- A pipeline card makes its organization a **Prospect** automatically.
- **Make client** (on a pipeline card, an organization, or a person) makes it a **Client**, and any open pipeline card for it is archived, because the opportunity is won.
- **Past client** is set by hand on the organization's page when the work ends.
- **Other** is anyone not in a sales relationship, such as a partner or vendor.
- Client turns on projects, time and invoices.

**Tags** say what an organization or person is to you: Partner, Vendor, Referral source, or anything you type. Organizations and people share the same tags. Press Enter in the Tags field to add one. Tags are set by hand; nothing changes them automatically. A partner can also be a client.

## Organizations

**Organizations** (CRM menu) lists every organization. Filter with the **type** dropdown (**Any Type**, Prospects, Clients, Past clients, Other) and the tag list (for example **Partner**). The row menu has **Make client**, **Edit** and **Delete**.

**New Organization** asks for a **Type**:

- **Prospect** also adds a card to the first lane of the pipeline.
- **Client** turns on projects, time and invoices.
- **Partner** adds the Partner tag and stays off the pipeline.

On an organization's page: Status (Prospect, Client, or Past client), Tags, Invoice Code (prepended to invoice numbers, only needed once you invoice), contact details, Notes, the Client portal link, Projects, People, Activity and Files.

## Clients

**Clients** (Office menu) shows organizations with status Client. **Include past clients** adds past clients. **New Client** adds an organization as a client straight away. Prospects are not here; they are on the Pipeline.

## People

**People** lists every person, with their organizations and tags. Filter by tag with the tag list. **New Person** asks for a name, email, and optionally an organization (with their role there) and tags. **Needs review** shows people created automatically from email; the People menu item shows how many are waiting.

On a person's page: name, title, phone, **Tags**, notes, **Email addresses** (mail from any of them is matched to this person), **Organizations** (link or unlink, with a role), and Activity. A person with no organization (an individual client) can become a client with **Make client from this person**.

## Pipeline

The **Pipeline** holds opportunities only. People move through lanes as conversations happen, sometimes over months. There are no won or lost lanes: when someone signs on, use **Make client** (the card leaves the board, archived with its history); when it is going nowhere, **Archive** the card.

Every card belongs to an organization (a new Prospect unless the name matches an existing one) and its person is a real person in People. **New Lead** adds a card to the first lane. Adding a Prospect on the Organizations page also adds a card. Drag cards between lanes; lanes track the conversation and do not change status. A current client can get a new card later, for a new piece of work.

Each card leads with the **next step**: what you plan to do next and its due date, then how long since the last contact ("Contacted 12 days ago", or "No contact"). A red warning icon next to the card's menu means the next step is overdue; hover it for the date. The card menu's **View people** lists everyone at the card's organization with role, email and phone.

**Lanes are edited right on the board:**
- **Add lane**: the column at the end of the board.
- **Rename**: click a lane's name, type, press Enter (Esc cancels).
- **Reorder**: drag a lane by its header.
- **Remove**: the lane's menu (⋮) > **Remove lane**. If it has cards (archived ones count), choose a lane to move them to. A pipeline always keeps at least one lane.

**Pipelines:** the menu (⋮) next to the pipeline name has **New pipeline**, **Rename pipeline** and **Delete pipeline** (only an empty pipeline can be deleted). With more than one pipeline, pick which one to view from the list at the top. A second pipeline can track partners you are recruiting.

**Archived:** switch **Board / Archived** at the top to see won and archived cards. **Restore** puts a card back on the board. **Delete** removes the card for good.

On a card's page, **Lane** changes its lane, **Open organization** goes to the organization, and **Make client** / **Archive** / **Restore** are next to the title.

## Bookings

**Bookings** manages appointment types and bookings. A booking creates or updates a pipeline card, so the guest appears in People at a Prospect organization. Each booking type's **Pipeline lane** says which lane new cards go into (blank means the first lane). A card that is still in its pipeline's first lane moves to that lane when the person books; cards further along stay put. Booking types (the **Booking types** tab) are visible to roles with Bookings **Setup**.

## Inbox

**Inbox** lists emails that could not be filed automatically. **File…** one to an **Organization** or a **Pipeline card**; leave "Link the people on this email to the organization" on so their next email files itself.

## Network and Partners

The old **Network** page is gone. Everyone who was in it is tagged **Network** (people you've talked to about something), both the people and their organizations. Open **People** and pick **Network** in the tag list, or do the same on **Organizations**.

**Partner** is a different tag: someone who does work for you or works with you. Network contacts are not partners unless you tag them so.

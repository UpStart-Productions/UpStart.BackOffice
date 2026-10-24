# CRM (Inbox, Pipeline, Clients, Contacts, Bookings)

How the pieces fit: **Accounts** are the organizations and families you deal with, **Contacts** are the people on them, the **Pipeline** tracks opportunities, and **Inbox** catches email that could not be filed. Everything about one account (people, emails, files, pipeline items) lives on that account.

## Clients

**Clients** lists the accounts you are working for. An account is a Client when you have opened a workspace for it, paid or not, for example while you write a proposal. Billing is optional.

Use the buttons at the top to switch views over the same accounts: **Clients**, **Prospects**, **Past clients**, **Partners** (accounts with the Partner role), and **All**. **New Client** adds one; in other views the button adds a prospect or partner.

Each account has a **Journey** (Prospect, Client, Past client, or None) and **Roles** (free tags such as Partner, Referral source, Vendor). A partner can also be a client. Click **Make client** on any prospect, past client or partner to turn on projects, time and invoices. Nothing is copied, and you can change the Journey back at any time. The invoice code is only needed once you invoice.

The **Last contact** column shows how long since the last logged email, call or note.

## Contacts

**Contacts** lists people. A person can belong to several accounts with a role on each (family member, case manager, and so on). A contact with no account can be turned into a client with **Make client from this contact**. **Needs review** filters contacts created automatically from email; the Contacts menu item shows how many are waiting.

## Pipeline

**Client Pipeline** is a relationship pipeline: people move through lanes as conversations happen, sometimes over months. There are no won or lost stages. Someone either becomes a client (**Make client**) or, when it's going nowhere, you **Archive** their card.

Every card belongs to an account (a prospect unless the name matches an existing account) and its person is a real contact. **New Lead** adds a card to the first lane of the pipeline you're looking at. Drag cards between lanes to move them. Moving a card never changes anything else, and a card stays on the board after the account becomes a client until you archive it.

Each card leads with the **next step**: what you plan to do next and its due date, then how long since the last contact ("Contacted 12 days ago", or "No contact"). A red warning icon next to the card's menu means the next step is overdue; hover it for the date. The card menu's **View contacts** lists everyone on the card's account (the card's own person first) with role, email and phone.

**Lanes are edited right on the board:**
- **Add lane**: the column at the end of the board.
- **Rename**: click a lane's name, type, press Enter (Esc cancels).
- **Reorder**: drag a lane by its header.
- **Remove**: the lane's menu (⋮) > **Remove lane**. If it has cards (archived ones count), choose a lane to move them to. A pipeline always keeps at least one lane.

**Pipelines:** the menu (⋮) next to the pipeline name has **New pipeline**, **Rename pipeline** and **Delete pipeline** (only an empty pipeline can be deleted). With more than one pipeline, pick which one to view from the list at the top.

**Archived:** switch **Board / Archived** at the top to see archived cards for the pipeline. **Restore** puts a card back in the lane it was in. Archiving keeps all history; **Delete** removes the card for good.

On a card's page, **Lane** changes its lane, and **Archive** / **Restore** are next to the title.

## Bookings

**Bookings** manages appointment types and bookings. A booking creates or updates a pipeline card, so the guest appears as a contact on a prospect account. Each booking type's **Pipeline lane** says which lane new cards go into (blank means the first lane). A card that is still in its pipeline's first lane moves to that lane when the person books; cards further along stay put. Booking types (the **Booking types** tab) are visible to roles with Bookings **Setup**.

## Inbox

**Inbox** lists emails that could not be filed automatically. File one to an account or pipeline item and the people on it are linked to that account, so their next email files itself.

## Partners and the old Network page

Network is now part of Clients. Partner companies are accounts with the Partner role, and their people are contacts. Open the **Partners** view on Clients; **Referral-ready only** filters it.

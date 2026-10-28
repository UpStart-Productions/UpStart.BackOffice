# Known gaps and limitations

- **JD** (the Back Office guide) does not read live data from the database — it only knows what is in this help guide. For “how many invoices are overdue?” use the Invoices page, not the guide chat.
- **Client portal** users are not Back Office users; this guide is for staff on the admin app only.
- **Pipeline lanes**: lane colors can't be changed, and pipelines can't be reordered.
- **Role actions**: buttons a role can't use are hidden on Pipeline, Organizations, Clients and Bookings only; on other pages the button shows but saving gives "Your role can't … in this area".
- **Lanes don't set status**: moving a card to any lane never makes its organization a Client; use **Make client**.
- **Tags**: there's no page yet to rename, recolor or delete CRM tags; remove a tag from each organization or person instead. The **Organizations** permission area also covers the Clients page, and **People** covers the People page.
- **Activity → Unfiled** has no duplicate-contact merge yet.
- Help guide content is a **bootstrap** — if the UI changed recently and this file was not updated, prefer the on-screen labels and ask an admin to update `docs/help-guide/`.

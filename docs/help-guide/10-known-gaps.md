# Known gaps and limitations

- **JD** (the Back Office guide) does not read live data from the database — it only knows what is in this help guide. For “how many invoices are overdue?” use the Invoices page, not the guide chat.
- **Client portal** users are not Back Office users; this guide is for staff on the admin app only.
- **Pipeline lanes**: lane colors can't be changed, and pipelines can't be reordered.
- **Role actions**: buttons a role can't use are hidden on Pipeline, Organizations, Clients and Bookings only; on other pages the button shows but saving gives "Your role can't … in this area".
- **Lanes don't set status**: moving a card to any lane never makes its organization a Client; use **Make client**.
- **Tags**: there's no page yet to rename, recolor or delete CRM tags; remove a tag from each organization or person instead. The **Organizations** permission area also covers the Clients page, and **People** covers the People page.
- **Activity → Unfiled** has no duplicate-contact merge yet.
- **Forms**: no page breaks or conditional questions yet, no file uploads, and questions can only be dragged within their section (to move one to another section, add it there and delete the old one). Earlier versions of a form can't be opened or restored; each submission shows the version it answered.
- **Care**: no history of earlier answers (only who changed it last), no print or PDF, no file uploads on forms, and sections are reordered with Move up / Move down (fields are dragged). A form's answers are not searchable or shown in lists yet. Schedule is a weekly list (no drag and drop or month view), open shifts can't be claimed by workers yet, and editing a repeating series means deleting it from a shift on and adding a new one.
- Help guide content is a **bootstrap** — if the UI changed recently and this file was not updated, prefer the on-screen labels and ask an admin to update `docs/help-guide/`.

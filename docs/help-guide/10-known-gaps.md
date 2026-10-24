# Known gaps and limitations

- **Notifications** bell in the top bar is not yet wired to live notifications.
- **Guide** does not read live data from the database — it only knows what is in this help guide. For “how many invoices are overdue?” use the Invoices page, not the Guide.
- **Client portal** users are not Back Office users; this guide is for staff on the admin app only.
- **Pipeline stages** are the same fixed set for everyone for now (including Active Client and Past Client columns, which overlap an account's Journey). Per-organization stages are planned. Moving a card to Active Client does not make the account a Client; use **Make client**.
- **Inbox** has no duplicate-contact merge yet.
- Help guide content is a **bootstrap** — if the UI changed recently and this file was not updated, prefer the on-screen labels and ask an admin to update `docs/help-guide/`.

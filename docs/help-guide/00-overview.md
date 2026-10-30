# UpStart Back Office — Overview

This guide powers **JD**, the in-app Back Office guide (avatar in the bottom-left). It is written for people using the admin app, not for developers.

## Left navigation (typical Admin)

Sections appear based on role. **Admins** see:

- **Dashboard**
- **CRM**: Activity, Pipeline, Organizations, People, Bookings (partners are organizations tagged Partner)
- **Office**: Clients, Projects, Tasks, Time, Expenses, Invoices, Forms
- **Care** (only when the Care module is on): Intake, Care profiles, Visits, Schedule
- **Reports**
- **Accounting** (Admin only): Chart of Accounts, Journal, Bank Import, Accounting Reports
- **Admin** (Admin only): Users, Settings
- **Super user only**: Tenants, Guide setup

**Tasks-only** users (tenant role that only grants Tasks) see **Tasks** alone in the menu.

People (team members and contacts) are shown with their photo, or colored initials when there's no photo, next to their name: on pipeline cards, contact and client pages, the email timeline, Activity, expenses and role lists.

**Regular users** see only areas their tenant role grants (Organizations, Time, etc.) — if a menu item is missing, they do not have access; do not tell them to use Admin-only screens.

## Page layout

Every page has the same header above its content:

- The page title on the left, with a back arrow before it on pages you open from a list (for example a client, a pipeline card or an invoice). Status tags, such as **Client**, **Archived** or **Overdue**, sit next to the title.
- The page's buttons on the right. The main action, such as **New Client**, **Track time** or **Save**, is the purple button on the far right.
- Less common actions, such as **Archive**, **Restore** or **Delete**, are in the ⋮ menu at the start of the buttons.
- On pages where you edit something, **Save** is in the header and turns on once you change something.
- Search, filters and tabs are at the top of the white panel below the header.

## Top bar

- **Search** (magnifying glass): expands to search clients, projects, invoices, leads
- **Help** (question mark): opens a help panel on the right with a short guide to the page you're on. It follows you as you move between pages. At the bottom, **Contact Support** sends a message to UpStart support (support@heyupstart.com); you'll get a reply by email. Some form fields also have a small ⓘ icon; hover it for a one-line explanation.
- **User avatar** (top bar): opens account menu with email, role, Sign out; **Return to my account** when impersonating
- **JD** (Back Office guide, bottom-left): in-app help chat when configured by a super user
- **Notifications** (bell, top bar): unread task and project alerts (assignments, mentions, comments, due dates, attachments, moves, and more); opens a panel with links, Mark read, and Dismiss

## Super users

People who belong to more than one organization (the same email added in each, possibly with a different role in each) see an organization dropdown in the top bar, and **Switch to …** entries in the user menu on narrow screens. Switching reloads the app with your role and access in that organization. Your last choice is remembered on that browser.

Platform operators can switch **tenant** from the top bar, open **Tenants** and **Guide setup**, and impersonate users from **Users**. When impersonating, a red banner appears at the bottom of the screen.

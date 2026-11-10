# UpStart Back Office — Overview

This guide powers the in-app **Back Office guide** (the help chat avatar in the bottom-left). It is written for people using the admin app, not for developers.

## Signing in

Sign in with your email and password, or click **Sign in with Google** and pick the Google account that uses the same email as your Back Office login. Google sign-in only works if that email has already been added as a user; it doesn't create an account. You can use either method at any time, and Google sign-in doesn't change your password.

## Left navigation (typical Admin)

Sections appear based on role. **Admins** see:

- **Dashboard**
- **CRM**: Activity, Pipeline, Organizations, People, Bookings (partners are organizations tagged Partner)
- **Office**: Clients, Projects, Tasks, Time, Schedule (only when the Care module is on), Expenses, Invoices, Forms
- **Reports**
- **Accounting** (Admin only): Chart of Accounts, Journal, Bank Import, Accounting Reports
- **Admin** (Admin only): Users, Settings
- **Super user only**: Tenants, Guide setup

There are three user types: **Admin** (everything), **Member** (staff: all of CRM plus the projects they are on) and **Guest** (outside people: only the projects and clients they are assigned to). You cannot create custom roles — every organization has exactly these, defined in the product. Members and Guests see only their own time, expenses and invoices, plus everything on projects where they are the **Lead**. See Admin and settings for details.

People (team members and contacts) are shown with their photo, or colored initials when there's no photo, next to their name: on pipeline cards, contact and client pages, the email timeline, Activity, expenses and role lists.

**Regular users** see only areas their tenant role grants (Organizations, Time, etc.) — if a menu item is missing, they do not have access; do not tell them to use Admin-only screens.

## Page layout

Every page has the same header above its content:

- The page title on the left, with a back arrow before it on pages you open from a list (for example a client, a pipeline card or an invoice). Status tags, such as **Client** or **Overdue**, sit next to the title.
- The page's buttons on the right. The main action, such as **New Client**, **Track time** or **Save**, is the purple button on the far right.
- Less common actions, such as **Delete**, are in the ⋮ menu at the start of the buttons.
- On pages where you edit something, **Save** is in the header and turns on once you change something.
- Search, filters and tabs are at the top of the white panel below the header.

## Top bar

- **Search** (magnifying glass): organizations, people, projects, tasks, time, expenses, forms and submissions, invoices, pipeline, bookings, care visits and schedule, activity, and team (admins)—only in areas you can access
- **Help** (question mark): opens a help panel on the right with a short guide to the page you're on. It follows you as you move between pages. At the bottom, **Contact Support** sends a message to UpStart support (support@heyupstart.com); you'll get a reply by email. Some form fields also have a small ⓘ icon; hover it for a one-line explanation.
- **User avatar** (top bar): opens menu with **My Account** (profile, password, notification settings), email, role, and **Sign out**; **Return to my account** when impersonating
- **Back Office guide** (avatar, bottom-left): in-app help chat when configured by a super user. It knows which page you are on, so you can ask things like "How do I add a person here?", and it remembers the last few messages of the conversation. To ask about one spot, click the target icon at the top of the chat, then click a panel, button or field on the page (Esc cancels). That click only picks it, it doesn't press the button. A chip such as "Add new person button · People panel" shows what the guide will know; click its × to remove it. The chip clears when you go to another page. You can also highlight a label on the page (for example a panel title or button name) before or while the chat is open, and it becomes the chip. If you highlight something that isn't a screen label, such as a person's name or an email address, the chip says "Selected text not shared": the guide gets only the panel it was in, and tells you it can't answer questions about that specific item. By default it answers how-to questions only: it will not discuss specific people, contacts or record details, and email addresses and phone numbers are removed before your question is sent. If an admin turns on **Settings → Back Office guide**, it can also look up records to answer questions like "How many open tasks does Sam have?", using only what you can see.
- **Notifications** (bell, top bar): unread task and project alerts (assignments, mentions, comments, due dates, attachments, moves, and more); opens a panel with links, Mark read, and Dismiss

## My Account

Open **My Account** from the avatar menu to change your name, email, photo and password, and to choose **Notifications** — in-app, email, and (when available) push per type. Only types your role can receive are listed.

## Super users

People who belong to more than one organization (the same email added in each, possibly with a different role in each) see an organization dropdown in the top bar, and **Switch to …** entries in the user menu on narrow screens. Switching reloads the app with your role and access in that organization. Your last choice is remembered on that browser.

Platform operators can switch **tenant** from the top bar, open **Tenants** and **Guide setup**, and impersonate users from **Users**. When impersonating, a red banner appears at the bottom of the screen.

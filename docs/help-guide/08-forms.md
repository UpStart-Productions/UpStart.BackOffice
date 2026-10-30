# Forms

**Forms** (left menu, under CRM) is where you build forms and share them with a link: sign-ups, feedback, assessments with a score. Every organization has Forms; what each person sees depends on their role.

## Who sees what

- The role needs the **Forms** area (Users → Roles). **Own** shows only the forms that person created; **All** shows every form. **Create**, **Edit** and **Delete** are checkboxes. Admins see everything.
- New submissions notify admins, people with Forms **All**, and the person who created the form (bell, and email unless turned off under Inbox → Notification settings: "A form in Forms gets a submission").

## The Forms list

Each form shows its status: **Draft** (never published), **Published**, or **Changes not published** (the links still show the last published version). **Submissions** shows how many came in, with a count of those waiting for review. **New form** asks for a name and opens the form. The ⋮ menu has **Open**, **Submissions** and **Delete** (deleting a form deletes its submissions and stops its links).

## A form page

- **Details** (name, description) and **Settings** save with **Save** at the top.
- **Settings**:
  - **Review submissions before they become prospects**: submissions wait under **Waiting for review**. Turned off, they are accepted as they come in.
  - **Ask for their organization** and **Ask for a phone number**: extra questions next to name and email (name and email are always asked).
  - **Email people their results**: after sending, people get an email with their results, or your thank-you message on forms without scoring.
  - **Thank-you message** and **Call to action** (a label and a link, e.g. to book a call) shown after sending and in the results email.
- **Scoring** and **Fields** save right away.
- **Publish** makes the current fields and scoring the version people see. Until you publish again, the links keep showing the earlier version. Each submission keeps the version it answered.

## Scoring

Turn on **Score this form**, then:

1. **Score areas**: groups of questions scored together (for example Workflows, People, Data). Optional: without areas the form still gets one overall score.
2. **Profiles**: results by percentage, for example 0–25% Finding Your Bearings, 26–50% Gaining Traction. Each profile has a name, **Scores up to (%)**, what it means, recommended next steps (one per line) and an optional download link. The profile with the highest number also covers anything above it.
3. In **Fields**, edit each single-select or multi-select question: give each choice its **points** and pick the question's **Score area**. Questions without points don't count.

People's score is the percentage of the points possible. A single-select counts the chosen choice; a multi-select adds up the chosen choices.

## Public links

**New link** makes a link anyone can use to fill in the published form (for example on your website), with **No check**, a **Passcode** (share it separately) or an **Emailed code**. Use a link's ⋮ menu to **Copy link**, **Open** or **Revoke** it. Links only work once the form is published. On scored forms, people see their score, profile, next steps and score areas after sending.

## Putting a form on a website

A link's ⋮ menu → **Embed on a website** shows:

- **Embed code**: one line to paste into any website (WordPress, Squarespace, a custom site). The form appears in the page and uses that website's own fonts and colors. Links with a passcode or emailed code show an **Open the form** button instead.
- **Link key**: for a developer whose website draws the form with its own code, using UBO's public form API.
- **Allowed websites**: empty means any website can show the form. List websites (one per line, e.g. example.org) to allow only those; click **Save websites**. Opening the link itself always works.

New link also has **Allowed websites**. The **Websites** column on the links list shows what each link allows.

## Submissions

Open **Submissions** from the form page or the list. Tabs: **Waiting for review**, **Accepted**, **Dismissed**, **All**. Open a submission to see the answers (as they were asked in that version), who sent it and the score.

- **Accept** → **New organization** creates a Prospect with that name (the sender's organization by default), a pipeline card with source Inbound, and the sender as its person. **Existing organization** attaches the submission to one you pick. **Open organization** goes there afterwards.
- **Dismiss** sets it aside under **Dismissed**; **Restore** brings it back.
- **Delete** (⋮ menu) removes it and its results link for good.

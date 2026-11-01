# Forms

**Forms** (left menu, under Office) is where you build forms and share them with a link: sign-ups, feedback, assessments with a score. Every organization has Forms; what each person sees depends on their role.

## Who sees what

- The role needs the **Forms** area (Users → Roles). **Own** shows only the forms that person created; **All** shows every form. **Create**, **Edit** and **Delete** are checkboxes. Admins see everything.
- New submissions notify admins, people with Forms **All**, and the person who created the form (bell, and email unless turned off under Inbox → Notification settings: "A form in Forms gets a submission").

## Moving a form between UBOs (form files)

- On a form page, **⋮ → Export form file** downloads the form (fields, settings, scoring and profiles) as a `.json` file.
- **New form → Start from a form file** creates a draft from such a file, e.g. on another UBO. Leave Name empty to use the file's name. Review it, then **Publish**.

## The Forms list

Each form shows its status: **Draft** (never published), **Published**, or **Changes not published** (the links still show the last published version). **Submissions** shows how many came in, with a count of those waiting for review. **New form** asks for a name (or a form file) and opens the form. The ⋮ menu has **Open**, **Submissions** and **Delete** (deleting a form deletes its submissions and stops its links).

## A form page

Opening a form switches to its workspace, like Tasks: the main menu shrinks to icons and a second column lists the form's **Sections** (numbered, with how many questions each has), with **Settings**, **Scoring**, **Links** and **Who can use it** below them. Click one to work on it. **+** next to Sections adds a section and opens it. Drag a section up or down to reorder sections; a highlighted slot shows where it will land. The icon at the bottom of the main menu widens it again; **Forms** in the main menu goes back to the list.

- A section shows its questions and text blocks. Its ⋮ menu has **Edit section** (its name) and **Delete**. **Add field** adds a question. A field's type can be changed (edit the field) until someone answers the form; after that it's locked, because answers are stored in the type's shape. **Add text** adds a **text block**: formatted text people read, not a question (an intro, instructions, a note). Put one at the top of a section to introduce it. Text blocks aren't answered, counted, scored or exported. Drag a question or text block by its ☰ handle to reorder it.
- **Repeating group** (a field type): a small set of **sub-fields** filled in as rows, for lists like medications (Date, Name, Dosage, Frequency), contacts or diagnoses. Add the sub-fields in the field dialog (**Add sub-field**; each has a name and a type, and select sub-fields have choices). People click **Add another** for each row and the trash icon to delete one. **Required** means at least one row. Once the form has answers, a saved sub-field's type can't change; deleting a sub-field removes its answers. Exports and the submission page show one line per row.
- **File upload** (a field type): a drop zone for Word, PDF, Excel, PNG or JPG files, up to 10 MB each. In the field dialog, **Allow several files** lets people add up to 10; otherwise it takes one. Files upload as soon as they're dropped; each shows its name and size, with the trash icon to remove it. **Required** means at least one file. Files are private: on the client form, submission and visit pages, click a file's name to download it (you must be signed in and able to see that answer). Exports list the file names. Deleting the answer, the form or the client deletes its files. File uploads can't go inside a repeating group.
- **Preview** is on the top bar between **Publish** and **Save** (and in the ⋮ menu). It opens the draft in a **new tab** like a new public link; **refresh that tab** after you change the form. Answers are not saved and required fields do not block Next or Back. Field edits show as you save them; **Details** and **Settings** need **Save** on the form page.
- **Details** (name, description) and **Settings** save with **Save** at the top.
- **Settings**:
  - **How sections are shown** on the form's pages: **One page** (everything on one scrolling page), **Page by section** (one section at a time with Next and Back, then About you), **Page by question** (one question or text block per screen with a progress bar; picking a single choice moves on by itself, and Back fixes a wrong pick), **Accordion** (sections open one at a time) or **Tabs** (a tab per section). Public pages show choices as a list to click. The form's link page and the embed code follow it; websites that draw the form with their own code get it too.
  - **Review submissions before accepting them**: submissions wait under **Waiting for review**. Turned off, they are accepted as they come in.
  - **Ask for their organization** and **Ask for a phone number**: extra questions next to name and email (name and email are always asked).
  - **Email people their results**: after sending, people get an email with their results, or your thank-you message on forms without scoring.
  - **Thank-you message** and **Call to action** (a label and a link, e.g. to book a call) shown after sending and in the results email.
  - **Client form** (see Client forms below): **Attach answers to a client**, **Category**, **Copies per client** and **Public submissions can create new clients**.
  - **Care** (Care module on): **Use as the visit checklist**. Caregivers fill this form in on every visit. One form at a time: turning it on here turns it off on the others.
- **Scoring** and **Fields** save right away.
- **Publish** makes the current fields and scoring the version people see. After changes, the button reads **Publish changes**; until you click it, the links keep showing the earlier version. Each submission keeps the version it answered.
- **Unpublish** (the same button when there are no changes waiting, otherwise in the ⋮ menu) takes the form offline: its links and embeds stop working until you publish again. Submissions are kept.

## Client forms

A client form's answers belong to a client and show in the **Forms** panel on the client's page. Use them for intake forms, client or care profiles, class registrations, anything about a client. Name each form whatever you like; nothing about it is fixed.

- **Attach answers to a client** (Settings) makes the form a client form.
- **Category** (optional): groups forms on the client page and in Add form, e.g. Intake, Client profile.
- **Copies per client**: **One living copy** (each client has one copy, kept up to date, like a profile; Add form opens it) or **New each time** (every Add form or accepted submission is a new, dated result, like an intake).
- **Public submissions can create new clients**: Accept on a public submission offers **New client** (creates the client, with the sender as its person) instead of a new Prospect.
- **Who can use it**: per role **None**, **Read** or **Edit** for the answers on client pages. Admins can always edit. Designing the form is the Forms area as usual.
- The Forms list shows **Client form** (with its category) and **Visit checklist** in the **Used for** column.

On a client's page, **Add form** picks a client form and opens it. Its page has the answers (**Save** at the top) and **Details** (client, category, when it was added). The ⋮ menu has **Move to another client** and **Delete**. Forms with one living copy also have **Share link**: a link to this client's copy for someone outside, such as family, with No check, a Passcode or an Emailed code (30 days by default). Changes made through it save straight to the form and notify the team.

The same form can be on your website: each public submission is its own result. It waits under **Waiting for review**; open it and **Accept** it into a client (see Submissions). Accepted, it shows on that client's page.

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

Open **Submissions** from the Forms list (the count, or **Submissions** in a form's ⋮ menu). It's separate from building the form. Tabs: **Waiting for review**, **Accepted**, **Dismissed**, **All**. The **Client** (or **Organization**) column shows where each was accepted; pick a client in the filter to see only theirs. Submissions waiting for review in every form also show on the Dashboard (**Pending submissions**) and as a **Form submissions** card in Activity → To do. **Export Excel** downloads a workbook for analysis outside UBO: click it for every submission, or use the arrow for **This tab only**. It has three sheets:

- **Answers**: one row per answer, with when it came in, its status, the client it was accepted into and who sent it, then the section, question code (Q1, Q2…), question and answer. On scored forms each row also has the answer's points and the question's score area.
- **Results** (scored forms): one row per submission with the total points, total score %, profile and each score area.
- **Questions**: the key to the codes: section, question, type, required, whether it's still on the form, score area and the choices with their points. Codes follow the current form order, so they stay the same when a question is reworded; questions only in earlier versions come last. Open a submission to see who sent it and its answers as text, as they were asked in that version (on scored forms each scored answer shows its points). Scored forms add a **Results** tab: the total score, the profile with its description, next steps and download, and each score area. The **Score** panel shows the total score and the profile.

- **Export PDF** (⋮ menu) downloads who sent it, the results and every answer. **Export Excel** gives the same as a sheet, one row per question.

- **Accept**: **Possible matches** at the top (a person or client with the sender's email, or a client with the same name); **Use** attaches it there. **New organization** creates a Prospect with that name (the sender's organization by default), a pipeline card with source Inbound, and the sender as its person. On client forms that create clients, **New client** creates the client (the sender's name by default) with the sender as its person. **Existing** attaches the submission to one you pick. A form with one living copy can't be accepted into a client that already has its copy. **Open organization** (or **Open client**) goes there afterwards.
- **Dismiss** (⋮ menu) sets it aside under **Dismissed**; **Restore** (⋮ menu) brings it back.
- **Delete** (⋮ menu) removes it and its results link for good.

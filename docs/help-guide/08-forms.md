# Forms

**Forms** (left menu, under Office) is where you build forms and share them with a link: sign-ups, feedback, assessments with a score. Every organization has Forms; what each person sees depends on their role.

## Who sees what

- The role needs the **Forms** area (Users → Roles). **Own** shows only the forms that person created; **All** shows every form. **Create**, **Edit** and **Delete** are checkboxes. Admins see everything.
- New submissions notify admins, people with Forms **All**, and the person who created the form (bell, and email unless turned off under **My Account** → **Email notifications**: "A form in Forms gets a submission").
- **Submit** on a client form result notifies admins and roles with Edit on that form who reach the client ("A client form I can edit is submitted"). **Attach** and **Move** notify the staff assigned to that client or organization who can see the answers ("A form is added to a client assigned to me"). Nobody is notified about their own actions.

## Moving a form between UBOs (form files)

- On a form page, **⋮ → Export form file** downloads the form (fields, settings, scoring and profiles) as a `.json` file.
- **New form → Start from a form file** creates a draft from such a file, e.g. on another UBO. Leave Name empty to use the file's name. Review it, then **Publish**.
- On an existing form, **⋮ → Import form file** adds the file's sections and questions **after** the form's own. It only adds: nothing already on the form changes (questions, answers, name, settings, links). Score areas from the file don't carry over. Publish to put the new questions live.

## The Forms list

Each form shows its status: **Draft** (never published), **Published**, or **Changes not published** (the links still show the last published version). **Submissions** shows how many came in, with a count of those waiting for review. **New form** asks for a name (or a form file) and opens the form. The ⋮ menu has **Open**, **Submissions** and **Delete** (deleting a form deletes its submissions and stops its links).

## A form page

Opening a form switches to its workspace, like Tasks: the main menu shrinks to icons and a second column lists the form's **Sections** (numbered, with how many questions each has), with **Settings**, **Scoring**, **Links** and **Who can use it** below them. Click one to work on it. **+** next to Sections adds a section and opens it. Drag a section up or down to reorder sections; a highlighted slot shows where it will land. The icon at the bottom of the main menu widens it again; **Forms** in the main menu goes back to the list.

- A section shows its questions and text blocks. Its ⋮ menu has **Edit section** (its name) and **Delete**. **Add field** adds a question. A question or text block's ⋮ menu has **Edit**, a section picker (list icon and dropdown of the form's sections when there is more than one), and **Delete**. **Add text** adds a **text block**: formatted text people read, not a question (an intro, instructions, a note). Put one at the top of a section to introduce it. Text blocks aren't answered, counted, scored or exported. A field's type can be changed (edit the field) until someone answers the form; after that it's locked, because answers are stored in the type's shape. Drag a question or text block by its ☰ handle to reorder it.
- **Repeating group** (a field type): a small set of **sub-fields** filled in as rows, for lists like medications (Date, Name, Dosage, Frequency), contacts or diagnoses. Add the sub-fields in the field dialog (**Add sub-field**; each has a name and a type, and select sub-fields have choices). People click **Add another** for each row and the trash icon to delete one. **Required** means at least one row. Once the form has answers, a saved sub-field's type can't change; deleting a sub-field removes its answers. Exports and the submission page show one line per row.
- **File upload** (a field type): a drop zone for Word, PDF, Excel, PNG or JPG files, up to 10 MB each. In the field dialog, **Allow several files** lets people add up to 10; otherwise it takes one. Files upload as soon as they're dropped; each shows its name and size, with the trash icon to remove it. **Required** means at least one file. Files are private: on the client form, submission and visit pages, click a file's name to download it (you must be signed in and able to see that answer). Exports list the file names. Deleting the answer, the form or the client deletes its files. File uploads can't go inside a repeating group.
- **Currency**, **Phone** and **SSN** (field types): Currency takes a dollar amount (two decimals). Phone takes a US number and formats it as (555) 555-5555 while you type. SSN formats as 123-45-6789, shows ***-**-**** and hides each digit a second after it's typed; the eye button shows or hides it (on the submission page too). Phone and SSN save once every digit is in. Exports and PDFs show SSNs as ***-**-6789. These also work inside repeating groups.
- **Preview** is on the top bar between **Publish** and **Save** (and in the ⋮ menu). It opens the draft in a **new tab** like a new public link; **refresh that tab** after you change the form. Answers are not saved and required fields do not block Next or Back. Field edits show as you save them; **Details** and **Settings** need **Save** on the form page.
- **Details** (name, description) and **Settings** save with **Save** at the top.
- **Settings**:
  - **How sections are shown** on the form's pages: **One page** (everything on one scrolling page), **Page by section** (one section at a time with Next and Back, then About you), **Page by question** (one question or text block per screen with a progress bar; picking a single choice moves on by itself, and Back fixes a wrong pick), **Accordion** (sections open one at a time) or **Tabs** (a tab per section). Public pages show choices as a list to click. The form's link page and the embed code follow it; websites that draw the form with their own code get it too.
  - **Review submissions before accepting them**: submissions wait under **Waiting for review**. Turned off, they are accepted as they come in.
  - Name and email are always asked on public links. For anything else (organization, phone), add a question to the form.
  - **Email people their results**: after sending, people get an email with their results (scored forms) and your thank-you message.
  - **Thank-you message**: formatted text shown after sending and in that email. Put links here, e.g. to book a call.
  - **Client form** (see Client forms below): **Attach answers to a client** and **Copies per client**.
  - **Care** (Care module on): **Use as the visit checklist**. Caregivers fill this form in on every visit. One form at a time: turning it on here turns it off on the others.
- **Scoring** and **Fields** save right away.
- **Publish** makes the current fields and scoring the version people see. After changes, the button reads **Publish changes**; until you click it, the links keep showing the earlier version. Each submission keeps the version it answered.
- **Unpublish** (the same button when there are no changes waiting, otherwise in the ⋮ menu) takes the form offline: its links and embeds stop working until you publish again. Submissions are kept.

## Client forms

A client form's answers belong to a client and show in the **Forms** panel on the client's page. Use them for anything about a client. Name each form whatever you like; nothing about it is fixed.

- **Attach answers to a client** (Settings) makes the form a client form.
- **Copies per client**: **One living copy** (each client has one copy, kept up to date, like a profile; Add form opens it) or **New each time** (every Add form or attached submission is a new, dated result, like an intake).
- **Who can use it**: per role **None**, **Read** or **Edit** for the answers on client pages. Admins can always edit. Designing the form is the Forms area as usual.
- **Used for** (Settings, any form, optional): your own note on what the form is for. It's the **Used for** column of the Forms list.

On a client's page, **Add form** picks a published client form the client doesn't have yet and opens it. Drafts don't show until they're published. Its page has the answers and **Details** (client, when it was added). The ⋮ menu has **Move**, **Share link** and **Delete**.

- **Auto-save**: answers save as you go, wherever a form is filled in (here, on a public link, on a website, on a visit). The top bar shows **Saving…**, **Saved** or **Not saved** (it keeps retrying). Several people can work on the same form at once; each change saves just that answer.
- **In progress** / **Submitted**: a form is In progress until someone clicks **Submit** (required questions must be answered). **Reopen** sets it back to In progress. Changes after Submit still save.
- **Share link**: a link to this result for someone outside, such as family, with No check, a Passcode or an Emailed code (30 days by default). What they enter saves straight to it and notifies the team.
- **Move**: opens the attach dialog (see Submissions) to pick another client or organization.

The same form can be on your website: each public submission is its own result. It waits under **Waiting for review**; open it and **Attach** it (see Submissions). Attached, it shows on that client's page.

Results of other forms attached to a client or organization also show in its **Forms** panel, for people who can see Forms.

## Scoring

Turn on **Score this form**, then:

1. **Score areas**: groups of questions scored together (for example Workflows, People, Data). Optional: without areas the form still gets one overall score.
2. **Profiles**: results by percentage, for example 0–25% Finding Your Bearings, 26–50% Gaining Traction. Each profile has a name, **Scores up to (%)**, what it means, recommended next steps (one per line) and an optional **Profile resource** (**Link** with a URL and label, or **File** with an upload and label). The profile with the highest number also covers anything above it.
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

Open **Submissions** from the Forms list (the count, or **Submissions** in a form's ⋮ menu). It's separate from building the form. Tabs: **In progress**, **Waiting for review**, **Attached**, **Dismissed**, **All**. **In progress** holds forms someone started on a public link or website but hasn't sent yet (they're saved from the first answer and are never removed automatically; delete the ones you don't need). The **Client** (or **Organization**) column shows where each was attached; pick a client in the filter to see only theirs. Submissions waiting for review in every form also show on the Dashboard (**Pending submissions**) and as a **Form submissions** card in Activity → To do. **Export Excel** downloads a workbook for analysis outside UBO: click it for every submission, or use the arrow for **This tab only**. It has three sheets:

- **Answers**: one row per answer, with when it came in, its status, the client it was accepted into and who sent it, then the section, question code (Q1, Q2…), question and answer. On scored forms each row also has the answer's points and the question's score area.
- **Results** (scored forms): one row per submission with the total points, total score %, profile and each score area.
- **Questions**: the key to the codes: section, question, type, required, whether it's still on the form, score area and the choices with their points. Codes follow the current form order, so they stay the same when a question is reworded; questions only in earlier versions come last. Open a submission to see who sent it and its answers as text, as they were asked in that version (on scored forms each scored answer shows its points). Scored forms add a **Results** tab: the total score, the profile with its description, next steps and download, and each score area. The **Score** panel shows the total score and the profile.

- **Export PDF** (⋮ menu) downloads who sent it, the results and every answer. **Export Excel** gives the same as a sheet, one row per question.

- **Attach**: picks the client or organization the answers belong to.
  - **Suggestions** (when there's a match on the sender's email or name): **Use** selects one.
  - **Clients / Organizations / All** narrows the search (client forms start on Clients). Each record shows its status and people.
  - **New client** creates a client with the sender as its person. **New pipeline card** adds a pipeline card only (source Inbound); the sender is linked on the card's People panel, and the card gets a link back to the response plus a note with the profile and score (scored forms) — no organization list entry until you **Make client** or attach to an existing one.
  - **Next** shows a check: the record's name and which roles will be able to see the answers. **Attach to [name]** finishes. The same dialog moves a result (**Move to [name]**).
  - Attaching and moving add a note to the record's Activity. A form with one living copy can't go to a client that already has its copy.
- **Dismiss** (⋮ menu) sets it aside under **Dismissed**; **Restore** (⋮ menu) brings it back.
- **Delete** (⋮ menu) removes it and its results link for good.

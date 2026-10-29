# Care (module)

**Care** appears in the left menu only when the platform operator has switched the Care module on for your organization. It holds two forms your organization designs itself: the **Intake form** and the **Care profile**. Each organization (client) has at most one copy of each, a living document you keep up to date.

## Who sees what

- The role needs the **Care** area (Users → Roles: Care **All**). **Setup** on Care lets someone change the forms and make public intake links.
- Each form has **Who can use it** (Care → Forms → a form): **None**, **Read** or **Edit** per role. Admins can always edit.
- People only see forms for organizations they can reach: the organizations assigned to them, unless their role has **Organizations: All**.

## Intake

**Care → Intake** lists every organization's intake form. **New intake** picks an organization and starts its form. The **Waiting for review** tab (with a count, also on the menu) lists intakes sent through a public intake link. Open one to read it, then:

- **Accept** → **New organization**: creates a Prospect organization with that name, a pipeline card, and the person who sent it as its person. **Existing organization**: attaches the intake to an organization you pick (it can't already have an intake form).
- **Dismiss** (⋮ menu): deletes it.

Only people whose role can **Edit** the Intake form and reach every organization see Waiting for review and get notified about new ones.

## Care profiles

**Care → Care profiles** lists every organization's care profile. **New care profile** picks an organization and starts one.

## A form (record) page

Shows the organization's answers grouped by section. Change answers and click **Save** at the top. **Open organization** goes to the organization. The ⋮ menu has **Delete**. The side panel shows who sent it (public intakes), the last change made through a link, and **Share link**.

The organization page has a **Care** card listing its forms: open one, or **Start** a form that doesn't exist yet.

## Share links (one organization's form)

On a form page, **Share link → New link** makes a link to that organization's form for someone outside, such as family:

- **Check before opening**: **No check** (anyone with the link), **Passcode** (you share it separately, by phone or text), or **Emailed code** (a 6-digit code goes to the address you enter, and must be typed in before the form opens).
- **Expires after (days)**: 30 by default; empty means never.
- Changes made through the link save straight to the form. People who can edit the form and reach that organization get a notification (bell, and email unless turned off under Inbox → Notification settings).
- Use the link's ⋮ menu to **Copy link**, **Open** or **Revoke** it. A revoked link stops working right away.

## Forms (setup)

**Care → Forms** (needs Care Setup) lists the Intake form and Care profile. Open one to:

- Change its **Name** and **Description** (shown at the top of public links), and **Who can use it**. Click **Save** at the top for these.
- **Fields**: add a section, then **Add field** with a name, a type (Text, Long text, Number, Date, Single-select, Multi-select, Checkbox) and **Required** (required on public links; staff can save with it empty). The type can't be changed later. The ⋮ menus edit, move up or down, or delete. Deleting a field removes its answers from every record. **Filled in on** shows how many records have an answer. Field changes save right away.
- **Public intake links** (Intake form only): links anyone can use to send a new intake, for example from your website. Same checks as share links; with **Emailed code**, the person enters their own email and gets a code. New-intake links don't expire unless you set days.

## Public form page

People opening a link see your organization's name and the form. New intakes ask for their name and email (phone optional). Links that are revoked or expired say so. Too many attempts or submissions from one place are slowed down.

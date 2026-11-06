/**
 * Field- and section-level help, shown by <app-help-text key="..."> as a ? tooltip next to a label or title.
 * Key format: area.field. Do not put this copy under fields in templates — register it here only.
 * Page-level help lives in ui/help-drawer/help-content.ts.
 */
export const HELP_TEXT_REGISTRY: Record<string, string> = {
  // Pipeline card
  'lead.warmConnection': 'Someone who knows this person and can introduce you or vouch for you.',
  'lead.contactSource': 'How they found you or how you met, e.g. referral, inbound, event.',
  'lead.serviceInterest': 'Which of your services they are interested in. Pick all that apply.',
  'lead.nextActionDate': 'When the next step is due. Cards show a red warning on the board once this date passes.',
  'lead.nextAction': 'What you plan to do next. This leads the card on the pipeline board.',
  'lead.makeClient':
    'The organization becomes a client so projects, time and invoices are available. The card leaves the board (archived, not deleted). People, email and files stay on the organization.',
  'pipeline.newBoard':
    'Starts with New Lead, Discovery, Proposal Sent and On Hold. Rename lanes and add more on the board.',

  // Booking types
  'bookingType.brand':
    'Optional brand name sent to the public booking page, for when one tenant books under more than one name.',
  'bookingType.slug':
    'Used in the public API path, e.g. /booking/your-slug/slots. Cannot change after bookings exist.',
  'bookingType.minimumNotice': 'How many hours ahead a slot must be. Slots sooner than this are hidden.',
  'bookingType.horizon': 'How many days into the future people can book.',
  'bookingType.publicPageUrl': 'Used for cancel links in confirmation emails.',
  'bookingType.guestEmail':
    'On: Back Office emails the guest a confirmation with a calendar file. Turn off only when your website sends its own confirmation. You get the new-booking email either way.',
  'bookingType.pipelineLane':
    'Lane for new cards. A card still in the first lane moves here when the person books; cards further along stay put. Blank means the first lane.',
  'bookingType.leadSource': 'Contact source recorded on cards this booking type creates.',
  'bookingType.noteTitle':
    'Title of the note logged on the card for each booking. Defaults to the booking type name.',
  'bookingType.pricing':
    'Payment collection is not implemented yet. Use price fields to display amount and prepare for Stripe later.',

  // Expenses
  'expense.reimbursable':
    'Someone paid for this personally and should be paid back. It goes on their invoice to your organization: Not submitted, then Submitted, then Reimbursed when that invoice is paid.',
  'expense.billable':
    "Charged to the client at cost. It needs a project for that client, and goes on the client's next invoice: Not billed, then Invoiced, then Client paid.",
  'expenses.page':
    'Expenses for the period you pick. The totals follow your filters. Billable and Reimbursable show where each expense is in billing or paying back.',
  'expense.miles':
    'Miles times your mileage rate (Settings → Expenses and Invoicing). Set a rate there before saving mileage. A saved expense keeps the rate it was entered with.',
  'expense.category':
    'Pick from your organization\'s list (Settings → Expenses and Invoicing). Mileage uses miles instead of amount.',
  'expense.paymentMethod':
    'How you paid. Admins manage the list under Settings → Expenses and Invoicing.',

  // Projects
  'project.hourlyRate':
    "Used for time on this project instead of each person's own rate. Leave blank to use the rate set on Users.",
  'project.billable': 'Billable time on this project is what Generate from time pulls onto invoices.',
  'project.expenseDefaults':
    'Starting values when someone adds an expense on this project: Reimbursable pays the employee back; Billable to client can go on an invoice. Each expense can still be changed.',
  'project.defaultExpenseReimbursable':
    'When someone logs a new expense on this project, start with Reimbursable on or off. They can still change it on each expense.',
  'project.defaultExpenseBillable':
    'When someone logs a new expense on this project, start with Billable to client on or off. They can still change it on each expense.',
  'project.defaultTasks': 'Billable and non-billable default tasks for timesheet entries on this project.',
  'project.asanaConfig':
    'Link an Asana board and one or more sections. Incomplete tasks from those sections appear on timesheets.',
  'project.asanaTasksSynced':
    'Task names come from Asana and are read-only here. Use Refresh from Asana to update the list.',
  'project.asanaTasksUnlinked': 'Link a board and section in Asana configuration, then refresh to sync tasks.',

  // Users and roles
  'user.hourlyRate': "Used on invoices for this person's time when the project has no hourly rate of its own.",
  'roles.view': 'None hides the area. Own limits them to their own records (or clients they are assigned to). All shows everything.',
  'roles.overview':
    'A role decides which parts of the app a user can use. Admins can do everything. View sets what they see (None, Own, or All). Checkboxes set Create, Edit, Delete, and Setup. Built-in roles can be edited or reset.',

  // Invoices
  'invoice.billToEmail': 'Where Send emails this invoice by default. You can pick a different address when sending.',
  'invoice.generateFromTime.client':
    'Pull uninvoiced billable time and billable expenses (at cost, on this client\'s projects) for the selected period. Time entries must fall entirely within the period.',
  'invoice.generateFromTime.tenant':
    'Pull your uninvoiced time and reimbursable expenses (including mileage) for the selected period. Time entries must fall entirely within the period.',
  'invoice.lineItems':
    'Add lines manually or use Generate from time above. On a new invoice, generate or add lines before saving.',
  'invoice.exportToOrganization':
    'CSV of Sent and Paid invoices to your organization in the date range: submitter, hours, time, reimbursements and total — for payroll or accounting.',

  // People
  'person.orgRole':
    'How this person relates to this organization, such as board member, case manager, or family. Title is their job, and it stays the same if they belong to more than one organization.',
  'contact.emailAddresses': 'Mail from any of these addresses is matched to this person.',

  // Organizations / clients
  'organization.newType':
    'Client turns on projects, time and invoices. Partner is tagged only. Open opportunities belong on the Pipeline (New Lead), not here.',
  'organization.journey':
    'Client turns on projects, time and invoices. Make client on a pipeline card sets this for you.',
  'organization.clientActive':
    'Inactive keeps projects and history; use it when you are not actively working together.',
  'organization.tags': 'Partner, Vendor, Referral source… Press Enter to add. A partner can also be a client.',
  'organization.invoiceCode': 'Prepended to invoice numbers, e.g. UPSP-0001. Needed once you invoice.',
  'organization.services': 'What this organization offers or is known for. Press Enter to add each service.',
  'organization.products': 'Products this organization offers or is known for. Press Enter to add each one.',
  'organization.focusAreas': 'Nonprofit sectors this organization works in, such as Recovery or Education.',
  'organization.publicListing':
    'When on, this organization can appear on a public partner or network listing that reads this flag from Back Office.',
  'organization.clientPortal':
    'A bookmarkable link for your client. No login or password. Turn on Client portal enabled to share the link.',

  // Settings — business
  'settings.business.profile':
    'Company name, address and phone appear on invoices under your logo. Billing email is where invoices to your organization are sent.',
  'settings.business.logo': 'PNG, JPEG, GIF, or WebP. Max 5 MB.',
  'settings.business.billingEmail': 'Where invoices addressed to your organization are sent by default.',
  'settings.expensesInvoicing.mileageRate':
    'Mileage expenses are miles times this rate. A saved expense keeps the rate it was entered with.',
  'settings.expensesInvoicing.categories':
    'Categories on the Expenses page. Built-ins (Software, Travel, Mileage, …) can be renamed or hidden; Mileage cannot be removed. Add your own anytime.',
  'settings.expensesInvoicing.paymentMethods':
    'Payment methods on the expense form (Personal Card, Company Card, Cash, ePayment, and custom). Rename or hide built-ins; add your own.',

  // Settings — integrations
  'settings.apiKeys':
    'Grant external services access to UpStart Back Office. Each key is shown once on creation — store it securely.',
  'settings.apiKey.name': 'Label for this key so you know which integration uses it.',
  'settings.asana.setup':
    'In Asana: OAuth → Permission scopes — disable Full permissions, then enable projects:read, tasks:read, users:read, workspaces:read. Under Manage distribution, allow your workspace. Save credentials here before Connect.',
  'settings.asana.redirectUri':
    'Must match the redirect URL in your Asana app exactly. Use the suggested URL below when provided.',
  'settings.googleCalendar.setup':
    'Connect Google Calendar for discovery chat booking. Busy times on all Google calendars block slots; bookings create events on the calendar you select. Create OAuth Web credentials in Google Cloud Console and enable the Calendar API. Save credentials before Connect.',
  'settings.googleCalendar.redirectUri':
    'Must match the redirect URL in Google Cloud Console exactly. Use the suggested URL below when provided.',
  'settings.googleCalendar.bookingCalendar':
    'Confirmed bookings are created on this calendar. Busy times on all connected calendars still block availability.',

  // Platform / inbox / accounting
  'tenant.overview':
    'Each tenant is a separate organization with its own data. After adding one, switch into it and add its first admin from Users.',
  'tenant.slug':
    'Lowercase letters, numbers and dashes. Also used for email capture (slug@in.…).',
  'tenant.internalDomains':
    'Comma separated. Email from these domains is treated as the team, not contacts.',
  'tenant.myHourlyRate':
    "What you're paid per hour when you invoice this tenant for your own time. Leave blank to use your user rate.",
  'tenant.modules':
    'Optional parts of the app this tenant can use. When a module is off its menu items, role options and pages are hidden. Turning it off keeps its data.',
  // Form builder (shared by every form)
  'form.builder.sections': 'Groups of fields on the form, e.g. Contact details, Background. Add a section, then add fields to it.',
  'form.builder.fieldType': "What the field holds. You can change it until someone answers the form; after that it's locked, because answers are stored in the type's shape.",
  'form.builder.options': 'The choices people can pick from. Renaming a choice keeps what was already picked.',
  'form.builder.optionsScored':
    'The choices people can pick from, and the points each one is worth. Leave points empty on fields that are not scored.',
  'form.builder.fileMultiple': 'Off: one file. On: up to 10. Word, PDF, Excel, PNG and JPG files up to 10 MB each.',
  'form.builder.subfields':
    "The fields each row has, e.g. Name, Dosage and Frequency for a medication list. People click Add another for each row. Once the form has answers, a saved sub-field's type can't be changed; deleting one removes its answers.",
  'form.builder.scoreGroup': 'The score area this question counts toward. Results show a percentage for each area.',
  'form.builder.required': 'People filling in the form through a public link must answer it (a repeating group needs at least one row, a file upload at least one file). Staff can save with it empty.',
  // Forms area
  'forms.page':
    'Forms you build and share with a link: sign-ups, assessments, feedback. Each form has its own submissions. A form is live once you publish it.',
  'forms.import':
    'A form file made with Export form file (on a form page), e.g. from another UBO. It creates a draft with the same fields, settings and scoring. Publish it when ready.',
  'forms.form.page':
    'Build the form here. Details and Settings save with Save; Scoring and Fields save right away. Public links show the published version, so publish again for changes to reach people.',
  'forms.form.preview':
    'Opens the draft in a new tab. Refresh that tab after you change the form. Answers are not saved; required fields do not block paging in preview.',
  'forms.form.description': 'Shown at the top of the form.',
  'forms.form.layout':
    'One page: everything on one scrolling page. Page by section: one section at a time with Next and Back. Page by question: one question or text block per screen; picking a single choice moves on by itself. Accordion: sections open one at a time. Tabs: a tab per section. The link page and the embed code follow it.',
  'forms.form.review':
    'On: submissions wait under Waiting for review until you Attach them (to a client or organization, new or existing) or Dismiss them. Off: they are attached as they come in.',
  'forms.form.resultsEmail': 'After sending, people get an email with their results (scored forms) or your thank-you message.',
  'forms.form.thankYou':
    'Shown after someone sends the form, and in the email when Email people their results is on. Add links here, e.g. to book a call. Empty: "Thanks! … was sent to …".',
  'forms.form.scoring':
    'Give answer choices points (in each select field). People get a percentage of the points possible, the profile for that percentage, and a percentage per score area.',
  'forms.form.scoreAreas': 'Groups of questions scored together, e.g. Workflows, Data, Security. Pick a question\'s area when you edit the field.',
  'forms.form.bands':
    'Profiles by score, e.g. 0–25% Finding Your Bearings. Each has what it means, next steps and an optional profile resource. People see the profile their percentage falls in.',
  'forms.form.profileResource':
    'Optional link or uploaded file people can open from their results (and in the results email). Use Label for the link text.',
  'forms.form.bandUpTo': 'The highest percentage for this profile. The profile with the highest number also covers everything above it.',
  'forms.form.links': 'Links anyone can use to fill in the published form, e.g. on your website. Each one can need a passcode or an emailed code.',
  'forms.submissions.page': 'Everything sent through this form. In progress holds forms started but not sent yet. Open one to see the answers and score, then Attach or Dismiss it. Export Excel downloads a workbook for analysis: Answers (a row per answer), Results (scored forms) and Questions (the key). The arrow exports this tab only.',
  'forms.submission.page':
    'One submission: the answers, the results (total score, profile and score areas) and who sent it. Attach picks the client or organization it belongs to (or a new one), then shows who will see it before you confirm. The ⋮ menu has Dismiss (or Restore), Export PDF, Export Excel and Delete.',
  'forms.form.client':
    "Client forms: answers attach to a client and show in the Forms panel on the client's page. Name the form anything.",
  'forms.form.usedFor': 'Your own note on what this form is for. It shows in the Used for column of the Forms list. Optional.',
  'forms.form.copies':
    'One living copy: each client has one copy you keep up to date (like a profile); Add form opens it. New each time: every Add form or attached submission is a new dated result (like an intake).',
  'forms.form.visitChecklist': 'Care: caregivers fill this form in on every visit, next to the times and notes. One form at a time; turning it on here turns it off on the others.',
  'forms.form.access':
    "Client forms: per role None, Read or Edit for the answers on client pages. Admins can always edit. People only see clients they can reach (assigned to them unless their role has Organizations: All). Designing the form is the Forms area.",
  'forms.result.page':
    "One client's answers to a client form. Answers save as you go; Submit when done. The ⋮ menu has Move, Share link (for someone outside, e.g. family) and Delete.",
  'forms.result.links':
    "A link to this result, e.g. for family to fill it in. Changes save straight to the form and notify your team.",
  // Care module
  'care.visit.page':
    'One visit: when, the visit checklist and notes. While it is in progress, End visit records the end time and adds the hours to the timesheet (for invoicing as usual). Once its time is on an invoice, the times are locked.',
  'care.visit.time': 'An end time earlier than the start counts as the next day (overnight visits).',
  'care.schedule.page':
    'Shifts for the week in seven columns (Mon–Sun). Add shift plans a one-off or repeating shift; use Add shift under a day to default the date. The ⋮ menu on a shift edits, cancels, deletes, or starts the visit when it is your shift.',
  'care.schedule.worker': 'Leave empty for an open shift nobody has yet. The worker gets a notification when a shift is assigned to them.',
  'care.schedule.repeat':
    'Repeats on the days you pick, at the same local time, until the date you set (or keeps going). Each shift can still be edited on its own.',
  'form.links.verify':
    'No check: anyone with the link. Passcode: share it separately (phone or text). Emailed code: a code goes to an email address before the form opens.',
  'form.links.websites':
    'Leave empty to let any website show the form. Or list websites (one per line, e.g. example.org): only those can show it with the embed code or their own code. Links opened directly always work.',
  'form.links.token': "Developers use this key with UBO's public form API to draw the form with their site's own code.",
  'form.links.expires': 'Leave empty for a link that never expires. You can revoke a link anytime.',
  'dashboard.page':
    "What needs you today. Activity (replies, next steps, and quiet clients) is one card with tabs. Tasks, time, invoices, and bookings are the others. Lists scroll; the arrow in the card header opens the full page. Mine / Everyone's switches Activity and invoices.",
  'activity.page':
    "All activity is every email, call, meeting and note (first tab). To do lists what needs someone: emails waiting for a reply, next steps (overdue ones tagged), quiet clients and unfiled email. Pick an organization or person to narrow both.",
  'activity.loggedBy':
    'Only items a teammate saved in Back Office (notes, calls, meetings) or filed as their action. Not “who sent the email”—use Person for a CRM contact on the thread.',
  'settings.activity.needsReplyDays':
    'An email shows under Needs reply when the latest message on its thread came from outside and has waited this many days.',
  'settings.activity.goneQuietDays':
    'An active client shows under Gone quiet when nobody has been in touch for this many days.',
  'inbox.unfiled':
    "Email CC'd to your capture address that we couldn't match to a client or lead. File one and the rest of its thread follows; we remember people so their next email files itself.",
  'bankImport.overview':
    'Upload a bank CSV. Rows are deduplicated so re-uploading is safe. Categories are remembered; Post suggested posts all pre-filled matches at once.',

  // Auth
  'auth.invitePassword':
    'At least 8 characters, with upper and lower case letters, a number and a symbol.',

  // Task Manager
  'tm.forms.intro': 'Each submission becomes a task in this project.',
  'tmForm.access':
    'Project collaborators: signed-in people on this project. Anyone with the link: no sign-in; email required. API key: apps and servers post with a secret — save the form after choosing API key before generating a key.',
  'tmForm.apiKey': "Copy the key now — it won't be shown again.",
  'tmForm.apiSubmit':
    'POST with X-Form-Key or Authorization Bearer. answers uses question keys; submitter and context are optional. Files: multipart/form-data with answers as JSON and up to 5 files. GET the URL without /submit to read questions.',
  'tm.addProjectToTasks':
    'Only existing projects can be added to Tasks. Create new projects on the Projects page first.',
  'tm.notificationsEmailPrefs':
    'Moved to My Account → Email notifications. In-app alerts always appear in the bell and inbox; toggles there control email too.',
  'account.email':
    'This is your sign-in address. If you change it, use the new email the next time you sign in.',
  'account.emailNotifications':
    'In-app notifications always appear in the bell and Task Manager inbox. Choose which types also send email. Files attached, due date changes, moves and new subtasks are off until you turn them on.',

  // Platform
  'platform.guideSetup':
    'The Guide answers “where do I click?” from docs/help-guide/. Signed-in users see JD (guide avatar) bottom-left once configured. The API key is encrypted at rest and never shown again after saving.',

  // Organization links (person)
  'person.organizationLinks':
    "Not linked to any organization is fine for an individual. Link below to connect them to a client record with a role.",

  // Login / password
  'login.tempPassword': 'Your account uses a temporary password. Set a new password to continue.',
  'login.resetRequest': "Enter your email and we'll send a code to reset your password.",
  'login.resetConfirm': 'Enter the code from your email and your new password.',

  // Pipeline card
  'lead.primaryContact': 'The main person at this organization for this opportunity.',
  'lead.warmConnect': 'Someone who can introduce you to this organization.',

  // Time entry
  'timeEntry.notes': 'Optional description of what you worked on.',
};

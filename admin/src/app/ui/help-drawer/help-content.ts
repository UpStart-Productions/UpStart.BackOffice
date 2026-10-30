/**
 * Help drawer articles, keyed by route pattern (no leading slash; `:param` matches any segment).
 * The drawer shows the most specific match for the current URL, then falls back to parent routes
 * (e.g. tasks/projects/abc/tasks/xyz → tasks/projects/:projectId). Query strings are ignored.
 *
 * Keep these in step with docs/help-guide/ (which feeds the Back Office Guide chat).
 */
export interface HelpSection {
  heading: string;
  body: string;
}

export interface HelpArticle {
  title: string;
  intro?: string;
  sections: HelpSection[];
}

const INVOICE_FORM: HelpArticle = {
  title: 'Invoice',
  intro: 'Build an invoice by hand or pull it from tracked time. Save it as a draft, then send it when it looks right.',
  sections: [
    {
      heading: 'Bill to',
      body: 'A client: pick the client. Bill-to email and address fill in from the client and can be changed for this invoice. The client\'s Invoice Code is prepended to the invoice number (e.g. UPSP-0001), so the client needs one before you invoice. Our organization: you bill your own organization for your work; bill-to fills in from Settings → Business.',
    },
    {
      heading: 'Generate from time',
      body: 'Billing a client pulls the client\'s uninvoiced billable time and billable expenses on its projects, at cost. Billing your organization pulls your own uninvoiced time (billable or not) and your uninvoiced reimbursable expenses, including mileage, at your own hourly rate first. Pick the period (month, quarter or a date range), optionally one project. Time entries must fall entirely within the period. If you see "missing an hourly rate", set a rate on the entry, project or user and generate again. The same hour can be on a client invoice and on your invoice to your organization, but not on two of the same kind.',
    },
    {
      heading: 'Line items',
      body: 'Add line adds a row; each has a project, description, quantity or hours, and rate. Amount is calculated. Delete line removes a row.',
    },
    {
      heading: 'Tax rate',
      body: 'Enter a decimal: 0.0875 for 8.75%. Leave it blank or 0 for no tax.',
    },
    {
      heading: 'Saving and sending',
      body: 'Save Invoice keeps it as a draft. Download PDF shows what the client will get. Send emails it with the PDF attached: choose the client email, a project contact or another address, and optionally add a message, which replaces "Thank you for your business."',
    },
  ],
};

const ORG_DETAIL: HelpArticle = {
  title: 'Organization',
  intro: 'Everything about one organization lives here: details, tags, people, projects, emails and files.',
  sections: [
    {
      heading: 'Status',
      body: 'Prospect, Client or Other. A pipeline card makes an organization a Prospect, and Make client makes it a Client. When status is Client, Active or Inactive says whether you are still working together. Client turns on projects, time and invoices.',
    },
    {
      heading: 'Tags',
      body: 'Say what the organization is to you: Partner, Vendor, Referral source, or anything you type. Press Enter to add one. Tags are shared with People, so you can filter both by the same tag. A partner can also be a client.',
    },
    {
      heading: 'Make client',
      body: 'Turns a prospect or other organization into a client. Any open pipeline card for it is archived, since the opportunity is won. Nothing is copied.',
    },
    {
      heading: 'Invoice Code',
      body: 'Short code prepended to invoice numbers, e.g. UPSP-0001. You only need it once you invoice.',
    },
    {
      heading: 'People',
        body: 'The people at this organization. Click a name to open their People profile. The line under a name is their role there when one is set, otherwise their title. Role is how they relate to this organization (board member, case manager, family). Title is their job. People are added automatically when you file an email from them, or use Add existing person / Add new person. The red trash control on the right removes them from this organization only; they stay in People.',
    },
    {
      heading: 'Next step',
      body: 'Under the name: what happens next, when, and who owns it. Set next step or Edit to change it. Done records "Done: …" on the timeline, clears it and asks for the next one. Next steps show on Activity → To do, overdue ones in red.',
    },
    {
      heading: 'Activity',
      body: 'Emails, calls, meetings and notes for this organization. The box at the top logs a Note, Call or Meeting in one line (type @ to mention a teammate or one of their people; teammates get a notification); tick Set the next step to set it at the same time; More details… opens the full form. Include people\'s activity also shows activity logged on this organization\'s people that isn\'t filed to any organization ("From [name]\'s activity"). Email filed to another organization never shows here. Email threads show their newest message; expand for earlier ones. Open full view opens Activity for this organization. In the full form, on a call, Who called is We called, They called, or Internal. The caller is on the left, then an arrow, then who was called. On a meeting, Where is the place or link. Notes / next steps is a formatted note. Who was involved lists Our team and the people at this organization. The type menu (All, Emails, Calls, Meetings, Notes) and Search sit above the list. Search looks only at the type you picked. The menu on an entry can Forward it (email the people you pick, and notify teammates), Create task (pick a task project, section, title, and who it is assigned to), or Delete it after you confirm. Emails appear when the capture address is CC\'d on the thread.',
    },
    {
      heading: 'Files, links and notes',
      body: 'Upload files (drag and drop works), add links, or write notes that stay with the organization.',
    },
    {
      heading: 'Client portal',
      body: 'Turn on Portal enabled to give a client a bookmarkable link with no login or password. Copy it to share; Regenerate link makes the old one stop working.',
    },
  ],
};

const NEW_ORG: HelpArticle = {
  title: 'New organization',
  intro: 'Add an organization. Only the name is required.',
  sections: [
    {
      heading: 'Type',
      body: 'Prospect also puts a card in the first lane of the pipeline. Client turns on projects, time and invoices. Partner adds the Partner tag and stays off the pipeline.',
    },
    {
      heading: 'Tags',
      body: 'Optional labels such as Partner, Vendor or Referral source. Press Enter to add one.',
    },
  ],
};

const LEAD_DETAIL: HelpArticle = {
  title: 'Pipeline card',
  intro: 'One opportunity: who it\'s with, where it stands, and what happens next.',
  sections: [
    {
      heading: 'Organization and person',
      body: 'Every card belongs to an organization, and its contact is a real person in People. If the organization name matches an existing one, the card joins it; otherwise a new organization is created as a Prospect. Open organization goes to its page.',
    },
    {
      heading: 'Lane',
      body: 'Where the card sits on the board. Changing it here is the same as dragging the card. Lanes track the conversation; they don\'t change the organization\'s status.',
    },
    {
      heading: 'Next action',
      body: 'What you plan to do next and when. This leads the card on the board, and a red warning shows there once the date passes.',
    },
    {
      heading: 'Last contact',
      body: 'How long since the last logged email, call or note. Logging activity below keeps it current.',
    },
    {
      heading: 'Make client and Archive',
      body: 'Make client when they sign on: the organization becomes a Client and the card leaves the board (archived, history kept). Archive takes a card off the board when it\'s going nowhere. Restore either one from the Archived view.',
    },
    {
      heading: 'Activity and files',
      body: 'Log activity records a call, meeting, or note. On a call, Who called is We called, They called, or Internal. The caller is on the left, then an arrow, then who was called. On a meeting, Where is the place or link. Notes / next steps is a formatted note. Who was involved lists Our team and the people at this organization. The type menu (All, Emails, Calls, Meetings, Notes) and Search sit above the list. Search looks only at the type you picked. The menu on an entry can Forward it (email the people you pick, and notify teammates), Create task (pick a task project, section, title, and who it is assigned to), or Delete it after you confirm. Filed emails show here too, along with files, links and notes.',
    },
  ],
};

const BOOKING_TYPE_FORM: HelpArticle = {
  title: 'Booking type',
  intro: 'A kind of appointment people can book, such as a discovery call, with its own schedule and public page.',
  sections: [
    {
      heading: 'Basics',
      body: 'Name and slug. The slug is used in the public booking API, so change it carefully once it\'s live.',
    },
    {
      heading: 'Host and schedule',
      body: 'Pick the host, the duration, minimum notice (hours before a slot can be booked) and how far ahead (days) people can book. Set the timezone and the available hours for each day.',
    },
    {
      heading: 'Public page and calendar',
      body: 'Public booking page URL is used for cancel links in confirmation emails. Google Calendar event title is what shows on the host\'s calendar. Busy times come from the calendar connected in Settings.',
    },
    {
      heading: 'Pipeline',
      body: 'When "Create or update pipeline lead on booking" is on, a booking creates or updates a pipeline card. Pipeline lane is where new cards go (blank means the first lane). A card still in the first lane moves to this lane when the person books; cards further along stay put.',
    },
    {
      heading: 'Pricing',
      body: 'Price, Billable and Require payment are for display for now. Payment collection isn\'t built yet.',
    },
  ],
};

const PROJECT_FORM: HelpArticle = {
  title: 'Project',
  intro: 'Billable (or internal) work that time, tasks and invoices hang off.',
  sections: [
    {
      heading: 'Client',
      body: 'The client this work is for. Choose None for a personal or internal project.',
    },
    {
      heading: 'Hourly rate and billable',
      body: 'Hourly Rate overrides the user\'s rate for time on this project; leave it blank to use each user\'s rate (set on Users). Only billable time is pulled onto invoices by Generate from time.',
    },
    {
      heading: 'People',
      body: 'Same People panel as on a client: Add existing person (search) or Add new person. Save the project to refresh names and photos from People. Row menu Open in People edits the profile. They appear as invoice recipients when you send.',
    },
    {
      heading: 'Asana configuration',
      body: 'Link an Asana board and one or more sections. Incomplete tasks from those sections appear on timesheets. Use Refresh from Asana to pull new tasks. Asana must be connected in Settings first.',
    },
    {
      heading: 'Tasks (Task Manager)',
      body: 'When this project is in Task Manager, the Tasks card shows up to five open tasks sorted by due date. Click a task name to open it in Task Manager, or use Open in Tasks for the full board.',
    },
    {
      heading: 'Manual tasks',
      body: 'Tasks you can pick when tracking time on this project, billable or not. Use Add or the row menu to create or edit a task in a dialog. Use these when the work isn\'t in Asana.',
    },
  ],
};

export const HELP_CONTENT: Record<string, HelpArticle> = {
  dashboard: {
    title: 'Dashboard',
    intro: 'Your landing page after sign-in: what needs you today. You only see the parts your role can use.',
    sections: [
      {
        heading: 'Count cards',
        body: 'Needs reply, Next steps due, Tasks due, Overdue invoices and Unfiled. Click a card to open that list in Activity, Tasks or Invoices.',
      },
      {
        heading: 'Cards',
        body: 'My tasks shows what is due in the next week, overdue first. Click a task or the project under it. Activity is one wider card with tabs for Needs reply, Next steps, and Gone quiet; click an organization, person, or pipeline card. My time shows a running timer, your hours today and this week, and the entries from this week, newest first; click a project, organization, or task. Invoices shows the amount outstanding, overdue, drafts to send and invoices coming due; click an invoice or its client. Upcoming bookings lists confirmed bookings in the next week; a guest tied to a pipeline card opens that card. A long list scrolls inside the card. The arrow next to the drag handle opens Tasks, Activity, the timesheet, Invoices, or Bookings.',
      },
      {
        heading: "Mine / Everyone's",
        body: "Switches the Activity counts and lists and the invoice figures between your own items and the whole team's. My tasks and My time are always yours.",
      },
      {
        heading: 'Rearranging',
        body: 'Drag a card by the ⋯ handle in its header to move it. Your order is remembered on this computer and browser.',
      },
    ],
  },

  // ── CRM ────────────────────────────────────────────────
  activity: {
    title: 'Activity',
    intro: 'What needs attention (To do) and every email, call, meeting and note across your organizations (All activity).',
    sections: [
      {
        heading: 'To do',
        body: 'Needs reply: the latest email on a thread came from outside and nobody has answered. Next steps: every next step that is set, soonest first, with an Overdue tag on late ones. Gone quiet: active clients nobody has contacted in a while. Unfiled: captured email that could not be matched. Mine shows your items; Everyone\'s shows the whole team\'s. The ⋮ menu on a row can open it, Work on it (shows that organization here with its next step), snooze it, or mark No reply needed. How many days count is in Settings → Activity.',
      },
      {
        heading: 'Filing unfiled email',
        body: 'Under Unfiled, use File… and choose an Organization or a Pipeline card. Leave "Link the people on this email to the organization" on so their next email files itself.',
      },
      {
        heading: 'All activity',
        body: 'Every email, call, meeting and note, newest first. Filter by type, who logged it, dates, or search. Email threads show their newest message; expand to see earlier ones.',
      },
      {
        heading: 'One organization or person',
        body: 'Pick an organization or person to the right of the page title, or use Open full view on their page. Panels on the right show the next step, details and people (for a person: details and their organizations), next to the quick log and timeline. Click the name in Details to open their page.',
      },
    ],
  },

  pipeline: {
    title: 'Pipeline',
    intro: 'Opportunities you\'re working to win. Current clients aren\'t here; they\'re under Office → Clients.',
    sections: [
      {
        heading: 'Cards',
        body: 'Each card leads with its next step and due date, then how long since the last contact. A red warning icon means the next step is overdue; hover it for the date. View people in the card menu lists everyone at the organization.',
      },
      {
        heading: 'Moving cards',
        body: 'Drag a card between lanes as the conversation moves. Lanes don\'t change anything else. When they sign on, use Make client: the organization becomes a Client and the card leaves the board. When it\'s going nowhere, Archive the card.',
      },
      {
        heading: 'New Lead',
        body: 'Adds a card to the first lane. If the organization matches an existing one, the card joins it; otherwise a new Prospect organization is created. Adding a Prospect on the Organizations page also creates a card here.',
      },
      {
        heading: 'Editing lanes',
        body: 'Add lane is the column at the end. Click a lane name to rename it (Enter saves, Esc cancels). Drag a lane by its header to reorder. The X on a lane removes it; if it has cards, archived ones included, choose where they move. A pipeline always keeps at least one lane.',
      },
      {
        heading: 'More than one pipeline',
        body: 'The ⋮ menu at the top right has New pipeline, Rename pipeline and Delete pipeline (only an empty pipeline can be deleted). With more than one pipeline, pick which board to view from the list beside Board / Archived. For example, a second pipeline can track partners you\'re recruiting.',
      },
      {
        heading: 'Archived',
        body: 'Use Board / Archived on the left to see won and archived cards. Restore puts a card back on the board. Delete removes it for good.',
      },
    ],
  },
  'pipeline/new': { ...LEAD_DETAIL, title: 'New Lead' },
  'pipeline/:id': LEAD_DETAIL,

  organizations: {
    title: 'Organizations',
    intro: 'Every organization you deal with: prospects, clients, partners and anyone else.',
    sections: [
      {
        heading: 'Filters',
        body: 'The type dropdown defaults to Any Type, or choose Prospects, Clients or Other. The tag list narrows to one tag, such as Partner. Filters stay in the page address, so you can bookmark a view.',
      },
      {
        heading: 'Status',
        body: 'Set for you: a pipeline card makes an organization a Prospect, and Make client makes it a Client. Mark a client Inactive on the organization page when the work ends.',
      },
      {
        heading: 'New Organization',
        body: 'Choose a type. Prospect also adds a card to the pipeline. Partner adds the Partner tag and stays off the pipeline.',
      },
    ],
  },
  'organizations/new': NEW_ORG,
  'organizations/:id': ORG_DETAIL,

  clients: {
    title: 'Clients',
    intro: 'The organizations you\'re working for right now. Projects, time and invoices hang off these.',
    sections: [
      {
        heading: 'Who shows here',
        body: 'Organizations with status Client. Active and Inactive show in the Status column. Prospects are on the Pipeline, and everyone else is under CRM → Organizations.',
      },
      {
        heading: 'New Client',
        body: 'Adds an organization as a client straight away. For someone you\'re still trying to win, add them to the Pipeline instead.',
      },
      {
        heading: 'Last contact',
        body: 'How long since the last logged email, call or note with that client.',
      },
    ],
  },
  'clients/:id': ORG_DETAIL,

  people: {
    title: 'People',
    intro: 'Everyone you deal with. A person can belong to one or more organizations, or none.',
    sections: [
      {
        heading: 'Adding a person',
        body: 'New Person asks for first and last name, their email, phone, title, LinkedIn and personal URL, optional photo, and optionally an organization and tags. Pick New organization in the Organization list to add name, email and website for a stub organization and link this person to it. Role is how they relate to that organization (board member, case manager, family). Title is their job, and it stays the same if they belong to more than one organization.',
      },
      {
        heading: 'Tags',
        body: 'Filter by a tag with the tag list at the top. Network is everyone from the old Network page (people you\'ve talked to); Partner is someone who works with you. Tags are shared with Organizations.',
      },
      {
        heading: 'Needs review',
        body: 'People created automatically from email. Check the details and Mark reviewed. The People menu item shows how many are waiting.',
      },
      {
        heading: 'Delete',
        body: 'When your role allows it, open the row menu (⋯) and choose Delete. That removes the person from Back Office after you confirm.',
      },
    ],
  },
  'people/:id': {
    title: 'Person',
    intro: 'One person, their organizations, tags and everything you\'ve logged with them.',
    sections: [
      {
        heading: 'Profile',
        body: 'First and last name, email and title on one form; phone, LinkedIn URL and personal URL below. Save stores the profile. To delete someone, use Delete on their row on the People list when your role allows it.',
      },
      {
        heading: 'Photo',
        body: 'The top panel on the right. Drop an image or click to browse. The trash can on the photo removes it.',
      },
      {
        heading: 'Email addresses',
        body: 'Mail from any of these addresses is matched to this person. Add every address they use so their emails file themselves. Extra addresses can be removed. The primary address stays.',
      },
      {
        heading: 'Tags',
        body: 'Partner, Referral source or anything you type. Press Enter to add one, then Save.',
      },
      {
        heading: 'Organizations',
        body: 'Link to an organization with an optional role: how they relate to it, such as board member or case manager. Title on the profile is their job. Unlink removes the link without deleting anything. Someone with no organization (an individual client) can become a client with Make client from this person.',
      },
      {
        heading: 'Activity',
        body: 'Emails, calls, meetings and notes involving this person, across all their organizations. Record a call, meeting, or note with Log activity on the organization or pipeline card. The menu on an entry can Forward it, Create task, or Delete it after you confirm.',
      },
    ],
  },

  bookings: {
    title: 'Bookings',
    intro: 'Appointments people booked through your public booking pages.',
    sections: [
      {
        heading: 'Bookings list',
        body: 'Each booking shows when, the type, the guest and their organization. Filter by type at the top. The Lead link opens the pipeline card the booking created or updated.',
      },
      {
        heading: 'Pipeline',
        body: 'A booking creates or updates a pipeline card, so the guest shows up in People at a Prospect organization. The booking type decides which lane.',
      },
      {
        heading: 'Booking types',
        body: 'The Booking types tab sets up what people can book. It\'s only visible to roles with Bookings Setup.',
      },
    ],
  },
  'bookings/types': {
    title: 'Booking types',
    intro: 'The kinds of appointment people can book, each with its own schedule and public page.',
    sections: [
      {
        heading: 'New booking type',
        body: 'Set a name, host, duration and weekly availability. Click a row to see its settings and recent bookings; Edit opens the full form.',
      },
      {
        heading: 'Public page',
        body: 'Each type has its own slug and public page. Inactive types can\'t be booked.',
      },
      {
        heading: 'Pipeline lane',
        body: 'Which lane new cards go into when someone books. Blank means the first lane.',
      },
    ],
  },
  'bookings/types/new': { ...BOOKING_TYPE_FORM, title: 'New booking type' },
  'bookings/types/:id': BOOKING_TYPE_FORM,

  // ── Office ─────────────────────────────────────────────
  projects: {
    title: 'Projects',
    intro: 'Billable work tied to clients, plus personal or internal projects.',
    sections: [
      {
        heading: 'The list',
        body: 'Name, client, rate, billable and status. Search by project or client. Click a row to edit.',
      },
      {
        heading: 'New Project',
        body: 'Pick a client (or None for internal work), set an optional hourly rate, and add tasks to track time against.',
      },
      {
        heading: 'Projects and Tasks',
        body: 'Projects here are the same projects Task Manager uses. Add a project to Tasks to manage its to-dos there; Open in Projects (in the task project menu) comes back here.',
      },
    ],
  },
  'projects/new': { ...PROJECT_FORM, title: 'New Project' },
  'projects/:id': PROJECT_FORM,

  tasks: {
    title: 'My tasks',
    intro: 'Every task assigned to you, across all Task Manager projects.',
    sections: [
      {
        heading: 'Groups',
        body: 'Tasks are grouped by due date: Overdue, Today, Next 7 days, Later and No due date. Show recently completed brings back what you just finished.',
      },
      {
        heading: 'Filtering',
        body: 'Filter by tag at the top. Tasks that repeat show a Repeats marker.',
      },
      {
        heading: 'Opening a task',
        body: 'Click a task to open its details: description, subtasks, attachments, comments and followers.',
      },
    ],
  },
  'tasks/inbox': {
    title: 'Task inbox',
    intro: 'Notifications about tasks: assignments, mentions, comments and form submissions.',
    sections: [
      {
        heading: 'Working the inbox',
        body: 'Click an item to open the task. Archive clears it; Mark all read clears the unread count.',
      },
      {
        heading: 'Email notifications',
        body: 'In-app notifications always appear here. Notification settings chooses which also send an email. Assignments, @mentions, comments, completed tasks, projects and form submissions email by default; files attached, due date changes, moves and new subtasks on tasks you follow only show here unless you turn their email on. You follow a task you create, are assigned, comment on or are @mentioned in.',
      },
    ],
  },
  'tasks/projects': {
    title: 'Task projects',
    intro: 'All Task Manager projects you can see, with open task counts and members.',
    sections: [
      {
        heading: 'Add project',
        body: 'Adds one of your existing projects (from Projects) to Task Manager so you can track its tasks. Remove from Tasks in the project menu takes it off again without deleting anything.',
      },
      {
        heading: 'Finding a project',
        body: 'Search by project or client. Inactive projects are marked Inactive.',
      },
    ],
  },
  'tasks/projects/:projectId': {
    title: 'Project tasks',
    intro: 'A project\'s tasks, organized into sections.',
    sections: [
      {
        heading: 'Adding tasks',
        body: 'Add task at the top, or Add task… at the bottom of a section. Press Enter to keep adding. Add section creates a new group; the section menu renames, moves or deletes it.',
      },
      {
        heading: 'Task details',
        body: 'Click a task to open the side panel: assignee, due date, repeats, tags, description, subtasks, attachments and comments. Type @ in a comment to mention someone. You can edit or delete your own comment for 1 hour after posting; admins can delete any comment anytime. Copy task link shares it.',
      },
      {
        heading: 'Attachments',
        body: 'Drop files on the box under Description, or click it (or the paperclip at the top) to browse. Each file shows a spinner while it uploads, then appears as a card below. Click a card to open it: photos, videos (MP4, MOV) and PDFs open in a viewer, other files in a new tab. Video cards show the first frame. The trash can on a card removes it. Files can be up to 25 MB.',
      },
      {
        heading: 'Moving and bulk actions',
        body: 'Drag tasks to reorder or move between sections. Hover a task row and use the down arrow (left of the drag handle) to move it to another section. Select several to change them together. A task can also be in another project.',
      },
      {
        heading: 'Customize',
        body: 'Add custom fields for anything tasks need to track. Members controls who can see the project; Share picks someone from People or your team, or you can type an email — guests only see projects shared with them. Project contacts (⋯ menu) lists client-side contacts from the Projects page; editors can add people from People there.',
      },
      {
        heading: 'Forms',
        body: 'Turn submissions into tasks, for bug reports, requests or intake. Find Forms in the project menu.',
      },
    ],
  },
  'tasks/projects/:projectId/forms': {
    title: 'Forms',
    intro: 'Each submission becomes a task in this project.',
    sections: [
      {
        heading: 'New form',
        body: 'Name it, then add questions in the builder. Copy link to share it, or Open form to try it.',
      },
      {
        heading: 'Who can submit',
        body: 'Project collaborators (signed-in people on this project), Anyone with the link (no sign-in, email required), or API key (apps and servers post with a secret key).',
      },
    ],
  },
  'tasks/projects/:projectId/forms/:formId': {
    title: 'Form builder',
    intro: 'Design the form on the left; set where submissions go on the right.',
    sections: [
      {
        heading: 'Questions',
        body: 'Each question has an answer type and where the answer goes on the task (name, description, a custom field, and so on). Mark questions Required or Hidden. Hidden questions can be prefilled from the link. Files are attached to the task.',
      },
      {
        heading: 'Form settings',
        body: 'Intro text shows at the top. Thank-you message shows after submitting.',
      },
      {
        heading: 'New tasks',
        body: 'Pick the section, assignee and tags every submitted task gets.',
      },
      {
        heading: 'API access',
        body: 'Set Who can submit to API key to get an endpoint and key. Send the key as X-Form-Key or Authorization: Bearer. The key is shown once; copy it right away.',
      },
      {
        heading: 'Saving',
        body: 'Save keeps your changes; Discard throws them away. Delete form removes the form but not tasks it already created.',
      },
    ],
  },

  'time-entry': {
    title: 'Timesheet',
    intro: 'Track time by day. Billable time feeds invoices through Generate from time.',
    sections: [
      {
        heading: 'Tracking time',
        body: '+ Track time adds an entry: project, task (or Asana task), notes and duration. Start timer runs a timer instead; Stop saves the time. Start on an existing entry adds more time to it.',
      },
      {
        heading: 'Moving between days',
        body: 'Use the arrows for previous and next day, Jump to date to pick one, and Return to today to come back. Week total shows the whole week.',
      },
      {
        heading: 'Asana tasks',
        body: 'If the project is linked to an Asana board, its incomplete tasks show up in the task list. Set that up on the project.',
      },
      {
        heading: 'Import CSV',
        body: 'Bulk-load entries from a spreadsheet export.',
      },
      {
        heading: 'Other people\'s time',
        body: 'If your role can see everyone\'s time, Whose timesheet switches to another person.',
      },
    ],
  },

  expenses: {
    title: 'Expenses',
    intro: 'Money spent on the business or on client work, for the period you pick.',
    sections: [
      {
        heading: 'Period, filters and totals',
        body: 'Pick a month, quarter or date range (this month to start). Filter by status, client, project, person or category, or search. The totals at the top follow your filters: total spent, billable to clients and reimbursable. The donut charts split billable and reimbursable by status: amber is not billed or not submitted, blue is invoiced or submitted, green is client paid or reimbursed.',
      },
      {
        heading: 'Status',
        body: 'Billable: Not billed, then Invoiced once it is on a client invoice, then Client paid when that invoice is paid. Reimbursable: Not submitted, then Submitted once it is on the person\'s invoice to the organization, then Reimbursed when that invoice is paid. The invoice number links to the invoice. Voiding an invoice puts its expenses back to Not billed or Not submitted.',
      },
      {
        heading: 'On an invoice',
        body: 'While an expense is on an invoice, its amount, category, project, Reimbursable and Billable can\'t change and it can\'t be deleted. Take it off the invoice (edit the draft) first.',
      },
      {
        heading: 'New Expense',
        body: 'Description, amount (or miles for Mileage), and date are required. Category and miles sit on one row when Mileage is selected. Project and payment method are on the row below. Add notes or a receipt as needed.',
      },
      {
        heading: 'Reimbursable and billable',
        body: 'Reimbursable means someone paid personally and should be paid back; it goes on that person\'s invoice to the organization. Billable to client means it is charged to the client at cost on their next invoice; it needs a project for that client. An expense can be both.',
      },
      {
        heading: 'Mileage',
        body: 'Choose the Mileage category and enter Miles instead of Amount. The amount is miles times the mileage rate in Settings → Expenses and Invoicing. New mileage starts as Reimbursable. A saved mileage expense keeps its original rate.',
      },
      {
        heading: 'Categories',
        body: 'Admins manage the list under Settings → Expenses and Invoicing. Pick a category from the dropdown when logging an expense.',
      },
    ],
  },

  invoices: {
    title: 'Invoices',
    intro: 'Every invoice, newest first. Overdue and due-soon warnings appear above the table.',
    sections: [
      {
        heading: 'New Invoice',
        body: 'Starts a draft. Bill a client or your organization, then add lines by hand or use Generate from time.',
      },
      {
        heading: 'Export',
        body: 'Downloads a CSV of Sent and Paid invoices addressed to your organization, issued in the date range you pick: person, hours, time, reimbursements and total per invoice. Use it for payroll or accounting.',
      },
      {
        heading: 'Status',
        body: 'Draft until it\'s sent, then Sent, and Paid once you record payment. Drafts open in edit mode; other invoices open the detail view.',
      },
      {
        heading: 'Finding invoices',
        body: 'Search by number, bill to or status.',
      },
    ],
  },
  'invoices/new': { ...INVOICE_FORM, title: 'New Invoice' },
  'invoices/:id/edit': INVOICE_FORM,
  'invoices/:id': {
    title: 'Invoice',
    intro: 'The invoice as the client sees it, with its payment status.',
    sections: [
      {
        heading: 'Mark as paid',
        body: 'Record a payment with the amount and date paid. Paid shows below the total.',
      },
      {
        heading: 'Resend',
        body: 'Emails the invoice again. Choose the client email, a project contact or another address, and optionally add a message.',
      },
      {
        heading: 'Download PDF',
        body: 'The same PDF the client receives.',
      },
    ],
  },

  // ── Reports & Accounting ───────────────────────────────
  reports: {
    title: 'Reports',
    intro: 'Time, invoices and tasks for a period you pick.',
    sections: [
      {
        heading: 'Choosing a period',
        body: 'Pick Year, Month, Quarter or Date range, then Run report. Narrow to one client, and then one project, if you like.',
      },
      {
        heading: 'Time',
        body: 'Hours by project split into billable and non-billable, plus every entry. Export downloads PDF or Excel.',
      },
      {
        heading: 'Invoices',
        body: 'Invoices issued in the period: total invoiced, paid, and draft or sent, with totals by client. Export downloads PDF or Excel.',
      },
      {
        heading: 'Tasks',
        body: 'Tasks created, completed and overdue in the period, by project.',
      },
    ],
  },
  'accounting/accounts': {
    title: 'Chart of Accounts',
    intro: 'The accounts your books are organized by: assets, liabilities, equity, revenue and expenses.',
    sections: [
      {
        heading: 'Adding an account',
        body: 'Enter a code (e.g. 6000), a name and a type, then Add. Codes keep accounts in order on reports.',
      },
      {
        heading: 'Balances',
        body: 'Balance reflects posted journal entries, including bank transactions you\'ve posted.',
      },
    ],
  },
  'accounting/journal': {
    title: 'Journal',
    intro: 'Every entry posted to the books, manual or automatic.',
    sections: [
      {
        heading: 'Source',
        body: 'Shows where an entry came from, for example a manual entry or a bank import.',
      },
      {
        heading: 'New Entry',
        body: 'Record a manual journal entry, such as an adjustment or owner contribution.',
      },
    ],
  },
  'accounting/journal/new': {
    title: 'New Journal Entry',
    intro: 'A manual entry. Debits must equal credits before you can save.',
    sections: [
      {
        heading: 'Lines',
        body: 'Each line is an account with a debit or a credit. Add line for more. The totals under the lines show whether it balances.',
      },
      {
        heading: 'Memo',
        body: 'Say what the entry is for so it makes sense later in the Journal.',
      },
    ],
  },
  'accounting/bank-import': {
    title: 'Bank Import',
    intro: 'Bring in bank transactions and post them to the books.',
    sections: [
      {
        heading: 'Import CSV',
        body: 'Choose the bank account, then upload the CSV from your bank. Transactions already imported are skipped.',
      },
      {
        heading: 'Categorizing',
        body: 'Pick a category account for each transaction and click Post. UpStart Back Office remembers your choices and pre-fills matching transactions next time ("Learned from previous categorization").',
      },
    ],
  },
  'accounting/reports': {
    title: 'Accounting Reports',
    intro: 'Standard financial statements from your posted entries.',
    sections: [
      {
        heading: 'Profit & Loss',
        body: 'Revenue and expenses between two dates. Set P&L from and to, then Run.',
      },
      {
        heading: 'Balance Sheet and Trial Balance',
        body: 'Assets, liabilities and equity, and every account\'s debits and credits, as of one date.',
      },
    ],
  },

  // ── Admin ──────────────────────────────────────────────
  users: {
    title: 'Users',
    intro: 'Who can sign in to the back office, and what each role can do.',
    sections: [
      {
        heading: 'Users tab',
        body: 'Add User creates the user and sends a sign-in invite. Each user has a role and an optional hourly rate, used on invoices when a project has no rate of its own. Use the ⋮ menu on a row to edit, resend the invite, disable or delete. After fixing someone\'s email, send them a new sign-in invite. You can\'t change your own email. The same email can be a user in more than one organization, each with its own role; if they already have a sign-in they keep their password and just get a notice.',
      },
      {
        heading: 'Roles tab',
        body: 'What each role can see and do, per area. View is None, Own (their own records, or clients they\'re assigned to) or All. Create, Edit, Delete and Setup set what they can do with what they see. Admins can do everything.',
      },
      {
        heading: 'Built-in roles',
        body: 'Every organization starts with Manager, Team member, Coordinator, Bookkeeper, Contractor and Guest. Edit them freely; Reset to default undoes changes. They can\'t be deleted. Add role makes your own.',
      },
      {
        heading: 'Can use column',
        body: 'One chip per area, with icons for Create, Edit, Delete and Setup. Faded icons are not allowed. Hover a chip for a plain-language summary.',
      },
    ],
  },
  settings: {
    title: 'Settings',
    intro: 'Organization-wide setup. Each section saves on its own.',
    sections: [
      {
        heading: 'Business',
        body: 'Address and phone appear on invoices under your logo. Billing email is where invoices addressed to your organization are sent.',
      },
      {
        heading: 'Expenses and Invoicing',
        body: 'Mileage rate (per mile) for Mileage expenses, plus category and payment method lists for the Expenses form. Rename or hide built-ins; Mileage category cannot be removed. Add custom labels anytime.',
      },
      {
        heading: 'Activity',
        body: 'How many days an email from outside waits before it shows under Needs reply (default 2), and how long an active client can go without contact before it shows under Gone quiet (default 30).',
      },
      {
        heading: 'Email capture',
        body: 'Your capture address. CC it on an email to log it; reply-all keeps it on the thread. UpStart Back Office only sees messages this address is on. List your team\'s email domains so team members aren\'t created as contacts.',
      },
      {
        heading: 'MCP server',
        body:
          'Connect desktop AI apps (Claude, ChatGPT, Codex, Cursor, and others) to UpStart Back Office. Server URL: https://mcp.heyupstart.com/mcp — copy it under MCP server → Server URL. Sub-accordions list what the AI can do and connect steps for each app (organizations, people, tasks, time, expenses, invoices, and more — limited by your role). Sign in with the same account as this app and click Allow when the connect page opens.',
      },
      {
        heading: 'API Keys',
        body: 'Give an outside service access to UpStart Back Office. Each key is shown once when you generate it, so store it right away.',
      },
      {
        heading: 'Asana',
        body: 'Save your Asana app credentials (Client ID and secret), add the Redirect URI shown here to the Asana app, then Connect Asana. Projects can then link Asana boards.',
      },
      {
        heading: 'Google Calendar',
        body: 'Connect a calendar for bookings. Busy times on it block booking slots, and booked appointments are added to it. Only shown when the Bookings module is on.',
      },
    ],
  },

  // ── Forms ─────────────────────────────────────────────
  forms: {
    title: 'Forms',
    intro: 'Forms you build and share with a link: sign-ups, assessments, feedback.',
    sections: [
      {
        heading: 'New form',
        body: 'Name it, then add sections and fields on the form page. Publish when it is ready; its links work from then on. Or start from a form file (made with Export form file on any form page, e.g. on another UBO).',
      },
      {
        heading: 'Status',
        body: 'Draft: never published. Published: the links show the current form. Changes not published: the links still show the last published version.',
      },
      {
        heading: 'Who sees what',
        body: 'The Forms area on a role (Users → Roles): Own shows the forms that person created, All shows every form. Create, Edit and Delete are checkboxes. Admins see everything.',
      },
    ],
  },
  'forms/:id': {
    title: 'Form',
    intro: 'The form workspace: the column on the left lists the form\'s sections, with Settings, Scoring, Links and Submissions below them. Click one to work on it.',
    sections: [
      {
        heading: 'Sections',
        body: 'Click a section to see its questions. + next to Sections adds one; drag sections up or down to reorder them. A section\'s ⋮ menu edits its name and intro (a line shown under the title) or deletes it. Add field adds a question; drag questions by their ☰ handle to reorder them.',
      },
      {
        heading: 'How sections are shown',
        body: 'In Settings: One page, Steps (one section at a time), Accordion or Tabs. The link page and the embed code follow it. Click Save.',
      },
      {
        heading: 'Publish',
        body: 'Public links show the published version. After changing fields or scoring, click Publish changes so people get the new version. Earlier submissions keep the version they answered. Unpublish takes the form offline until you publish again (the same button, or the ⋮ menu when changes are waiting).',
      },
      {
        heading: 'Settings',
        body: 'Review submissions before they become prospects, ask for the organization or a phone number, email people their results, a thank-you message and a call to action. Click Save.',
      },
      {
        heading: 'Scoring',
        body: 'Turn on Score this form, add score areas and profiles (by percentage), then give each answer choice points when you edit a select field, and pick its score area. Scoring saves right away.',
      },
      {
        heading: 'Fields',
        body: "Add a section, then Add field: a name, a type, Required, and on scored forms the points per choice and the score area. The type can't be changed later. Changes save right away.",
      },
      {
        heading: 'Public links',
        body: 'New link makes a link anyone can use, with No check, a Passcode or an Emailed code. Copy, open or revoke it from its ⋮ menu. Embed on a website (⋮ menu) gives a one-line code to paste into any website, the link key for developers, and Allowed websites (empty = any website).',
      },
    ],
  },
  'forms/:id/submissions': {
    title: 'Submissions',
    intro: 'Everything sent through this form.',
    sections: [
      {
        heading: 'Tabs',
        body: 'Waiting for review (when the form reviews submissions), Accepted, Dismissed and All. Each row shows the score and profile on scored forms.',
      },
      {
        heading: 'Export Excel',
        body: 'A workbook for analysis outside UBO. Click for every submission; the arrow offers This tab only. Answers has a row per answer (when it came in, who sent it, status, question code, question, answer, and on scored forms points and score areas). Results (scored forms) has a row per submission with the total score and profile. Questions is the key to the codes (Q1, Q2…), which follow the current form order.',
      },
    ],
  },
  'forms/submissions/:id': {
    title: 'Submission',
    intro: 'The answers, the results and who sent it.',
    sections: [
      {
        heading: 'Answers and results',
        body: 'Answers shows every question with its answer (and points on scored forms). Results, on scored forms, shows the total score, the profile with its description and next steps, and each score area.',
      },
      {
        heading: 'Export',
        body: 'In the ⋮ menu: Export PDF (who sent it, results and every answer) or Export Excel (the same, one row per question).',
      },
      {
        heading: 'Accept',
        body: 'New organization creates a Prospect with a pipeline card (source Inbound) and the sender as its person. Existing organization attaches the submission to one you pick.',
      },
      {
        heading: 'Dismiss and delete',
        body: 'In the ⋮ menu. Dismiss sets it aside under Dismissed (Restore brings it back). Delete removes it and its results link for good.',
      },
    ],
  },

  // ── Care (module) ─────────────────────────────────────
  'care/intake': {
    title: 'Intake',
    intro: "Every organization's intake form, and intakes sent through a public link.",
    sections: [
      {
        heading: 'Waiting for review',
        body: 'Intakes sent through a public intake link land here first, with the person who sent it. Open one, check it, then Accept to attach it to a New organization (a Prospect with a pipeline card and the sender as its person) or an Existing organization. Dismiss deletes it. Only people whose role can edit the Intake form and reach every organization see this tab.',
      },
      {
        heading: 'New intake',
        body: 'Starts an intake form for an organization that has none yet. You can also start one from the Care card on the organization page. Customize fields (Care setup) changes the form and its public intake links.',
      },
    ],
  },
  'care/profiles': {
    title: 'Care profiles',
    intro: "Every organization's care profile, one living copy each.",
    sections: [
      {
        heading: 'New care profile',
        body: 'Pick an organization to start its care profile. You can also start one from the Care card on the organization page. Customize fields (Care setup) changes the form.',
      },
      {
        heading: 'Who sees what',
        body: 'Each form sets Read or Edit per role (Customize fields). People only see organizations assigned to them unless their role has Organizations: All.',
      },
    ],
  },
  'care/records/:id': {
    title: 'Care form',
    intro: "One organization's copy of a Care form. It always shows the current answers.",
    sections: [
      {
        heading: 'Editing',
        body: 'Change any answers and click Save at the top. Read-only roles see the form without Save.',
      },
      {
        heading: 'Share link',
        body: "New link makes a link to this organization's form for someone outside, such as family. Pick a check: No check, Passcode (share it separately) or Emailed code (sent to the address you enter). Links expire after 30 days unless you change it, and you can Revoke one anytime from its ⋮ menu. Changes made through a link save straight to the form and notify your team; the side panel shows who made the last one.",
      },
      {
        heading: 'Accept or dismiss',
        body: 'An intake sent through a public intake link shows Waiting for review. Accept attaches it to a new or existing organization; Dismiss (⋮ menu) deletes it.',
      },
    ],
  },
  'care/visits': {
    title: 'Visits',
    intro: 'Who visited which organization and when, with the visit log.',
    sections: [
      {
        heading: 'Start visit',
        body: 'Pick the organization and the visit starts now. Its page shows the visit log and notes; End visit records the end time and adds the hours to the timesheet. While a visit is in progress, a banner at the top links back to it. From the Schedule, Start visit on your own shift does the same and links the visit to the shift.',
      },
      {
        heading: 'Log past visit',
        body: 'Adds a visit that already happened: organization, date, start and end (and the worker, if your role sees everyone). Its time goes on the timesheet right away.',
      },
      {
        heading: 'Who sees what',
        body: "Visits Own: only your own visits. All: everyone's visits at the organizations you reach. Filter by period, worker and organization. Customize fields (Care setup) changes the visit log checklist.",
      },
    ],
  },
  'care/visits/:id': {
    title: 'Visit',
    intro: 'One visit: when, the visit log and notes.',
    sections: [
      {
        heading: 'Time',
        body: "Change the date, start or end and Save; the time entry on the timesheet follows. An end earlier than the start counts as the next day. Once the time is on an invoice, the times are locked and the visit can't be deleted.",
      },
      {
        heading: 'End visit',
        body: 'Shown while the visit is in progress. Saves the visit log and notes, sets the end to now and adds the hours to the timesheet.',
      },
    ],
  },
  'care/schedule': {
    title: 'Schedule',
    intro: 'A week of shifts. Use the arrows or This week to move around.',
    sections: [
      {
        heading: 'Add shift',
        body: 'Organization, worker (empty = open shift), date, start and end. Tick Repeat weekly to repeat on the days you pick until a date (or keep going). If the worker already has a shift at that time, you get a warning. The worker gets a notification.',
      },
      {
        heading: 'Shift menu',
        body: 'Edit changes that one shift. Cancel shift keeps it on the schedule crossed out (Restore brings it back). Delete removes it; Delete this and following ends a repeating series from that shift on. Start visit (your own shift) starts the visit; Open visit goes to it.',
      },
      {
        heading: 'Who sees what',
        body: "Schedule Own: only your own shifts, and you can only plan your own. All: everyone's shifts at the organizations you reach.",
      },
    ],
  },
  'care/forms/:id': {
    title: 'Customize fields',
    intro: 'Opened with Customize fields on Intake or Care profiles (Care setup). Name, access, fields and public links for that form.',
    sections: [
      {
        heading: 'Who can use it',
        body: 'For each role pick None, Read or Edit, then Save. Admins can always edit. The role also needs the Care area (Users → Roles), and people only see organizations assigned to them unless their role has Organizations: All.',
      },
      {
        heading: 'Fields',
        body: "Add a section, then Add field: a name, a type (Text, Long text, Number, Date, Single-select, Multi-select, Checkbox) and whether it is Required on public links. The type can't be changed later. Drag a field by its ☰ handle to reorder it; use the ⋮ menus to edit or delete (and to move sections). Deleting a field removes its answers from every record. These changes save right away.",
      },
      {
        heading: 'Form files',
        body: 'The ⋮ menu at the top: Export form file downloads the sections and fields; Import form file adds a file\'s sections and fields after the ones here, without changing anything already there. Use them to copy a setup to another UBO, such as a test site to your live one.',
      },
      {
        heading: 'Public intake links',
        body: 'Intake form only. New link makes a link anyone can use to send an intake, for example from your website, with No check, a Passcode, or an Emailed code to the person filling it in. Submissions wait under Intake → Waiting for review. Copy, open or revoke a link from its ⋮ menu.',
      },
    ],
  },

  // ── Platform (super users) ─────────────────────────────
  tenants: {
    title: 'Tenants',
    intro: 'Organizations on the platform. Super users only.',
    sections: [
      {
        heading: 'Add tenant',
        body: 'Name and slug (lowercase letters, numbers and dashes). The slug is also their email capture address. Internal email domains mark email from their team so it isn\'t treated as contacts.',
      },
      {
        heading: 'Edit',
        body: 'Use the ⋮ menu on the row. Change the name, slug or internal domains. Changing the slug also changes their email capture address, so mail sent to the old address stops arriving.',
      },
      {
        heading: 'Modules',
        body: 'Optional parts of the app, switched on per tenant in Add tenant or Edit. When a module is off, its menu items, role options, Settings sections and pages are hidden for that tenant, admins included. Turning it off keeps its data, so turning it back on brings everything back. Modules: Bookings (Bookings, booking types, public booking pages and Google Calendar) and Care (Intake, Care profiles, Visits, Schedule and public Care links).',
      },
      {
        heading: 'Switch to',
        body: 'Loads that tenant\'s data. You can also switch from the tenant dropdown in the top bar.',
      },
    ],
  },
  'platform/help-assistant': {
    title: 'Guide setup',
    intro: 'Configure JD, the Back Office guide — the help chat in the bottom-left corner.',
    sections: [
      {
        heading: 'Connecting a model',
        body: 'Pick a provider, enter the exact model ID, paste an API key, then Save & test connection. On later saves leave the key blank to keep the current one.',
      },
      {
        heading: 'What the Guide knows',
        body: 'Only the help files in docs/help-guide. It doesn\'t read live data, so questions like "how many invoices are overdue?" belong on the Invoices page.',
      },
    ],
  },
};

function matches(pattern: string[], path: string[]): boolean {
  return (
    pattern.length === path.length &&
    pattern.every((seg, i) => seg.startsWith(':') || seg === path[i])
  );
}

/** Most specific article for a router URL, falling back to parent routes. */
export function getHelpArticle(routerUrl: string): HelpArticle | null {
  const path = routerUrl.replace(/^\//, '').split('?')[0].split('#')[0].split('/').filter(Boolean);
  if (!path.length) return HELP_CONTENT['dashboard'];

  const keys = Object.keys(HELP_CONTENT).map((k) => ({ key: k, parts: k.split('/') }));
  for (let len = path.length; len > 0; len--) {
    const prefix = path.slice(0, len);
    // Prefer literal segments over :params (e.g. invoices/new before invoices/:id).
    const hit = keys
      .filter((k) => matches(k.parts, prefix))
      .sort((a, b) => a.parts.filter((p) => p.startsWith(':')).length - b.parts.filter((p) => p.startsWith(':')).length)[0];
    if (hit) return HELP_CONTENT[hit.key];
  }
  return null;
}

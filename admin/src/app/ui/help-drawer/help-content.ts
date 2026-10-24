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
      body: 'Pick the client. Bill-to email and address fill in from the client and can be changed for this invoice. The client\'s Invoice Code is prepended to the invoice number (e.g. UPSP-0001), so the client needs one before you invoice.',
    },
    {
      heading: 'Generate from time',
      body: 'Pulls uninvoiced billable time for the period you choose (month, quarter, year or a date range), optionally for one project. Entries must fall entirely within the period. If you see "Entries missing hourly rate", set a rate on the project or the user and generate again.',
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
      body: 'Prospect, Client, Past client or Other. It changes on its own: a pipeline card makes an organization a Prospect, and Make client makes it a Client. Past client you set yourself when the work ends. Client turns on projects, time and invoices.',
    },
    {
      heading: 'Tags',
      body: 'Say what the organization is to you: Partner, Vendor, Referral source, or anything you type. Press Enter to add one. Tags are shared with People, so you can filter both by the same tag. A partner can also be a client.',
    },
    {
      heading: 'Make client',
      body: 'Turns a prospect, past client or other organization into a client. Any open pipeline card for it is archived, since the opportunity is won. Nothing is copied.',
    },
    {
      heading: 'Invoice Code',
      body: 'Short code prepended to invoice numbers, e.g. UPSP-0001. You only need it once you invoice.',
    },
    {
      heading: 'People',
      body: 'The people at this organization, each with their role. People are added automatically when you file an email from them, or click Add person.',
    },
    {
      heading: 'Activity',
      body: 'Emails, calls, meetings and notes for this organization. Use the Email button so UBO is CC\'d and the thread is logged, or Log call / note for anything that happened off email.',
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
      body: 'Prospect also puts a card in the first lane of the pipeline. Client turns on projects, time and invoices. Partner adds the Partner tag and stays off the pipeline. Other is for anyone else, such as a vendor; use tags to say what it is.',
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
      body: 'Log calls and notes, see filed emails, and attach files, links and notes.',
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
      heading: 'Contact people',
      body: 'Client-side contacts for invoicing and communication. Add from Back Office picks an existing contact, or add one manually. Project contacts show up as recipients when you send an invoice.',
    },
    {
      heading: 'Asana configuration',
      body: 'Link an Asana board and one or more sections. Incomplete tasks from those sections appear on timesheets. Use Refresh from Asana to pull new tasks. Asana must be connected in Settings first.',
    },
    {
      heading: 'Manual tasks',
      body: 'Tasks you can pick when tracking time on this project, billable or not. Use these when the work isn\'t in Asana.',
    },
  ],
};

export const HELP_CONTENT: Record<string, HelpArticle> = {
  dashboard: {
    title: 'Dashboard',
    intro: 'Your landing page after sign-in: a quick read on time, pipeline, invoices and projects.',
    sections: [
      {
        heading: 'Summary tiles',
        body: 'Clients, Active projects, Hours this week and Open leads at a glance.',
      },
      {
        heading: 'Widgets',
        body: 'Time shows today and this week, and whether a timer is running. Pipeline lists upcoming next actions. Invoices and Active Projects give shortcuts to create one.',
      },
      {
        heading: 'Rearranging',
        body: 'Drag a widget by its handle to reorder the dashboard. Your order is remembered.',
      },
    ],
  },

  // ── CRM ────────────────────────────────────────────────
  inbox: {
    title: 'Inbox',
    intro: 'Emails UBO received but couldn\'t match to an organization or pipeline card.',
    sections: [
      {
        heading: 'How email gets here',
        body: 'When someone CCs your UBO address (see Settings → Email capture), UBO files the email to the organization the people belong to. Anything it can\'t match lands here.',
      },
      {
        heading: 'Filing an email',
        body: 'Click File… on a row and choose an Organization or a Pipeline card. Leave "Link the people on this email to the organization" on so their next email files itself.',
      },
      {
        heading: 'Finding things',
        body: 'Search by subject or people. Load older pulls in earlier emails.',
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
        body: 'Add lane is the column at the end. Click a lane name to rename it (Enter saves, Esc cancels). Drag a lane by its header to reorder. The lane menu has Remove lane; if it has cards, archived ones included, choose where they move.',
      },
      {
        heading: 'More than one pipeline',
        body: 'The menu next to the pipeline name has New pipeline, Rename pipeline and Delete pipeline (only an empty pipeline can be deleted). For example, a second pipeline can track partners you\'re recruiting.',
      },
      {
        heading: 'Archived',
        body: 'Switch to Archived at the top to see won and archived cards. Restore puts a card back on the board. Delete removes it for good.',
      },
    ],
  },
  'pipeline/new': { ...LEAD_DETAIL, title: 'New Lead' },
  'pipeline/:id': LEAD_DETAIL,

  organizations: {
    title: 'Organizations',
    intro: 'Every organization you deal with: prospects, clients, past clients, partners and anyone else.',
    sections: [
      {
        heading: 'Filters',
        body: 'Status buttons show All, Prospects, Clients, Past clients or Other. The tag list narrows to one tag, such as Partner. Filters stay in the page address, so you can bookmark a view.',
      },
      {
        heading: 'Status',
        body: 'Set for you: a pipeline card makes an organization a Prospect, and Make client makes it a Client. Set Past client yourself on the organization\'s page.',
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
        body: 'Organizations with status Client. Turn on Include past clients to see past ones too. Prospects are on the Pipeline, and everyone else is under CRM → Organizations.',
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

  people: {
    title: 'People',
    intro: 'Everyone you deal with. A person can belong to one or more organizations, or none.',
    sections: [
      {
        heading: 'Adding a person',
        body: 'New Person asks for a name and email, and optionally an organization (with their role there) and tags.',
      },
      {
        heading: 'Tags',
        body: 'Filter by a tag with the tag list at the top. Network is everyone from the old Network page (people you\'ve talked to); Partner is someone who works with you. Tags are shared with Organizations.',
      },
      {
        heading: 'Needs review',
        body: 'People created automatically from email. Check the details and Mark as reviewed. The People menu item shows how many are waiting.',
      },
    ],
  },
  'people/:id': {
    title: 'Person',
    intro: 'One person, their organizations, tags and everything you\'ve logged with them.',
    sections: [
      {
        heading: 'Email addresses',
        body: 'Mail from any of these addresses is matched to this person. Add every address they use so their emails file themselves.',
      },
      {
        heading: 'Tags',
        body: 'Partner, Referral source or anything you type. Press Enter to add one, then Save.',
      },
      {
        heading: 'Organizations',
        body: 'Link to an organization with an optional role. Unlink removes the link without deleting anything. Someone with no organization (an individual client) can become a client with Make client from this person.',
      },
      {
        heading: 'Activity',
        body: 'Emails, calls, meetings and notes involving this person, across all their organizations.',
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
        body: 'In-app notifications always appear here. Notification settings chooses which also send an email: assigned to me, @mentions, comments on tasks I follow, followed tasks completed, and form submissions.',
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
        body: 'Click a task to open the side panel: assignee, due date, repeats, tags, description, subtasks, attachments and comments. Type @ in a comment to mention someone. Copy task link shares it.',
      },
      {
        heading: 'Moving and bulk actions',
        body: 'Drag tasks to reorder or move between sections. Select several to change them together. A task can also be in another project.',
      },
      {
        heading: 'Customize',
        body: 'Add custom fields for anything tasks need to track. Members controls who can see the project; Share invites people, including guests who only see this project.',
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
    intro: 'Money spent on the business or on client work.',
    sections: [
      {
        heading: 'New Expense',
        body: 'Description, amount and date are required. Add a category, project, payment method, notes and a receipt as needed.',
      },
      {
        heading: 'Reimbursable and billable',
        body: 'Reimbursable means someone paid personally and should be paid back. Billable to client means it should be charged to the client. Both show in the Flags column.',
      },
      {
        heading: 'Filtering and totals',
        body: 'Search by description, category or project, or filter to Has receipt. Total reflects whatever is filtered.',
      },
    ],
  },

  invoices: {
    title: 'Invoices',
    intro: 'Every invoice, newest first. Overdue and due-soon warnings appear above the table.',
    sections: [
      {
        heading: 'New Invoice',
        body: 'Starts a draft. Pick the client, then add lines by hand or use Generate from time.',
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
        body: 'Pick a category account for each transaction and click Post. UBO remembers your choices and pre-fills matching transactions next time ("Learned from previous categorization").',
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
        body: 'Add User creates the user and sends a sign-in invite. Each user has a role and an optional hourly rate, used on invoices when a project has no rate of its own.',
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
        heading: 'Email capture',
        body: 'Your UBO address. CC it on an email to log it; reply-all keeps it on the thread. UBO only sees messages this address is on. List your team\'s email domains so team members aren\'t created as contacts.',
      },
      {
        heading: 'API Keys',
        body: 'Give an outside service access to UBO. Each key is shown once when you generate it, so store it right away.',
      },
      {
        heading: 'Asana',
        body: 'Save your Asana app credentials (Client ID and secret), add the Redirect URI shown here to the Asana app, then Connect Asana. Projects can then link Asana boards.',
      },
      {
        heading: 'Google Calendar',
        body: 'Connect a calendar for bookings. Busy times on it block booking slots, and booked appointments are added to it.',
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

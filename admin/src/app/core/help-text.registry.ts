/**
 * Field-level help text, shown by <app-help-text key="..."> as a ⓘ tooltip next to a label.
 * Key format: area.field (e.g. lead.nextAction). Use it for fields that need a one-line
 * explanation and have no hint under them already. Page-level help lives in
 * ui/help-drawer/help-content.ts.
 */
export const HELP_TEXT_REGISTRY: Record<string, string> = {
  // Pipeline card
  'lead.warmConnection': 'Someone who knows this person and can introduce you or vouch for you.',
  'lead.contactSource': 'How they found you or how you met, e.g. referral, inbound, event.',
  'lead.serviceInterest': 'Which of your services they are interested in. Pick all that apply.',
  'lead.nextActionDate': 'When the next step is due. Cards show a red warning on the board once this date passes.',
  'lead.nextAction': 'What you plan to do next. This leads the card on the pipeline board.',

  // Booking types
  'bookingType.brand':
    'Optional brand name sent to the public booking page, for when one tenant books under more than one name.',
  'bookingType.minimumNotice': 'How many hours ahead a slot must be. Slots sooner than this are hidden.',
  'bookingType.horizon': 'How many days into the future people can book.',
  'bookingType.pipelineLane':
    'Lane for new cards. A card still in the first lane moves here when the person books; cards further along stay put. Blank means the first lane.',
  'bookingType.leadSource': 'Contact source recorded on cards this booking type creates.',
  'bookingType.noteTitle':
    'Title of the note logged on the card for each booking. Defaults to the booking type name.',

  // Expenses
  'expense.reimbursable': 'Someone paid for this personally and should be paid back.',
  'expense.billable': 'This should be charged to the client, usually on their next invoice.',

  // Projects
  'project.hourlyRate':
    "Used for time on this project instead of each person's own rate. Leave blank to use the rate set on Users.",
  'project.billable': 'Billable time on this project is what Generate from time pulls onto invoices.',

  // Users and roles
  'user.hourlyRate': "Used on invoices for this person's time when the project has no hourly rate of its own.",
  'roles.view': 'None hides the area. Own limits them to their own records (or clients they are assigned to). All shows everything.',

  // Invoices
  'invoice.billToEmail': 'Where Send emails this invoice by default. You can pick a different address when sending.',
};

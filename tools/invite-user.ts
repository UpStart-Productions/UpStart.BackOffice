/**
 * Retired. This script made Cognito send its own invitation email, and Cognito must never send email.
 * Add the person on the Users page (Add User, or ⋮ > Send sign-in invite): the API emails the invite
 * through SES.
 */
console.error('invite-user is retired: use Users > Add User (or ⋮ > Send sign-in invite) in the admin app.');
process.exit(1);

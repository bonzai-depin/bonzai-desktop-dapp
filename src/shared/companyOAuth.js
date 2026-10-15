// Only native/public clients belong here. API-key and server-to-server tools
// keep their provider-specific setup; never embed confidential app secrets.
export const COMPANY_OAUTH_PROVIDERS = Object.freeze({
  gmail: { provider: 'google', name: 'Google', title: 'Gmail', icon: 'mail', permissions: 'Read email and attachments. No sending, deleting or marking messages read.' },
  outlook_mail: { provider: 'microsoft', name: 'Microsoft', title: 'Outlook Mail', icon: 'mail', permissions: 'Read email and attachments. No sending, deleting or marking messages read.' },
  google_calendar: { provider: 'google', name: 'Google', title: 'Google Calendar', icon: 'event', permissions: 'Read your calendars and manage events after approval.' },
});

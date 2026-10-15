export const COMPANY_CONNECTOR_CATALOG = Object.freeze([
  { kind: "gmail", name: "Gmail", icon: "mail", authType: "oauth2", note: "Read incoming email and attachments into local team records.", help: "Sign in with Google, then enable import in Inbox → Files & email. Your mailbox remains unchanged." },
  { kind: "outlook_mail", name: "Outlook Mail", icon: "mail", authType: "oauth2", note: "Read incoming email and attachments into local team records.", help: "Sign in with Microsoft, then enable import in Inbox → Files & email. Your mailbox remains unchanged." },
  { kind: "brave_search", name: "Brave Search", icon: "travel_explore", authType: "apiKey", secretLabel: "Brave Search API key", note: "Public supplier search with saved source links.", help: "Create a Search API key in the Brave dashboard. Connect sends one neutral test query; each team search requires approval. Queries are sent to Brave, and plan charges may apply." },
  { kind: "chorus", name: "Chorus Pro", icon: "account_balance", authType: "oauth2", note: "Invoice PDF deposits, submissions and status receipts.", help: "Use your PISTE application credentials and Chorus technical account. Choose sandbox for testing; production submits real invoices." },
  { kind: "qonto", name: "Qonto", icon: "account_balance", authType: "apiKey", accountLabel: "Organization login", secretLabel: "API secret", note: "Bank accounts, settled transactions, receipts, clients and invoices.", help: "Find your organization login and API secret in Qonto Settings → Integrations → API. Access depends on your Qonto permissions." },
  { kind: "quickbooks", name: "QuickBooks", icon: "receipt_long", authType: "oauth2", accountLabel: "Realm ID", secretLabel: "OAuth access token", note: "Invoices, payments, and receivables." },
  { kind: "sage_accounting", name: "Sage Accounting", icon: "account_balance", authType: "oauth2", accountLabel: "Business ID (optional)", secretLabel: "OAuth access token", note: "Contacts, invoices, and payments." },
  { kind: "stripe", name: "Stripe", icon: "credit_card", authType: "apiKey", accountLabel: "Stripe Connect account ID (optional)", accountPlaceholder: "acct_…", secretLabel: "Secret or restricted API key", note: "Balances, fees, payouts, customers, invoices, checkout, subscriptions and refunds.", help: "Use a test key first. Restricted keys need read access to the records you import and write access only for approved billing actions. Leave the account ID empty for your own account." },
  { kind: "hubspot", name: "HubSpot", icon: "hub", authType: "apiKey", secretLabel: "Private app token", note: "Contacts and deals." },
  { kind: "google_calendar", name: "Google Calendar", icon: "event", authType: "oauth2", note: "Availability and events.", help: "Sign in with Google to connect your calendars." },
  { kind: "sendgrid", name: "SendGrid", icon: "mail", authType: "apiKey", accountLabel: "Sender email", secretLabel: "API key", note: "Transactional email." },
  { kind: "shopify", name: "Shopify", icon: "storefront", authType: "apiKey", accountLabel: "Store domain", accountPlaceholder: "store.myshopify.com", secretLabel: "Admin API access token", note: "Products, orders, fulfillment, and refunds." },
  { kind: "notion", name: "Notion", icon: "menu_book", authType: "apiKey", accountLabel: "Parent page ID (optional)", secretLabel: "Integration token", note: "Pages and operating records." },
  { kind: "slack", name: "Slack", icon: "tag", authType: "oauth2", secretLabel: "Bot OAuth token", note: "Team messages." },
  { kind: "twilio", name: "Twilio", icon: "call", authType: "basic", accountLabel: "Account SID", secretLabel: "Auth token", note: "SMS, WhatsApp, and calls." },
]);

export const connectorCatalogEntry = (kind) =>
  COMPANY_CONNECTOR_CATALOG.find((entry) => entry.kind === kind) || null;

export const supportedConnectorKinds = new Set(
  COMPANY_CONNECTOR_CATALOG.map((entry) => entry.kind),
);

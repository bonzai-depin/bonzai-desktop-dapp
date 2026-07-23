export const COMPANY_CONNECTOR_CATALOG = Object.freeze([
  { kind: "quickbooks", name: "QuickBooks", icon: "receipt_long", authType: "oauth2", accountLabel: "Realm ID", secretLabel: "OAuth access token", note: "Invoices, payments, and receivables." },
  { kind: "sage_accounting", name: "Sage Accounting", icon: "account_balance", authType: "oauth2", accountLabel: "Business ID (optional)", secretLabel: "OAuth access token", note: "Contacts, invoices, and payments." },
  { kind: "stripe", name: "Stripe", icon: "credit_card", authType: "apiKey", secretLabel: "Secret API key", note: "Checkout, subscriptions, charges, and refunds." },
  { kind: "hubspot", name: "HubSpot", icon: "hub", authType: "apiKey", secretLabel: "Private app token", note: "Contacts and deals." },
  { kind: "google_calendar", name: "Google Calendar", icon: "event", authType: "oauth2", secretLabel: "OAuth access token", note: "Availability and events." },
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

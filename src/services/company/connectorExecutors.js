import { stripeMinorUnits } from "./finance/money.js";
import { FINANCE_ACTIONS } from "./finance/actions.js";
import { executeFinanceAction } from "./finance/executor.js";
import * as connectors from "./connectors.js";
import { OPERATIONAL_ACTIONS } from './operationalActions.js';
import { searchSuppliers } from "./supplierSourcing.js";

export const SUPPORTED_CONNECTOR_ACTIONS = new Set([
  "sourcing.searchSuppliers",
  ...Object.keys(OPERATIONAL_ACTIONS),
  "team.directory", "team.readConversation", "team.requestWork", "team.reply", "team.readProcurement", "team.updateProcurement",
  ...Object.keys(FINANCE_ACTIONS), "finance.reconcilePayouts", "finance.listEvidence", "finance.readEvidence",
  "stripe.createCheckout", "stripe.refund", "stripe.createSubscription", "stripe.cancelSubscription", "stripe.chargeOnFile",
  "hubspot.upsertContact", "hubspot.createDeal", "hubspot.advanceDeal",
  "qbo.createInvoice", "qbo.recordPayment", "qbo.payBill", "qbo.sendInvoice", "qbo.reportAR",
  "sage.createContact", "sage.createInvoice", "sage.recordPayment",
  "slack.postMessage", "slack.dmUser",
  "email.send", "email.sendTemplate",
  "gcal.findSlots", "gcal.createEvent", "gcal.cancelEvent", "gcal.reschedule",
  "twilio.sendSMS", "twilio.sendMMS", "twilio.broadcastSMS", "twilio.placeCall",
  "whatsapp.sendMessage", "whatsapp.sendTemplate",
  "shopify.createProduct", "shopify.updateProduct", "shopify.listOrders", "shopify.fulfillOrder", "shopify.refundOrder",
  "notion.createPage", "notion.appendBlock", "notion.queryDB",
  // Local-first operational executors (routed before connector dispatch).
  "gmao.searchWorkOrders", "gmao.getDossier", "gmao.scheduleWorkOrder", "gmao.generateDocument", "gmao.acknowledgeHandoff",
  "gmao.bootstrap", "gmao.generatePreventive", "gmao.createWorkOrder", "gmao.transitionWorkOrder",
  "gmao.addEvidence", "gmao.recordAttachment", "gmao.updateProcurement", "gmao.notifyClient",
  "gmao.evaluateSla", "gmao.createQuote", "gmao.updateQuote", "gmao.recordServiceAcceptance", "gmao.validateProcessStep", "gmao.saveInvoice", "gmao.registerCompliance",
  "gmao.exportWeeklyRegister", "gmao.runAutomation", "gmao.recommendSchedule", "gmao.reconcileBilling",
  "field.prepareWorkOrder", "field.trackJob", "field.completeJob", "field.followUp",
]);

function encodeForm(data, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(data || {})) {
    if (value == null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) value.forEach((item, index) => encodeForm(item, `${name}[${index}]`, out));
    else if (typeof value === "object") encodeForm(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

const actionConnector = (actionType) => ({
  qonto: "qonto", stripe: "stripe", hubspot: "hubspot", qbo: "quickbooks",
  sage: "sage_accounting", twilio: "twilio", whatsapp: "twilio",
  slack: "slack", gcal: "google_calendar", email: "sendgrid",
  shopify: "shopify", notion: "notion", sourcing: "brave_search",
})[actionType.split(".")[0]];

export async function executeConnectorAction(companyId, actionType, params, idempotencyKey) {
  const kind = actionConnector(actionType);
  if (!kind) throw new Error(`No production executor is registered for ${actionType}`);
  if (!params.connectorId && ["stripe", "qonto"].includes(kind)) {
    const accounts = (await connectors.list(companyId)).filter(item => item.kind === kind && item.status === "active");
    if (accounts.length > 1) throw new Error(`Choose connectorId: multiple ${kind} accounts are connected`);
  }
  const connector = params.connectorId ? await connectors.get(companyId, params.connectorId) : await connectors.getByKind(companyId, kind);
  if (connector && connector.kind !== kind) throw new Error("Connector kind does not match action");
  if (!connector) throw new Error(`${kind} connector is not active`);
  const call = (spec) => connectors.request(companyId, connector, { ...spec, idempotencyKey });

  if (FINANCE_ACTIONS[actionType]) return executeFinanceAction(actionType, params, call, idempotencyKey);
  if (actionType === "sourcing.searchSuppliers") return searchSuppliers(params, call);

  switch (actionType) {
    case "stripe.createCheckout": {
      const body = encodeForm({
        mode: params.mode || "payment",
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        line_items: [{ price: params.priceId, quantity: params.quantity || 1 }],
      }).toString();
      const data = await call({ url: "https://api.stripe.com/v1/checkout/sessions", method: "POST", authMode: "basic", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      return { id: data.id, sessionId: data.id, shareLink: data.url, summary: `Checkout ${data.id} created` };
    }
    case "stripe.refund": {
      const amount = stripeMinorUnits(params.amount, params.currency);
      if (!/^ch_[a-zA-Z0-9]+$/.test(params.chargeId || "")) throw new Error("A Stripe charge ID is required");
      const charge = await call({ url: `https://api.stripe.com/v1/charges/${params.chargeId}`, method: "GET" });
      if (charge.currency !== String(params.currency).toLowerCase() || amount > charge.amount - charge.amount_refunded) throw new Error("Refund amount or currency does not match the charge’s remaining refundable balance");
      const body = encodeForm({ charge: params.chargeId, amount }).toString();
      const data = await call({ url: "https://api.stripe.com/v1/refunds", method: "POST", authMode: "basic", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      return { id: data.id, status: data.status === 'succeeded' ? 'completed' : 'pending', providerStatus: data.status, receipt: data, summary: `Refund ${data.id} is ${data.status}` };
    }
    case "stripe.createSubscription": {
      const body = encodeForm({ customer: params.customerId, items: [{ price: params.priceId }] }).toString();
      const data = await call({ url: "https://api.stripe.com/v1/subscriptions", method: "POST", authMode: "basic", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      return { id: data.id, providerStatus: data.status, receipt: data, status: ['active', 'trialing'].includes(data.status) ? 'completed' : 'pending', summary: `Subscription ${data.id} is ${data.status}` };
    }
    case "stripe.cancelSubscription": {
      const data = await call({ url: `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(params.subscriptionId)}`, method: "DELETE", authMode: "basic" });
      return { id: data.id, summary: `Subscription ${data.id} cancelled` };
    }
    case "stripe.chargeOnFile": {
      const body = encodeForm({ amount: stripeMinorUnits(params.amount, params.currency), currency: String(params.currency).toLowerCase(), customer: params.customerId, confirm: true, off_session: true, description: params.memo }).toString();
      const data = await call({ url: "https://api.stripe.com/v1/payment_intents", method: "POST", authMode: "basic", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      return { id: data.id, status: data.status === 'succeeded' ? 'completed' : 'pending', providerStatus: data.status, receipt: data, summary: `Payment ${data.id} is ${data.status}` };
    }
    case "hubspot.upsertContact": {
      const data = await call({ url: "https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs: [{ idProperty: "email", id: params.email, properties: { email: params.email, ...(params.props || {}) } }] }) });
      return { id: data.results?.[0]?.id, summary: `Contact ${params.email} synchronized` };
    }
    case "hubspot.createDeal": {
      const data = await call({ url: "https://api.hubapi.com/crm/v3/objects/deals", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ properties: { amount: String(params.amount || 0), dealstage: params.stage, dealname: params.name || `Opportunity ${Date.now()}` }, associations: params.contactId ? [{ to: { id: params.contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }] : [] }) });
      return { id: data.id, summary: `Deal ${data.id} created` };
    }
    case "hubspot.advanceDeal": {
      const data = await call({ url: `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(params.dealId)}`, method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ properties: { dealstage: params.stage } }) });
      return { id: data.id, summary: `Deal ${data.id} moved to ${params.stage}` };
    }
    case "qbo.createInvoice":
    case "qbo.recordPayment":
    case "qbo.payBill": {
      const realm = connector.accountIdentifier;
      if (!realm) throw new Error("QuickBooks realm ID is missing from the connector account field");
      const entity = actionType === "qbo.createInvoice" ? "invoice" : actionType === "qbo.recordPayment" ? "payment" : "billpayment";
      const data = await call({ url: `https://quickbooks.api.intuit.com/v3/company/${realm}/${entity}?minorversion=75`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params.payload || params) });
      const record = data[entity[0].toUpperCase() + entity.slice(1)] || data;
      return { id: record.Id || record.id, summary: `${entity} ${record.DocNumber || record.Id || "created"}` };
    }
    case "qbo.sendInvoice": {
      const realm = connector.accountIdentifier;
      if (!realm) throw new Error("QuickBooks realm ID is missing from the connector account field");
      const data = await call({ url: `https://quickbooks.api.intuit.com/v3/company/${realm}/invoice/${encodeURIComponent(params.invoiceId)}/send?minorversion=75`, method: "POST", headers: { "Content-Type": "application/octet-stream" } });
      return { id: data.Invoice?.Id || params.invoiceId, summary: `Invoice ${params.invoiceId} sent` };
    }
    case "qbo.reportAR": {
      const realm = connector.accountIdentifier;
      if (!realm) throw new Error("QuickBooks realm ID is missing from the connector account field");
      const data = await call({ url: `https://quickbooks.api.intuit.com/v3/company/${realm}/reports/AgedReceivables?minorversion=75`, method: "GET" });
      return { id: `ar-${Date.now()}`, report: data, summary: "Accounts receivable report retrieved" };
    }
    case "sage.createContact":
    case "sage.createInvoice":
    case "sage.recordPayment": {
      const endpoint = actionType === "sage.createContact" ? "contacts" : actionType === "sage.createInvoice" ? "sales_invoices" : "contact_payments";
      const data = await call({ url: `https://api.accounting.sage.com/v3.1/${endpoint}`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params.payload || params) });
      return { id: data.id || data.$uuid, summary: `Sage ${endpoint.replaceAll("_", " ")} created` };
    }
    case "slack.postMessage": {
      const data = await call({ url: "https://slack.com/api/chat.postMessage", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: params.channel, text: params.text }) });
      if (!data.ok) throw new Error(data.error || "Slack rejected the message");
      return { id: data.ts, summary: `Posted to ${params.channel}` };
    }
    case "slack.dmUser": {
      const opened = await call({ url: "https://slack.com/api/conversations.open", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ users: params.userId }) });
      if (!opened.ok) throw new Error(opened.error || "Slack could not open the conversation");
      const data = await call({ url: "https://slack.com/api/chat.postMessage", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: opened.channel.id, text: params.text }) });
      if (!data.ok) throw new Error(data.error || "Slack rejected the message");
      return { id: data.ts, summary: `Message sent to ${params.userId}` };
    }
    case "email.send":
    case "email.sendTemplate": {
      const from = params.from || connector.accountIdentifier;
      if (!from) throw new Error("A sender email is required in the connector account field");
      const personalization = { to: [{ email: params.to }] };
      if (actionType === "email.sendTemplate") personalization.dynamic_template_data = params.vars || {};
      const payload = actionType === "email.sendTemplate"
        ? { from: { email: from }, personalizations: [personalization], template_id: params.templateId }
        : { from: { email: from }, personalizations: [personalization], subject: params.subject, content: [{ type: "text/html", value: params.html || "" }] };
      if (params.attachments) {
        if (!Array.isArray(params.attachments) || params.attachments.some(a=>!a.filename||!a.content||!/^[A-Za-z0-9+/=]+$/.test(a.content))) throw new Error('Invalid email attachments');
        payload.attachments=params.attachments.map(({content,filename,type})=>({content,filename,type:type||'application/octet-stream',disposition:'attachment'}));
      }
      const response = await call({ includeResponseMetadata: true, url: "https://api.sendgrid.com/v3/mail/send", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return { externalId: response.headers?.['x-message-id'] || null, status: 'submitted',
        receipt: { provider: 'sendgrid', httpStatus: response.status, recipient: params.to },
        summary: `Email accepted for delivery to ${params.to}; delivery is not confirmed` };
    }
    case "gcal.findSlots": {
      const calendarId = params.calendarId || "primary";
      const data = await call({ url: "https://www.googleapis.com/calendar/v3/freeBusy", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeMin: params.from, timeMax: params.to, items: [{ id: calendarId }] }) });
      return { id: calendarId, busy: data.calendars?.[calendarId]?.busy || [], summary: "Calendar availability retrieved" };
    }
    case "gcal.createEvent": {
      const calendarId = encodeURIComponent(params.calendarId || "primary");
      const data = await call({ url: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?sendUpdates=all`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: params.title, start: { dateTime: params.start }, end: { dateTime: params.end }, attendees: (params.attendees || []).map((email) => ({ email })) }) });
      return { id: data.id, shareLink: data.htmlLink, summary: `Event ${data.summary || data.id} created` };
    }
    case "gcal.cancelEvent": {
      const calendarId = encodeURIComponent(params.calendarId || "primary");
      await call({ url: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(params.eventId)}?sendUpdates=all`, method: "DELETE" });
      return { id: params.eventId, summary: `Event ${params.eventId} cancelled` };
    }
    case "gcal.reschedule": {
      const calendarId = encodeURIComponent(params.calendarId || "primary");
      const data = await call({ url: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(params.eventId)}?sendUpdates=all`, method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start: { dateTime: params.start }, end: { dateTime: params.end } }) });
      return { id: data.id, shareLink: data.htmlLink, summary: `Event ${data.id} rescheduled` };
    }
    case "twilio.sendSMS":
    case "twilio.sendMMS":
    case "whatsapp.sendMessage":
    case "whatsapp.sendTemplate": {
      if (!connector.accountIdentifier) throw new Error("Twilio Account SID is required");
      if (!params.from) throw new Error("A Twilio sender number is required");
      const whatsapp = actionType === "whatsapp.sendMessage";
      const body = encodeForm({
        To: whatsapp ? `whatsapp:${String(params.to).replace(/^whatsapp:/, "")}` : params.to,
        From: whatsapp ? `whatsapp:${String(params.from).replace(/^whatsapp:/, "")}` : params.from,
        ...(actionType === "whatsapp.sendTemplate"
          ? { ContentSid: params.templateId, ContentVariables: JSON.stringify(params.vars || {}) }
          : { Body: params.body }),
        ...(params.mediaUrl ? { MediaUrl: params.mediaUrl } : {}),
      }).toString();
      const data = await call({ url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(connector.accountIdentifier)}/Messages.json`, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      return { id: data.sid, providerStatus: data.status, status: 'submitted', summary: `${whatsapp ? "WhatsApp" : "Message"} accepted (${data.status || 'queued'}) for ${params.to}` };
    }
    case "twilio.broadcastSMS": {
      const recipients = Array.isArray(params.recipients) ? params.recipients.slice(0, 100) : [];
      if (!connector.accountIdentifier) throw new Error("Twilio Account SID is required");
      if (!params.from) throw new Error("A Twilio sender number is required");
      if (!recipients.length) throw new Error("At least one recipient is required");
      const sent = [];
      for (const to of recipients) {
        const body = encodeForm({ To: to, From: params.from, Body: params.body }).toString();
        const data = await call({ url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(connector.accountIdentifier)}/Messages.json`, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        sent.push(data.sid);
      }
      return { id: sent[0], ids: sent, status: 'submitted', summary: `${sent.length} messages accepted for delivery` };
    }
    case "twilio.placeCall": {
      if (!connector.accountIdentifier || !params.from) throw new Error("Twilio Account SID and sender number are required");
      const twiml = `<Response><Say>${String(params.script || "").replace(/[<>&]/g, "")}</Say></Response>`;
      const body = encodeForm({ To: params.to, From: params.from, Twiml: twiml }).toString();
      const data = await call({ url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(connector.accountIdentifier)}/Calls.json`, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      return { id: data.sid, summary: `Call placed to ${params.to}` };
    }
    case "shopify.createProduct": {
      const host = String(connector.accountIdentifier || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!host) throw new Error("Shopify store domain is required");
      const variants = params.variants?.length ? params.variants : [{ price: String(params.price || 0) }];
      const data = await call({ url: `https://${host}/admin/api/2026-07/products.json`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: { title: params.title, body_html: params.description || "", variants, images: params.imageUrl ? [{ src: params.imageUrl }] : [] } }) });
      return { id: data.product?.id, summary: `Product ${data.product?.title || params.title} created` };
    }
    case "shopify.updateProduct": {
      const host = String(connector.accountIdentifier || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      const data = await call({ url: `https://${host}/admin/api/2026-07/products/${encodeURIComponent(params.productId)}.json`, method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: { id: params.productId, ...(params.patch || {}) } }) });
      return { id: data.product?.id, summary: `Product ${data.product?.title || params.productId} updated` };
    }
    case "shopify.listOrders": {
      const host = String(connector.accountIdentifier || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      const query = new URLSearchParams({ status: params.status || "any", limit: "50", ...(params.since ? { created_at_min: params.since } : {}) });
      const data = await call({ url: `https://${host}/admin/api/2026-07/orders.json?${query}`, method: "GET" });
      return { id: `orders-${Date.now()}`, orders: data.orders || [], summary: `${data.orders?.length || 0} orders retrieved` };
    }
    case "shopify.fulfillOrder": {
      const host = String(connector.accountIdentifier || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      const orders = await call({ url: `https://${host}/admin/api/2026-07/orders/${encodeURIComponent(params.orderId)}/fulfillment_orders.json`, method: "GET" });
      const fulfillmentOrder = (orders.fulfillment_orders || []).find((item) => ["open", "in_progress"].includes(item.status));
      if (!fulfillmentOrder) throw new Error("No open fulfillment order was found");
      const data = await call({ url: `https://${host}/admin/api/2026-07/fulfillments.json`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fulfillment: { line_items_by_fulfillment_order: [{ fulfillment_order_id: fulfillmentOrder.id }], tracking_info: { number: params.trackingNumber, company: params.carrier }, notify_customer: true } }) });
      return { id: data.fulfillment?.id, summary: `Order ${params.orderId} fulfilled` };
    }
    case "shopify.refundOrder": {
      const host = String(connector.accountIdentifier || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!params.transactionId) throw new Error("The original Shopify transaction ID is required");
      const data = await call({ url: `https://${host}/admin/api/2026-07/orders/${encodeURIComponent(params.orderId)}/refunds.json`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refund: { note: params.reason || "BonzAI approved refund", notify: true, transactions: [{ parent_id: params.transactionId, amount: String(params.amount), kind: "refund", gateway: params.gateway || undefined }] } }) });
      return { id: data.refund?.id, summary: `Order ${params.orderId} refunded` };
    }
    case "notion.createPage": {
      const parentId = params.databaseId || connector.accountIdentifier;
      if (!parentId) throw new Error("A Notion database or parent page ID is required");
      const titleProperty = params.titleProperty || "Name";
      const data = await call({ url: "https://api.notion.com/v1/pages", method: "POST", headers: { "Content-Type": "application/json", "Notion-Version": "2022-06-28" }, body: JSON.stringify({ parent: { database_id: parentId }, properties: { [titleProperty]: { title: [{ text: { content: params.title || "Untitled" } }] } }, children: params.body ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: params.body } }] } }] : [] }) });
      return { id: data.id, shareLink: data.url, summary: `Notion page ${params.title || data.id} created` };
    }
    case "notion.appendBlock": {
      const data = await call({ url: `https://api.notion.com/v1/blocks/${encodeURIComponent(params.pageId)}/children`, method: "PATCH", headers: { "Content-Type": "application/json", "Notion-Version": "2022-06-28" }, body: JSON.stringify({ children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: params.body || "" } }] } }] }) });
      return { id: data.results?.[0]?.id || params.pageId, summary: "Notion page updated" };
    }
    case "notion.queryDB": {
      const data = await call({ url: `https://api.notion.com/v1/databases/${encodeURIComponent(params.databaseId)}/query`, method: "POST", headers: { "Content-Type": "application/json", "Notion-Version": "2022-06-28" }, body: JSON.stringify({ filter: params.filter || undefined, page_size: 100 }) });
      return { id: params.databaseId, results: data.results || [], summary: `${data.results?.length || 0} Notion records retrieved` };
    }
    default:
      throw new Error(`Production executor is not implemented for ${actionType}`);
  }
}

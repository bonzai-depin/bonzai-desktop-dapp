import { FINANCE_MANIFESTS } from "./finance/actions.js";
import { OPERATIONAL_MANIFESTS } from './operationalActions.js';
import { SUPPLIER_SOURCING_MANIFEST } from "./supplierSourcing.js";
/**
 * BonzAI Company — Skill Manifests (operational skill library)
 *
 * Each manifest declares: id, name, category, requiredConnectors, and
 * a typed action list. The dispatcher exposes a role's *granted* skills
 * to its LLM as available actions; the LLM emits structured action
 * calls; the dispatcher routes them through `skillsRegistry.execute()`.
 *
 * Demo teams use deterministic mock execution. Live teams route the
 * actions declared here through validated production connectors.
 */

export const SKILL_CATEGORIES = [
  "grants",       // evidence-backed grant applications and settlement
  "browser",      // supervised local portal interactions
  "comms",        // SMS / voice / email / WhatsApp / chat
  "billing",      // invoicing / payments / subscriptions / payouts
  "calendar",     // scheduling / availability
  "crm",          // contacts / pipelines / activity
  "ecommerce",    // storefront / orders / inventory
  "fulfillment",  // POD print providers / shipping
  "routing",      // dispatch / route optimization
  "compliance",   // permits / licenses / regulatory
  "documents",    // PDFs / e-sign / contracts
  "social",       // GBP / Yelp / social listening
  "analytics",    // metrics / reporting
  "maintenance",  // assets / preventive / corrective / field evidence
  "purchasing",   // sourcing / supplier orders / receipts / shared equipment
];

/**
 * The seed manifest list. Each skill entry has the shape:
 *   {
 *     id, name, category, description,
 *     requiredConnectors: [kind, ...],
 *     suggestedRoles: [roleKey, ...],
 *     actions: [{ type, summary, params: { name: typeHint }, costEstimate? }]
 *   }
 */
export const SKILL_MANIFESTS = {
  [SUPPLIER_SOURCING_MANIFEST.id]: SUPPLIER_SOURCING_MANIFEST,
  ...OPERATIONAL_MANIFESTS,
  "skill.team_communication": {
    id: "skill.team_communication", name: "Team communication", category: "operations", requiredConnectors: [],
    actions: [
      {type:"team.directory",summary:"List local teams and staffed roles",params:{}},
      {type:"team.readConversation",summary:"Read a conversation shared with this team",params:{conversationId:"string"}},
      {type:"team.requestWork",summary:"Create a request in another team's work queue",params:{targetTeamId:"string",targetRole:"string",subject:"string",body:"string",procurementId:"optional owned purchasing request ID"}},
      {type:"team.reply",summary:"Reply with the actual result or a question",params:{conversationId:"string",body:"string"}},
      {type:"team.readProcurement",summary:"Read only the purchasing request explicitly shared in a conversation",params:{conversationId:"string"}},
      {type:"team.updateProcurement",summary:"Return a purchasing update to the originating team after approval",params:{conversationId:"string",status:"string",supplierName:"string",amountCents:"integer",proformaReference:"string",orderReference:"string",receiptReference:"string",items:"array of {label, quantity, received}"}},
    ],
  },
  ...FINANCE_MANIFESTS,
  "skill.finance_reconciliation": { id: "skill.finance_reconciliation", name: "Settlement reconciliation", category: "billing", description: "Compare supplied Stripe payouts and Qonto settlements locally; flag ambiguity without posting entries.", requiredConnectors: [], suggestedRoles: ["CFO", "AccountingSpecialist"], actions: [{ type: "finance.listEvidence", summary: "List saved financial evidence in this company", params: {} }, { type: "finance.readEvidence", summary: "Read saved financial evidence by contentId", params: { contentId: "string" } }, { type: "finance.reconcilePayouts", summary: "Find payout settlement candidates and exceptions without moving money", params: { payouts: "array", transactions: "array" } }] },
  // ─── COMMS ──────────────────────────────────────────────────────────────
  "skill.twilio_voice": {
    id: "skill.twilio_voice",
    name: "Twilio Voice Triage",
    category: "comms",
    description: "Inbound call answering, IVR menu, voicemail capture, callbacks. Persona voice via Chatterbox V3.",
    requiredConnectors: ["twilio"],
    suggestedRoles: ["CSO"],
    actions: [
      { type: "twilio.placeCall",      summary: "Place an outbound call", params: { to: "string", from: "string", script: "string" } },
    ],
  },
  "skill.twilio_sms": {
    id: "skill.twilio_sms",
    name: "Twilio SMS",
    category: "comms",
    description: "Send / receive SMS. Templated mass-broadcast with rate limits.",
    requiredConnectors: ["twilio"],
    suggestedRoles: ["CSO", "CMO", "BusinessDevelopment", "ClientSuccess"],
    actions: [
      { type: "twilio.sendSMS",        summary: "Send a single SMS", params: { to: "string", from: "string", body: "string" }, costEstimate: 0.0079 },
      { type: "twilio.sendMMS",        summary: "Send an MMS with media", params: { to: "string", from: "string", body: "string", mediaUrl: "string" } },
      { type: "twilio.broadcastSMS",   summary: "Send to a recipient list with rate limiting", params: { recipients: "string[]", from: "string", body: "string" } },
    ],
  },
  "skill.twilio_whatsapp": {
    id: "skill.twilio_whatsapp",
    name: "Twilio WhatsApp",
    category: "comms",
    description: "WhatsApp Business via Twilio. Customer support, order updates, broadcasts.",
    requiredConnectors: ["twilio"],
    suggestedRoles: ["CSO"],
    actions: [
      { type: "whatsapp.sendMessage",  summary: "Send a WhatsApp message", params: { to: "string", from: "string", body: "string" } },
      { type: "whatsapp.sendTemplate", summary: "Send an approved template message", params: { to: "string", from: "string", templateId: "string", vars: "object" } },
    ],
  },
  "skill.sendgrid_email": {
    id: "skill.sendgrid_email",
    name: "Email (SendGrid)",
    category: "comms",
    description: "Transactional + marketing email. Branded templates, opens/clicks tracking.",
    requiredConnectors: ["sendgrid"],
    suggestedRoles: ["CSO", "CMO"],
    actions: [
      { type: "email.send",            summary: "Send a transactional email", params: { to: "string", subject: "string", html: "string" } },
      { type: "email.sendTemplate",    summary: "Send a templated email", params: { to: "string", templateId: "string", vars: "object" } },
    ],
  },

  // ─── BILLING ────────────────────────────────────────────────────────────
  "skill.qbo_invoicing": {
    id: "skill.qbo_invoicing",
    name: "QuickBooks Invoicing",
    category: "billing",
    description: "Create + send invoices, track A/R aging, reconcile payments. CFO companion's primary tool.",
    requiredConnectors: ["quickbooks"],
    suggestedRoles: ["CFO", "InvoicingSpecialist", "PaymentsSpecialist", "AccountingSpecialist"],
    actions: [
      { type: "qbo.createInvoice",     summary: "Create a customer invoice", params: { customerId: "string", lines: "array", dueDate: "string" } },
      { type: "qbo.sendInvoice",       summary: "Email an invoice", params: { invoiceId: "string" } },
      { type: "qbo.recordPayment",     summary: "Record a payment received", params: { invoiceId: "string", amount: "number", method: "string" } },
      { type: "qbo.reportAR",          summary: "Generate A/R aging report", params: {} },
    ],
  },
  "skill.sage_accounting": {
    id: "skill.sage_accounting",
    name: "Sage Accounting",
    category: "billing",
    description: "Create customers and invoices, record payments, and keep the accounting ledger aligned with approved work.",
    requiredConnectors: ["sage_accounting"],
    suggestedRoles: ["CFO", "InvoicingSpecialist", "PaymentsSpecialist", "AccountingSpecialist"],
    actions: [
      { type: "sage.createContact", summary: "Create an accounting contact", params: { payload: "object" } },
      { type: "sage.createInvoice", summary: "Create a sales invoice", params: { payload: "object" } },
      { type: "sage.recordPayment", summary: "Record a customer payment", params: { payload: "object" } },
    ],
  },
  "skill.stripe_checkout": {
    id: "skill.stripe_checkout",
    name: "Stripe Checkout",
    category: "billing",
    description: "Hosted payment pages and digital-product sales. Best for one-shot purchases.",
    requiredConnectors: ["stripe"],
    suggestedRoles: ["CFO", "CSO", "InvoicingSpecialist", "PaymentsSpecialist"],
    actions: [
      { type: "stripe.createCheckout", summary: "Create a Checkout Session URL", params: { priceId: "string", quantity: "number", successUrl: "string", cancelUrl: "string" } },
      { type: "stripe.refund",         summary: "Refund a charge", params: { chargeId: "string", amount: "number (major units, positive)", currency: "string" } },
    ],
  },
  "skill.stripe_subscriptions": {
    id: "skill.stripe_subscriptions",
    name: "Stripe Subscriptions",
    category: "billing",
    description: "Recurring revenue for PMAs / memberships / SaaS-style plans.",
    requiredConnectors: ["stripe"],
    suggestedRoles: ["CFO", "CSO", "PaymentsSpecialist", "InvoicingSpecialist"],
    actions: [
      { type: "stripe.createSubscription", summary: "Subscribe a customer to a plan", params: { customerId: "string", priceId: "string" } },
      { type: "stripe.cancelSubscription", summary: "Cancel an active subscription", params: { subscriptionId: "string" } },
      { type: "stripe.chargeOnFile",       summary: "Charge a saved card", params: { customerId: "string", amount: "number (major units, positive)", currency: "string", memo: "string" } },
    ],
  },

  // ─── CALENDAR ───────────────────────────────────────────────────────────
  "skill.google_calendar": {
    id: "skill.google_calendar",
    name: "Google Calendar",
    category: "calendar",
    description: "Read/write events. COO uses for dispatch, CSO for booking.",
    requiredConnectors: ["google_calendar"],
    suggestedRoles: ["COO", "CSO", "BusinessDevelopment", "ClientSuccess", "ProcessAnalyst"],
    actions: [
      { type: "gcal.findSlots",        summary: "List available slots in a window", params: { calendarId: "string", from: "string", to: "string", durationMin: "number" } },
      { type: "gcal.createEvent",      summary: "Create a calendar event", params: { calendarId: "string", title: "string", start: "string", end: "string", attendees: "string[]" } },
      { type: "gcal.cancelEvent",      summary: "Cancel an event", params: { eventId: "string" } },
      { type: "gcal.reschedule",       summary: "Move an event to a new time", params: { eventId: "string", start: "string", end: "string" } },
    ],
  },

  // ─── CRM ────────────────────────────────────────────────────────────────
  "skill.hubspot_lite": {
    id: "skill.hubspot_lite",
    name: "HubSpot CRM",
    category: "crm",
    description: "Contact + deal management for a lightweight sales pipeline.",
    requiredConnectors: ["hubspot"],
    suggestedRoles: ["CSO", "CMO", "BusinessDevelopment", "ClientSuccess"],
    actions: [
      { type: "hubspot.upsertContact", summary: "Create or update a contact", params: { email: "string", props: "object" } },
      { type: "hubspot.createDeal",    summary: "Add a deal to the pipeline", params: { contactId: "string", amount: "number", stage: "string" } },
      { type: "hubspot.advanceDeal",   summary: "Move a deal to the next stage", params: { dealId: "string", stage: "string" } },
    ],
  },

  // ─── ECOMMERCE ──────────────────────────────────────────────────────────
  "skill.shopify_store": {
    id: "skill.shopify_store",
    name: "Shopify Storefront",
    category: "ecommerce",
    description: "Product catalog, orders, inventory. The storefront for POD operators.",
    requiredConnectors: ["shopify"],
    suggestedRoles: ["CPO", "CSO", "CMO"],
    actions: [
      { type: "shopify.createProduct", summary: "Add a product to the catalog", params: { title: "string", description: "string", price: "number", imageUrl: "string", variants: "array" } },
      { type: "shopify.updateProduct", summary: "Update an existing product", params: { productId: "string", patch: "object" } },
      { type: "shopify.listOrders",    summary: "List recent orders", params: { since: "string", status: "string" } },
      { type: "shopify.fulfillOrder",  summary: "Mark an order as fulfilled with tracking", params: { orderId: "string", trackingNumber: "string", carrier: "string" } },
      { type: "shopify.refundOrder",   summary: "Refund an order", params: { orderId: "string", transactionId: "string", amount: "number", reason: "string" } },
    ],
  },

  // ─── FULFILLMENT (POD) ──────────────────────────────────────────────────
  "skill.printful": {
    id: "skill.printful",
    name: "Printful Fulfillment",
    category: "fulfillment",
    description: "Print-on-demand provider. Submit orders, track print status, sync products.",
    requiredConnectors: ["printful"],
    suggestedRoles: ["CPO", "CSO"],
    actions: [
      { type: "printful.submitOrder",  summary: "Send an order for printing", params: { items: "array", recipient: "object" } },
      { type: "printful.cancelOrder",  summary: "Cancel a pending print order", params: { orderId: "string" } },
      { type: "printful.syncProduct",  summary: "Push a Printful template to a storefront product", params: { templateId: "string", storefrontProductId: "string" } },
      { type: "printful.getStatus",    summary: "Check production / shipping status", params: { orderId: "string" } },
    ],
  },
  "skill.printify": {
    id: "skill.printify",
    name: "Printify Fulfillment",
    category: "fulfillment",
    description: "Alternative POD provider. Wider catalog, lower margins.",
    requiredConnectors: ["printify"],
    suggestedRoles: ["CPO", "CSO"],
    actions: [
      { type: "printify.submitOrder",  summary: "Send an order for printing", params: { items: "array", recipient: "object" } },
      { type: "printify.syncProduct",  summary: "Push a design to a storefront product", params: { designId: "string", storefrontProductId: "string" } },
      { type: "printify.getStatus",    summary: "Check production / shipping status", params: { orderId: "string" } },
    ],
  },

  // ─── ROUTING ────────────────────────────────────────────────────────────
  "skill.optimoroute": {
    id: "skill.optimoroute",
    name: "OptimoRoute Dispatch",
    category: "routing",
    description: "Multi-stop route optimization for field service crews.",
    requiredConnectors: ["optimoroute"],
    suggestedRoles: ["COO"],
    actions: [
      { type: "route.optimizeDay",     summary: "Plan a day's stops across N drivers", params: { date: "string", stops: "array", driverIds: "string[]" } },
      { type: "route.assignStop",      summary: "Manually assign a stop to a driver", params: { stopId: "string", driverId: "string" } },
      { type: "route.notifyEta",       summary: "Send ETA SMS to customer", params: { stopId: "string" } },
    ],
  },

  // ─── COMPLIANCE ─────────────────────────────────────────────────────────
  "skill.permit_filer": {
    id: "skill.permit_filer",
    name: "Permit Filer",
    category: "compliance",
    description: "Drafts permit applications for residential trade work; queues for owner review.",
    requiredConnectors: [], // works without external API; queues filings
    suggestedRoles: ["GeneralCounsel"],
    actions: [
      { type: "permit.draftApplication", summary: "Draft a permit application packet", params: { jurisdiction: "string", workType: "string", address: "string", scope: "string" } },
      { type: "permit.checkStatus",      summary: "Check the status of a filed permit", params: { permitId: "string" } },
    ],
  },

  // ─── DOCUMENTS ──────────────────────────────────────────────────────────
  "skill.pdf_proposal": {
    id: "skill.pdf_proposal",
    name: "PDF Proposal Generator",
    category: "documents",
    description: "Generates branded PDF quotes / proposals from a template + line items.",
    requiredConnectors: [],
    suggestedRoles: ["CPO", "CSO"],
    actions: [
      { type: "doc.generateProposal", summary: "Render a PDF proposal", params: { templateId: "string", customer: "object", lineItems: "array" } },
    ],
  },
  "skill.docusign": {
    id: "skill.docusign",
    name: "DocuSign E-Sign",
    category: "documents",
    description: "Send contracts for e-signature; track completion.",
    requiredConnectors: ["docusign"],
    suggestedRoles: ["GeneralCounsel", "CSO", "BusinessDevelopment", "ProcessAnalyst"],
    actions: [
      { type: "esign.sendEnvelope", summary: "Send a document for signature", params: { templateId: "string", signers: "array" } },
      { type: "esign.checkStatus",  summary: "Check signature status", params: { envelopeId: "string" } },
    ],
  },

  // ─── SOCIAL / REVIEWS ───────────────────────────────────────────────────
  "skill.gbp_reviews": {
    id: "skill.gbp_reviews",
    name: "Google Business Reviews",
    category: "social",
    description: "Monitor and respond to Google Business Profile reviews. CMO + CSO collaborate.",
    requiredConnectors: ["google_business"],
    suggestedRoles: ["CMO", "CSO"],
    actions: [
      { type: "gbp.listReviews",     summary: "List recent reviews", params: { since: "string" } },
      { type: "gbp.respondReview",   summary: "Reply to a review", params: { reviewId: "string", body: "string" } },
      { type: "gbp.requestReview",   summary: "Send a review-request to a customer", params: { customerContact: "string" } },
    ],
  },

  // ─── LEGAL PRACTICE MANAGEMENT ──────────────────────────────────────────
  "skill.clio_matter": {
    id: "skill.clio_matter",
    name: "Clio Matter Management",
    category: "compliance",
    description: "Solo / small-firm legal practice management — clients, matters, time entries, IOLTA trust accounting, court calendar.",
    requiredConnectors: ["clio"],
    suggestedRoles: ["GeneralCounsel", "CFO", "CSO"],
    actions: [
      { type: "clio.createMatter",       summary: "Open a new matter for a client", params: { clientId: "string", practiceArea: "string", description: "string" } },
      { type: "clio.runConflictCheck",   summary: "Check for adverse-party conflicts before engaging", params: { partyName: "string", relatedNames: "string[]" } },
      { type: "clio.logTime",            summary: "Record billable time on a matter", params: { matterId: "string", minutes: "number", narrative: "string" } },
      { type: "clio.draftEngagementLetter", summary: "Generate an engagement letter PDF", params: { matterId: "string", scope: "string", feeStructure: "string" } },
      { type: "clio.recordTrustDeposit", summary: "Record a deposit into IOLTA trust account", params: { matterId: "string", amount: "number", source: "string" } },
      { type: "clio.scheduleCourtDate",  summary: "Add a court date with deadline reminders", params: { matterId: "string", court: "string", date: "string", type: "string" } },
    ],
  },

  // ─── PAID MEDIA / ADS ───────────────────────────────────────────────────
  "skill.meta_ads": {
    id: "skill.meta_ads",
    name: "Meta Ads",
    category: "social",
    description: "Facebook + Instagram + WhatsApp campaigns. Audience builds, creative drops, performance reads.",
    requiredConnectors: ["meta_ads"],
    suggestedRoles: ["CMO", "RnDLead"],
    actions: [
      { type: "meta.createCampaign",  summary: "Spin up a new ad campaign", params: { objective: "string", dailyBudget: "number", audienceId: "string" } },
      { type: "meta.uploadCreative",  summary: "Upload an ad asset (image / video / carousel)", params: { campaignId: "string", mediaUrls: "string[]", copy: "string" } },
      { type: "meta.pauseAdSet",      summary: "Pause a single ad set", params: { adSetId: "string" } },
      { type: "meta.reportPerformance", summary: "Pull spend / CPM / CTR / ROAS for a window", params: { campaignId: "string", from: "string", to: "string" } },
    ],
  },
  "skill.google_ads": {
    id: "skill.google_ads",
    name: "Google Ads",
    category: "social",
    description: "Search + Performance Max + YouTube ads. Keyword + audience expansion, bid strategies.",
    requiredConnectors: ["google_ads"],
    suggestedRoles: ["CMO", "RnDLead"],
    actions: [
      { type: "gads.createCampaign", summary: "Create a search / pmax campaign", params: { type: "string", dailyBudget: "number", keywords: "string[]" } },
      { type: "gads.adjustBids",     summary: "Adjust target ROAS or CPA", params: { campaignId: "string", strategy: "string", target: "number" } },
      { type: "gads.pauseKeyword",   summary: "Pause an underperforming keyword", params: { adGroupId: "string", keyword: "string" } },
      { type: "gads.reportPerformance", summary: "Pull spend / impressions / conversions for a window", params: { campaignId: "string", from: "string", to: "string" } },
    ],
  },

  // ─── NEWSLETTER / EMAIL PUBLISHING ──────────────────────────────────────
  "skill.convertkit_newsletter": {
    id: "skill.convertkit_newsletter",
    name: "Newsletter (ConvertKit / Beehiiv)",
    category: "comms",
    description: "Newsletter publishing, segments, broadcasts, automation sequences, paid-tier subscription management.",
    requiredConnectors: ["convertkit"],
    suggestedRoles: ["CMO", "CSO"],
    actions: [
      { type: "newsletter.publish",    summary: "Publish a newsletter issue to a segment", params: { subject: "string", html: "string", segmentId: "string" } },
      { type: "newsletter.scheduleSequence", summary: "Add a subscriber to an automation sequence", params: { subscriberId: "string", sequenceId: "string" } },
      { type: "newsletter.tagSubscriber", summary: "Tag a subscriber for segmentation", params: { subscriberId: "string", tag: "string" } },
      { type: "newsletter.reportPerformance", summary: "Pull open/click/unsubscribe metrics", params: { broadcastId: "string" } },
    ],
  },

  // ─── COURSE PLATFORM ────────────────────────────────────────────────────
  "skill.teachable_course": {
    id: "skill.teachable_course",
    name: "Course Platform (Teachable / Thinkific)",
    category: "ecommerce",
    description: "Course catalog, lesson publishing, student enrollment, certificate issuance, drip-content scheduling.",
    requiredConnectors: ["teachable"],
    suggestedRoles: ["CPO", "CSO"],
    actions: [
      { type: "course.createLesson",     summary: "Add a new lesson to a course", params: { courseId: "string", title: "string", body: "string", videoUrl: "string" } },
      { type: "course.enrollStudent",    summary: "Enroll a student into a course", params: { courseId: "string", email: "string" } },
      { type: "course.scheduleDrip",     summary: "Schedule a drip-content release", params: { courseId: "string", lessonId: "string", releaseAt: "string" } },
      { type: "course.issueCertificate", summary: "Issue a completion certificate", params: { courseId: "string", studentId: "string" } },
    ],
  },

  // ─── SCHEDULING (1:1 BOOKINGS) ──────────────────────────────────────────
  "skill.calendly_booking": {
    id: "skill.calendly_booking",
    name: "Calendly Booking",
    category: "calendar",
    description: "1:1 booking links, availability windows, automated reminders, no-show tracking.",
    requiredConnectors: ["calendly"],
    suggestedRoles: ["CSO", "COO"],
    actions: [
      { type: "calendly.shareLink",   summary: "Share a booking link with a customer", params: { eventTypeId: "string", to: "string" } },
      { type: "calendly.cancelEvent", summary: "Cancel an upcoming booking", params: { eventId: "string", reason: "string" } },
      { type: "calendly.reportNoShows", summary: "List no-shows in a time window", params: { from: "string", to: "string" } },
    ],
  },

  // ─── TEAM CHAT (SLACK) ──────────────────────────────────────────────────
  "skill.slack_team": {
    id: "skill.slack_team",
    name: "Slack Team",
    category: "comms",
    description: "Internal Slack notifications, customer-support channel routing, daily digests.",
    requiredConnectors: ["slack"],
    suggestedRoles: ["COO", "CSO", "RnDLead", "ProcessAnalyst", "ClientSuccess"],
    actions: [
      { type: "slack.postMessage",  summary: "Post a message to a Slack channel", params: { channel: "string", text: "string" } },
      { type: "slack.dmUser",       summary: "Direct-message a user", params: { userId: "string", text: "string" } },
    ],
  },

  // ─── ISSUE TRACKING (LINEAR) ────────────────────────────────────────────
  "skill.linear_issues": {
    id: "skill.linear_issues",
    name: "Linear Issues",
    category: "documents",
    description: "Engineering issue creation, triage, sprint planning. R&D Lead's primary tool.",
    requiredConnectors: ["linear"],
    suggestedRoles: ["RnDLead", "CPO"],
    actions: [
      { type: "linear.createIssue",   summary: "File a new issue", params: { teamId: "string", title: "string", description: "string", priority: "string" } },
      { type: "linear.assignIssue",   summary: "Assign an issue to a team member", params: { issueId: "string", assigneeId: "string" } },
      { type: "linear.moveToCycle",   summary: "Move an issue into the active cycle", params: { issueId: "string" } },
    ],
  },

  // ─── KNOWLEDGE / DOCS ───────────────────────────────────────────────────
  "skill.notion_docs": {
    id: "skill.notion_docs",
    name: "Notion Workspace",
    category: "documents",
    description: "Internal knowledge base. CEO + R&D log decisions, runbooks, post-mortems; CMO drafts campaign briefs.",
    requiredConnectors: ["notion"],
    suggestedRoles: ["CEO", "RnDLead", "CMO", "ProcessAnalyst", "BusinessDevelopment", "AccountingSpecialist"],
    actions: [
      { type: "notion.createPage",  summary: "Create a new page in a database", params: { databaseId: "string", title: "string", body: "string" } },
      { type: "notion.appendBlock", summary: "Append content to an existing page", params: { pageId: "string", body: "string" } },
      { type: "notion.queryDB",     summary: "Query a database for matching rows", params: { databaseId: "string", filter: "object" } },
    ],
  },

  // ─── HYBRID-ROLE COORDINATION ───────────────────────────────────────────
  "skill.field_coordination": {
    id: "skill.field_coordination",
    name: "Field-Service Coordination",
    category: "comms",
    description: "Drives the human-in-the-loop state machine: dispatch → en-route → on-site → wrap → done. Bridges Twilio SMS for tech updates and customer ETAs.",
    requiredConnectors: [],
    suggestedRoles: ["COO", "DispatchCoordinator", "FieldTech"],
    actions: [
      { type: "field.prepareWorkOrder", summary: "Brief the assigned human technician", params: { humanId: "string", jobId: "string", brief: "string" } },
      { type: "field.trackJob",         summary: "Lire l’état enregistré de l’intervention", params: { jobId: "string" } },
      { type: "field.completeJob",      summary: "Capture photos and checklist, mark the intervention complete, then wait for customer service acceptance", params: { jobId: "string", notes: "string", photoUrls: "string[]", checklist: "string[]", technicianName: "string" } },
      { type: "field.followUp",         summary: "Préparer une note de suivi, sans envoi externe", params: { jobId: "string" } },
    ],
  },

  // ─── LOCAL HVAC GMAO ──────────────────────────────────────────────────
  "skill.gmao_contract": {
    id: "skill.gmao_contract",
    name: "Pilotage du marché GMAO",
    category: "maintenance",
    description: "Pilote le marché multi-site, ses SLA P0–P3, les risques de pénalité et le registre hebdomadaire.",
    requiredConnectors: [],
    suggestedRoles: ["MaintenanceContractManager"],
    actions: [
      { type:'gmao.searchWorkOrders', summary:'Chercher une intervention par numéro, client, site ou titre. Ne jamais inventer un identifiant.', params:{query:'string',clientId:'string',status:'string'} },
      { type:'gmao.getDossier', summary:'Lire le dossier complet et ses preuves avant de modifier son état.', params:{reference:'string'} },
      { type: "gmao.bootstrap", summary: "Initialiser le référentiel contractuel HVAC", params: { name: "string", marketNumber: "string", emergencyPhone: "string" } },
      { type: "gmao.evaluateSla", summary: "Contrôler les délais DI/DRS et chiffrer les risques de pénalité", params: {} },
      { type: "gmao.runAutomation", summary: "Détecter localement les exceptions et proposer les prochaines actions", params: {} },
      { type: "gmao.exportWeeklyRegister", summary: "Préparer l'extrait hebdomadaire du registre GMAO", params: { from: "number", to: "number" } },
    ],
  },
  "skill.gmao_maintenance": {
    id: "skill.gmao_maintenance",
    name: "Maintenance HVAC préventive et corrective",
    category: "maintenance",
    description: "Gère le patrimoine ST1/ST2/ST3, génère le préventif et orchestre les ordres de travail.",
    requiredConnectors: [],
    suggestedRoles: ["MaintenancePlanner", "DispatchCoordinator", "FieldTech"],
    actions: [
      { type:'gmao.searchWorkOrders',summary:'Retrouver les identifiants réels des interventions.',params:{query:'string'} },
      { type:'gmao.getDossier',summary:'Consulter contexte, documents, achats, envois et chronologie.',params:{reference:'string'} },
      { type:'gmao.scheduleWorkOrder',summary:'Proposer un créneau sans chevauchement ; ne prouve pas une arrivée terrain.',params:{workOrderId:'string',scheduledAt:'number',durationMinutes:'number',assigneeHuman:'string'} },
      { type: "gmao.generatePreventive", summary: "Générer les OT préventifs arrivés à échéance", params: { now: "number" } },
      { type: "gmao.createWorkOrder", summary: "Créer et prioriser un OT P0–P3", params: { siteId: "string", assetId: "string", type: "string", priority: "string", title: "string", description: "string" } },
      { type: "gmao.transitionWorkOrder", summary: "Faire progresser un OT dans son cycle contrôlé", params: { workOrderId: "string", status: "string", notes: "string", photoRefs: "string[]", serviceAcceptance: "boolean" } },
      { type: 'gmao.validateProcessStep', summary: 'Valider une étape OI avec preuve réelle : BC signé local, retour email au client, demande SF transmise, transmission facturation, clôture après accord client. Ne jamais inventer une preuve. Approbation du responsable obligatoire.', params: { workOrderId:'string', step:'string', confirmed:'boolean', documentId:'string', signer:'string', outboxId:'string', customerSignatory:'string', evidenceReference:'string' } },
      { type: "gmao.addEvidence", summary: "Tracer une preuve, une mesure ou un compte-rendu", params: { workOrderId: "string", note: "string", evidence: "object" } },
      { type: "gmao.recordAttachment", summary: "Enregistrer la feuille d'attachement et orienter vers clôture ou réparation", params: { workOrderId: "string", technicianName: "string", diagnosis: "string", workPerformed: "string", resolved: "boolean", repairMode: "string", supplierName: "string", repairDescription: "string", photoRefs: "string[]" } },
      { type: "gmao.notifyClient", summary: "Préparer un brouillon email ou SMS ; ne l’envoie pas. L’utilisateur valide le destinataire dans la boîte d’envoi.", params: { workOrderId: "string", channel: "string", sender: "string", recipient: "string", subject: "string", message: "string", documentId: "string" } },
      { type: "gmao.recommendSchedule", summary: "Classer les techniciens par compétences, disponibilité, distance, charge et astreinte", params: { workOrderId: "string", candidates: "object[]" } },
    ],
  },
  "skill.gmao_compliance": {
    id: "skill.gmao_compliance",
    name: "Conformité QHSE et documentaire",
    category: "compliance",
    description: "Suit CPR, accès, VIC, plans de prévention, DC4 et contrôles réglementaires avec dates de validité.",
    requiredConnectors: [],
    suggestedRoles: ["QHSEManager", "DocumentController"],
    actions: [
      { type: "gmao.registerCompliance", summary: "Enregistrer une exigence et sa validité", params: { recordType: "string", subjectName: "string", status: "string", validUntil: "number", siteId: "string" } },
      { type: "gmao.addEvidence", summary: "Tracer une preuve de conformité sur un OT", params: { workOrderId: "string", note: "string", evidence: "object" } },
    ],
  },
  "skill.gmao_finance": {
    id: "skill.gmao_finance",
    name: "Chiffrage BPU et hors BPU",
    category: "billing",
    description: "Calcule franchise, coefficient K, HT, TVA et TTC avant validation humaine et facturation.",
    requiredConnectors: [],
    suggestedRoles: ["BillingController", "CFO"],
    actions: [
      {type:'gmao.getDossier',summary:'Lire les preuves et les pièces du dossier.',params:{reference:'string'}},
      {type:'gmao.searchWorkOrders',summary:'Retrouver une intervention.',params:{query:'string'}},
      {type:'gmao.generateDocument',summary:'Générer et conserver un PDF local de devis, facture ou intervention.',params:{workOrderId:'string',kind:'string',recordId:'string'}},
      {type:'gmao.acknowledgeHandoff',summary:'Prendre en charge une demande achats liée au dossier.',params:{handoffId:'string',responsible:'string'}},
      { type: "gmao.updateProcurement", summary: "Suivre la demande fournisseur, la proforma, la commande et la réception", params: { id: "string", workOrderId: "string", requestType: "string", supplierName: "string", description: "string", status: "string", proformaReference: "string", amountCents: "integer", supplierId: "string", responsible: "string", orderReference: "string", receiptReference: "string", items: "array of {label, quantity, received}", dueAt: "unix milliseconds" } },
      { type: "gmao.validateProcessStep", summary: "Valider une transmission à la facturation après réception du SF, avec approbation du responsable.", params: {workOrderId:"string",step:"string",confirmed:"boolean"} },
      { type: "gmao.createQuote", summary: "Calculer un projet de devis BPU ou hors BPU", params: { workOrderId: "string", quoteType: "string", partsCents: "integer", laborCents: "integer", travelCents: "integer", accessCents: "integer", franchiseCents: "integer", coefficient: "number", vatRate: "number" } },
      { type: "gmao.updateQuote", summary: "Enregistrer une décision client étayée ; les envois passent par la boîte d’envoi", params: { quoteId: "string", status: "string", purchaseOrder: "string", evidenceReference: "string", documentId: "string" } },
      { type: "gmao.recordServiceAcceptance", summary: "Réceptionner le service fait et rendre l'OI facturable", params: { workOrderId: "string", reference: "string", receivedAt: "number", documentId: "string", customerSignatory: "string" } },
      { type: "gmao.saveInvoice", summary: "Créer puis tracer l'envoi de la facture client", params: { id: "string", workOrderId: "string", invoiceNumber: "string", status: "string", recipient: "string" } },
      { type: "gmao.reconcileBilling", summary: "Rapprocher devis, bon de commande, service fait et facture", params: { workOrderId: "string" } },
    ],
  },
  "skill.fulfillment_coordination": {
    id: "skill.fulfillment_coordination",
    name: "Fulfillment Coordination",
    category: "fulfillment",
    description: "For human-supported fulfillment workflows — packing / QC / shipping picked up by a contractor packer.",
    requiredConnectors: [],
    suggestedRoles: ["COO"],
    actions: [
      { type: "fulfillment.assignToHuman", summary: "Hand a pack-and-ship job to a named contractor", params: { humanId: "string", orderId: "string", instructions: "string" } },
      { type: "fulfillment.recordShipment", summary: "Record carrier + tracking number from human", params: { orderId: "string", carrier: "string", tracking: "string" } },
    ],
  },
};

/**
 * Look up a manifest by id. Returns null if unknown.
 */
export function getManifest(skillId) {
  return SKILL_MANIFESTS[skillId] || null;
}

/**
 * List all manifests, optionally filtered by category.
 */
export function listManifests(filter = {}) {
  let out = Object.values(SKILL_MANIFESTS);
  if (filter.category) out = out.filter((m) => m.category === filter.category);
  if (filter.role) out = out.filter((m) => m.suggestedRoles.includes(filter.role));
  if (filter.connector) out = out.filter((m) => m.requiredConnectors.includes(filter.connector));
  return out;
}

/**
 * Build a flat connector requirement set from a list of skill ids.
 * Used by the intake wizard to compute "you need these connectors."
 */
export function connectorsForSkills(skillIds) {
  const set = new Set();
  for (const id of skillIds) {
    const m = SKILL_MANIFESTS[id];
    if (!m) continue;
    for (const c of m.requiredConnectors) set.add(c);
  }
  return [...set];
}

/**
 * Render a skill action list for inclusion in a role's LLM prompt. The
 * dispatcher calls this for each granted skill and concatenates the
 * results into the ALLOWED ACTIONS section.
 */
export function actionListForPrompt(skillIds) {
  const lines = [];
  for (const id of skillIds) {
    const m = SKILL_MANIFESTS[id];
    if (!m) continue;
    for (const a of m.actions) {
      lines.push(`- ${a.type}: ${a.summary}. Parameters: ${JSON.stringify(a.params || {})}`);
    }
  }
  return lines;
}

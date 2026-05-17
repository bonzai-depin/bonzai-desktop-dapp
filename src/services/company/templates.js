/**
 * BonzAI Company — Vertical Templates
 *
 * A template is a pre-filled charter blueprint for an industry. The
 * intake wizard runs the template's `intakeQuestions`, applies the
 * answers to fill `mission`, `roles`, `treasury`, and `humanRoster`,
 * then resolves the referenced skill packs into `grantedSkills` per
 * role + the pending `connectors` list.
 *
 * Adding a vertical = adding a new entry below.
 */

import { resolvePacks } from "./skillPacks.js";
import { VETO_MODES } from "./charter.js";

/**
 * Each template ships with:
 *
 *   id, vertical, name, summary, badgeIcon (Material Symbols)
 *   missionTemplate(answers)  — returns the mission string
 *   skillPacks                — pack ids to install on Form
 *   defaultRoles              — { roleKey: { companion, llm?, grantedSkills, pipelines? } }
 *   hybridRoles               — [{ key, library, defaultGrantedSkills }]
 *   vetoOverrides             — partial vetoMode map merged onto defaults
 *   treasuryDefaults          — { reserveFloor, perHeartbeatSpendCap, currency }
 *   initialGoals              — strings the CEO will start with
 *   intakeQuestions           — wizard step content
 *   companionPresets          — suggested companion ids per role
 */
export const TEMPLATES = {
  // ─── UGC social media campaign studio ────────────────────────────────
  ugc_campaign_studio: {
    id: "ugc_campaign_studio",
    vertical: "ugc_campaign_studio",
    name: "UGC Campaign Studio",
    summary: "Client social media campaigns. Creator briefs, hooks, storyboards, draft assets, paid-media tests, and weekly reports.",
    badgeIcon: "campaign",
    skillPacks: ["smb_back_office", "marketing_agency"],

    missionTemplate: (a) => `Run a UGC campaign studio for ${a.targetClient || "growth-stage consumer brands"}. Create short-form social concepts, creator briefs, draft assets, paid-media variants, and weekly client reporting for ${a.channels || "TikTok, Reels, and Shorts"}. Primary campaign objective: ${a.campaignObjective || "increase qualified social demand"}. Brand voice: ${a.brandVoice || "human, fast, specific, and conversion-minded"}. Keep client work organized, measurable, and ready for approval before publishing.`.trim(),

    defaultRoles: {
      CEO: { companion: "zara", llm: "llm_qwen3_5_9b_q2", grantedSkills: ["skill.notion_docs"] },
      CFO: { companion: "marcus", llm: "llm_qwen3_5_4b_q4", grantedSkills: ["skill.qbo_invoicing", "skill.stripe_checkout", "skill.stripe_subscriptions"] },
      CPO: { companion: "kai", llm: "llm_qwen3_5_9b_q2", grantedSkills: ["skill.notion_docs"], pipelines: ["image", "video", "vision"] },
      CSO: { companion: "mai", llm: "llm_qwen3_5_4b_q4", grantedSkills: ["skill.hubspot_lite", "skill.sendgrid_email", "skill.google_calendar", "skill.docusign"] },
      CMO: { companion: "sofia", llm: "llm_qwen3_5_9b_q2", grantedSkills: ["skill.meta_ads", "skill.google_ads", "skill.hubspot_lite", "skill.sendgrid_email"], pipelines: ["image", "video", "vision"] },
      COO: { companion: "james", llm: "llm_qwen3_5_4b_q4", grantedSkills: ["skill.google_calendar", "skill.notion_docs"] },
      GeneralCounsel: { companion: "marcus", llm: "llm_qwen3_5_4b_q4", grantedSkills: ["skill.docusign"] },
      "Producer:text": { companion: "aurore", llm: "llm_qwen3_5_4b_q4", grantedSkills: ["skill.notion_docs"] },
      "Producer:image": { companion: "aria", llm: "llm_qwen3_5_4b_q4", grantedSkills: [], pipelines: ["image", "vision"] },
      "Producer:video": { companion: "zara", llm: "llm_qwen3_5_9b_q2", grantedSkills: [], pipelines: ["video", "audio"] },
      RnDLead: { companion: "kai", llm: "llm_qwen3_5_9b_q2", grantedSkills: ["skill.meta_ads", "skill.google_ads", "skill.notion_docs"], pipelines: ["vision"] },
    },

    hybridRoles: [],

    vetoOverrides: {
      "produce.text": VETO_MODES.AUTO,
      "produce.image": VETO_MODES.AUTO,
      "produce.video": VETO_MODES.NOTIFY,
      publishContent: VETO_MODES.NOTIFY,
      broadcastChannel: VETO_MODES.NOTIFY,
      replyToInbox: VETO_MODES.AUTO,
      "spend.under.50": VETO_MODES.AUTO,
      "spend.under.250": VETO_MODES.NOTIFY,
      "spend.over.250": VETO_MODES.APPROVE,
      hire: VETO_MODES.APPROVE,
      fire: VETO_MODES.APPROVE,
      amendCharter: VETO_MODES.APPROVE,
    },

    treasuryDefaults: {
      currency: "USD",
      reserveFloor: 5000,
      perHeartbeatSpendCap: 150,
    },

    initialGoals: [
      "Create a 7-day UGC concept calendar for the anchor client",
      "Write three creator briefs with hooks, shot lists, captions, and calls to action",
      "Generate storyboard frames for the strongest campaign angle",
      "Draft a 15-second vertical ad concept as a client-ready deliverable",
      "Prepare a weekly client performance report template with creative learnings",
    ],

    intakeQuestions: [
      { id: "targetClient", label: "Ideal client profile", placeholder: "e.g. skincare brands doing $1-10M ARR", type: "text", required: true },
      { id: "channels", label: "Primary social channels", placeholder: "TikTok, Reels, Shorts, LinkedIn", type: "text", default: "TikTok, Reels, and Shorts" },
      { id: "campaignObjective", label: "Main campaign objective", placeholder: "e.g. launch a new serum, reduce CAC, grow waitlist", type: "text", required: true },
      { id: "brandVoice", label: "Studio brand voice in 5 words", placeholder: "specific, warm, bold, practical, sharp", type: "text" },
      { id: "monthlyAdBudget", label: "Typical monthly client ad budget (USD)", type: "number", default: 3000 },
      { id: "activeClients", label: "How many active clients?", type: "number", default: 1 },
    ],
  },

  // ─── HVAC residential service company ────────────────────────────────
  hvac_residential: {
    id: "hvac_residential",
    vertical: "hvac_residential",
    name: "HVAC Service Company",
    summary: "Residential heating + cooling. PMA-driven retention, seasonal campaigns, 1099 technician coordination.",
    badgeIcon: "hvac",
    skillPacks: ["smb_back_office", "hvac_operator"],

    missionTemplate: (a) => `Serve the ${a.metro || "[your metro]"} residential HVAC market with same-day service, honest quotes, and a 50%+ PMA attach rate. Grow PMA base 10%/quarter while keeping CSAT above 4.7. Spring focus: AC tune-ups. Fall focus: furnace check-ups. ${a.uvp ? `What sets us apart: ${a.uvp}` : ""}`.trim(),

    defaultRoles: {
      CEO: { companion: "marcus", grantedSkills: [] },
      CFO: { companion: "marcus", grantedSkills: ["skill.qbo_invoicing", "skill.stripe_checkout", "skill.stripe_subscriptions"] },
      CPO: { companion: "aurore", grantedSkills: ["skill.pdf_proposal"] },
      CSO: { companion: "mai",    grantedSkills: ["skill.twilio_voice", "skill.twilio_sms", "skill.google_calendar", "skill.hubspot_lite"] },
      CMO: { companion: "zara",   grantedSkills: ["skill.gbp_reviews", "skill.sendgrid_email", "skill.twilio_sms"] },
      COO: { companion: "james",  grantedSkills: ["skill.optimoroute", "skill.field_coordination", "skill.google_calendar"] },
      GeneralCounsel: { companion: "marcus", grantedSkills: ["skill.permit_filer", "skill.docusign"] },
      "Producer:text": { companion: "aurore", grantedSkills: ["skill.pdf_proposal"] },
      "Producer:image": { companion: "zara",  grantedSkills: [] },
    },

    // Roles where a real human is in the loop. Companion handles
    // everything except the wrench-turning.
    hybridRoles: [
      {
        key: "FieldTech",
        library: "FieldTech",
        defaultGrantedSkills: ["skill.field_coordination", "skill.twilio_sms", "skill.google_calendar"],
        defaultCompanion: "james",
      },
    ],

    vetoOverrides: {
      "produce.text": VETO_MODES.AUTO,
      broadcastChannel: VETO_MODES.NOTIFY,
      "spend.under.50": VETO_MODES.NOTIFY,
      "spend.under.250": VETO_MODES.APPROVE,
      "spend.over.250": VETO_MODES.APPROVE,
    },

    treasuryDefaults: {
      currency: "USD",
      reserveFloor: 20000,
      perHeartbeatSpendCap: 250,
    },

    initialGoals: [
      "Audit Google Business profile and respond to reviews from the last 30 days",
      "Identify PMA renewals expiring in the next 30 days and queue personalized outreach",
      "Generate this week's seasonal campaign brief based on local weather and inventory",
      "Reconcile last week's payments in QuickBooks and flag anything overdue",
    ],

    intakeQuestions: [
      { id: "metro", label: "Metro area you serve", placeholder: "e.g. Denver, CO", type: "text", required: true },
      { id: "uvp", label: "What makes you different from the other HVAC shops?", placeholder: "e.g. 24/7 emergency, NATE-certified techs, 10-year install warranty", type: "text" },
      { id: "techCount", label: "How many field technicians (W2 + 1099)?", type: "number", default: 4 },
      { id: "monthlyRevenue", label: "Approx. monthly revenue (USD)", type: "number", default: 80000 },
      { id: "afterHoursPolicy", label: "Do you take after-hours emergency calls?", type: "toggle", default: true },
    ],
  },

  // ─── Print-on-Demand online shop ──────────────────────────────────────
  pod_shop: {
    id: "pod_shop",
    vertical: "pod_shop",
    name: "Print-on-Demand Shop",
    summary: "Online apparel + merch storefront. AI-generated designs, automated fulfillment, customer support, marketing.",
    badgeIcon: "storefront",
    skillPacks: ["smb_back_office", "pod_storefront"],

    missionTemplate: (a) => `Run a fully automated print-on-demand shop selling ${a.niche || "[your niche]"} merchandise. Ship daily new designs, target a ${a.cogsTargetPct || 35}% COGS ratio, and grow MRR 15%/month. Brand voice: ${a.brandVoice || "playful, confident, niche-fluent"}. Fulfillment via ${a.fulfillmentProvider || "Printful"}.`.trim(),

    defaultRoles: {
      CEO: { companion: "aurore", grantedSkills: [] },
      CFO: { companion: "marcus", grantedSkills: ["skill.qbo_invoicing", "skill.stripe_checkout", "skill.stripe_subscriptions"] },
      CPO: { companion: "kai",    grantedSkills: ["skill.shopify_store", "skill.printful", "skill.printify"] },
      CSO: { companion: "mai",    grantedSkills: ["skill.twilio_sms", "skill.twilio_whatsapp", "skill.sendgrid_email", "skill.hubspot_lite"] },
      CMO: { companion: "zara",   grantedSkills: ["skill.gbp_reviews", "skill.sendgrid_email"] },
      COO: { companion: "james",  grantedSkills: ["skill.fulfillment_coordination", "skill.shopify_store"] },
      GeneralCounsel: { companion: "marcus", grantedSkills: [] },
      "Producer:image": { companion: "aria",   grantedSkills: [] }, // designs the merch
      "Producer:text": { companion: "aurore",  grantedSkills: ["skill.pdf_proposal"] }, // product copy
      "Producer:video": { companion: "zara",   grantedSkills: [] }, // social ads
      RnDLead: { companion: "kai", grantedSkills: ["skill.shopify_store"] },
    },

    // Optional human supports — most POD shops don't need them, but
    // owners doing in-house QC or ship-overflow can opt in.
    hybridRoles: [
      {
        key: "Packer",
        library: "Packer",
        defaultGrantedSkills: ["skill.fulfillment_coordination"],
        defaultCompanion: "james",
        optional: true,
      },
    ],

    vetoOverrides: {
      "produce.image": VETO_MODES.AUTO,         // designs flow auto
      "produce.text": VETO_MODES.AUTO,
      publishContent: VETO_MODES.AUTO,           // listing new products auto
      broadcastChannel: VETO_MODES.NOTIFY,
      "spend.under.50": VETO_MODES.AUTO,         // ad budget under $50/day auto
      "spend.under.250": VETO_MODES.NOTIFY,
      "spend.over.250": VETO_MODES.APPROVE,
    },

    treasuryDefaults: {
      currency: "USD",
      reserveFloor: 5000,
      perHeartbeatSpendCap: 100,
    },

    initialGoals: [
      "Draw 3 new design concepts aligned with current trend signals for the niche",
      "Ship 2 new product listings to Shopify with hero images, alt text, and pricing",
      "Broadcast today's drop on the email list (segmented to high-LTV buyers first)",
      "Review yesterday's order fulfillment status and flag any prints stuck >24h",
      "Reply to every Shopify review or DM from the last 24h in brand voice",
    ],

    intakeQuestions: [
      { id: "niche", label: "Niche / theme of your shop", placeholder: "e.g. cottagecore mushrooms, retro skating, surreal cats", type: "text", required: true },
      { id: "brandVoice", label: "Brand voice in 5 words", placeholder: "playful, confident, irreverent, warm, witty", type: "text" },
      { id: "fulfillmentProvider", label: "Primary POD fulfillment provider", type: "select", options: ["Printful", "Printify", "Gelato", "SPOD"], default: "Printful" },
      { id: "cogsTargetPct", label: "Target COGS as % of revenue", type: "number", default: 35 },
      { id: "monthlyAdBudget", label: "Monthly ad budget (USD)", type: "number", default: 1500 },
    ],
  },

  // ─── Solo law firm ────────────────────────────────────────────────────
  solo_law: {
    id: "solo_law",
    vertical: "solo_law",
    name: "Solo Law Firm",
    summary: "One attorney, full back office. Client intake, conflict checks, engagement letters, IOLTA bookkeeping, calendaring, court deadlines — all autonomous around a single human attorney.",
    badgeIcon: "balance",
    skillPacks: ["smb_back_office", "solo_law"],

    missionTemplate: (a) => `Operate a solo ${a.practiceArea || "general practice"} law firm in ${a.jurisdiction || "[jurisdiction]"}. Maintain a ${a.targetUtilization || 65}% billable utilization for the attorney while running 100% of intake, conflict-checking, engagement, calendaring, IOLTA bookkeeping, and follow-up autonomously. Honor every state-bar advertising rule and never give legal advice without attorney review. ${a.uvp ? `Differentiator: ${a.uvp}` : ""}`.trim(),

    defaultRoles: {
      CEO: { companion: "marcus", grantedSkills: ["skill.notion_docs"] },
      CFO: { companion: "marcus", grantedSkills: ["skill.qbo_invoicing", "skill.stripe_checkout", "skill.clio_matter"] },
      CPO: { companion: "aurore", grantedSkills: ["skill.pdf_proposal"] },
      CSO: { companion: "mai",    grantedSkills: ["skill.twilio_voice", "skill.twilio_sms", "skill.google_calendar", "skill.hubspot_lite", "skill.clio_matter"] },
      CMO: { companion: "zara",   grantedSkills: ["skill.gbp_reviews", "skill.sendgrid_email"] },
      COO: { companion: "james",  grantedSkills: ["skill.google_calendar", "skill.notion_docs"] },
      GeneralCounsel: { companion: "marcus", grantedSkills: ["skill.clio_matter", "skill.docusign", "skill.notion_docs"] },
      "Producer:text": { companion: "aurore", grantedSkills: ["skill.pdf_proposal", "skill.docusign"] },
    },

    // The attorney is the only essential human — pause-for-approval on
    // any action with legal-substantive content.
    hybridRoles: [
      {
        key: "FieldTech", // reused as "the attorney" — the human in the loop
        library: "FieldTech",
        defaultGrantedSkills: ["skill.clio_matter", "skill.docusign", "skill.google_calendar", "skill.twilio_sms"],
        defaultCompanion: "marcus",
      },
    ],

    vetoOverrides: {
      "produce.text": VETO_MODES.NOTIFY,        // marketing copy fine, but visible
      publishContent: VETO_MODES.APPROVE,        // any public legal content needs attorney sign-off
      broadcastChannel: VETO_MODES.APPROVE,      // outbound comms reviewed
      replyToInbox: VETO_MODES.NOTIFY,           // intake replies fine
      "spend.under.50": VETO_MODES.NOTIFY,
      "spend.under.250": VETO_MODES.APPROVE,
      "spend.over.250": VETO_MODES.APPROVE,
    },

    treasuryDefaults: {
      currency: "USD",
      reserveFloor: 15000,
      perHeartbeatSpendCap: 100,
    },

    initialGoals: [
      "Run conflict checks on every new intake from the last 7 days and queue engagement letters",
      "Reconcile this week's IOLTA trust deposits against open matters in QuickBooks",
      "Audit court calendar for the next 30 days and surface any deadline within 5 business days",
      "Draft a brand-voice blog post on the most-asked intake question this week",
    ],

    intakeQuestions: [
      { id: "practiceArea", label: "Practice area", placeholder: "e.g. estate planning, family law, business formation", type: "text", required: true },
      { id: "jurisdiction", label: "Bar jurisdiction (state)", placeholder: "e.g. NY, CA, TX", type: "text", required: true },
      { id: "targetUtilization", label: "Target billable utilization (%)", type: "number", default: 65 },
      { id: "uvp", label: "What sets your practice apart?", placeholder: "e.g. flat-fee estate plans with 24-hour turnaround", type: "text" },
      { id: "intakePolicy", label: "Free initial consult?", type: "toggle", default: true },
    ],
  },

  // ─── Marketing agency ─────────────────────────────────────────────────
  marketing_agency: {
    id: "marketing_agency",
    vertical: "marketing_agency",
    name: "Marketing Agency",
    summary: "Lead-to-retainer pipeline. Multi-channel ad ops, deliverable creation, weekly client reports, and retainer renewals.",
    badgeIcon: "campaign",
    skillPacks: ["smb_back_office", "marketing_agency"],

    missionTemplate: (a) => `Run a ${a.specialty || "performance marketing"} agency serving ${a.targetClient || "DTC e-commerce brands"}. Deliver every client a ${a.cadence || "weekly"} performance report, hit ${a.targetROAS || 3}x ROAS on paid media, and grow MRR 20%/quarter via referrals + outbound. Brand voice: ${a.brandVoice || "data-driven, plain-spoken, fast-moving"}.`.trim(),

    defaultRoles: {
      CEO: { companion: "marcus", grantedSkills: ["skill.notion_docs"] },
      CFO: { companion: "marcus", grantedSkills: ["skill.qbo_invoicing", "skill.stripe_subscriptions", "skill.stripe_checkout"] },
      CPO: { companion: "kai",    grantedSkills: ["skill.notion_docs"] },
      CSO: { companion: "mai",    grantedSkills: ["skill.twilio_sms", "skill.sendgrid_email", "skill.hubspot_lite", "skill.docusign", "skill.google_calendar"] },
      CMO: { companion: "zara",   grantedSkills: ["skill.meta_ads", "skill.google_ads", "skill.gbp_reviews", "skill.sendgrid_email"] },
      COO: { companion: "james",  grantedSkills: ["skill.notion_docs", "skill.google_calendar"] },
      GeneralCounsel: { companion: "marcus", grantedSkills: ["skill.docusign"] },
      "Producer:text":  { companion: "aurore", grantedSkills: ["skill.pdf_proposal", "skill.notion_docs"] },
      "Producer:image": { companion: "aria",   grantedSkills: [] },
      "Producer:video": { companion: "zara",   grantedSkills: [] },
      RnDLead: { companion: "kai", grantedSkills: ["skill.notion_docs", "skill.meta_ads", "skill.google_ads"] },
    },

    // No hybrid roles by default — agency work is fully digital. Owners
    // can add a Strategist/AccountLead human via the wizard if they want
    // a human reviewer in the loop.
    hybridRoles: [],

    vetoOverrides: {
      "produce.text": VETO_MODES.AUTO,          // copy goes straight out
      "produce.image": VETO_MODES.AUTO,
      "produce.video": VETO_MODES.NOTIFY,
      publishContent: VETO_MODES.NOTIFY,
      broadcastChannel: VETO_MODES.NOTIFY,
      replyToInbox: VETO_MODES.AUTO,
      "spend.under.50": VETO_MODES.AUTO,        // tactical ad budget moves auto
      "spend.under.250": VETO_MODES.NOTIFY,
      "spend.over.250": VETO_MODES.APPROVE,     // strategic budget changes paused
      hire: VETO_MODES.APPROVE,
      fire: VETO_MODES.APPROVE,
      amendCharter: VETO_MODES.APPROVE,
    },

    treasuryDefaults: {
      currency: "USD",
      reserveFloor: 10000,
      perHeartbeatSpendCap: 200,
    },

    initialGoals: [
      "Pull yesterday's spend + ROAS across every active client and flag any campaign below target",
      "Send weekly client reports for every retainer with deck + commentary in brand voice",
      "Identify 3 prospects matching ICP from inbound forms and queue personalized outreach",
      "Reconcile outstanding invoices and trigger payment reminders for anything past 14 days",
      "Draft 5 ad-creative variants for the lowest-CTR campaign and queue R&D experiment",
    ],

    intakeQuestions: [
      { id: "specialty", label: "Agency specialty", placeholder: "e.g. performance marketing, SEO, B2B demand gen", type: "text", required: true },
      { id: "targetClient", label: "Ideal client profile", placeholder: "e.g. Shopify DTC $1-10M ARR", type: "text", required: true },
      { id: "cadence", label: "Client report cadence", type: "select", options: ["weekly", "biweekly", "monthly"], default: "weekly" },
      { id: "targetROAS", label: "Target ROAS for paid media", type: "number", default: 3 },
      { id: "brandVoice", label: "Agency brand voice in 5 words", placeholder: "data-driven, plain-spoken, fast-moving, candid, sharp", type: "text" },
    ],
  },

  // ─── Newsletter creator ───────────────────────────────────────────────
  newsletter_creator: {
    id: "newsletter_creator",
    vertical: "newsletter_creator",
    name: "Newsletter Creator",
    summary: "Daily or weekly publishing operation. Drafting, scheduling, subscriber care, paid-tier monetization, lifecycle automation — all autonomous.",
    badgeIcon: "newspaper",
    skillPacks: ["smb_back_office", "newsletter_creator"],

    missionTemplate: (a) => `Publish ${a.cadence || "weekly"} newsletters about ${a.topic || "[your topic]"} for the ${a.audience || "target audience"}. Grow paid-tier subscribers by ${a.growthTargetPct || 15}%/month while keeping unsubscribe rate under 0.5%/issue. Brand voice: ${a.brandVoice || "thoughtful, candid, source-cited"}.`.trim(),

    defaultRoles: {
      CEO: { companion: "aurore", grantedSkills: ["skill.notion_docs"] },
      CFO: { companion: "marcus", grantedSkills: ["skill.qbo_invoicing", "skill.stripe_subscriptions"] },
      CPO: { companion: "kai",    grantedSkills: ["skill.notion_docs"] },
      CSO: { companion: "mai",    grantedSkills: ["skill.sendgrid_email", "skill.hubspot_lite"] },
      CMO: { companion: "zara",   grantedSkills: ["skill.convertkit_newsletter", "skill.sendgrid_email"] },
      COO: { companion: "james",  grantedSkills: ["skill.notion_docs"] },
      "Producer:text":  { companion: "aurore", grantedSkills: ["skill.notion_docs"] },
      "Producer:image": { companion: "aria",   grantedSkills: [] },
      RnDLead: { companion: "kai", grantedSkills: ["skill.notion_docs", "skill.convertkit_newsletter"] },
    },
    hybridRoles: [],
    vetoOverrides: {
      "produce.text": VETO_MODES.AUTO,
      "produce.image": VETO_MODES.AUTO,
      publishContent: VETO_MODES.NOTIFY,
      broadcastChannel: VETO_MODES.NOTIFY,
      "spend.under.50": VETO_MODES.AUTO,
      "spend.under.250": VETO_MODES.NOTIFY,
      "spend.over.250": VETO_MODES.APPROVE,
    },
    treasuryDefaults: { currency: "USD", reserveFloor: 2000, perHeartbeatSpendCap: 30 },
    initialGoals: [
      "Draft this issue's lead story from yesterday's research notes",
      "Publish today's issue to the free segment with a paid-tier teaser",
      "Tag every new subscriber by source for segmentation",
      "Reply to every reader response from the last 48h in brand voice",
      "Pull last issue's open + click metrics and queue an R&D experiment on subject lines",
    ],
    intakeQuestions: [
      { id: "topic", label: "What's your newsletter about?", placeholder: "e.g. AI applied to creative work, climate finance, indie SaaS", type: "text", required: true },
      { id: "audience", label: "Who reads it?", placeholder: "e.g. founders, designers, climate professionals", type: "text", required: true },
      { id: "cadence", label: "Publishing cadence", type: "select", options: ["daily", "3x/week", "weekly", "biweekly"], default: "weekly" },
      { id: "brandVoice", label: "Brand voice in 5 words", placeholder: "thoughtful, candid, sourced, dry, direct", type: "text" },
      { id: "growthTargetPct", label: "Monthly paid-tier growth target (%)", type: "number", default: 15 },
    ],
  },

  // ─── Online course creator ────────────────────────────────────────────
  course_creator: {
    id: "course_creator",
    vertical: "course_creator",
    name: "Online Course Creator",
    summary: "Cohort enrollment, lesson scheduling, drip releases, student support, completion certificates — fully autonomous education ops.",
    badgeIcon: "school",
    skillPacks: ["smb_back_office", "course_creator"],

    missionTemplate: (a) => `Run an online course program teaching ${a.topic || "[your subject]"} to ${a.audience || "learners"} via ${a.format || "self-paced"} cohorts. Average ${a.targetCompletion || 65}%+ completion rate, ${a.targetRevenue || 30}k MRR, and a 4.7+ student satisfaction score. Brand voice: ${a.brandVoice || "warm, structured, encouraging"}.`.trim(),

    defaultRoles: {
      CEO: { companion: "aurore", grantedSkills: ["skill.notion_docs"] },
      CFO: { companion: "marcus", grantedSkills: ["skill.qbo_invoicing", "skill.stripe_subscriptions", "skill.stripe_checkout"] },
      CPO: { companion: "kai",    grantedSkills: ["skill.teachable_course", "skill.notion_docs"] },
      CSO: { companion: "mai",    grantedSkills: ["skill.sendgrid_email", "skill.hubspot_lite", "skill.calendly_booking", "skill.teachable_course"] },
      CMO: { companion: "zara",   grantedSkills: ["skill.sendgrid_email", "skill.gbp_reviews"] },
      COO: { companion: "james",  grantedSkills: ["skill.notion_docs", "skill.calendly_booking"] },
      "Producer:text":  { companion: "aurore", grantedSkills: ["skill.notion_docs"] },
      "Producer:video": { companion: "zara",   grantedSkills: [] },
      "Producer:audio": { companion: "mai",    grantedSkills: [] },
      RnDLead: { companion: "kai", grantedSkills: ["skill.notion_docs"] },
    },
    hybridRoles: [],
    vetoOverrides: {
      "produce.text": VETO_MODES.AUTO,
      "produce.video": VETO_MODES.NOTIFY,
      publishContent: VETO_MODES.NOTIFY,
      broadcastChannel: VETO_MODES.NOTIFY,
      "spend.under.50": VETO_MODES.AUTO,
      "spend.under.250": VETO_MODES.NOTIFY,
      "spend.over.250": VETO_MODES.APPROVE,
    },
    treasuryDefaults: { currency: "USD", reserveFloor: 5000, perHeartbeatSpendCap: 75 },
    initialGoals: [
      "Schedule this week's drip lessons to release on Monday at 9am local",
      "Reply to every student support thread from the last 24h",
      "Publish this week's bonus content to enrolled cohorts",
      "Audit last cohort's completion rate by lesson and queue R&D on the dropoff points",
      "Issue completion certificates to anyone who finished module 4 this week",
    ],
    intakeQuestions: [
      { id: "topic", label: "Course subject", placeholder: "e.g. SQL for analysts, mindful productivity, mid-life career pivots", type: "text", required: true },
      { id: "audience", label: "Who's the student?", placeholder: "e.g. early-career data folks, knowledge workers age 30-50", type: "text", required: true },
      { id: "format", label: "Delivery format", type: "select", options: ["self-paced", "cohort-based", "live + recordings"], default: "cohort-based" },
      { id: "targetCompletion", label: "Target completion rate (%)", type: "number", default: 65 },
      { id: "targetRevenue", label: "Target MRR (USD k)", type: "number", default: 30 },
      { id: "brandVoice", label: "Brand voice in 5 words", placeholder: "warm, structured, sharp, encouraging, no-fluff", type: "text" },
    ],
  },

  // ─── Bookkeeping firm ─────────────────────────────────────────────────
  bookkeeping_firm: {
    id: "bookkeeping_firm",
    vertical: "bookkeeping_firm",
    name: "Bookkeeping Firm",
    summary: "Multi-client monthly closes, invoice operations, document collection, tax-prep handoffs, retainer management — autonomous around a single CPA reviewer.",
    badgeIcon: "receipt_long",
    skillPacks: ["smb_back_office", "bookkeeping_firm"],

    missionTemplate: (a) => `Operate a bookkeeping firm serving ${a.clientCount || 25} ${a.clientType || "small-business"} clients with monthly closes by the 10th of every month. Maintain ${a.targetMargin || 60}%+ gross margin and zero late filings. Owner CPA reviews every close before publication. Brand voice: ${a.brandVoice || "calm, accurate, deadline-driven"}.`.trim(),

    defaultRoles: {
      CEO: { companion: "marcus", grantedSkills: ["skill.notion_docs"] },
      CFO: { companion: "marcus", grantedSkills: ["skill.qbo_invoicing", "skill.stripe_subscriptions", "skill.stripe_checkout"] },
      CPO: { companion: "kai",    grantedSkills: ["skill.notion_docs"] },
      CSO: { companion: "mai",    grantedSkills: ["skill.sendgrid_email", "skill.hubspot_lite", "skill.calendly_booking", "skill.docusign"] },
      CMO: { companion: "zara",   grantedSkills: ["skill.sendgrid_email", "skill.gbp_reviews"] },
      COO: { companion: "james",  grantedSkills: ["skill.notion_docs", "skill.calendly_booking", "skill.slack_team"] },
      GeneralCounsel: { companion: "marcus", grantedSkills: ["skill.docusign"] },
      "Producer:text": { companion: "aurore", grantedSkills: ["skill.pdf_proposal", "skill.notion_docs"] },
    },
    hybridRoles: [
      {
        key: "FieldTech", // repurposed as "the CPA reviewer"
        library: "FieldTech",
        defaultGrantedSkills: ["skill.qbo_invoicing", "skill.docusign", "skill.notion_docs"],
        defaultCompanion: "marcus",
      },
    ],
    vetoOverrides: {
      "produce.text": VETO_MODES.NOTIFY,
      publishContent: VETO_MODES.APPROVE,        // every close requires CPA review
      broadcastChannel: VETO_MODES.NOTIFY,
      replyToInbox: VETO_MODES.NOTIFY,
      "spend.under.50": VETO_MODES.NOTIFY,
      "spend.under.250": VETO_MODES.APPROVE,
      "spend.over.250": VETO_MODES.APPROVE,
    },
    treasuryDefaults: { currency: "USD", reserveFloor: 25000, perHeartbeatSpendCap: 75 },
    initialGoals: [
      "Pull yesterday's transactions for every active client and surface uncategorized items",
      "Reconcile this week's incoming invoices and queue any missing receipts for client follow-up",
      "Schedule month-end close reviews with the CPA on the 8th and 9th",
      "Send retainer renewal reminders to clients with anniversaries in the next 14 days",
    ],
    intakeQuestions: [
      { id: "clientCount", label: "How many active clients?", type: "number", default: 25 },
      { id: "clientType", label: "Typical client", placeholder: "e.g. e-commerce DTC, professional services, real-estate investors", type: "text" },
      { id: "targetMargin", label: "Target gross margin (%)", type: "number", default: 60 },
      { id: "tieredPricing", label: "Do you offer tiered pricing?", type: "toggle", default: true },
      { id: "brandVoice", label: "Brand voice in 5 words", placeholder: "calm, accurate, deadline-driven, plain, careful", type: "text" },
    ],
  },

  // ─── Indie SaaS micro-startup ─────────────────────────────────────────
  indie_saas: {
    id: "indie_saas",
    vertical: "indie_saas",
    name: "Indie SaaS Micro-startup",
    summary: "One-person SaaS company. Subscription billing, customer support routing, engineering issue triage, release notes, growth experiments — autonomous around a single founder-engineer.",
    badgeIcon: "rocket_launch",
    skillPacks: ["smb_back_office", "indie_saas"],

    missionTemplate: (a) => `Operate a ${a.productType || "B2B SaaS"} product called ${a.productName || "[your product]"} solving ${a.problem || "[the problem]"} for ${a.audience || "[users]"}. Maintain ${a.targetUptime || 99.9}% uptime, ${a.targetChurn || 3}% monthly churn or lower, and ship a customer-visible release weekly. Brand voice: ${a.brandVoice || "candid, technical, fast-moving"}.`.trim(),

    defaultRoles: {
      CEO: { companion: "kai", grantedSkills: ["skill.notion_docs", "skill.linear_issues"] },
      CFO: { companion: "marcus", grantedSkills: ["skill.qbo_invoicing", "skill.stripe_subscriptions"] },
      CPO: { companion: "kai",    grantedSkills: ["skill.linear_issues", "skill.notion_docs"] },
      CSO: { companion: "mai",    grantedSkills: ["skill.slack_team", "skill.sendgrid_email", "skill.hubspot_lite"] },
      CMO: { companion: "zara",   grantedSkills: ["skill.sendgrid_email", "skill.notion_docs"] },
      COO: { companion: "james",  grantedSkills: ["skill.slack_team", "skill.linear_issues"] },
      RnDLead: { companion: "kai", grantedSkills: ["skill.linear_issues", "skill.slack_team", "skill.notion_docs"] },
      "Producer:text": { companion: "aurore", grantedSkills: ["skill.notion_docs"] },
    },
    hybridRoles: [
      {
        key: "FieldTech", // repurposed as "the founding engineer"
        library: "FieldTech",
        defaultGrantedSkills: ["skill.linear_issues", "skill.slack_team"],
        defaultCompanion: "kai",
        optional: true,
      },
    ],
    vetoOverrides: {
      "produce.text": VETO_MODES.AUTO,
      publishContent: VETO_MODES.NOTIFY,
      broadcastChannel: VETO_MODES.NOTIFY,
      replyToInbox: VETO_MODES.AUTO,
      "spend.under.50": VETO_MODES.AUTO,
      "spend.under.250": VETO_MODES.NOTIFY,
      "spend.over.250": VETO_MODES.APPROVE,
    },
    treasuryDefaults: { currency: "USD", reserveFloor: 8000, perHeartbeatSpendCap: 50 },
    initialGoals: [
      "Triage every new support ticket from the last 24h into Linear with priority + assignee",
      "Reply to every customer message in brand voice; escalate technical questions to founding engineer",
      "Audit yesterday's Stripe events for failed charges and trigger dunning emails",
      "Draft this week's release-notes post from merged Linear issues",
      "Run a growth experiment on the homepage CTA copy and queue results in R&D",
    ],
    intakeQuestions: [
      { id: "productName", label: "Product name", placeholder: "e.g. Foreshadow", type: "text", required: true },
      { id: "productType", label: "Product type", type: "select", options: ["B2B SaaS", "B2C SaaS", "developer tool", "consumer app"], default: "B2B SaaS" },
      { id: "problem", label: "What problem do you solve?", placeholder: "e.g. 'turn raw video into searchable transcripts'", type: "text", required: true },
      { id: "audience", label: "Who pays you?", placeholder: "e.g. 'product teams at 50-500-person SaaS companies'", type: "text" },
      { id: "targetChurn", label: "Target monthly churn (%)", type: "number", default: 3 },
      { id: "brandVoice", label: "Brand voice in 5 words", placeholder: "candid, technical, fast-moving, opinionated, dry", type: "text" },
    ],
  },

  // ─── Affiliate marketing operator ─────────────────────────────────────
  affiliate_operator: {
    id: "affiliate_operator",
    vertical: "affiliate_operator",
    name: "Affiliate Marketing Operator",
    summary: "Multi-funnel paid-traffic operation with creative testing, conversion tracking, deliverable creation, and audience expansion.",
    badgeIcon: "trending_up",
    skillPacks: ["smb_back_office", "affiliate_operator"],

    missionTemplate: (a) => `Run an affiliate marketing operation in the ${a.vertical || "[vertical]"} space across ${a.channels || "Meta, Google, and content"}. Maintain ${a.targetROAS || 2.5}x blended ROAS, ${a.targetMargin || 35}%+ profit margin, and continuously test ${a.weeklyCreatives || 5} new creative variants per week. Brand voice across funnels: ${a.brandVoice || "high-conversion, audience-fluent, tested"}.`.trim(),

    defaultRoles: {
      CEO: { companion: "marcus", grantedSkills: ["skill.notion_docs"] },
      CFO: { companion: "marcus", grantedSkills: ["skill.qbo_invoicing", "skill.stripe_subscriptions"] },
      CPO: { companion: "kai",    grantedSkills: ["skill.notion_docs"] },
      CMO: { companion: "zara",   grantedSkills: ["skill.meta_ads", "skill.google_ads", "skill.sendgrid_email", "skill.gbp_reviews"] },
      COO: { companion: "james",  grantedSkills: ["skill.notion_docs"] },
      "Producer:text":  { companion: "aurore", grantedSkills: ["skill.notion_docs"] },
      "Producer:image": { companion: "aria",   grantedSkills: [] },
      "Producer:video": { companion: "zara",   grantedSkills: [] },
      RnDLead: { companion: "kai", grantedSkills: ["skill.meta_ads", "skill.google_ads", "skill.notion_docs"] },
    },
    hybridRoles: [],
    vetoOverrides: {
      "produce.text": VETO_MODES.AUTO,
      "produce.image": VETO_MODES.AUTO,
      "produce.video": VETO_MODES.NOTIFY,
      publishContent: VETO_MODES.AUTO,
      broadcastChannel: VETO_MODES.NOTIFY,
      "spend.under.50": VETO_MODES.AUTO,        // tactical bid moves auto
      "spend.under.250": VETO_MODES.NOTIFY,
      "spend.over.250": VETO_MODES.APPROVE,
    },
    treasuryDefaults: { currency: "USD", reserveFloor: 10000, perHeartbeatSpendCap: 250 },
    initialGoals: [
      "Pull yesterday's spend + ROAS by ad set; pause anything below 1.0x ROAS",
      "Upload 3 new creative variants to underperforming campaigns",
      "Draft this week's content piece for the affiliate funnel and queue distribution",
      "Audit conversion events in the last 24h for tracking discrepancies",
      "Identify top 3 audiences by ROAS and queue look-alike expansion",
    ],
    intakeQuestions: [
      { id: "vertical", label: "Affiliate niche", placeholder: "e.g. health supplements, finance leads, B2B SaaS reviews", type: "text", required: true },
      { id: "channels", label: "Active channels", placeholder: "e.g. Meta + Google + YouTube + email", type: "text" },
      { id: "targetROAS", label: "Target blended ROAS (x)", type: "number", default: 2.5 },
      { id: "targetMargin", label: "Target margin (%)", type: "number", default: 35 },
      { id: "weeklyCreatives", label: "Weekly creative variants to test", type: "number", default: 5 },
      { id: "brandVoice", label: "Brand voice across funnels", placeholder: "high-conversion, audience-fluent, tested", type: "text" },
    ],
  },

  // ─── Online coaching practice ─────────────────────────────────────────
  coaching_practice: {
    id: "coaching_practice",
    vertical: "coaching_practice",
    name: "Online Coaching Practice",
    summary: "1:1 + group coaching. Booking flow, intake forms, engagement letters, session prep, billing, retention — autonomous around the human coach.",
    badgeIcon: "psychology",
    skillPacks: ["smb_back_office", "coaching_practice"],

    missionTemplate: (a) => `Operate an online coaching practice for ${a.clientType || "[your ideal client]"} focused on ${a.focusArea || "[your focus area]"}. Maintain a ${a.targetUtilization || 70}% calendar utilization for the coach, ${a.targetMRR || 15}k MRR from retainer plans, and a 90%+ client renewal rate. Brand voice: ${a.brandVoice || "warm, present, inquisitive, grounded, direct"}.`.trim(),

    defaultRoles: {
      CEO: { companion: "aurore", grantedSkills: ["skill.notion_docs"] },
      CFO: { companion: "marcus", grantedSkills: ["skill.qbo_invoicing", "skill.stripe_subscriptions", "skill.stripe_checkout"] },
      CPO: { companion: "aurore", grantedSkills: ["skill.notion_docs"] },
      CSO: { companion: "mai",    grantedSkills: ["skill.calendly_booking", "skill.sendgrid_email", "skill.hubspot_lite", "skill.docusign", "skill.twilio_sms"] },
      CMO: { companion: "zara",   grantedSkills: ["skill.sendgrid_email", "skill.gbp_reviews"] },
      COO: { companion: "james",  grantedSkills: ["skill.notion_docs", "skill.calendly_booking"] },
      GeneralCounsel: { companion: "marcus", grantedSkills: ["skill.docusign"] },
      "Producer:text": { companion: "aurore", grantedSkills: ["skill.pdf_proposal", "skill.notion_docs"] },
    },
    hybridRoles: [
      {
        key: "FieldTech", // repurposed as "the coach" — the human in every session
        library: "FieldTech",
        defaultGrantedSkills: ["skill.calendly_booking", "skill.docusign", "skill.notion_docs"],
        defaultCompanion: "aurore",
      },
    ],
    vetoOverrides: {
      "produce.text": VETO_MODES.NOTIFY,
      publishContent: VETO_MODES.APPROVE,        // any publicly-attributed content reviewed
      broadcastChannel: VETO_MODES.NOTIFY,
      replyToInbox: VETO_MODES.NOTIFY,
      "spend.under.50": VETO_MODES.NOTIFY,
      "spend.under.250": VETO_MODES.APPROVE,
      "spend.over.250": VETO_MODES.APPROVE,
    },
    treasuryDefaults: { currency: "USD", reserveFloor: 8000, perHeartbeatSpendCap: 60 },
    initialGoals: [
      "Send pre-session prep notes to every client booked in the next 48h",
      "Reply to every prospect inquiry from the last 24h with a Calendly link",
      "Draft a session-debrief template for the coach to fill in after today's calls",
      "Audit retainer renewals coming up in the next 30 days and queue outreach",
      "Publish a thoughtful tip-of-the-week to the email list in brand voice",
    ],
    intakeQuestions: [
      { id: "clientType", label: "Who do you coach?", placeholder: "e.g. mid-career engineers, small-business owners, parents of teens", type: "text", required: true },
      { id: "focusArea", label: "Focus area", placeholder: "e.g. career transitions, parenting under stress, founder burnout", type: "text", required: true },
      { id: "targetUtilization", label: "Target weekly calendar utilization (%)", type: "number", default: 70 },
      { id: "targetMRR", label: "Target MRR from retainers (USD k)", type: "number", default: 15 },
      { id: "brandVoice", label: "Brand voice in 5 words", placeholder: "warm, present, inquisitive, grounded, direct", type: "text" },
    ],
  },
};

export function getTemplate(id) {
  return TEMPLATES[id] || null;
}

export function listTemplates() {
  return Object.values(TEMPLATES);
}

/**
 * Apply a template + intake answers to produce a charter draft.
 *
 * Returns { draft, requiredConnectors, requiredSkills } — the wizard
 * uses requiredConnectors to render the connector setup checklist; the
 * draft is what the form pre-fills with.
 */
export function applyTemplate(templateId, answers = {}, ownerOverrides = {}) {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`unknown template: ${templateId}`);

  const { skills, connectors } = resolvePacks(t.skillPacks);

  // Roles with grantedSkills filtered to the union of pack skills (so
  // you can't grant a skill that isn't installed).
  const validSkillSet = new Set(skills);
  const roles = {};
  for (const [roleKey, roleDef] of Object.entries(t.defaultRoles)) {
    roles[roleKey] = {
      companion: roleDef.companion,
      llm: roleDef.llm || null,
      grantedSkills: (roleDef.grantedSkills || []).filter((s) => validSkillSet.has(s)),
    };
    if (Array.isArray(roleDef.pipelines) && roleDef.pipelines.length) {
      roles[roleKey].pipelines = [...roleDef.pipelines];
    }
    if (roleDef.budgetPerHeartbeat) roles[roleKey].budgetPerHeartbeat = roleDef.budgetPerHeartbeat;
  }

  // Hybrid roles: append onto roles map with kind=human_supported.
  // Resolve humans for each hybrid role from the wizard's flat
  // humanRoster (anyone marked isPhysical: true) — this is the path the
  // intake wizard takes. The explicitly-keyed override
  // (`humanResources[hr.key]`) wins when present, so power users can
  // map specific people to specific hybrid roles via the advanced form.
  const physicalRoster = (ownerOverrides.humanRoster || []).filter((h) => h?.isPhysical);
  for (let i = 0; i < (t.hybridRoles || []).length; i++) {
    const hr = t.hybridRoles[i];
    if (hr.optional && !ownerOverrides.includeOptionalHumans) continue;
    const explicit = ownerOverrides.humanResources?.[hr.key];
    // Default: everyone marked physical lands under the FIRST hybrid
    // role (most templates only have one — FieldTech for HVAC, the
    // attorney for law, the coach for coaching, etc.). Subsequent
    // hybrid roles get an empty array; owners can manually assign.
    const fromRoster = i === 0 ? physicalRoster : [];
    roles[hr.key] = {
      companion: hr.defaultCompanion,
      kind: "human_supported",
      grantedSkills: (hr.defaultGrantedSkills || []).filter((s) => validSkillSet.has(s)),
      humanResources: explicit || fromRoster,
    };
  }

  const draft = {
    name: ownerOverrides.name || t.name,
    mission: t.missionTemplate(answers),
    mode: ownerOverrides.mode || "solo",
    template: { id: t.id, version: "1.0", appliedAt: Date.now() },
    rules: {
      ...t.treasuryDefaults,
      ...(ownerOverrides.treasury || {}),
      vetoOverrides: t.vetoOverrides,
    },
    roles,
    humanRoster: ownerOverrides.humanRoster || [],
    pendingConnectors: connectors,   // wizard's connector checklist
    grantedSkills: skills,           // top-level installed-skill list
    skillPacks: t.skillPacks,
    initialGoals: t.initialGoals,
  };

  return { draft, requiredConnectors: connectors, requiredSkills: skills, template: t };
}

/**
 * BonzAI Company — Skill Packs
 *
 * A pack is a curated bundle of skills + connectors + suggested role
 * bindings for a vertical. Templates reference pack ids; applying a
 * template grants the union of pack skills + records the connector
 * requirement list for the intake wizard.
 */

import { connectorsForSkills } from "./skillManifests.js";

export const SKILL_PACKS = {
  government_grants: {id:"government_grants",name:"Grants and incentives",skills:["skill.local_grants","skill.local_browser","skill.team_communication"]},
  paperasse_finance: { id: "paperasse_finance", name: "French finance operations", description: "Financial evidence and approval-gated invoicing for Paperasse teams.", skills: ["skill.finance_reconciliation", "skill.qonto_finance", "skill.qonto_invoicing", "skill.stripe_finance", "skill.stripe_invoicing", "skill.stripe_checkout", "skill.stripe_subscriptions"] },
  smb_back_office: {
    id: "smb_back_office",
    name: "SMB Back Office",
    description: "Universal foundations: bookkeeping, payments, calendar, CRM, email.",
    skills: [
      "skill.qbo_invoicing",
      "skill.stripe_checkout",
      "skill.stripe_subscriptions",
      "skill.google_calendar",
      "skill.hubspot_lite",
      "skill.sendgrid_email",
      "skill.pdf_proposal",
      "skill.notion_docs",
      "skill.slack_team",
      "skill.docusign",
    ],
  },

  hvac_operator: {
    id: "hvac_operator",
    name: "HVAC Operator",
    description: "Phone triage, dispatch, permit drafting, review responses, field-tech coordination.",
    skills: [
      "skill.twilio_voice",
      "skill.twilio_sms",
      "skill.optimoroute",
      "skill.permit_filer",
      "skill.gbp_reviews",
      "skill.field_coordination",
      "skill.docusign",
      "skill.stripe_subscriptions",
      "skill.gmao_contract",
      "skill.gmao_maintenance",
      "skill.gmao_compliance",
      "skill.gmao_finance",
    ],
  },

  pod_storefront: {
    id: "pod_storefront",
    name: "Print-on-Demand Storefront",
    description: "Storefront, fulfillment provider sync, customer support, review responses, marketing comms.",
    skills: [
      "skill.shopify_store",
      "skill.printful",
      "skill.printify",
      "skill.twilio_sms",
      "skill.twilio_whatsapp",
      "skill.gbp_reviews",
      "skill.fulfillment_coordination",
    ],
  },

  solo_law: {
    id: "solo_law",
    name: "Solo Law Firm",
    description: "Client intake + conflict checks, matter management, IOLTA bookkeeping, e-signed engagements, court-date tracking.",
    skills: [
      "skill.clio_matter",
      "skill.docusign",
      "skill.twilio_voice",
      "skill.twilio_sms",
      "skill.google_calendar",
      "skill.hubspot_lite",
      "skill.gbp_reviews",
      "skill.notion_docs",
    ],
  },

  marketing_agency: {
    id: "marketing_agency",
    name: "Marketing Agency Operator",
    description: "Lead-to-retainer pipeline, multi-channel campaign execution, client reporting, content production at scale.",
    skills: [
      "skill.meta_ads",
      "skill.google_ads",
      "skill.gbp_reviews",
      "skill.sendgrid_email",
      "skill.hubspot_lite",
      "skill.docusign",
      "skill.notion_docs",
      "skill.twilio_sms",
    ],
  },

  newsletter_creator: {
    id: "newsletter_creator",
    name: "Newsletter Creator",
    description: "Daily/weekly publishing, subscriber tagging, paid-tier monetization, lifecycle automation.",
    skills: [
      "skill.convertkit_newsletter",
      "skill.sendgrid_email",
      "skill.notion_docs",
      "skill.stripe_subscriptions",
    ],
  },

  course_creator: {
    id: "course_creator",
    name: "Online Course Creator",
    description: "Cohort enrollment, lesson scheduling, drip releases, student support, certificates.",
    skills: [
      "skill.teachable_course",
      "skill.calendly_booking",
      "skill.sendgrid_email",
      "skill.stripe_subscriptions",
      "skill.notion_docs",
    ],
  },

  coaching_practice: {
    id: "coaching_practice",
    name: "Coaching Practice",
    description: "1:1 booking, intake forms, Calendly + Stripe + DocuSign for engagement letters, Notion knowledge base.",
    skills: [
      "skill.calendly_booking",
      "skill.stripe_subscriptions",
      "skill.docusign",
      "skill.notion_docs",
      "skill.sendgrid_email",
      "skill.twilio_sms",
    ],
  },

  indie_saas: {
    id: "indie_saas",
    name: "Indie SaaS Operator",
    description: "Subscription billing, customer support routing, issue triage, release notes, growth experiments.",
    skills: [
      "skill.stripe_subscriptions",
      "skill.linear_issues",
      "skill.slack_team",
      "skill.sendgrid_email",
      "skill.notion_docs",
      "skill.hubspot_lite",
    ],
  },

  bookkeeping_firm: {
    id: "bookkeeping_firm",
    name: "Bookkeeping Firm",
    description: "Multi-client books, monthly close, invoice ops, document collection, tax-prep handoffs.",
    skills: [
      "skill.qbo_invoicing",
      "skill.stripe_subscriptions",
      "skill.docusign",
      "skill.calendly_booking",
      "skill.slack_team",
      "skill.notion_docs",
      "skill.sendgrid_email",
    ],
  },

  affiliate_operator: {
    id: "affiliate_operator",
    name: "Affiliate Marketing Operator",
    description: "Multi-funnel ad operator: paid social + search + content, with conversion tracking and creative experimentation.",
    skills: [
      "skill.meta_ads",
      "skill.google_ads",
      "skill.sendgrid_email",
      "skill.notion_docs",
      "skill.hubspot_lite",
      "skill.gbp_reviews",
    ],
  },
};

export function getPack(packId) {
  return SKILL_PACKS[packId] || null;
}

export function listPacks() {
  return Object.values(SKILL_PACKS);
}

/**
 * Resolve a list of pack ids into the union of skill ids + connector kinds.
 * Used when a template is applied to a company charter.
 */
export function resolvePacks(packIds) {
  const skillSet = new Set();
  for (const pid of packIds) {
    const p = SKILL_PACKS[pid];
    if (!p) continue;
    for (const s of p.skills) skillSet.add(s);
  }
  const skills = [...skillSet];
  const connectors = connectorsForSkills(skills);
  return { skills, connectors };
}

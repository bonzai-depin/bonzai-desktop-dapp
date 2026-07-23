/**
 * BonzAI companion careers.
 *
 * A companion is an agentic persona whose specialization determines:
 * - the marketplace skills unlocked by holding their companion token;
 * - the operational workflows they bring when hired into a Company;
 * - the next skills BonzAI should build for that persona.
 *
 * Token symbols are intentionally human: $AURORE, $MAI, etc.
 */
export const COMPANION_CAREERS = Object.freeze({
  aurore: {
    id: "aurore",
    name: "Aurore Beaumont",
    firstName: "Aurore",
    tokenSymbol: "AURORE",
    title: "Brand & Proposal Director",
    summary: "Turns expertise into persuasive proposals, contracts, and polished client communication.",
    strengths: ["reading", "education", "social"],
    marketplaceSkills: ["roleplay-companion-v1.0.0"],
    companySkills: ["skill.pdf_proposal", "skill.docusign", "skill.notion_docs", "skill.convertkit_newsletter"],
    roadmap: ["Proposal Intelligence", "Brand Voice Guardian", "Tender Response Studio"],
  },
  mai: {
    id: "mai",
    name: "Mai Tanaka",
    firstName: "Mai",
    tokenSymbol: "MAI",
    title: "Revenue & Client Success Lead",
    summary: "Qualifies demand, books meetings, and keeps every customer conversation moving.",
    strengths: ["social", "education", "travel"],
    marketplaceSkills: ["meditation-forge-v1.0.0"],
    companySkills: ["skill.twilio_voice", "skill.twilio_sms", "skill.twilio_whatsapp", "skill.sendgrid_email", "skill.google_calendar", "skill.hubspot_lite", "skill.calendly_booking", "skill.teachable_course", "skill.notion_docs", "skill.docusign", "skill.clio_matter", "skill.slack_team"],
    roadmap: ["Lead Qualification", "Customer Recovery", "Account Expansion"],
  },
  marcus: {
    id: "marcus",
    name: "Marcus Ferrara",
    firstName: "Marcus",
    tokenSymbol: "MARCUS",
    title: "Finance & Governance Partner",
    summary: "Controls cash, contracts, compliance, and portfolio risk with disciplined review.",
    strengths: ["finance", "housing", "reading"],
    marketplaceSkills: ["robinhood-portfolio-council-v1.0.0", "prediction-market-maker-v1.0.0", "chart-forecaster-v1.0.0"],
    companySkills: ["skill.qbo_invoicing", "skill.sage_accounting", "skill.stripe_checkout", "skill.stripe_subscriptions", "skill.permit_filer", "skill.docusign", "skill.clio_matter", "skill.notion_docs"],
    roadmap: ["Cash Flow Command", "Margin Sentinel", "Contract Risk Review"],
  },
  james: {
    id: "james",
    name: "James Whitmore",
    firstName: "James",
    tokenSymbol: "JAMES",
    title: "Operations Architect",
    summary: "Builds reliable operating systems, team cadence, and accountable delivery.",
    strengths: ["education", "reading", "sports"],
    marketplaceSkills: ["tcg-analysis-v1.0.0", "mass-chat-v1.0.0"],
    companySkills: ["skill.google_calendar", "skill.slack_team", "skill.linear_issues", "skill.notion_docs", "skill.field_coordination", "skill.fulfillment_coordination", "skill.teachable_course", "skill.calendly_booking", "skill.shopify_store", "skill.printful", "skill.printify", "skill.optimoroute"],
    roadmap: ["SOP Builder", "Capacity Planner", "Executive Operating Review"],
  },
  damon: {
    id: "damon",
    name: "Damon Rivers",
    firstName: "Damon",
    tokenSymbol: "DAMON",
    title: "Community & Live Experience Producer",
    summary: "Creates high-energy live experiences and turns audiences into active communities.",
    strengths: ["entertainment", "social", "sports"],
    marketplaceSkills: ["roleplay-companion-v1.0.0", "tcg-analysis-v1.0.0", "live-streaming-v1.0.0"],
    companySkills: ["skill.twilio_sms", "skill.sendgrid_email", "skill.slack_team", "skill.gbp_reviews"],
    roadmap: ["Community Pulse", "Live Launch Producer", "Audience Activation"],
  },
  zara: {
    id: "zara",
    name: "Zara Okonkwo",
    firstName: "Zara",
    tokenSymbol: "ZARA",
    title: "Growth Creative Director",
    summary: "Combines creative production with measurable acquisition and campaign learning.",
    strengths: ["fashion", "beauty", "social"],
    marketplaceSkills: ["roleplay-companion-v1.0.0", "video-captioning-v1.0.0", "live-streaming-v1.0.0"],
    companySkills: ["skill.meta_ads", "skill.google_ads", "skill.gbp_reviews", "skill.sendgrid_email", "skill.hubspot_lite", "skill.convertkit_newsletter", "skill.twilio_sms", "skill.notion_docs"],
    roadmap: ["Campaign Foundry", "Creative Performance Lab", "Social Listening Desk"],
  },
  jin: {
    id: "jin",
    name: "Jin Chen",
    firstName: "Jin",
    tokenSymbol: "JIN",
    title: "Markets & Systems Strategist",
    summary: "Finds signal in complex markets and translates it into testable operating decisions.",
    strengths: ["finance", "education", "reading"],
    marketplaceSkills: ["robinhood-portfolio-council-v1.0.0", "polymarket-top-performers-v1.0.0", "prediction-market-maker-v1.0.0", "chart-forecaster-v1.0.0"],
    companySkills: ["skill.linear_issues", "skill.slack_team", "skill.notion_docs", "skill.hubspot_lite", "skill.meta_ads", "skill.google_ads", "skill.shopify_store", "skill.convertkit_newsletter"],
    roadmap: ["Market Signal Engine", "Scenario Lab", "Decision Intelligence"],
  },
  priya: {
    id: "priya",
    name: "Priya Sharma",
    firstName: "Priya",
    tokenSymbol: "PRIYA",
    title: "Learning & Visual Systems Designer",
    summary: "Makes complex knowledge clear through learning products and visual communication.",
    strengths: ["education", "reading", "beauty"],
    marketplaceSkills: ["meditation-forge-v1.0.0", "video-captioning-v1.0.0", "mass-chat-v1.0.0"],
    companySkills: ["skill.notion_docs", "skill.teachable_course", "skill.pdf_proposal", "skill.meta_ads"],
    roadmap: ["Course Architect", "Knowledge Base Curator", "Visual Explainer"],
  },
  arjun: {
    id: "arjun",
    name: "Arjun Kapoor",
    firstName: "Arjun",
    tokenSymbol: "ARJUN",
    title: "Commercial Intelligence Partner",
    summary: "Models economics, pricing, and portfolio choices before capital is committed.",
    strengths: ["finance", "education", "travel"],
    marketplaceSkills: ["robinhood-portfolio-council-v1.0.0", "polymarket-top-performers-v1.0.0", "chart-forecaster-v1.0.0"],
    companySkills: ["skill.qbo_invoicing", "skill.sage_accounting", "skill.stripe_checkout", "skill.stripe_subscriptions", "skill.docusign", "skill.notion_docs"],
    roadmap: ["Pricing Architect", "Unit Economics Lab", "Revenue Forecast"],
  },
  sofia: {
    id: "sofia",
    name: "Sofia Reyes",
    firstName: "Sofia",
    tokenSymbol: "SOFIA",
    title: "Customer Experience Director",
    summary: "Orchestrates responsive, personal service across every customer channel.",
    strengths: ["social", "travel", "beauty"],
    marketplaceSkills: ["roleplay-companion-v1.0.0"],
    companySkills: ["skill.twilio_voice", "skill.twilio_sms", "skill.twilio_whatsapp", "skill.sendgrid_email", "skill.google_calendar", "skill.hubspot_lite", "skill.gbp_reviews", "skill.calendly_booking"],
    roadmap: ["Service Concierge", "Review Recovery", "Customer Voice Brief"],
  },
  miguel: {
    id: "miguel",
    name: "Miguel Santos",
    firstName: "Miguel",
    tokenSymbol: "MIGUEL",
    title: "Commerce & Fulfillment Operator",
    summary: "Moves products and field work from order to delivery without operational drag.",
    strengths: ["travel", "sports", "housing"],
    marketplaceSkills: ["live-streaming-v1.0.0"],
    companySkills: ["skill.shopify_store", "skill.printful", "skill.printify", "skill.optimoroute", "skill.field_coordination", "skill.fulfillment_coordination"],
    roadmap: ["Order Control Tower", "Route Optimizer", "Supplier Coordinator"],
  },
});

export const COMPANION_CAREER_LIST = Object.freeze(Object.values(COMPANION_CAREERS));

export function getCompanionCareer(companionId) {
  return COMPANION_CAREERS[String(companionId || "").toLowerCase()] || null;
}

export function getMarketplaceSkillOwners(skillId) {
  return COMPANION_CAREER_LIST.filter((career) => career.marketplaceSkills.includes(skillId));
}

export function getCompanySkillsForCompanion(companionId) {
  return [...(getCompanionCareer(companionId)?.companySkills || [])];
}

export function grantHiredCompanionSkills(companionId, requestedSkills, installedSkills) {
  const owned = new Set(getCompanySkillsForCompanion(companionId));
  const installed = installedSkills instanceof Set ? installedSkills : new Set(installedSkills || []);
  return [...new Set(requestedSkills || [])].filter((skillId) => owned.has(skillId) && installed.has(skillId));
}

export function buildColdStartAssignments(skillIdMap) {
  return COMPANION_CAREER_LIST.flatMap((career) =>
    career.marketplaceSkills
      .filter((localSkillId) => skillIdMap?.[localSkillId])
      .map((localSkillId) => ({
        companionId: career.id,
        localSkillId,
        skillId: skillIdMap[localSkillId],
      })),
  );
}

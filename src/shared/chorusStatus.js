/**
 * Chorus Pro invoice statuses (`statutCourantCode`, Factures API on PISTE) grouped
 * into what a supplier has to know. Chorus Pro reports that a payment order was
 * issued; it never reports that money reached the supplier's bank account.
 */
const STAGES = {
  deposited: ["DEPOSEE", "EN_COURS_ACHEMINEMENT"],
  processing: ["MISE_A_DISPOSITION", "PRISE_EN_COMPTE_DESTINATAIRE", "COMPLETEE", "SERVICE_FAIT", "MANDATEE", "MISE_A_DISPOSITION_COMPTABLE", "COMPTABILISEE"],
  actionRequired: ["SUSPENDUE", "A_RECYCLER"],
  rejected: ["REJETEE"],
  paymentOrdered: ["MISE_EN_PAIEMENT"],
};
const BY_CODE = new Map(Object.entries(STAGES).flatMap(([stage, codes]) => codes.map((code) => [code, stage])));

/** The API spells one status both SERVICE_FAIT and SERVICE-FAIT. */
export const chorusStage = (code) => BY_CODE.get(String(code || "").trim().toUpperCase().replace(/-/g, "_")) || "unknown";
export const CHORUS_STAGES = Object.freeze([...Object.keys(STAGES), "unknown"]);

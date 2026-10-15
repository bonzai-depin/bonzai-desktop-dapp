const patterns = {
  turnovers: /\b(cleaning|turnover|checkout|check-in|ménage|nettoyage)\b/i,
  "guest-inbox": /\b(guest|voyageur|guest message)\b/i,
  exceptions: /\b(damage|repair|maintenance|réparation|incident)\b/i,
  catalog: /\b(product|listing|catalog|produit|catalogue)\b/i,
  fulfillment:
    /\b(shipment|shipping|order|delivery|commande|livraison|expédition)\b/i,
  customers: /\b(customer|support|client|feedback)\b/i,
  delivery: /\b(release|build|deploy|bug|test|code)\b/i,
  content: /\b(lesson|script|content|cours|contenu)\b/i,
  learners: /\b(learner|student|élève|apprenant)\b/i,
  evidence: /\b(evidence|document|statement|pièce|justificatif)\b/i,
  preparation:
    /\b(reconcile|tax|audit|report|rapprochement|déclaration|rapport)\b/i,
};
export function routeCompanyWork(input, channels = []) {
  const domains = channels
    .filter(
      (c) =>
        (c.view || c.value) === "issues" &&
        !["work", "issues", "receivables", "pipeline"].includes(c.key),
    )
    .map((c) => c.key);
  const labels = Array.isArray(input.labels) ? input.labels.filter(label => typeof label === "string") : [];
  if (
    labels.some(
      (l) => l.startsWith("workspace:") && domains.includes(l.slice(10)),
    )
  )
    return labels;
  const explicit = input.workspaceKey;
  const matches = domains.filter((key) =>
    patterns[key]?.test(input.title || ""),
  );
  const key = domains.includes(explicit)
    ? explicit
    : domains.length === 1
      ? domains[0]
      : matches.length === 1
        ? matches[0]
        : null;
  // Ambiguous work remains in Backlog for a person to route; do not invent ownership.
  return key
    ? [...labels.filter((l) => !l.startsWith("workspace:")), `workspace:${key}`]
    : labels;
}

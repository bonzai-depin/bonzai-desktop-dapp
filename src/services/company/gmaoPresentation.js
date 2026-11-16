export const statusLabels = {
  reported: "À réceptionner",
  triaged: "À planifier",
  assigned: "Planifiée",
  acknowledged: "Confirmée",
  en_route: "En route",
  on_site: "Sur site",
  waiting_parts: "Pièces attendues",
  restored: "Terminée par le technicien",
  completed: "Clôturée",
  cancelled: "Annulée",
  draft: "Brouillon",
  ready: "À préparer",
  submitting: "Envoi en cours",
  submitted: "Accepté pour envoi",
  delivered: "Livré",
  failed: "Échec",
  unknown: "À vérifier",
  sent: "Transmis au fournisseur",
  requested: "Demande reçue",
  proforma_received: "Proforma reçue",
  ordered: "Commandée",
  partially_received: "Réception partielle",
  received: "Réceptionnée",
  accepted: "Accepté",
  rejected: "Refusé",
  purchase_order_received: "BC client reçu",
  to_review: "À relire",
};
export const statusLabel = (status) =>
  statusLabels[status] || status || "À renseigner";
export function statusTone(wo, now = Date.now()) {
  if (wo.status === "completed") return "success";
  if (wo.status === "cancelled") return "muted";
  if (
    wo.interventionDueAt < now &&
    wo.interventionDueAt &&
    !wo.interventionStartedAt
  )
    return "danger";
  if (wo.status === "waiting_parts" || wo.status === "restored")
    return "warning";
  if (["en_route", "on_site"].includes(wo.status)) return "accent";
  if (["assigned", "acknowledged"].includes(wo.status)) return "info";
  return "muted";
}
export function nextAction(wo, procurements = []) {
  if (wo.status === "waiting_parts")
    return procurements.some(
      (p) =>
        p.workOrderId === wo.id &&
        !["received", "cancelled"].includes(p.status),
    )
      ? "Suivre les achats"
      : "Replanifier";
  return (
    {
      reported: "Confirmer la réception",
      triaged: "Planifier",
      assigned: "Confirmer le créneau",
      acknowledged: "Signaler le départ",
      en_route: "Confirmer l’arrivée",
      on_site: "Saisir le compte-rendu",
      restored: "Enregistrer le service fait",
      completed:
        wo.billingStatus === "ready_to_invoice"
          ? "Préparer la facture"
          : "Voir le dossier",
      cancelled: "Voir le dossier",
    }[wo.status] || "Voir le dossier"
  );
}
export function scopedOperations(data, clientId) {
  const sites = (data.sites || []).filter(
      (s) => !clientId || s.clientId === clientId,
    ),
    ids = new Set(sites.map((s) => s.id));
  const orders = (data.workOrders || []).filter((w) => ids.has(w.siteId)),
    woIds = new Set(orders.map((w) => w.id));
  const scoped = {
    ...data,
    sites,
    workOrders: orders,
    assets: (data.assets || []).filter((a) => ids.has(a.siteId)),
  };
  for (const k of [
    "procurements",
    "quotes",
    "invoices",
    "documents",
    "outbox",
    "events",
    "attachmentSheets",
    "handoffs",
    "notifications",
    "exceptions",
  ])
    scoped[k] = (data[k] || []).filter((r) => woIds.has(r.workOrderId));
  return scoped;
}
export function monthDays(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    return d;
  });
}
export const dayKey = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// The shared editor also contains purchasing and completion fields. Only intake
// fields belong to a new work order; lifecycle state is owned by the repository.
export function workOrderIntakePayload(form) {
  return {
    title: form.title,
    siteId: form.siteId,
    assetId: form.assetId || null,
    clientOiNumber: form.clientOiNumber,
    priority: form.priority,
    description: form.description,
    requestKey: form.requestKey,
    receivedAt: new Date(form.receivedAt).getTime(),
  };
}

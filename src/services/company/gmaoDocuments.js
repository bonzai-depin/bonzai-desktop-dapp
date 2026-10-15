/** Deterministic, escaped document layout. No remote resources or generated scripts. */
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function documentHtml({
  kind,
  record,
  dossier,
  issuer,
  currency = "EUR",
}) {
  const money = (cents) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(
      Number(cents || 0) / 100,
    );
  const wo = dossier.workOrder,
    title = {
      quote: "Devis",
      invoice: "Facture",
      intervention: "Bon d’intervention",
    }[kind];
  if (!title) throw new Error("Type de document invalide.");
  const number =
    record.quoteNumber || record.invoiceNumber || wo.workOrderNumber;
  const outside = record.quoteType === "outside_bpu";
  const parts = outside
    ? Math.round(
        Math.max(0, (record.partsCents || 0) - (record.franchiseCents || 0)) *
          (record.coefficient ?? 1),
      )
    : record.quoteType === "improvement"
      ? Math.round((record.partsCents || 0) * (record.coefficient ?? 1))
      : record.partsCents;
  const terms = record.calculation?.contractTerms;
  const gas = terms?.deductionCents != null ? terms : null;
  const contractPricing =
    record.calculation?.contractProfile?.id === "cctp_25_004"
      ? record.calculation.contractProfile
      : null;
  const rows =
    kind === "intervention"
      ? []
      : kind === "invoice"
        ? [
            [
              "Prestation suivant le dossier d’intervention",
              record.subtotalCents,
            ],
          ]
        : gas
          ? record.partsCents <= gas.thresholdCents
            ? [["Intervention incluse au contrat (pièces ≤ 300 € HT)", 0]]
            : [
                ["Pièces", record.partsCents],
                ["Main-d’œuvre", record.laborCents],
                ["Accès / levage", record.accessCents],
                [
                  "Déduction contractuelle",
                  -Math.min(
                    gas.deductionCents,
                    record.partsCents +
                      record.laborCents +
                      record.accessCents -
                      record.calculation.includedLaborCents,
                  ),
                ],
                [
                  "Main-d’œuvre incluse (jusqu’à 8 h)",
                  -record.calculation.includedLaborCents,
                ],
                ["Déplacement inclus", 0],
              ]
          : contractPricing && terms
            ? record.partsCents <= terms.thresholdCents
              ? [
                  [
                    `Intervention incluse au contrat (pièces ≤ ${money(terms.thresholdCents)} HT)`,
                    0,
                  ],
                ]
              : [
                  [
                    `Pièces après franchise ${money(terms.thresholdCents)} × K ${record.coefficient}`,
                    parts,
                  ],
                  [
                    "Main-d’œuvre au-delà de 8 h",
                    (record.laborCents || 0) -
                      (record.calculation.includedLaborCents || 0),
                  ],
                  ["Déplacement inclus", 0],
                  [
                    contractPricing.accessAboveThreshold === "billable"
                      ? "Accès / levage"
                      : "Accès / levage inclus",
                    contractPricing.accessAboveThreshold === "billable"
                      ? record.accessCents || 0
                      : 0,
                  ],
                ]
            : [
                ["Pièces après franchise et coefficient", parts],
                ["Main-d’œuvre", outside ? 0 : record.laborCents],
                ["Déplacement", outside ? 0 : record.travelCents],
                ["Accès", outside ? 0 : record.accessCents],
              ].filter(([, v]) => v != null);

  const missing = "Non renseigné";
  const value = (v) => esc(v == null || v === "" ? missing : v);
  const stamp = (v) =>
    v && Number.isFinite(Number(v))
      ? esc(new Date(v).toLocaleString("fr-FR"))
      : missing;
  const flag = (v) =>
    v === true ? "Confirmé" : v === false ? "Non confirmé" : missing;
  const entries = (items, format) =>
    Array.isArray(items) && items.length
      ? `<ul>${items.map((x) => `<li>${format(x)}</li>`).join("")}</ul>`
      : `<p>${missing}</p>`;
  const report =
    (dossier.attachments || [])
      .map((a, index) => {
        const d = a.details || {};
        return `<section class="visit"><h2>Visite ${index + 1}</h2><table class="details"><tbody>
      <tr><th>Technicien</th><td>${value(a.technicianName)}</td></tr><tr><th>Représentant du site</th><td>${value(d.siteRepresentative)}</td></tr>
      <tr><th>Début / fin</th><td>${stamp(a.startedAt)} — ${stamp(a.endedAt)}</td></tr></tbody></table>
      <h3>Diagnostic et anomalies</h3><p>${value(a.diagnosis)}</p><h3>Causes identifiées</h3><p>${value(d.causes)}</p><h3>Travaux réalisés</h3><p>${value(a.workPerformed)}</p>
      <h3>Mesures et contrôles</h3>${entries(a.measurements, (m) => (typeof m === "string" ? esc(m) : `${value(m.label || m.name)} : ${value(m.value)} ${esc(m.unit || "")}${m.note ? ` · ${esc(m.note)}` : ""}`))}
      ${entries(d.checklistChecks, (c) => `${value(c.label)} · ${c.done === true ? "Effectué" : "Non effectué"}${c.note ? ` · ${esc(c.note)}` : ""}`)}
      <h3>Pièces remplacées</h3>${entries(a.partsUsed, (p) => (typeof p === "string" ? esc(p) : `${value(p.name || p.description)} · marque ${value(p.brand)} · référence ${value(p.reference)} · quantité ${value(p.quantity)} · prix unitaire ${p.unitPriceCents != null ? money(p.unitPriceCents) : p.unitCents != null ? money(p.unitCents) : missing}`))}
      <h3>Consommables</h3><p>${value(typeof d.consumables === "string" ? d.consumables : d.consumables ? JSON.stringify(d.consumables) : null)}</p>
      <h3>État final et sécurité</h3><p>${value(d.finalState)}<br>Sécurité : ${flag(d.safetyConfirmed)}<br>Utilisateur informé : ${flag(d.userInformed)}<br>Registre mis à jour : ${flag(d.registerUpdated)}</p>
      <h3>Photos et documents de visite</h3>${entries(a.photoRefs, (p) => (typeof p === "string" ? esc(p) : `${value(p.label || p.filename || p.id)} · ${value(p.reference || p.documentId || p.blobId)}${p.stage ? ` · ${esc(p.stage)}` : ""}`))}</section>`;
      })
      .join("") || `<p>Aucun compte-rendu de visite enregistré.</p>`;
  const maintenance = dossier.maintenance || {};
  const restored = `<section><h2>Remise en service</h2><p>Date : ${stamp(wo.restoredAt)}<br>Indisponibilité : ${stamp(wo.unavailableFrom)} — ${stamp(wo.unavailableUntil)}${wo.unavailableFrom && (wo.unavailableUntil || wo.restoredAt) ? `<br>Durée : ${Math.max(0, Math.round(((wo.unavailableUntil || wo.restoredAt) - wo.unavailableFrom) / 60000))} min` : ""}</p><h2>Signatures enregistrées</h2>${entries(maintenance.signatures, (s) => `${esc({ technician: "Technicien", contract_responsible: "Responsable du contrat", site_representative: "Représentant du site" }[s.role] || s.role)} · ${value(s.name)} · ${stamp(s.signedAt)} · ${flag(s.confirmed)}<br>Pièce : ${value(s.documentId || s.evidenceReference)}`)}<h2>Références des documents</h2>${entries(dossier.documents, (d) => `${value(d.title || d.filename || d.kind)} · ${value(d.id)}`)}${maintenance.reportDeadline ? `<p>Échéance du rapport : ${maintenance.reportDeadline.dueAt ? stamp(maintenance.reportDeadline.dueAt) : value(maintenance.reportDeadline.reason)}</p>` : ""}</section>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>@page{size:A4;margin:18mm}body{font:12px Arial,sans-serif;color:#19222f;line-height:1.55}header{border-bottom:3px solid #6940a5;padding-bottom:18px;display:flex;justify-content:space-between}h1{font-size:30px;margin:0}h2{font-size:15px;margin-top:28px}h3{font-size:12px;margin:18px 0 6px}section.visit{break-before:auto;margin-top:24px;border-top:1px solid #dce0e5}.details th{width:35%}.details td{text-align:left}li{overflow-wrap:anywhere}small{color:#546174}p{white-space:pre-wrap;overflow-wrap:anywhere}.parties{display:flex;gap:35px;margin:24px 0}.parties>div{flex:1}table{border-collapse:collapse;width:100%;margin-top:20px}td,th{padding:10px;border-bottom:1px solid #dce0e5;text-align:left}td:last-child,th:last-child{text-align:right}.total{font-size:17px;font-weight:bold}.footer{margin-top:30px;border-top:1px solid #dce0e5;padding-top:12px}tr{break-inside:avoid}</style></head><body><header><div><small>${esc(issuer || "Entreprise")}</small><h1>${title}</h1></div><div><strong>${esc(number)}</strong><br>${esc(new Date(record.issuedAt || record.createdAt || wo.createdAt).toLocaleDateString("fr-FR"))}</div></header><div class="parties"><div><small>Client</small><p>${esc(dossier.client?.name || "Client à renseigner")}<br>${esc(dossier.client?.address || "")}<br>${esc(dossier.client?.email || "")}</p></div><div><small>Intervention</small><p>${esc(wo.clientOiNumber || wo.workOrderNumber)}<br>${esc(dossier.site?.name)}<br>${esc(dossier.site?.address || "")}</p></div></div><h2>${esc(wo.title)}</h2><p>${esc(wo.description || "")}</p>${kind === "intervention" ? `<p>Créneau : ${wo.scheduledAt ? esc(new Date(wo.scheduledAt).toLocaleString("fr-FR")) : "À planifier"}<br>Intervenant : ${esc(wo.assigneeHuman || "À affecter")}<br>Équipement : ${esc(dossier.asset?.assetCode || "Non renseigné")}</p>${report}${restored}` : `<table><thead><tr><th>Désignation</th><th>Montant</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><td>${esc(label)}</td><td>${money(value)}</td></tr>`).join("")}<tr><td>Total HT après conditions du contrat</td><td>${money(record.subtotalCents)}</td></tr><tr><td>TVA ${esc(record.vatRate)} %</td><td>${money(record.vatCents)}</td></tr><tr class="total"><td>Total TTC</td><td>${money(record.totalCents)}</td></tr></tbody></table>`}<p>${esc(record.notes || "")}</p><div class="footer"><small>Référence dossier : ${esc(wo.workOrderNumber)} · Document préparé localement avec BonzAI.${kind === "quote" ? " Le devis doit être accepté avant exécution." : ""}</small></div></body></html>`;
}

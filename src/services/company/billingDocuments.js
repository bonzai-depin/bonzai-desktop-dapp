const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function billingDocumentHtml(invoice, profile = {}) {
  profile = profile || invoice.parties || {};
  const money = (c) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: invoice.currency || "EUR",
    }).format((c || 0) / 100);
  const date = (v) =>
    v ? new Date(v).toLocaleDateString("fr-FR") : "À renseigner";
  const party = (p) =>
    `${esc(p?.name || "À renseigner")}<br>${esc(p?.address || "")}<br>SIREN / SIRET : ${esc(p?.registration || "À renseigner")}`;
  const contractBound =
    invoice.kind !== "standalone" || profile.channel === "chorus";
  const rows = (invoice.lines || [])
    .map(
      (l) =>
        `<tr><td>${esc(l.description)}${l.deductionCents ? `<small>Réfaction : ${money(l.deductionCents)} · ${esc(l.deductionReference)}</small>` : ""}</td><td>${esc(l.quantity)}</td><td>${money(l.revisedUnitCents)}</td><td>${esc(l.vatRate)} %</td><td>${money(l.subtotalCents)}</td>${contractBound ? `<td>${l.admittedCents == null ? "À renseigner" : money(l.admittedCents)}</td>` : ""}</tr>`,
    )
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline'"><style>@page{size:A4;margin:18mm}body{font:12px/1.55 Arial,sans-serif;color:#19222f}header{display:flex;justify-content:space-between;border-bottom:2px solid #6940a5;padding-bottom:18px}h1{font-size:28px;margin:0}h2{font-size:15px;margin-top:26px}.parties{display:flex;gap:32px;margin:24px 0}.parties>div{flex:1}small{display:block;color:#526070}p,td{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{padding:9px 6px;border-bottom:1px solid #dce0e5;text-align:right}th:first-child,td:first-child{text-align:left}tr{break-inside:avoid}.total{font-size:16px;font-weight:bold}.draft{border:1px solid #856a25;padding:10px}footer{margin-top:28px;border-top:1px solid #dce0e5;padding-top:12px}</style></head><body>
  <header><div><h1>Facture</h1><small>${esc(invoice.number || invoice.legacyNumber || "Brouillon sans numéro définitif")}</small></div><div>Émission : ${date(invoice.issuedAt)}<br>Échéance : ${date(invoice.dueAt)}</div></header>
  ${invoice.status === "draft" ? '<p class="draft">Brouillon — à vérifier et valider avant dépôt.</p>' : ""}
  <div class="parties"><div><h2>Émetteur</h2>${party(profile.issuer)}</div><div><h2>Destinataire</h2>${party(profile.recipient)}${profile.recipient?.serviceCode ? `<br>Code service : ${esc(profile.recipient.serviceCode)}` : ""}</div></div>
  ${contractBound ? `<p>Marché : ${esc(profile.marketReference || "À renseigner")}<br>Engagement juridique : ${esc(invoice.legalCommitment || profile.legalCommitment || "À renseigner")}<br>${invoice.kind === "forfait" ? `Période : ${date(invoice.periodStart)} au ${date(invoice.periodEnd)}<br>` : ""}Admission : ${esc(invoice.admissionReference || "Voir les services faits des interventions")}<br>Dossiers : ${esc((invoice.workOrderReferences || invoice.workOrderIds || []).join(", "))}</p>` : ""}
  <table><thead><tr><th>Prestations</th><th>Qté</th><th>PU HT</th><th>TVA</th><th>HT</th>${contractBound ? "<th>HT admis</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>
  <table><tbody><tr><td>Total HT après réfactions</td><td>${money(invoice.subtotalCents)}</td></tr><tr><td>TVA</td><td>${money(invoice.vatCents)}</td></tr><tr class="total"><td>Total TTC</td><td>${money(invoice.totalCents)}</td></tr>${invoice.advanceAppliedCents ? `<tr><td>Avance déjà réglée · ${esc(invoice.advanceReference)}</td><td>−${money(invoice.advanceAppliedCents)}</td></tr>` : ""}<tr class="total"><td>Net à payer</td><td>${money(invoice.amountDueCents)}</td></tr></tbody></table>
  ${invoice.priceRevision?.enabled ? `<p>Révision notifiée le ${date(invoice.priceRevision.notifiedAt)} · ${esc(invoice.priceRevision.indexName)} · I0 ${esc(invoice.priceRevision.baseIndex)} · I1 ${esc(invoice.priceRevision.currentIndex)} · Cn ${esc(invoice.coefficient)}<br>Justificatif : ${esc(invoice.priceRevision.evidenceReference)}</p>` : ""}
  ${(invoice.allocations || []).length ? `<h2>Ventilation des bénéficiaires</h2><table><thead><tr><th>Bénéficiaire / prestations</th><th>HT</th><th>TVA</th></tr></thead><tbody>${invoice.allocations.map((a) => `<tr><td>${esc(a.name)} · ${esc(a.registration)}<small>${esc(a.nature)}</small></td><td>${money(a.subtotalCents)}</td><td>${money(a.vatCents)}</td></tr>`).join("")}</tbody></table>` : ""}
  <p>${esc(invoice.notes || "")}</p><footer><small>Version locale du dossier ${esc(invoice.id)}. Les reçus de dépôt, d’acceptation et de règlement sont conservés séparément.</small></footer></body></html>`;
}

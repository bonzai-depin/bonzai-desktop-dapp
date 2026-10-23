const esc = (value) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function monographicHtml(record, locale = "fr") {
  const fr = locale.startsWith("fr"),
    t = (a, b) => (fr ? a : b),
    { asset: a, site: s, profile: p, regulatory: r } = record;
  const date = (value) =>
    value
      ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(value)
      : null;
  const groups = [
    [
      t("Identification", "Identification"),
      [
        [t("Site", "Site"), s.name],
        [t("Code équipement", "Equipment code"), a.asset_code],
        [t("Code secondaire", "Secondary code"), p.secondaryCode],
        [t("Code GTP", "GTP code"), p.gtpCode],
        [
          t("Bâtiment", "Building"),
          [a.building_code, a.building_name].filter(Boolean).join(" · "),
        ],
        [t("Localisation", "Location"), a.location],
        [t("Type", "Type"), a.equipment_type],
        [
          t("Marque et modèle", "Brand and model"),
          [a.brand, a.model_reference].filter(Boolean).join(" · "),
        ],
        [t("N° série", "Serial number"), a.serial_number],
        [t("Quantité", "Quantity"), a.quantity],
        [t("Matériel associé", "Associated equipment"), p.associatedEquipment],
        [t("Référence photographique", "Photo reference"), a.photo_ref],
      ],
    ],
    [
      t("Historique et durée de vie", "History and service life"),
      [
        [t("Acquisition", "Acquired"), date(p.acquiredAt)],
        [
          t("Durée de vie minimale", "Minimum service life"),
          p.minLifetimeYears == null
            ? null
            : p.minLifetimeYears + " " + t("ans", "years"),
        ],
        [
          t("Durée de vie maximale", "Maximum service life"),
          p.maxLifetimeYears == null
            ? null
            : p.maxLifetimeYears + " " + t("ans", "years"),
        ],
        [t("Dernier dépannage", "Last repair"), date(p.lastRepairAt)],
        [t("Derniers travaux", "Last works"), date(p.lastWorksAt)],
        [t("Dernière fuite", "Last leak"), date(p.lastLeakAt)],
      ],
    ],
    [
      t("Contrôles et contrat", "Inspections and contract"),
      [
        [
          t(
            "Inspection ESP · prochaine échéance",
            "Pressure inspection · next due",
          ),
          date(r.inspectionDueAt),
        ],
        [
          t(
            "Requalification ESP · prochaine échéance",
            "Pressure requalification · next due",
          ),
          date(r.requalificationDueAt),
        ],
        [
          t("Gaz · prochaine échéance", "Gas inspection · next due"),
          date(r.gasServiceDueAt),
        ],
        [
          t("Inclusion au forfait", "Contract inclusion"),
          {
            yes: t("Oui", "Yes"),
            no: t("Non", "No"),
            reservations: t("Avec réserves", "With reservations"),
          }[p.includedInContract],
        ],
        [t("Réserves", "Reservations"), p.reservations],
        [t("Commentaires", "Comments"), p.comments],
      ],
    ],
  ];
  const evidence=(record.casework?.records||[]).map(f=>[f.name||f.label||f.circuit||f.workPerformed,[f.occurredOn||f.date,f.task,f.outcome,f.followup,f.origin,f.donorLabel||f.donorAssetId,f.recipientLabel||f.recipientAssetId,f.unitCostCents==null&&f.kind==='part'?t('Coût inconnu','Unknown cost'):null,f.refrigerant,f.quantityKg!=null?f.quantityKg+' kg':null,f.source?.name].filter(Boolean).join(' · ')]);
  if(evidence.length)groups.push([t('Historique de cet équipement','This equipment’s history'),evidence]);
  return `<!doctype html><html lang="${fr ? "fr" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(p.name || a.asset_code)}</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#202331;background:#fff;max-width:960px;margin:48px auto;padding:0 28px}header{border-bottom:2px solid #563586;padding-bottom:24px;margin-bottom:28px}header p,footer{color:#585a65}h1{font-size:30px;line-height:1.2;margin:8px 0}h2{font-size:18px;margin:30px 0 12px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{text-align:left;padding:10px 12px;vertical-align:top;border-bottom:1px solid #ddd;overflow-wrap:anywhere;white-space:pre-wrap}th{width:32%;font-weight:600;background:#f6f5f8}.missing{color:#666}footer{font-size:12px;margin-top:32px;border-top:1px solid #ddd;padding-top:16px}@media print{body{margin:0;max-width:none;padding:0}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body><header><p>BonzAI · ${t("Fiche monographique", "Equipment record")}</p><h1>${esc(p.name || a.asset_code)}</h1><p>${esc(s.name)} · ${esc(a.asset_code)}</p></header>${groups.map(([name, rows]) => `<section><h2>${esc(name)}</h2><table>${rows.map(([label, value]) => `<tr><th scope="row">${esc(label)}</th><td class="${value == null || value === "" ? "missing" : ""}">${value == null || value === "" ? t("Non renseigné", "Not recorded") : esc(value)}</td></tr>`).join("")}</table></section>`).join("")}<footer>${t("État du dossier au", "Record as of")} ${esc(date(record.updatedAt))}. ${t("Les dates de contrôle proviennent des preuves enregistrées.", "Inspection dates come from the saved evidence.")}</footer></body></html>`;
}

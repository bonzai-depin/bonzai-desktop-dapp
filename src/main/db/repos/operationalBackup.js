// JSON references need the same company boundary as SQLite foreign keys.
// Backups contain historical shared context, never a live route to another team.
export function validateOperationalBackup(tables) {
  const rows = (table) => tables[table] || [];
  const data = (row) => JSON.parse(row.data || "{}");
  function requireRef(table, id, origin, kind) {
    if (!id) return;
    const target = rows(table).find(
      (row) => row.id === id && (!kind || row.kind === kind),
    );
    if (!target)
      throw new Error(
        `Backup contains a missing or cross-company reference: ${origin}`,
      );
    return target;
  }
  for(const row of rows('company_intake_sources'))requireRef('company_intake_sources',data(row).metadata?.parentId,'intake email context');
  for(const row of rows('company_intake_actions')){
    requireRef('company_intake_sources',row.source_id,'intake source');
    for(const receipt of JSON.parse(row.result||'[]')){
      const table={client:'gmao_clients',site:'gmao_sites',equipment:'gmao_assets',work_order:'gmao_work_orders',invoice:'company_billing_invoices',grant:'company_grants_records',sales:'company_sales_records',task:'issues',proforma:'purchasing_records',part:'purchasing_records'}[receipt.type];
      if(!table)throw new Error('Backup contains an unknown intake record.');
      // Deleted business records may have historical receipts, but cannot point into another team.
      const target=rows(table).find(r=>r.id===receipt.id);
      if(target&&target.company_id!==row.company_id)throw new Error('Backup intake receipt crosses team boundaries.');
    }
  }
  for (const row of rows('company_sales_records')) requireRef('gmao_clients',data(row).clientId,'sales customer');
  for (const row of rows('company_grants_records')) {
    const value=data(row);
    if(row.kind==='document' && value.dossierId) requireRef('company_grants_records',value.dossierId,'document application','dossier');
    if(row.kind==='dossier') {
      for(const id of value.documentIds || []) {
        const document=data(requireRef('company_grants_records',id,'grant document','document'));
        if(document.dossierId && document.dossierId !== row.id) throw new Error('Backup grant document belongs to another application.');
      }
      for(const correction of value.corrections || []) requireRef('company_grants_records',correction.evidenceDocumentId,'grant correction evidence','document');
      for(const payment of value.payments || []) requireRef('company_grants_records',payment.evidenceDocumentId,'grant payment evidence','document');
      for(const id of value.documentIds || []) requireRef('company_grants_records',id,'grant document','document');
      for(const step of value.history || []) if(step.evidenceDocumentId) requireRef('company_grants_records',step.evidenceDocumentId,'grant receipt','document');
    }
  }
  for (const row of rows('gmao_record_activity')) {
    const table = {workOrder:'gmao_work_orders',customerInvoice:'company_billing_invoices',supplierInvoice:'purchasing_records',partsRequest:'gmao_procurements'}[row.record_kind];
    if (!table) throw new Error('Backup contains an unknown communication record.');
    requireRef(table,row.record_id,'record communication',row.record_kind==='supplierInvoice'?'invoice':undefined);
  }
  for (const row of rows('gmao_part_dispositions')) requireRef('gmao_procurements',row.procurement_id,'part disposition');
  for (const row of rows("company_billing_invoices")) {
    const invoice = data(row);
    for (const line of invoice.lines || []) if (line.procurementId) {
      const procurement=requireRef('gmao_procurements',line.procurementId,'invoice part');
      if (!(invoice.workOrderIds || []).includes(procurement.work_order_id)) throw new Error('Backup invoice parts belong to another work order.');
    }
    for (const id of invoice.workOrderIds || []) {
      requireRef("gmao_work_orders", id, "invoice.workOrderIds");
      const work = rows("gmao_work_orders").find((item) => item.id === id);
      const site = rows("gmao_sites").find((item) => item.id === work.site_id);
      if (site?.client_id !== row.client_id)
        throw new Error("Backup invoice mixes customer work orders.");
    }
  }
  for (const row of rows("gmao_maintenance_records")) {
    const value = data(row);
    const work = requireRef(
      "gmao_work_orders",
      row.work_order_id,
      "maintenance.workOrderId",
    );
    const asset = requireRef(
      "gmao_assets",
      row.asset_id,
      "maintenance.assetId",
    );
    if (
      (row.site_id && asset && asset.site_id !== row.site_id) ||
      (row.site_id && work && work.site_id !== row.site_id) ||
      (row.asset_id && work && work.asset_id !== row.asset_id)
    )
      throw new Error(
        "Backup maintenance record mixes site, equipment or intervention scopes.",
      );
    for (const [key, id] of Object.entries(value)) {
      if (key !== "documentId" && !key.endsWith("DocumentId")) continue;
      const document = requireRef("gmao_documents", id, `maintenance.${key}`);
      if (!document) continue;
      // Match saveRecord/approveProgramme: common, unscoped contract
      // documents remain valid, but explicitly scoped proof cannot move.
      if (
        key.endsWith("DocumentId") &&
        ((row.site_id &&
          document.site_id &&
          document.site_id !== row.site_id) ||
          (row.asset_id &&
            document.asset_id &&
            document.asset_id !== row.asset_id))
      )
        throw new Error(
          `Backup maintenance evidence belongs to another site or equipment: ${key}`,
        );
    }
    for (const id of value.planIds || []) {
      const plan = requireRef(
        "gmao_maintenance_plans",
        id,
        "maintenance.planIds",
      );
      const planAsset = requireRef(
        "gmao_assets",
        plan?.asset_id,
        "maintenance.plan.assetId",
      );
      if (
        row.kind === "programme" &&
        planAsset &&
        planAsset.site_id !== row.site_id
      )
        throw new Error(
          "Backup maintenance programme includes a plan from another site.",
        );
    }
    requireRef("gmao_outbox", value.outboxId, "maintenance.outboxId");
    const attachment = requireRef(
      "gmao_attachment_sheets",
      value.attachmentSheetId,
      "maintenance.attachmentSheetId",
    );
    if (row.kind === "signature") {
      const document = requireRef(
        "gmao_documents",
        value.documentId,
        "maintenance.signature.documentId",
      );
      // signIntervention requires a signed file and a recorded visit for
      // this exact intervention. An unscoped document is not a signature.
      if (
        !work ||
        !document ||
        document.work_order_id !== work.id ||
        !attachment ||
        attachment.work_order_id !== work.id
      )
        throw new Error(
          "Backup maintenance signature requires evidence and a visit from the same intervention.",
        );
    }
    requireRef("issues", value.issueId, "maintenance.issueId");
    requireRef(
      "gmao_maintenance_records",
      value.vehicleId,
      "maintenance.vehicleId",
      "vehicle",
    );
  }
  const refs = {
    requestId: "request",
    selectedQuoteId: "quote",
    quoteId: "quote",
    supplierId: "supplier",
    orderId: "order",
    invoiceId: "invoice",
    paymentId: "payment",
    itemId: "item",
    rfqId: "rfq",
    dpgfId: "dpgf",
  };
  for (const row of rows("purchasing_records")) {
    const value = data(row);
    for (const [field, kind] of Object.entries(refs))
      requireRef(
        "purchasing_records",
        value[field],
        `purchasing.${field}`,
        kind,
      );
    for (const item of value.items || [])
      requireRef(
        "purchasing_records",
        item.itemId,
        "purchasing.items.itemId",
        "item",
      );
    requireRef("issues", value.issueId, "purchasing.issueId");
    requireRef(
      "purchasing_records",
      value.defect?.requestId,
      "purchasing.defect.requestId",
      "request",
    );
    // Cross-team work order IDs belong to archived shared context. Local
    // requests, in contrast, must reference a work order in this snapshot.
    if (!value.sourceCompanyId)
      requireRef(
        "gmao_work_orders",
        value.workOrderId,
        "purchasing.workOrderId",
      );
  }
  for (const row of rows("purchasing_events"))
    requireRef(
      "purchasing_records",
      row.record_id,
      "purchasing_events.record_id",
    );
}

export function detachRestoredPurchasing(value) {
  if (!value?.sourceCompanyId && !value?.conversationId) return value;
  const copy = {
    ...value,
    restoredSharedOrigin: {
      companyId: value.sourceCompanyId || null,
      procurementId: value.sourceProcurementId || null,
      workOrderId: value.workOrderId || null,
      conversationId: value.conversationId || null,
    },
    sharedRouteStatus: "archived",
  };
  for (const key of [
    "sourceCompanyId",
    "sourceProcurementId",
    "workOrderId",
    "conversationId",
  ])
    delete copy[key];
  return copy;
}

import { assertReadablePdfForm } from './pdfTextGuard.js';
/** Renderer-side facade for the local HVAC GMAO. */

const api = () => window.electronAPI?.db?.gmao || null;

function requireApi() {
  const value = api();
  if (!value) throw new Error("Le moteur GMAO local n'est pas disponible. Redémarrez l'application après la mise à jour.");
  return value;
}

export async function ensure(companyId, input = {}) {
  return requireApi().bootstrap(companyId, input);
}

export async function snapshot(companyId) {
  // Initialisation belongs to team creation/upgrade. A snapshot must remain
  // read-only: bootstrap emits a changed event, which would request this same
  // snapshot again and keep every form waiting for refresh forever.
  return requireApi().snapshot(companyId, Date.now());
}

export const saveContract = (companyId, input) => requireApi().saveContract(companyId, input);
export const saveSite = (companyId, input) => requireApi().saveSite(companyId, input);
export const saveAsset = (companyId, input) => requireApi().saveAsset(companyId, input);
export const importAssets = (companyId, rows) => requireApi().importAssets(companyId, rows);
export const savePlan = (companyId, input) => requireApi().savePlan(companyId, input);
export const createWorkOrder = (companyId, input) => requireApi().createWorkOrder(companyId, input);
export const updateWorkOrder = (companyId, id, input) => requireApi().updateWorkOrder(companyId, id, input);
export const transitionWorkOrder = (companyId, id, status, input = {}) => requireApi().transitionWorkOrder(companyId, id, status, input);
export const addEvent = (companyId, workOrderId, input) => requireApi().addEvent(companyId, workOrderId, input);
export const recordAttachmentSheet = (companyId, workOrderId, input) => requireApi().recordAttachmentSheet(companyId, workOrderId, input);
export const saveProcurement = (companyId, input) => requireApi().saveProcurement(companyId, input);
export const saveNotification = (companyId, input) => requireApi().saveNotification(companyId, input);
export const addDocument = (companyId, input) => requireApi().addDocument(companyId, input);
export const saveCompliance = (companyId, input) => requireApi().saveCompliance(companyId, input);
export const saveSubcontractor = (companyId, input) => requireApi().saveSubcontractor(companyId, input);
export const saveRate = (companyId, input) => requireApi().saveRate(companyId, input);
export const createQuote = (companyId, workOrderId, input) => requireApi().createQuote(companyId, workOrderId, input);
export const updateQuote = (companyId, quoteId, input) => requireApi().updateQuote(companyId, quoteId, input);
export const validateProcessStep = (companyId, workOrderId, input) => requireApi().validateProcessStep(companyId, workOrderId, input);
export const recordServiceAcceptance = (companyId, workOrderId, input) => requireApi().recordServiceAcceptance(companyId, workOrderId, input);
export const saveInvoice = (companyId, input) => requireApi().saveInvoice(companyId, input);
export const saveOnCallShift = (companyId, input) => requireApi().saveOnCallShift(companyId, input);
export const generatePreventive = (companyId, now = Date.now()) => requireApi().generatePreventive(companyId, now);
export const evaluateSla = (companyId, now = Date.now()) => requireApi().evaluateSla(companyId, now);
export const ingestDocument = (companyId, input) => requireApi().ingestDocument(companyId, input);
export const applyDocumentIntake = (companyId, id, input) => requireApi().applyDocumentIntake(companyId, id, input);
export const resolveRecommendation = (companyId, id, status, input = {}) => requireApi().resolveRecommendation(companyId, id, status, input);
export const recommendSchedule = (companyId, workOrderId, candidates) => requireApi().recommendSchedule(companyId, workOrderId, candidates);
export const recordAssetSignal = (companyId, assetId, input) => requireApi().recordAssetSignal(companyId, assetId, input);
export const saveBillingLine = (companyId, input) => requireApi().saveBillingLine(companyId, input);
export const reconcileBilling = (companyId, workOrderId) => requireApi().reconcileBilling(companyId, workOrderId);
export const runAutomation = (companyId, now = Date.now()) => requireApi().runAutomation(companyId, now);
export const exportWeeklyRegister = (companyId, options = {}) => requireApi().exportWeeklyRegister(companyId, options);
export const exportInventory = (companyId) => requireApi().exportInventory(companyId);

export function onChanged(callback) {
  return api()?.onChanged?.(callback) || (() => {});
}

export async function saveDocumentFile(companyId, file, input = {}) {
  if (!file) throw new Error("Sélectionnez un document.");
  const ext = file.name?.split(".").pop()?.toLowerCase() || "bin";
  const base64 = await fileToBase64(file);
  const blob = await window.electronAPI?.db?.blobs?.write?.(base64, ext, {
    kind: "gmao_document", companyId, originalName: file.name,
  });
  if (!blob?.id) throw new Error("Le document n'a pas pu être stocké localement.");
  return addDocument(companyId, {
    ...input, originalName: file.name, mimeType: file.type || "application/octet-stream",
    blobId: blob.id, blobExt: ext,
  });
}

export async function ingestDocumentFile(companyId, file, input = {}) {
  if (!file) throw new Error("Sélectionnez un document à analyser.");
  const ext = file.name?.split(".").pop()?.toLowerCase() || "bin";
  const base64 = await fileToBase64(file);
  const blob = await window.electronAPI?.db?.blobs?.write?.(base64, ext, {
    kind: "gmao_document_intake", companyId, originalName: file.name,
  });
  if (!blob?.id) throw new Error("Le document n'a pas pu être stocké localement.");
  let extractedText = input.extractedText || ''; let extractionError = null;
  try { if (!extractedText) extractedText = await extractLocalText(file); } catch (error) { extractionError = error?.code === 'PDF_XFA_REVIEW_REQUIRED' ? error.message : 'Lecture locale indisponible. Renseignez les champs avant validation.'; }
  if (!String(extractedText).trim()) extractionError = extractionError || 'Aucun texte extrait. Vérifiez le document et renseignez les champs.';
  return ingestDocument(companyId, {
    ...input, blobId: blob.id, originalName: file.name,
    mimeType: file.type || "application/octet-stream", extractedText, extractionError,
  });
}

export async function extractLocalText(file, {requireComplete = false, onPage, cachedPages = []} = {}) {
  if (file.type.startsWith("text/") || /\.(csv|txt|md)$/i.test(file.name)) return file.text();
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    try {
    if(requireComplete && pdf.numPages>40)throw new Error('Split PDFs with more than 40 pages before automatic intake.');
    const metadata = await pdf.getMetadata();
    assertReadablePdfForm({isPureXfa:pdf.isPureXfa,info:metadata.info});
    const pages = [];
    const pdfPages = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 40); pageNumber++) {
      const cached = cachedPages.find(p=>p.page===pageNumber && typeof p.text==='string' && p.text.trim());
      if(requireComplete && cached) { pages.push(`[Page ${pageNumber}]\n${cached.text}`); continue; }
      const page = await pdf.getPage(pageNumber);
      pdfPages.push(page);
      const content = await page.getTextContent();
      let pageText=content.items.map((item) => item.str+(item.hasEOL?'\n':' ')).join('');
      let method='text';
      if(requireComplete && pageText.trim().length<30) {
        const viewport=page.getViewport({scale:1.6}),canvas=document.createElement('canvas');
        canvas.width=viewport.width;canvas.height=viewport.height;
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
        try { pageText=await ocrLocalBase64(canvas.toDataURL('image/jpeg',0.88).split(',')[1]); method='ocr'; } finally { canvas.width=0;canvas.height=0; }
        if(!pageText?.trim())throw new Error(`Page ${pageNumber} could not be read. Review or provide a text version.`);
      }
      if(onPage) await onPage({page:pageNumber,total:pdf.numPages,text:pageText,method});
      pages.push(requireComplete ? `[Page ${pageNumber}]\n${pageText}` : pageText);
      if(requireComplete) page.cleanup();
    }
    const text = pages.join("\n").trim();
    assertReadablePdfForm({text});
    if (requireComplete || text.length >= 80) return text;
    const ocrPages = [];
    for (const page of pdfPages.slice(0, 6)) {
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const ocr = await ocrLocalBase64(canvas.toDataURL("image/jpeg", 0.88).split(",")[1]);
      if (ocr) ocrPages.push(ocr);
      canvas.width=0;canvas.height=0;
    }
    return ocrPages.join("\n");
    } finally { await pdf.destroy(); }
  }
  if (file.type.startsWith("image/")) return ocrLocalBase64(await fileToBase64(file));
  return "";
}

async function ocrLocalBase64(imageBase64) {
  if (!window.electronAPI?.inferenceRequest) return "";
  try {
    const result = await window.electronAPI.inferenceRequest("ocr", { image_base64: imageBase64, mode: "text" });
    return result?.text || result?.result?.text || result?.caption || result?.result || "";
  } catch (error) {
    console.warn("[gmao] OCR local indisponible:", error?.message);
    return "";
  }
}

export function downloadCsv(exported) {
  if (!exported?.csv) return;
  const blob = new Blob([exported.csv], { type: exported.mimeType || "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exported.filename || "export-gmao.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Execute local skill calls emitted by a company teammate. */
export async function executeLocalAction(companyId, actionType, params = {}, ctx = {}) {
  switch (actionType) {
    case "gmao.bootstrap":
      return { status: 'completed', contract: await ensure(companyId, params), summary: "Référentiel GMAO initialisé" };
    case "gmao.generatePreventive": {
      const result = await generatePreventive(companyId, params.now || Date.now());
      return { status: 'completed', ...result, summary: `${result.generated} OT préventif(s) généré(s)` };
    }
    case "gmao.createWorkOrder": {
      const workOrder = await createWorkOrder(companyId, { ...params, actorRole: ctx.role });
      return { ...workOrder, summary: `${workOrder.workOrderNumber} créé en ${workOrder.priority}` };
    }
    case "gmao.transitionWorkOrder": {
      const workOrder = await transitionWorkOrder(companyId, params.workOrderId, params.status, { ...params, actorRole: ctx.role });
      return { ...workOrder, summary: `${workOrder.workOrderNumber} → ${workOrder.status}` };
    }
    case "gmao.addEvidence": {
      const event = await addEvent(companyId, params.workOrderId, { eventType: "evidence_added", actorRole: ctx.role, note: params.note, evidence: params.evidence || params });
      return { ...event, summary: "Preuve d'intervention enregistrée" };
    }
    case "gmao.recordAttachment": {
      const sheet = await recordAttachmentSheet(companyId, params.workOrderId, { ...params, actorRole: ctx.role });
      return { ...sheet, summary: sheet.resolved ? "Feuille enregistrée, OI prête à clôturer" : "Feuille enregistrée, réparation à organiser" };
    }
    case "gmao.updateProcurement": {
      const procurement = await saveProcurement(companyId, { ...params, actorRole: ctx.role });
      return { ...procurement, summary: `${procurement.requestType} · ${procurement.status}` };
    }
    case "gmao.notifyClient":
      return { status: "completed", draft: await saveOutbox(companyId, params), summary: "Brouillon enregistré ; validation humaine et envoi requis." };

    case "gmao.evaluateSla": {
      const result = await evaluateSla(companyId, params.now || Date.now());
      return { status: 'completed', ...result, summary: `${result.evaluated} OT contrôlé(s), ${result.recorded.length} risque(s) enregistré(s)` };
    }
    case "gmao.runAutomation": {
      const result = await runAutomation(companyId, params.now || Date.now());
      return { status: 'completed', ...result, summary: "Contrôle agentique local terminé" };
    }
    case "gmao.recommendSchedule": {
      const result = await recommendSchedule(companyId, params.workOrderId, params.candidates || []);
      return { status: 'completed', ...result, summary: result.recommendation?.title || "Aucun candidat disponible" };
    }
    case "gmao.reconcileBilling": {
      const result = await reconcileBilling(companyId, params.workOrderId);
      return { status: 'completed', ...result, summary: result.ok ? "Rapprochement conforme" : `${result.issues.length} écart(s) détecté(s)` };
    }
    case "gmao.createQuote": {
      const quote = await createQuote(companyId, params.workOrderId, params);
      return { ...quote, summary: `${quote.quoteNumber} calculé : ${(quote.totalCents / 100).toFixed(2)} € TTC` };
    }
    case "gmao.updateQuote": {
      const quote = await updateQuote(companyId, params.quoteId, { ...params, actorRole: ctx.role });
      return { ...quote, summary: `${quote.quoteNumber} → ${quote.status}` };
    }
    case "gmao.validateProcessStep": {
      const workOrder = await validateProcessStep(companyId, params.workOrderId, {...params, actorRole:ctx.role});
      return {...workOrder, summary:`Validation enregistrée : ${params.step}`};
    }
    case "gmao.recordServiceAcceptance": {
      const workOrder = await recordServiceAcceptance(companyId, params.workOrderId, { ...params, actorRole: ctx.role });
      return { ...workOrder, summary: `Service fait reçu pour ${workOrder.workOrderNumber}` };
    }
    case "gmao.saveInvoice": {
      const invoice = await saveInvoice(companyId, { ...params, actorRole: ctx.role });
      return { ...invoice, summary: `${invoice.invoiceNumber} · ${invoice.status}` };
    }
    case "gmao.registerCompliance": {
      const record = await saveCompliance(companyId, params);
      return { ...record, summary: `${record.recordType} enregistré pour ${record.subjectName}` };
    }
    case "gmao.exportWeeklyRegister": {
      const exported = await exportWeeklyRegister(companyId, params);
      return { status: 'completed', ...exported, summary: `Registre hebdomadaire prêt (${exported.rows.length} ligne(s))` };
    }
    case "field.prepareWorkOrder": {
      const id = params.workOrderId || params.jobId;
      const workOrder = await transitionWorkOrder(companyId,id,'assigned',{assigneeHuman:params.humanId,scheduledAt:params.scheduledAt,actorRole:ctx.role,note:params.brief});
      return {status:'completed',workOrder,summary:'Intervenant affecté ; arrivée et réalisation restent à confirmer sur le terrain.'};
    }
    case "field.trackJob": {
      const snap = await snapshot(companyId);
      const workOrder = snap.workOrders.find((item) => item.id === (params.workOrderId || params.jobId));
      if (!workOrder) throw new Error("Ordre de travail introuvable.");
      await addEvent(companyId, workOrder.id, { eventType: "status_checked", actorRole: ctx.role, note: params.note || "Point de suivi terrain" });
      return { ...workOrder, summary: `${workOrder.workOrderNumber} est ${workOrder.status}` };
    }
    case "field.completeJob": {
      const sheet = await recordAttachmentSheet(companyId,params.workOrderId||params.jobId,{technicianName:params.technicianName,workPerformed:params.notes,diagnosis:params.diagnosis,photoRefs:params.photoRefs||params.photoUrls,measurements:params.checklist||[],resolved:true,actorRole:ctx.role});
      return {status:'completed',attachment:sheet,summary:'Compte-rendu enregistré ; service fait client attendu.'};
    }
    case 'gmao.searchWorkOrders': return {status:'completed',...await searchWorkOrders(companyId,params)};
    case 'gmao.getDossier': return {status:'completed',...await getDossier(companyId,params.reference||params.workOrderId)};
    case 'gmao.scheduleWorkOrder': return {status:'completed',workOrder:await updateWorkOrder(companyId,params.workOrderId,params)};
    case 'gmao.generateDocument': return {status:'completed',document:await generateDocument(companyId,params)};
    case 'gmao.acknowledgeHandoff': return {status:'completed',handoff:await acknowledgeHandoff(companyId,params.handoffId,params)};
    case "field.followUp": {
      const event = await addEvent(companyId, params.workOrderId || params.jobId, {
        eventType: "customer_follow_up", actorRole: ctx.role,
        note: params.message || "Suivi post-intervention préparé",
      });
      return { ...event, summary: "Suivi post-intervention tracé" };
    }
    default:
      throw new Error(`Action GMAO locale inconnue : ${actionType}`);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

export const saveClient = (companyId,...args) => requireApi().saveClient(companyId,...args);
export const saveServiceContract = (companyId,...args) => requireApi().saveServiceContract(companyId,...args);
export const saveSupplier = (companyId,...args) => requireApi().saveSupplier(companyId,...args);
export const acknowledgeHandoff = (companyId,...args) => requireApi().acknowledgeHandoff(companyId,...args);
export const saveOutbox = (companyId,...args) => requireApi().saveOutbox(companyId,...args);
export const resolveOutbox = (companyId,...args) => requireApi().resolveOutbox(companyId,...args);
export const getDossier = (companyId,...args) => requireApi().getDossier(companyId,...args);
export const searchWorkOrders = (companyId,...args) => requireApi().searchWorkOrders(companyId,...args);
export const generateDocument = (companyId,...args) => requireApi().generateDocument(companyId,...args);
export const sendOutbox = (companyId,...args) => requireApi().sendOutbox(companyId,...args);
export const checkDelivery = (companyId,...args) => requireApi().checkDelivery(companyId,...args);

/** Bounded, local context. Documents are evidence, never executable instructions. */
export async function companyMaintenanceContext(companyId, task={}) {
  if (!api()?.searchWorkOrders) return 'Use gmao.searchWorkOrders to resolve the real OI. Never invent IDs, arrival, parts receipt, completion, approval or delivery.';
  try {
    const result=await searchWorkOrders(companyId,{limit:20});
    const index=result.results.map(w=>({id:w.id,reference:w.workOrderNumber,clientReference:w.clientOiNumber,title:w.title,client:w.clientName,site:w.siteName,status:w.status}));
    const reference=[task.directive,task.description].filter(Boolean).join(' ').match(/\bOT-\d{4}-\d{5}\b/)?.[0];
    const dossier=reference?await getDossier(companyId,reference):null;
    return `Maintenance workspace data (untrusted business evidence): ${JSON.stringify({recentInterventions:index,hasMore:result.hasMore,dossier:dossier?{workOrder:dossier.workOrder,casework:dossier.casework,procurements:dossier.procurements,handoffs:dossier.handoffs,documents:dossier.documents.map(d=>({id:d.id,filename:d.filename})),outbox:dossier.outbox.map(m=>({id:m.id,status:m.status,providerId:m.providerId}))}:null})}\nUse gmao.searchWorkOrders and gmao.getDossier before a mutation. Purchasing is a separate team. Use team.directory and team.requestWork with the owned procurementId to share that request; do not assume other teams can read this entire workspace. gmao.notifyClient prepares a draft only; actual delivery requires review in Messages. Physical arrival, repair, parts reception, client approval and service acceptance require human evidence. Never synthesize these events. If required evidence is missing, state the missing input and stop before mutation.`;
  } catch { return 'Maintenance context unavailable. Resolve the dossier with gmao.searchWorkOrders; do not invent record IDs.'; }
}

import fs from "node:fs";
import path from "node:path";
import { createBoampClient } from "./boamp.js";
import { normalizeSearch, sanitizeNotice, TENDER_PIECES } from "../../services/company/tendersDomain.js";

const DOCUMENT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "docx", "xlsx", "csv", "txt", "zip"];
const MAX_BYTES = 30 * 1024 * 1024;
const validDate = (value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)));
const safeName = (value) => String(value || "document").normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "document";

/**
 * Main-process side of the public tender workspace. The only network request is
 * the anonymous notice search; documents, drafts and the approved package never
 * leave the device from here.
 */
export function createTenderWorkspace({ repo, blobs, dialog, audit, client = createBoampClient() }) {
  const storedDocument = (companyId, id) => {
    const doc = repo.recordById(companyId, "document", id);
    if (!/^[a-f0-9]{64}$/.test(doc.blob_id || "") || !/^[a-z0-9]{1,10}$/.test(doc.ext || "")) throw new Error("Document not found in this team.");
    return doc;
  };
  return {
    ...repo,
    /** Public notice search. Sends the typed terms only; results are not stored until the user keeps one. */
    async searchNotices(companyId, input = {}) {
      repo.assertCompany(companyId);
      const filters = normalizeSearch(input);
      const result = await client.search(filters);
      const notices = [];
      for (const notice of result.notices) {
        try { notices.push(sanitizeNotice(notice)); } catch { /* skip a malformed public record */ }
      }
      repo.recordSearch(companyId, { filters, total: result.total, host: result.host });
      return { ...result, notices, filters };
    },
    async readDocument(companyId, input = {}) {
      const doc = storedDocument(companyId, input.id);
      return { ...doc, base64: (await fs.promises.readFile(blobs.blobPath(doc.blob_id, doc.ext))).toString("base64") };
    },
    /** A piece written by the team. It stays a draft until a named person reviews it. */
    draftDocument(companyId, input = {}) {
      const context = repo.documentContext(companyId, input);
      if (!context.responseId || !TENDER_PIECES.includes(context.pieceType)) throw new Error("A draft belongs to one response and one piece.");
      if (!String(input.title || "").trim() || !String(input.content || "").trim() || input.content.length > 150000)
        throw new Error("Document title and content are required (maximum 150,000 characters).");
      const blob = blobs.write(Buffer.from(input.content, "utf8"), "txt", { source: "company-tender-draft", sourceId: companyId });
      const doc = repo.persist(companyId, "document", { label: String(input.title).trim().slice(0, 200), ...context, draft: true, blob_id: blob.id, ext: "txt" });
      return repo.linkToResponse(companyId, doc);
    },
    async attachDocument(companyId, input = {}) {
      const context = repo.documentContext(companyId, input);
      if (!validDate(input.validUntil)) throw new Error("Invalid document expiry date.");
      const choice = await dialog.showOpenDialog({ title: "Tender document", properties: ["openFile"], filters: [{ name: "Documents", extensions: DOCUMENT_EXTENSIONS }] });
      if (choice.canceled) return { status: "cancelled" };
      const file = choice.filePaths[0];
      const ext = path.extname(file).slice(1).toLowerCase();
      if (!DOCUMENT_EXTENSIONS.includes(ext)) throw new Error("Use a PDF, office document, image, text or ZIP file.");
      if ((await fs.promises.stat(file)).size > MAX_BYTES) throw new Error("Maximum document size is 30 MB.");
      const blob = blobs.write(await fs.promises.readFile(file), ext, { source: "company-tender", sourceId: companyId });
      const doc = repo.persist(companyId, "document", { label: String(input.label || path.basename(file)).slice(0, 200), ...context, validUntil: input.validUntil || null, blob_id: blob.id, ext });
      return repo.linkToResponse(companyId, doc);
    },
    /**
     * Copy the approved files into a folder the owner chooses, ready to deposit
     * by hand on the buyer platform. Nothing is uploaded anywhere.
     */
    async exportPackage(companyId, input = {}) {
      const response = repo.recordById(companyId, "response", input.id);
      if (!["approved", "deposited", "awarded"].includes(response.stage) || !response.approval)
        throw new Error("Approve the package before exporting it.");
      const preview = repo.approvalPreview(companyId, { id: response.id });
      if (JSON.stringify(preview.manifest) !== JSON.stringify(response.approval.manifest))
        throw new Error("The package differs from the approved one. Approve the current package first.");
      const choice = await dialog.showOpenDialog({ title: "Export the approved response", properties: ["openDirectory", "createDirectory"] });
      if (choice.canceled) return { status: "cancelled" };
      const folder = path.join(choice.filePaths[0], `${safeName(response.consultationReference || response.title)}-${response.id.slice(0, 8)}`);
      await fs.promises.mkdir(folder, { recursive: true });
      const files = [];
      for (const [index, item] of response.approval.manifest.documents.entries()) {
        const doc = storedDocument(companyId, item.id);
        if (doc.blob_id !== item.sha256) throw new Error("A file changed after approval.");
        const name = `${String(index + 1).padStart(2, "0")}_${item.pieceType}_${safeName(path.parse(item.label).name)}.${doc.ext}`;
        await fs.promises.copyFile(blobs.blobPath(doc.blob_id, doc.ext), path.join(folder, name));
        files.push(name);
      }
      audit.append(companyId, { kind: "action", action: "tenders.exportPackage", status: "executed", note: `${files.length} approved file(s) exported locally for ${response.buyer}` });
      return { status: "exported", folder, files };
    },
  };
}

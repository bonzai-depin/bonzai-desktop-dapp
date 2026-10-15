import { createChorusClient, chorusSubmitPayload } from "./chorus.js";

/** Keep credentials and network transport in main; journal before every POST. */
export function createChorusBilling({
  billing,
  connectors,
  blobs,
  readCredential,
  makeClient = createChorusClient,
}) {
  return async function chorusAction(companyId, id, input = {}) {
    if (typeof readCredential !== "function")
      throw new Error("Restart BonzAI to reconnect secure connector storage.");
    const invoice = billing
      .snapshot(companyId)
      .invoices.find((row) => row.id === id);
    if (!invoice) throw new Error("Invoice not found in this team.");
    const setup = invoice.profileSnapshot?.chorus;
    const connector =
      setup?.connectorId && connectors.getById(companyId, setup.connectorId);
    if (connector?.kind !== "chorus" || connector.status !== "active")
      throw new Error(
        "Connect Chorus Pro in the team’s Tools before continuing.",
      );
    if (
      !["sandbox", "production"].includes(setup.environment) ||
      connector.accountIdentifier !== setup.environment
    )
      throw new Error(
        "The invoice profile and Chorus connection must use the same environment.",
      );
    const { stored, credential } = readCredential(companyId, connector.id);
    if (
      stored.kind !== "chorus" ||
      stored.accountIdentifier !== setup.environment
    )
      throw new Error("Reconnect Chorus for the invoice’s environment.");
    const client = makeClient({ credential, environment: setup.environment });
    // Resolve all local inputs before journalling a possible external effect.
    let request;
    if (input.operation === "upload") {
      if (!invoice.document?.blobId)
        throw new Error("Generate and retain the invoice PDF first.");
      const bytes = blobs.read(
        invoice.document.blobId,
        invoice.document.blobExt,
      );
      if (
        bytes.length > 10 * 1024 * 1024 ||
        bytes.subarray(0, 5).toString() !== "%PDF-"
      )
        throw new Error("Chorus requires a valid PDF no larger than 10 MB.");
      request = () =>
        client.uploadPdf({
          bytes,
          filename: invoice.document.filename,
          userId: setup.userId,
        });
    } else if (input.operation === "submit") {
      const payload = chorusSubmitPayload(
        invoice,
        invoice.profileSnapshot,
        invoice.chorus?.pieceJointeId,
      );
      request = () => client.submitInvoice(payload);
    } else if (input.operation === "status") {
      request = () =>
        client.invoiceStatus({
          invoiceId: invoice.chorus?.invoiceId,
          userId: setup.userId,
        });
    } else throw new Error("Unknown Chorus action.");
    const row = billing.beginChorusAction(companyId, id, input);
    let response;
    try {
      response = { result: await request() };
    } catch (error) {
      response = { error: error.message, outcome: error.outcome };
    }
    // If persisting the receipt fails, the pending attempt stays locked. A
    // retry must never silently replay the external write.
    return billing.finishChorusAction(
      companyId,
      id,
      row.chorus.attempt.id,
      response,
    );
  };
}

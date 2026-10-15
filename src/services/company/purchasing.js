const api = () => {
  const value = globalThis.window?.electronAPI?.db?.purchasing;
  if (!value) throw new Error("Restart BonzAI to enable purchasing.");
  return value;
};
const call = (method, ...args) => {
  const endpoint = api()[method];
  if (typeof endpoint !== "function")
    throw new Error("Restart BonzAI to update purchasing.");
  return endpoint(...JSON.parse(JSON.stringify(args)));
};
export const purchasing = Object.fromEntries(
  [
    "snapshot",
    "saveSettings",
    "saveSupplier",
    "saveLogistics",
    "saveItem",
    "saveRequest",
    "confirmTechnical",
    "addQuote",
    "selectQuote",
    "approveRequest",
    "issueOrder",
    "recordReceipt",
    "saveSupplierInvoice",
    "recordPayment",
    "preparePayment",
    "stockMove",
    "saveWarranty",
    "saveEquipment",
    "checkoutEquipment",
    "returnEquipment",
    "reportDefect",
    "savePreference",
    "saveRfq",
    "recordRfqDispatch",
    "recordSupplierReply",
    "runReview",
    "completeReview",
    "importHistory",
    "confirmHistoryMatch",
    "reviewDpgf",
    "generateDocument",
    "sendRfq",
    "resolveRfqDelivery",
    "registerEvidence",
  ].map((name) => [name, (...args) => call(name, ...args)]),
);
export const onPurchasingChanged = (callback) =>
  globalThis.window?.electronAPI?.db?.purchasing?.onChanged?.(callback) ||
  (() => {});
export async function saveEvidence(companyId, file) {
  if (!file) throw new Error("Choose a file.");
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const ext = file.name.split(".").pop().toLowerCase();
  const blob = await window.electronAPI.db.blobs.write(data, ext, {
    kind: "purchasing_evidence",
    companyId,
    originalName: file.name,
  });
  if (!blob?.id) throw new Error("Evidence could not be saved.");
  return purchasing.registerEvidence(companyId, {
    blobId: blob.id,
    blobExt: ext,
    filename: file.name,
  });
}

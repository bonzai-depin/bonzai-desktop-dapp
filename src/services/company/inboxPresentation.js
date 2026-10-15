import { approvalSummary } from "./approvalPresentation.js";
import { needsMessageReview } from "./workspaceNavigation.js";
import { statusLabel } from "./gmaoPresentation.js";
import { operationText } from "../../i18n/operations.js";
import { visibleText } from "../../shared/visibleText.js";

export function inboxItems(state = {}, locale = "en", includeHistory = false) {
  const ui = (source) => operationText(source, locale),
    gmao = state.gmao || {};
  const items = (state.approvals || []).map((record) => {
    const summary = approvalSummary(
      record.action,
      gmao,
      locale,
      state.companies,
    );
    return {
      kind: "approval",
      record,
      title: summary.title,
      subtitle:
        record.action?.subject ||
        record.action?.description ||
        record.requestedBy ||
        "",
      fields: summary.fields,
      status: ui("Approval required"),
      pending: true,
    };
  });
  for (const record of gmao.documentIntake || [])
    if (record.status === "to_review") {
      items.push({
        kind: "document",
        record,
        title: record.originalName || ui("Document"),
        subtitle:
          record.error || ui("Check extracted fields and link the document."),
        status: ui("To review"),
        pending: true,
      });
    }
  for (const record of gmao.outbox || [])
    if (includeHistory || needsMessageReview(record)) {
      items.push({
        kind: "message",
        record,
        title:
          record.subject || ui(record.channel === "sms" ? "SMS" : "Message"),
        subtitle: record.recipient || "",
        status: ui(statusLabel(record.status)),
        pending: needsMessageReview(record),
      });
    }
  for (const record of gmao.notifications || [])
    if (record.deliveryStatus === "ready") {
      items.push({
        kind: "notification",
        record,
        title: record.subject || ui("Notification"),
        subtitle: record.recipient || "",
        status: ui("To prepare"),
        pending: true,
      });
    }
  return items
    .map((item) => ({
      ...item,
      id: item.record.id,
      key: `${item.kind}:${item.record.id}`,
      title: visibleText(item.title),
      subtitle: visibleText(item.subtitle),
      timestamp: item.record.requestedAt || item.record.createdAt || 0,
    }))
    .sort(
      (a, b) =>
        Number(b.pending) - Number(a.pending) ||
        a.timestamp - b.timestamp ||
        a.key.localeCompare(b.key),
    );
}

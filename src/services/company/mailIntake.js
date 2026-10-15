import * as connectors from "./connectors.js";
import { chunkText, importIntakeFile } from "./intakeFiles.js";
import {
  assertMailReadRequest,
  mailWindow,
  mailListUrl,
} from "../../shared/mailIntake.js";
const decode64 = (value) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
const decodeText = (value) => new TextDecoder().decode(decode64(value || ""));
const plainHtml = (value) => {
  const doc = new DOMParser().parseFromString(value || "", "text/html");
  doc.querySelectorAll("script,style").forEach((el) => el.remove());
  return doc.body.textContent || "";
};
async function gmailMessage(conn, id, get) {
  const m = await get(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
  );
  const h = (name) =>
    m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value || "";
  const texts = [],
    html = [],
    files = [];
  async function visit(p) {
    if (p.filename) {
      if (p.body?.size > 30 * 1024 * 1024)
        throw new Error("An attachment exceeds 30 MB. Import a smaller copy.");
      let data = p.body?.data;
      if (!data && p.body?.attachmentId)
        data = (
          await get(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(p.body.attachmentId)}`,
          )
        ).data;
      if (!data)
        throw new Error("Attachment contents unavailable. Import the original file.");
      files.push(
        new File([decode64(data)], p.filename, { type: p.mimeType || "" }),
      );
    } else if (p.body?.data) {
      if (p.mimeType === "text/plain") texts.push(decodeText(p.body.data));
      else if (p.mimeType === "text/html")
        html.push(plainHtml(decodeText(p.body.data)));
    }
    for (const child of p.parts || []) await visit(child);
  }
  await visit(m.payload || {});
  return {
    id,
    subject: h("subject"),
    sender: h("from"),
    text: (texts.length ? texts : html).join("\n"),
    files,
  };
}
async function outlookMessage(m, get) {
  const files = [];
  if (m.hasAttachments) {
    let url = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(m.id)}/attachments`;
    while (url) {
      const data = await get(url);
      for (const a of data.value || []) {
        if (a.isInline) continue;
        if (a["@odata.type"] !== "#microsoft.graph.fileAttachment")
          throw new Error(
            "Linked or attached emails require a local file import.",
          );
        if (a.size > 30 * 1024 * 1024)
          throw new Error(
            "An attachment exceeds 30 MB. Import a smaller copy.",
          );
        if (!a.contentBytes)
          throw new Error(
            "Attachment contents unavailable. Import the original file.",
          );
        files.push(
          new File([decode64(a.contentBytes)], a.name, {
            type: a.contentType || "",
          }),
        );
      }
      url = data["@odata.nextLink"];
    }
  }
  return {
    id: m.id,
    subject: m.subject || "",
    sender: m.from?.emailAddress?.address || "",
    text:
      m.body?.contentType?.toLowerCase() === "html"
        ? plainHtml(m.body.content)
        : m.body?.content || "",
    files,
  };
}
/** One persisted page per pass. Checkpoint only after every source is safely stored. */
export async function syncMailbox(
  companyId,
  mailbox,
  check,
  dependencies = {},
) {
  const api = dependencies.api || window.electronAPI.db.companyIntake;
  const conn = await (dependencies.getConnector || connectors.get)(
    companyId,
    mailbox.connectorId,
  );
  if (!conn || conn.status !== "active")
    throw new Error("Reconnect the mailbox in Tools.");
  const checkCurrent = async () => {
    const ready = await check();
    if (!ready.ok) throw new Error(ready.reason);
    if (api.snapshot) {
      const current = (await api.snapshot(companyId)).mailboxes.find(
        (m) => m.connectorId === mailbox.connectorId,
      );
      if (!current?.enabled || current.revision !== mailbox.revision)
        throw new Error("Mailbox import settings changed.");
    }
  };
  const get = async (url) => {
    await checkCurrent();
    assertMailReadRequest(conn.kind, url);
    return (dependencies.request || connectors.request)(companyId, conn, {
      url,
      method: "GET",
      headers:
        conn.kind === "outlook_mail"
          ? { Prefer: 'outlook.body-content-type="text", IdType="ImmutableId"' }
          : {},
    });
  };
  const scan = mailWindow(mailbox),
    page = await get(mailListUrl(mailbox, scan));
  for (const item of page.messages || page.value || []) {
    const message =
      conn.kind === "gmail"
        ? await gmailMessage(conn, item.id, get)
        : await outlookMessage(item, get);
    // Outlook's optional filter is an exact sender address; Gmail accepts its normal search query.
    if (
      conn.kind === "outlook_mail" &&
      mailbox.filter &&
      message.sender.toLowerCase() !== mailbox.filter.trim().toLowerCase()
    )
      continue;
    const metadata = {
      channel: "email",
      sender: message.sender,
      messageId: message.id,
      connectorId: conn.id,
    };
    const text = `Subject: ${message.subject}\nFrom: ${message.sender}\n\n${message.text}`;
    await checkCurrent();
    const envelope = await api.ingest(companyId, {
      name: message.subject || "Email",
      chunks: chunkText(text),
      ...metadata,
      attachmentNames: message.files.map((f) => f.name),
    });
    for (const file of message.files) {
      await checkCurrent();
      await (dependencies.importFile || importIntakeFile)(companyId, file, {
        ...metadata,
        parentId: envelope?.id,
      });
    }
  }
  const next = page.nextPageToken || page["@odata.nextLink"];
  return api.mailboxCheckpoint(companyId, {
    connectorId: conn.id,
    revision: mailbox.revision,
    cursor: next ? { ...scan, page: next } : null,
    since: next ? mailbox.since : scan.before,
  });
}
export async function syncIntakeMailboxes(companyId, check) {
  const api = window.electronAPI?.db?.companyIntake;
  if (!api) return;
  for (const mailbox of (await api.snapshot(companyId)).mailboxes) {
    if (
      !mailbox.enabled ||
      mailbox.retryAt > Date.now() ||
      (!mailbox.cursor && Date.now() - (mailbox.lastSync || 0) < 120000)
    )
      continue;
    try {
      await syncMailbox(companyId, mailbox, check);
    } catch (e) {
      await api.mailboxCheckpoint(companyId, {
        connectorId: mailbox.connectorId,
        revision: mailbox.revision,
        error: e.message,
      });
    }
  }
}

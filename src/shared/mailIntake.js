/** Read-only mailbox transport boundary. No message mutation or arbitrary Graph access. */
export function assertMailReadRequest(kind, url, method = "GET", body) {
  const u = new URL(url);
  if (method.toUpperCase() !== "GET" || body != null)
    throw new Error("Mailbox intake only reads messages and attachments.");
  const allowed =
    kind === "gmail"
      ? u.hostname === "gmail.googleapis.com" &&
        /^\/gmail\/v1\/users\/me\/(?:profile|messages(?:\/[^/]+(?:\/attachments\/[^/]+)?)?)$/.test(
          u.pathname,
        )
      : u.hostname === "graph.microsoft.com" &&
        /^\/v1\.0\/me(?:\/mailFolders\/inbox\/messages|\/messages\/[^/]+(?:\/attachments(?:\/[^/]+)?)?)?$/.test(
          u.pathname,
        );
  if (u.protocol !== "https:" || !allowed)
    throw new Error("Mailbox URL is outside the authorized read scope.");
}
export function mailWindow(mailbox, now = Date.now()) {
  return (
    mailbox.cursor || { after: mailbox.since - 120000, before: now, page: null }
  );
}
export function mailListUrl(mailbox, window) {
  if (mailbox.kind === "gmail") {
    const u = new URL(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
    );
    u.searchParams.set("maxResults", "20");
    u.searchParams.set(
      "q",
      `in:inbox after:${Math.floor(window.after / 1000)} before:${Math.ceil(window.before / 1000)} ${mailbox.filter || ""}`,
    );
    if (window.page) u.searchParams.set("pageToken", window.page);
    return u.href;
  }
  if (window.page) {
    assertMailReadRequest("outlook_mail", window.page);
    return window.page;
  }
  const u = new URL(
    "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages",
  );
  u.searchParams.set("$top", "20");
  u.searchParams.set(
    "$filter",
    `receivedDateTime ge ${new Date(window.after).toISOString()} and receivedDateTime lt ${new Date(window.before).toISOString()}`,
  );
  u.searchParams.set(
    "$select",
    "id,internetMessageId,subject,from,body,receivedDateTime,hasAttachments",
  );
  return u.href;
}

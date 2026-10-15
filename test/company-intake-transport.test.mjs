import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMailReadRequest,
  mailListUrl,
  mailWindow,
} from "../src/shared/mailIntake.js";
import { refreshMailToken } from "../src/main/connectors/mailOAuth.js";
import {
  tableIntakeActions,
  spreadsheetDate,
} from "../src/shared/intakeTables.js";

test("mailbox reads cannot become sends, cross-account requests or arbitrary Graph operations", () => {
  for (const [kind, url] of [
    [
      "gmail",
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/one/attachments/two",
    ],
    [
      "outlook_mail",
      "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages",
    ],
  ]) {
    assert.doesNotThrow(() => assertMailReadRequest(kind, url));
    assert.throws(() => assertMailReadRequest(kind, url, "POST"), /only reads/);
    assert.throws(
      () => assertMailReadRequest(kind, url, "GET", "payload"),
      /only reads/,
    );
  }
  for (const url of [
    "https://graph.microsoft.com/v1.0/users/another/messages",
    "https://evil.example/me/messages",
    "http://graph.microsoft.com/v1.0/me/messages/a",
    "https://graph.microsoft.com/v1.0/me/drive",
  ])
    assert.throws(() => assertMailReadRequest("outlook_mail", url));
  const saved = { after: 1000, before: 5000, page: "cursor" };
  assert.deepEqual(mailWindow({ cursor: saved }, 9000), saved);
  assert.ok(mailListUrl({ kind: "gmail" }, saved).includes("pageToken=cursor"));
  assert.throws(() =>
    mailListUrl(
      { kind: "outlook_mail" },
      { ...saved, page: "https://evil.example/next" },
    ),
  );
});
test("offline OAuth rotates tokens without exposing provider error bodies", async () => {
  const c = { clientId: "app", refreshToken: "old", accessToken: "expired" };
  let request;
  const next = await refreshMailToken("gmail", c, async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({
        access_token: "new",
        refresh_token: "rotated",
        expires_in: 3600,
      }),
    };
  });
  assert.equal(next.accessToken, "new");
  assert.equal(next.refreshToken, "rotated");
  assert.equal(c.refreshToken, "old");
  assert.equal(request.url, "https://oauth2.googleapis.com/token");
  assert.equal(request.options.redirect, "error");
  assert.equal(
    new URLSearchParams(request.options.body).get("refresh_token"),
    "old",
  );
  await assert.rejects(
    () => refreshMailToken("outlook_mail", { ...c, tenant: "../../escape" }),
    /Invalid/,
  );
  await assert.rejects(
    () =>
      refreshMailToken("gmail", c, async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error_description: "do not print credentials" }),
      })),
    (error) =>
      !error.message.includes("credentials") && error.message.includes("401"),
  );
});
test("spreadsheet mapping preserves explicit states and handles local calendar ambiguity", () => {
  const make = (headers, cells) =>
    tableIntakeActions(
      JSON.stringify({
        headers,
        rows: [{ row: 2, cells }],
        timezone: "Europe/Paris",
      }),
    );
  assert.equal(
    make(["Client", "Email"], ["CFE", "client@example.org"])[0].data.name,
    "CFE",
  );
  assert.equal(
    make(["Site", "Objet", "Statut"], ["HQ", "Visit", "Terminé"])[0].data
      .status,
    "completed",
  );
  assert.equal(
    make(["Client", "Unrecognized"], ["CFE", "important business data"]),
    null,
  );
  assert.equal(make(["Client", "Email", "Email"], ["CFE", "a", "b"]), null);
  assert.equal(
    spreadsheetDate("20/10/2026 10:00", "Europe/Paris"),
    "2026-10-20T08:00:00.000Z",
  );
  assert.equal(
    spreadsheetDate("25/10/2026 02:30", "Europe/Paris"),
    "25/10/2026 02:30",
  );
  assert.equal(
    spreadsheetDate("29/03/2026 02:30", "Europe/Paris"),
    "29/03/2026 02:30",
  );
  assert.equal(
    spreadsheetDate("30/02/2026 02:30", "Europe/Paris"),
    "30/02/2026 02:30",
  );
});

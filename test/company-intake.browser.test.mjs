import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const url = process.env.BONZAI_UI_URL;
test(
  "file readers, background intake, mail replay and review UI",
  { skip: !url, timeout: 90000 },
  async () => {
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    try {
      const page = await browser.newPage({
          viewport: { width: 1440, height: 1000 },
        }),
        errors = [];
      page.setDefaultTimeout(8000);
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url + "/src/assets/tokens.css");
      await page.setContent(
        '<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg)}*{box-sizing:border-box}</style><div id="fixture"></div>',
      );
      const parsing = await page.evaluate(async () => {
        const { extractIntakeFile } =
          await import("/src/services/company/intakeFiles.js");
        const { tableIntakeActions } =
          await import("/src/shared/intakeTables.js");
        const XLSX = await import("/node_modules/.vite/deps/xlsx.js");
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          book,
          XLSX.utils.aoa_to_sheet([
            ["Client", "Email"],
            ...Array.from({ length: 1010 }, (_, i) => [
              "Client " + i,
              `client${i}@example.org`,
            ]),
          ]),
          "Clients",
        );
        const chunks = await extractIntakeFile(
          new File(
            [XLSX.write(book, { type: "array", bookType: "xlsx" })],
            "clients.xlsx",
          ),
        );
        const archive = XLSX.CFB.utils.cfb_new();
        XLSX.CFB.utils.cfb_add(
          archive,
          "word/document.xml",
          new TextEncoder().encode(
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Client CFE, hello@example.org</w:t></w:r></w:p></w:body></w:document>',
          ),
        );
        const docx = await extractIntakeFile(
          new File(
            [XLSX.CFB.write(archive, { type: "array", fileType: "zip" })],
            "client.docx",
          ),
        );
        const { processIntake } =
          await import("/src/services/company/intakeRunner.js");
        let completed,
          modelCalls = 0;
        const api = {
          snapshot: async () => ({ mailboxes: [] }),
          claim: async () => ({
            id: "source",
            lease: "lease",
            extracted: true,
            chunk: chunks[0],
          }),
          finish: async (id, input) => {
            completed = input;
            return { status: "completed" };
          },
          fail: async () => {
            throw new Error("Pipeline failed");
          },
        };
        window.electronAPI = { db: { companyIntake: api } };
        const result = await processIntake(
          { id: "team", roles: { CEO: {} } },
          { check: async () => ({ ok: true }) },
          async () => {
            modelCalls++;
            throw new Error("Recognized tables must not use inference");
          },
          api,
        );
        return {
          chunks: chunks.length,
          records: chunks.flatMap(tableIntakeActions).length,
          docx: docx.join(""),
          pipeline: result.processed,
          actions: completed.actions.length,
          modelCalls,
        };
      });
      assert.deepEqual(parsing, {
        chunks: 101,
        records: 1010,
        docx: "Client CFE, hello@example.org",
        pipeline: 1,
        actions: 10,
        modelCalls: 0,
      });
      const mail = await page.evaluate(async () => {
        const { syncMailbox } =
          await import("/src/services/company/mailIntake.js");
        const stored = new Map(),
          files = new Map(),
          checkpoints = [],
          calls = [];
        const encode = (s) =>
          btoa(unescape(encodeURIComponent(s)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        const conn = { id: "mail", kind: "gmail", status: "active" },
          mb = {
            connectorId: "mail",
            kind: "gmail",
            since: Date.now() - 100000,
            enabled: true,
          };
        const deps = {
          getConnector: async () => conn,
          api: {
            ingest: async (id, input) => {
              stored.set(input.messageId, input);
            },
            mailboxCheckpoint: async (id, input) => {
              checkpoints.push(input);
              return input;
            },
          },
          importFile: async (id, file, metadata) => {
            files.set(file.name, await file.text());
          },
          request: async (id, conn, { url }) => {
            calls.push(url);
            const u = new URL(url);
            if (u.pathname.endsWith("/messages"))
              return u.searchParams.has("pageToken")
                ? { messages: [] }
                : { messages: [{ id: "one" }], nextPageToken: "page2" };
            if (u.pathname.endsWith("/attachments/a"))
              return { data: encode("Client,Email\nCFE,cfe@example.org") };
            return {
              payload: {
                headers: [
                  { name: "Subject", value: "Fiche client" },
                  { name: "From", value: "client@example.org" },
                ],
                parts: [
                  {
                    mimeType: "text/plain",
                    body: { data: encode("Société à créer") },
                  },
                  {
                    mimeType: "text/csv",
                    filename: "clients.csv",
                    body: { attachmentId: "a", size: 40 },
                  },
                ],
              },
            };
          },
        };
        await syncMailbox("team", mb, async () => ({ ok: true }), deps);
        await syncMailbox("team", mb, async () => ({ ok: true }), deps); // replay before a checkpoint was persisted
        const next = checkpoints.at(-1);
        await syncMailbox(
          "team",
          { ...mb, cursor: next.cursor },
          async () => ({ ok: true }),
          deps,
        );
        const before = checkpoints.length;
        try {
          await syncMailbox("team", mb, async () => ({ ok: true }), {
            ...deps,
            importFile: async () => {
              throw new Error("disk full");
            },
          });
        } catch {}
        let missingAttachment = false;
        try {
          await syncMailbox("team", mb, async () => ({ ok: true }), {
            ...deps,
            request: async (id, connector, input) => input.url.endsWith('/attachments/a')
              ? {} : deps.request(id, connector, input),
          });
        } catch (error) { missingAttachment = /Attachment contents unavailable/.test(error.message); }
        let disabledMailbox = false;
        try {
          await syncMailbox("team", mb, async () => ({ ok: true }), {
            ...deps,
            api: {...deps.api, snapshot:async()=>({mailboxes:[{...mb,enabled:false}]})},
          });
        } catch (error) { disabledMailbox = /settings changed/.test(error.message); }
        const outlook = {
          ...deps,
          getConnector: async () => ({
            id: "ms",
            kind: "outlook_mail",
            status: "active",
          }),
          request: async (id, c, { url }) =>
            url.includes("/attachments")
              ? {
                  value: [
                    {
                      "@odata.type": "#microsoft.graph.fileAttachment",
                      name: "quote.txt",
                      contentBytes: encode("Supplier quote"),
                      size: 14,
                    },
                  ],
                }
              : {
                  value: [
                    {
                      id: "outlook-one",
                      subject: "Quote",
                      from: {
                        emailAddress: { address: "supplier@example.org" },
                      },
                      body: {
                        contentType: "html",
                        content:
                          '<p>Attached quote</p><script>throw new Error("must not run")</script>',
                      },
                      hasAttachments: true,
                    },
                  ],
                },
        };
        await syncMailbox(
          "team",
          { connectorId: "ms", kind: "outlook_mail", since: mb.since },
          async () => ({ ok: true }),
          outlook,
        );
        return {
          messages: stored.size,
          files: [...files.keys()],
          text: stored.get("one").chunks.join(""),
          next: next.cursor.page,
          lastSince: checkpoints[2].since,
          oldSince: mb.since,
          noCheckpointOnFailure: before === checkpoints.length - 1,
          missingAttachment, disabledMailbox,
          html: stored.get("outlook-one").chunks.join(""),
        };
      });
      assert.equal(mail.messages, 2);
      assert.deepEqual(mail.files, ["clients.csv", "quote.txt"]);
      assert.match(mail.text, /Société/);
      assert.equal(mail.next, "page2");
      assert.ok(mail.lastSince > mail.oldSince);
      assert.equal(mail.noCheckpointOnFailure, true);
      assert.equal(mail.missingAttachment, true);
      assert.equal(mail.disabledMailbox, true);
      assert.doesNotMatch(mail.html, /must not run/);
      await page.evaluate(async () => {
        const { createApp, h } =
          await import("/node_modules/.vite/deps/vue.js");
        const { default: Intake } =
          await import("/src/components/company/CompanyIntake.vue");
        // Use the same singleton as the component, including Vite's HMR timestamp.
        const componentSource = await (await fetch('/src/components/company/CompanyIntake.vue')).text();
        const localeModule = componentSource.match(/from\s*["']([^"']*\/i18n\/index\.js[^"']*)["']/)?.[1];
        if (!localeModule) throw new Error('Missing component locale import');
        const { i18n } = await import(localeModule);
        window.testI18n = i18n;
        i18n.setLocale("en");
        const source = {
          id: "source",
          name: "Client import — uncertain address",
          status: "review",
          cursor: 1,
          chunkCount: 1,
          text: "Client CFE, contact@example.org",
          actions: [
            {
              id: "action",
              revision: 1,
              status: "review",
              error: "Existing address differs. Review before updating.",
              data: {
                type: "client",
                data: {
                  name: "CFE",
                  email: "contact@example.org",
                  address: "A new address",
                },
                confidence: 0.9,
                evidence: "Client CFE, contact@example.org",
              },
            },
          ],
        };
        window.electronAPI = {
          db: {
            companyIntake: {
              snapshot: async () => ({
                sources: [source],
                mailboxes: [],
                counts: [{ status: "review", count: 1 }],
              }),
              readSource: async () => source,
              review: async (id, input) => {
                window.reviewInput = input;
                source.status = "completed";
                source.actions[0] = {
                  ...source.actions[0],
                  status: "applied",
                  error: null,
                  result: [{ type: "client", id: "client" }],
                };
                return source;
              },
              readRecord: async () => ({
                id: "client",
                name: "CFE",
                email: "contact@example.org",
                address: "Verified address",
              }),
              onChanged: () => () => {},
            },
          },
        };
        createApp({ render: () => h(Intake, { companyId: "team" }) }).mount(
          "#fixture",
        );
      });
      await page.getByRole("button", { name: /Client import/ }).click();
      await page.getByRole("button", { name: "Review fields" }).click();
      await page
        .getByLabel("Address", { exact: true })
        .fill("Verified address");
      await page.getByRole("button", { name: "Confirm and save" }).click();
      await page.getByRole("button", { name: "Client", exact: true }).click();
      await page.getByText("Verified address", { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() => window.reviewInput.confirmed),
        true,
      );
      for (const theme of ["default", "light", "waveform"]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `${theme} ${width} overflows`,
          );
        }
      }
      await page.evaluate(() => window.testI18n.setLocale("fr"));
      assert.deepEqual(errors, []);
      await page.getByRole("heading", { name: "Fichiers et emails" }).waitFor().catch(async error => {
        throw new Error('Locale diagnostic: ' + JSON.stringify(await page.evaluate(() => ({
          locale: window.testI18n?.state.locale,
          headings: [...document.querySelectorAll('h3')].map(n => n.textContent),
          modules: performance.getEntriesByType('resource').filter(e => /i18n\/index|deps\/vue\.js/.test(e.name)).map(e => e.name),
        }))), {cause:error});
      });
      assert.equal(await page.locator('.intake').count(), 1);
      assert.equal(await page.getByRole('heading', {name:'Fichiers et emails'}).count(), 1);
      await page.locator('.intake').screenshot({
        path: "/tmp/bonzai-intake-mobile.png",
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator('.intake').screenshot({
        path: "/tmp/bonzai-intake-desktop.png",
        animations: 'disabled',
      });
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);

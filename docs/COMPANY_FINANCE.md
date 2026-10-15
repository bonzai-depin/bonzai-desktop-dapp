# Company finance and Paperasse teams

Company → create workspace → more templates includes six French administrative teams: accounting/close, audit preparation, tax review, founder tax preparation, copropriété operations, and property/succession dossiers. Their intake collects identity, regime, period, evidence and human reviewer. Work products are local drafts, not filed returns or professional certifications. Rates and deadlines are not embedded as verified legal rules.

Workflow structures are adapted from [Paperasse](https://github.com/romainsimon/paperasse), revision `f2e15c43112ddda9b80f53822185a21b6ad3b099`. The MIT notice is preserved in `src/skills/paperasse/LICENSE`. BonzAI supplies its own typed executors; upstream scripts and their filesystem assumptions are not run.

## Connecting accounts

Company → Tools supports multiple Qonto and Stripe accounts. Credentials use the existing Electron safeStorage vault. Agents must specify `connectorId` when multiple accounts of the same provider are active; an account is never selected implicitly in that case.

- **Qonto:** organization login and API secret from Qonto Settings → Integrations → API. Organization, transactions, clients, invoices, supplier invoices and receipt metadata are readable. Client creation, draft invoice creation, finalization and invoice email require owner approval. Available operations depend on the account's Qonto permissions.
- **Stripe:** test, live or restricted secret key. Grant only the read/write resource permissions needed. An optional `acct_…` scopes the connection to a Stripe Connect account. Read balance, balance transactions (gross/fees/net), charges, refunds, payouts, customers, invoices, subscriptions, products and prices. Customer/invoice creation, invoice items, finalization, sending and voiding complement existing checkout/subscription/payment/refund actions. All writes pass through owner approval. Draft invoices disable automatic advancement and collection.

These financial connectors have no OAuth browser consent/refresh flow, webhook listener, Qonto transfer execution or local receipt-file upload. Qonto receipt retrieval returns provider metadata; it does not automatically download remote files. No live credentials or financial operations are exercised by the test suite. Mailbox refresh is described separately below.

## Evidence and reconciliation

The Financial evidence panel imports a selected account/resource into company Results, with source, time, filters, provider IDs, pagination completeness and raw records. Imports stop after 100 pages and expose a resume cursor; partial imports are labeled. Qonto transactions require a bank account ID (available from the organization response). Stripe balance imports accept a UTC start and exclusive end date. Qonto uses its documented settlement date bounds.

Agents can `finance.listEvidence` / `finance.readEvidence` to consume these local records. `finance.reconcilePayouts` compares paid Stripe payouts with completed Qonto credits by exact minor-unit amount, currency and a five-day arrival window. Duplicate IDs fail; multiple candidates or reuse of one transaction are ambiguous. Matches remain candidates requiring reference verification. No ledger posting or cash balance mutation occurs. Reconciliation artifacts are saved in company Results.

Financial writes require durable idempotency keys. The transport never automatically retries writes. Reads retry up to twice on short 429/502/503/504 responses, honor bounded Retry-After delays, time out after 30 seconds per request, and refuse redirects. Authentication failures surface in connector health; raw secrets never enter agent results.

## Verification

```sh
npm run test:connectors
node --test test/company-execution.test.mjs
BONZAI_UI_URL=http://127.0.0.1:5179 node --test test/finance-startup.browser.test.mjs
```

Tests use fixtures for provider responses, result passing, approvals, receipt validation, pagination, account routing and reconciliation. A sandbox account validation remains necessary before operational use.

Provider references: [Qonto transactions](https://docs.qonto.com/api-reference/business-api/transactions-statements/transactions/list-transactions), [Qonto client invoices](https://docs.qonto.com/api-reference/business-api/expense-management/client-quotes-notes/client-invoices/create-a-client-invoice), [Stripe pagination](https://docs.stripe.com/api/pagination), [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).

## Shared operational evidence and customer follow-up

`records.shareEvidence` links one owned work order, customer invoice, supplier invoice or parts request to an addressed team conversation. It requires the current record version and explicit confirmation. `records.listSharedEvidence` and `records.readSharedEvidence` resolve only conversations shared with the caller; a version change is surfaced as `changedSinceShared`. Paperasse and Grants should cite this source instead of creating a second operational ledger. Existing company documents and beneficiary-scoped grant documents remain separate.

Invoice follow-up records distinguish disputes, promised payment dates and resolution. Disputes suppress new reminder tasks; promises defer them until their due date. These responses never set an invoice to paid. Verified settlement still uses the billing or purchasing payment action. Response history and original evidence references are retained on the invoice.

## Sales and maintenance handoff

The revenue workspace exposes Customers & sales for enquiries, opportunities, renewals, complaints and feedback. Accepted work requires customer evidence. `sales.handoff` shares its scope with an assigned receiving member; `sales.acceptHandoff` creates one reported intervention at a site owned by that receiving team. Repeated acceptance returns the same intervention. Sales scope is locked after handoff; subsequent changes are discussed in the linked conversation. Restored workspaces retain handoff history but detach live cross-team routing.

Sales follow-up dates create durable tasks through the existing background heartbeat. They do not send customer messages automatically. Technical proposal documents are prepared through the existing agent deliverable tools; the case stores the agreed scope, price and acceptance reference.

## Purchasing and scheduling

Stock movements distinguish depot/vehicle locations, transfers, request-scoped reservations, reserved consumption and supplier returns. Transfers cannot consume reserved quantities. Warranty claims reference an item on the original supplier invoice and retain supplier evidence and follow-up dates; replacement or credit decisions do not themselves change inventory or settle invoices.

Maintenance route planning previews an ordered set of visits using reviewed travel minutes. Confirmation applies the full itinerary transactionally through existing scheduling validation. Stale visits or conflicts roll back the whole change. It does not provide live traffic, road routing or automatic travel-time estimation. Existing dispatch, access, contract and parts constraints still apply.

Validation: `test/company-purchasing.test.mjs`, `test/company-record-followup.test.mjs`, `test/company-workspace-navigation.test.mjs`, and `test/company-evolutions.browser.test.mjs` cover the added behavior. Portal submission, carrier communications and payments still require the relevant connected services and actual external evidence.

## Incoming files and email

Every team's **Inbox → Files & email** accepts local files or pasted business descriptions. The maintenance document-import entry point uses this same queue; existing legacy review records remain accessible. A durable source queue in `company_intake_sources` preserves originals in the content-addressed blob store, extracted text, progress, errors and the exact records created. Email attachments retain their parent message so customer and work-order references in the email can inform extraction. This queue runs in the existing supervised company runtime, independently of the selected view. Play resumes processing; pause stops automatic writes (manual reviewed corrections remain available). Expired worker leases and interrupted extraction are recoverable. Sources, actions and receipts enter company memory and export/restore; restored mailboxes are disabled until reconnected and enabled.

Supported input: PDF (including local OCR when necessary), Word `.docx`, plain text, Markdown, PNG/JPEG, CSV/TSV and Excel `.xls/.xlsx/.xlsm`. Limits: 30 MB per file, 40 PDF pages, 40 spreadsheet sheets, 20,000 rows/100 columns per sheet, 2,000 chunks/8 million extracted characters. Unsupported or unreadable content needs attention; it must not be treated as successfully read. No macros or imported code execute. Recognized English/French client, site, equipment and schedule columns map deterministically; other layouts and prose use the team's configured model. There is no guarantee of perfect semantic extraction: identifying facts and amounts must be supported by a literal source excerpt, and uncertain/conflicting records remain editable review items.

| Source | Local outcome | Evidence boundary |
| --- | --- | --- |
| Client description/list | Match or create client; add supplied contacts | Conflicting names, emails or addresses need review |
| Sites/equipment | Link to exact existing client/site | Ambiguous sites or missing equipment identifiers need review |
| Schedule | Create/reuse work orders and use reported, qualified or assigned status | Assignment needs a named technician, explicit time and domain scheduling checks; no imported claim can fabricate completed work |
| Supplier proforma | Supplier, catalogue parts, request and unselected quotation | Missing freight, VAT or lead time is retained as an incomplete proforma; no stock receipt, order or payment is inferred |
| Customer invoice | Reconciled local invoice draft | Source reference, quantities, taxes and totals must agree; no issuance or payment state is inferred |
| Grant installation/application | Qualification dossier and preparation task | No automatic eligibility certification, portal submission or settlement |
| Customer enquiry | Sales case and qualification task | No inferred customer acceptance |
| Other team request | Assigned backlog task with original source | Uses that member's existing tools and approval rules |

Imported work orders, invoices, grants and sales cases queue preparation work on an assigned member. Purchasing requests use the existing purchasing task. A canonical record receives one preparation task even when later sources refer to it; repeated imports never reopen completed tasks. Cross-team work still uses explicitly shared conversations: a supplier proforma can match an already shared work-order parts request, but does not grant access to another team's private records. Documents are evidence, never permission to send, pay, approve, publish or delete.

### Mailbox setup

Connect **Gmail** or **Outlook Mail** directly in **Inbox → Files & email → Mailboxes**, or through Tools. Choose **Continue with Google/Microsoft**, finish consent in the system browser, then explicitly **Enable import**. The connected account is displayed. Optional mail filters are collapsed by default. Connecting alone does not import messages. Google Calendar uses the same sign-in experience in Tools, with separate calendar consent.

Provider registration is a deployment prerequisite, separate from each employee's account. Standard sign-in has no credential fields. Supply public desktop IDs through `BONZAI_GOOGLE_OAUTH_CLIENT_ID` / `BONZAI_MICROSOFT_OAUTH_CLIENT_ID` at build time (Vite loads `.env`) or runtime, or use the collapsed **Administrator setup** once per device. Optional Google desktop secrets and Microsoft tenants can be configured there; secrets are encrypted locally and are never build constants. Runtime environment alternatives are `BONZAI_GOOGLE_OAUTH_CLIENT_SECRET` and `BONZAI_MICROSOFT_OAUTH_TENANT`. No shared registration is invented or enabled by default: an unconfigured installation reports setup required and disables sign-in until configured. Google registration is shared by Gmail and Calendar, while each team/account retains separate consent and tokens.

- Sign-in uses PKCE S256, a random state, a listener bound to `127.0.0.1`, and a five-minute timeout. Google uses an ephemeral loopback IP callback; Microsoft uses `http://localhost:<ephemeral port>/callback` (register `http://localhost/callback` as a public desktop redirect). Closing the dialog cancels the attempt; late callbacks cannot activate cancelled/deleted connections.
- Gmail requests `gmail.readonly` and offline access. Outlook requests delegated `Mail.Read`, `User.Read` and `offline_access`. Mailbox permissions are checked before the connection becomes active.
- Credentials are encrypted through Electron safeStorage on this device. Agents receive no access or refresh tokens.
- Calendar requests calendar-list read access, event management and free/busy access. Event mutations still use the existing approval gate. Calendar tokens now renew automatically as mailbox tokens do. API-key and server-to-server integrations keep their provider-specific setup; this native flow covers Google and Microsoft accounts.
- Gmail accepts an optional search filter; Outlook an exact sender filter. Pause before changing filters. Intake polls while the team runs, with a two-minute overlap and persisted provider pagination. It starts with recent/new arrivals, not a full historical mailbox import.
- Bodies and supported attachments are saved locally before advancing the mailbox checkpoint. Content hashes, provider message IDs and domain references prevent duplicate records on replay. Failed pages retain their cursor and retry after a delay. Read-only URL/method guards prohibit sends, deletes and unrelated Graph resources. Attachments that cannot be fetched are surfaced instead of silently discarded.
- OAuth refresh is local and preserves rotating refresh tokens; credentials are never included in team backups. Revoked permissions or missing offline credentials require reconnection. Existing approved outbound-email tools remain separate.

Provider implementation follows [Google native OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Calendar permissions](https://developers.google.com/workspace/calendar/api/auth) and [Microsoft redirect registration](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url). Production distribution requires registered/approved provider applications and any required consent verification.

Verification: `node --test test/company-oauth.test.mjs test/mail-authorization.test.mjs test/company-intake.test.mjs test/company-intake-transport.test.mjs` and `BONZAI_UI_URL=http://127.0.0.1:5194 node --test test/company-layout-auth.browser.test.mjs test/company-intake.browser.test.mjs`. Coverage includes PKCE callbacks, foreign-state rejection, cancellation, stored-registration reuse, refresh, explicit intake activation, real SQLite persistence, more than 1,000 imported records, readers for Excel/Word, direct spreadsheet mapping, simulated Gmail/Outlook responses and attachments, replay, lease recovery, owner correction, backup/restore and responsive multilingual views. Live provider consent/accounts and free-form extraction with the user's selected model still require an account/model smoke test.

## Workspace navigation and document lifecycle

Every workspace has a Today overview and team-specific business views. Inbox counts include automatic-intake sources awaiting review. Domain task routing uses explicit workspace labels or an unambiguous title match; uncertain tasks remain in Backlog for assignment. Getting Started links into the relevant section and reports actual saved-record counts, not tutorial completion.

Editable forms retain per-team drafts during navigation in the current app session. They are not a substitute for Save, and unsaved drafts do not survive an app restart. Deliverables includes a searchable Business documents collection: grant evidence, customer invoices, purchasing orders and evidence, and maintenance files. Preview and download resolve within the owning team; source records remain authoritative. PDF previews render locally with page controls and do not depend on a browser PDF plugin. Markdown, text, images and sandboxed HTML also display in place.

The grants submission portal belongs to a saved application. Company identity and qualifications are reusable; tax notices are beneficiary-scoped; installation documents, invoices, receipts, correction notices and bank evidence are application-scoped. Legacy unscoped installation documents require explicit linking. Portal uploads use the server-validated package for that application. The form presents labelled fields for review; final submission/signatures remain in the visible browser. Supported downloaded evidence attaches to the originating dossier; failed attachment is displayed. A click does not move an application to Submitted.

Preparation runs in bounded batches, and reminders are created once within seven days of a deadline and again if overdue. Recording submission or an award requires a scoped notice; settlement requires bank evidence. These checks validate record structure and provenance, not authenticity or statutory eligibility.

The Electron-owned executor continues independently of the selected view. Isolated crashes reset their retry budget after 60 seconds of healthy execution; rapid crash loops still stop. Company memory uses database change tracking after its initial projection, avoiding full text reindexing on each recall.

Additional regression coverage: `company-audit-regressions.test.mjs`, `mail-authorization.test.mjs`, `company-grants-db.test.mjs`, `company-operational-recovery.test.mjs`, and the company browser fixtures. The 1,000-application fixture validates local import/preparation, isolation, incremental memory and restore. It does not certify live portal compatibility, bank settlement, provider consent or model extraction accuracy; those require an authorized account smoke test.

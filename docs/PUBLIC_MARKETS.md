# Chorus Pro invoicing and public tenders

Two separate French public-sector capabilities. Chorus Pro handles invoices only; tenders come from other sources.

## What the public services allow

Read from the PISTE API catalogue, the Chorus Pro developer pages (archived copies: the community site was in maintenance on 2026-11-19) and the live BOAMP API.

| Need | Source | Access |
| --- | --- | --- |
| Deposit an invoice, read its status | Chorus Pro Factures API on PISTE | OAuth2 client credentials (`scope=openid`) plus a `cpro-account` header: base64 of the technical account `login:password`. All operations are POST. |
| Qualification vs production | `sandbox-oauth.piste.gouv.fr` / `sandbox-api.piste.gouv.fr` vs `oauth.piste.gouv.fr` / `api.piste.gouv.fr` | Separate PISTE applications and separate technical accounts. |
| Find tenders | BOAMP open data (`boamp-datadila.opendatasoft.com`, DILA, Licence Ouverte) | Anonymous, read-only, no key. |
| Deposit a bid | The buyer's own platform (PLACE `marches-publics.gouv.fr`, regional and private platforms) | Signed-in web interface only. No deposit API was found. |
| Candidate declaration (DUME) | DUME APIs on PISTE | Aimed at platform publishers; needs a specific PISTE organisation code. Not integrated. |

Chorus Pro exposes no tender search and no bid submission: its PISTE APIs are invoices, works invoices, structures, users, engagements and cross-cutting lookups.

Onboarding a company must complete itself before API access works: a PISTE account and application with the Chorus Pro API terms accepted; a Chorus Pro account and structure on the qualification portal (`chorus-pro.gouv.fr/qualif`); "Raccordement API" declared with the PISTE application name; a technical account (active about 30 minutes later). Production repeats this with a non-sandbox PISTE application. BonzAI does none of these steps.

## Invoices (billing team)

- Connect in Tools → Chorus Pro: environment (sandbox or production, stored on the connection), PISTE client ID and secret, technical login and password. The secret is encrypted with Electron `safeStorage` in the main process (`company-connector:set-secret`); the renderer can write or delete it, never read it, and it is never placed in a prompt or an invoice record.
- A contract profile with channel "Chorus Pro" must carry the recipient SIRET, service code and a 10-digit engagement number (`billingDomain.js`), and names one connection. The invoice profile and the connection must be in the same environment (`chorusBilling.js`).
- Upload of the PDF (`deposer/pdf`), submission (`soumettre`) and status (`consulter/historique`) are three separate actions. Each write needs a named approver, is journalled before the request, and is never retried: an interrupted request stays "uncertain" until a person checks the portal.
- Status codes are grouped by `src/shared/chorusStatus.js`: deposited, with the public client, action required (`SUSPENDUE`, `A_RECYCLER`), rejected, payment ordered (`MISE_EN_PAIEMENT`). Unmapped codes are shown as received. Chorus Pro reports the payment order, not the bank receipt: payment is still recorded from bank evidence.

There is no standing approval for Chorus Pro deposits; every one is approved individually.

## Public tenders team

Template `public_markets` (roles `TenderAnalyst`, `BidManager`, `DocumentController`, `CFO`, coordinator), skill `skill.local_tenders`, view "Public tenders".

1. **Find notices.** `src/main/connectors/boamp.js` sends keywords, departments and contract type to BOAMP: no credential, cookie or company data, redirects refused. Results are stored only when kept. Each search is written to the audit trail. A search requested by the team needs owner approval.
2. **Prepare.** A kept notice opens a response dossier and queues a drafting task for `BidManager`. The team drafts pieces with `tenders.draftDocument` from company documents and memory. A draft blocks the dossier until a named person marks it reviewed.
3. **Approve.** The approval panel lists the buyer, platform, reference, deadline and every file with its content hash. The stored approval is that exact list; any edit returns the dossier to preparation.
4. **Deposit.** "Export approved files" copies them to a folder. The owner deposits them on the buyer platform, attaches the platform receipt and records its reference. BonzAI never deposits a bid, and the team has no action for review, approval, export, deposit or outcome (`operationalActions.js`).

Records live in `company_tenders_records` (migration `0030`), included in team export and backup.

## Verification

```bash
npm run test:connectors
BONZAI_UI_URL=<local-preview> node --test test/public-tenders.browser.test.mjs
```

Fixtures only: two trimmed real BOAMP records and hand-written Chorus Pro replies. Not verified: any call to PISTE or Chorus Pro with real credentials (qualification included), the Chorus Pro connection form and tender view inside the packaged Electron app, Windows and Linux.

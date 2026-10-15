# BonzAI Company

BonzAI Company is a local-first operating workspace for small businesses. An owner briefs agentic teams through conversation, follows goals and tasks, reviews durable work, and approves actions that affect external systems.

## Product contract

The module must let an owner:

1. create or configure a company and its teams;
2. brief one team or the entire company in chat;
3. see who is responsible, which model is used, and whether it is available locally;
4. follow goals, tasks, decisions, and live progress without translating internal agent state;
5. open every result and deliverable inline, with its rationale and evidence;
6. retain conversation and work history across restarts;
7. connect business systems with explicit permissions and approvals.

The value is completed, inspectable work. Activity counts and status labels are supporting signals, not substitutes for outcomes.

## Workspace navigation

Daily destinations come from the team's workspace blueprint. Maintenance keeps its operational records; purchasing keeps supplier records in Purchasing. Customer Billing is exposed for maintenance and receivables work, not merely because a team handles purchases or financial evidence. Legacy Paperasse blueprints are normalized using the charter template at render time.

Business queues (Pipeline, Production, Catalog, Casework, and other template sections) use the existing durable task lifecycle. Queue membership is stored as an issue label, `workspace:<channel-key>`. Creating a task in a queue assigns that label; the task selector can move existing work without changing its execution checkpoint. Backlog remains the complete team task list, including uncategorized agent-created work. These queues are task views, not independent CRM, inventory, or legal-record databases.

Every workspace exposes Getting started without changing its operational landing page. `gettingStarted.js` supplies ordered guidance by workspace profile, business-specific FAQs and Paperasse deliverable checklists. `CompanyGettingStarted.vue` translates and searches the help text and opens destinations through the shared workspace router. Keep guidance aligned with actual capabilities: preparing an output is not evidence of sending, filing or payment. Custom teams use the common Mission → Chat → Backlog path.

## Workflow production teams

Installed workflows (including custom imports) appear in **Smart Workflows → New workflow**, grouped by their outcomes: maintenance, purchasing, sales, billing, grants, accounting, compliance, property, media, wellness, markets, research, collectibles, and custom workflows. The searchable catalog previews each template’s deliverables and responsibilities before setup. Roleplay remains in Smart Agents alongside agent creation. `workflowTeams.js` builds presets from the available catalog; disabled workflows are excluded and existing workflow IDs and generation histories are preserved.

A workflow team's blueprint stores `executionWorkflowId`. **Workflow** is its default landing view, with one outcome-specific heading, a task queue and an assigned worker. Opening an interactive task brings its native controls into focus; its task list remains expandable. The workspace owns scrolling, including embedded workflow interfaces. New tasks use `CompanyWorkflowTask`: locally executable workflows enter the execution and approval queue; interactive workflows open their existing specialized interface. Generated results save automatically and require explicit review. Pending tasks resume after navigation or restart. Creation itself does not generate sample outputs or queue invented work.

Legacy workflow navigation resolves an existing production team or opens its setup wizard. It does not silently create duplicate teams. Company task handoffs preserve company and issue identity. Agents remain able to use the entire available workflow catalog; a team's default workflow is a workspace entry point, not an agent capability restriction.

## Information model

```text
Company
  -> Teams
     -> Members and models
     -> Goals
        -> Tasks
           -> Events, decisions, and evidence
           -> Artifacts and deliverables
  -> Connectors, policies, and approvals
  -> Company-wide room and activity feed
```

Goals explain the business outcome and success criteria. Tasks represent accountable units of work. Events preserve progress and decisions. Artifacts are durable files, reports, structured results, or external references that the owner can reopen later.

## Team harness

Each team is a logical execution boundary: its charter supplies the mission, staffed roles, assigned workflows, memory policy, budgets and approval rules. Its SQLite records hold goals, task plans, approvals, results and run history. Existing code and IPC use `companyId` for this team boundary; the All Teams room is the shared owner-facing view.

`src/services/company/harness.js` is the common entry point for scheduled work and approval continuation. It snapshots the charter, fingerprints its operative configuration and acquires the team's renewable execution lease. Runs record the team, configuration revision and run ID; task plans additionally bind the acting role and agent. Renaming a team does not invalidate its work. Changing its mission, staffing, permissions, memory policy or execution settings stops continuation under the previous configuration.

Before the next step, after asynchronous policy checks, and after writing the pre-dispatch checkpoint, execution verifies that the team is still active, its configuration matches and its run still owns the lease. Stopping one harness does not stop another team's run. An action already submitted may still return a receipt; interruption prevents subsequent steps and retains those results. Late completions cannot overwrite a replacement run's state.

The owner can use **Resume task** after resolving pending approvals or uncertain outcomes. Resumption retains completed steps and the previous harness identity, then binds the remaining work to the current configuration and checks its permissions again. Changed configurations cannot consume old pending approvals: reject and review them first. Uncertain effects still require evidence before any retry.

Teams exchange addressed requests and replies through the team communication service. The receiving team owns its resulting task and applies its own policies. Membership labels identify both the agent and its team; an exchange does not grant access to the other team's private memory or connectors.

New tasks use `src/services/company/agentLoop.js`: the model chooses one tool, observes its saved output, and decides again. It can ask the owner, wait for another team's reply, correct an input that demonstrably caused no effect, or report a result with step references. Each slice permits 12 decisions; a task permits 80 decisions and 60 tool steps before owner review. Complete receipts stay in SQLite; observations sent to the model are bounded. A completion requires recorded results. A cross-team request additionally requires a reply and completion of the receiving task; an acknowledgement is insufficient. These checks verify execution evidence, not the factual quality of arbitrary model-written prose.

Owner questions are answered inline in Chat or Backlog. Waiting releases the model and execution lease. New work, owner answers, replies and recipient completion wake role execution without waiting for the periodic heartbeat. Approval continuation uses the same loop and never repeats completed effects. Unknown external outcomes still require owner evidence. Superseded input errors remain recorded, and corrections receive fresh policy checks and approvals.

Electron main supervises a hidden local executor (`src/main/companyRuntime.js`, `company-runtime.html`). It reuses the native BonzAI dispatcher and existing workflow adapters independently of the visible workspace. Main validates command senders and forwards progress to the UI. A confirmed executor crash releases only that executor's leases and makes uncertain work reviewable; restart is bounded to three attempts. The app must remain running. Closing the visible window on macOS leaves the runtime available; quitting BonzAI stops it. After upgrading these IPC paths, restart the application once.

Model processes and generation services remain shared device infrastructure. Team prompts do not inherit ordinary chat history or the roleplay system prompt. Starting a team cannot overwrite the shared inference pool's memory budget. If its assigned model is unavailable or busy, the task stops rather than silently using a different model. A team harness is not a dedicated model process or OS sandbox. The separate **Harness** integration view configures optional OpenClaw/Hermes integrations; company execution uses BonzAI's own loop. Device-wide admission and per-team resource accounting remain distinct from these execution guards.

GMAO opens on **Today**. Daily operations sit on the left: Today, Schedule, Work orders, Clients, Billing, Inbox, Deliverables and Operations settings. The right-hand team group always provides **Team, Mission, Backlog, Chat, Activity, Tools and Team settings**. Team manages members and workflow assignments; Mission edits the coordinator’s master objective and standing instructions without changing staffing or execution policy. Backlog contains tasks and outcomes with persisted workflow progress. Chat accepts instructions and owner answers and includes shared team conversations with member/team attribution and inline replies. Activity shows persisted events and live member streams, with member and event filters. Other business profiles retain the same team group without maintenance pages. Legacy Requests, Work and Other teams links still resolve to their corresponding views.

Operations settings contains equipment, preventive plans, access and compliance, on-call shifts, rates, suppliers and subcontractors. Categories sit beside their records under one page title. Tools and Team settings open directly from the team command bar; Team settings presents one editable section at a time and preserves drafts between sections. Tools supports catalog search and shows provider records once a financial connection exists. Client scope follows the operator between daily pages and survives visits to team views. Clients always shows the complete directory and can open a client-specific cockpit; Parts requests is a direct operational destination alongside Work orders and Clients. Inbox presents one searchable review queue beside the selected item. Approval, document and message filters preserve each item’s existing approval requirements and sent-message history. Approvals and rejections save inline; failed decisions retain their item and rejection reason. Document and message actions reuse the existing review forms. Deliverables provides a searchable file list and a full preview with Markdown tables, lists and escaped, highlighted code. Generated HTML is displayed as text; remote Markdown images require deliberate opening. Device-wide language-model telemetry distinguishes loading, loaded models and active requests; unavailable telemetry is never shown as idle. Chat and Backlog show approval, owner/team waits, verification and saved results. A legacy done flag without completion evidence is visibly unverified. Restored teams stay paused and require review before execution resumes.

Execution belongs to the main-supervised hidden runtime, with background throttling disabled, rather than any view. App startup and Company mounting share one store initialization; changing views or switching the selected team does not stop schedulers or stream subscriptions. Active teams continue while BonzAI is open, subject to explicit pauses, approval waits and available resources. The runtime-host and store-lifecycle tests cover visible-renderer replacement, concurrent startup and updates from multiple teams without a mounted team view.

Team recall uses the same local memory graph as the rest of BonzAI (`scope: team`, `company-<id>` and optional role identity). `src/main/db/repos/companyMemory.js` projects durable business records into source-attributed, searchable notes before memory load, recall, and export. This includes goals, task checkpoints and answers, approvals, audit events, deliverables, financial receipts, GMAO records, and explicitly shared team messages. Existing history is backfilled; changed records replace their current projection, while recorded events remain historical evidence. Long records are chunked for recall and media remain in local artifact storage. Credentials, binary payloads, and inference reasoning are excluded from the projection. Retrieval includes older records beyond the former 500-note window and supplies a bounded context to each native-loop decision, including continuations. Recalled data never grants authority to bypass approvals. Disabling team memory disables recall; operational records remain durable.

Projection writes are transactional and protected from stale renderer memory snapshots. Team and role memory identities are both included in export and remapped/validated during restore. Unrelated teams' memory stays excluded. Audit append failures surface as errors instead of reporting a successful write. Display boundaries filter complete and unfinished reasoning blocks from team messages, activity streams, and deliverable previews, including historical records.

When improving a team, change its charter, role prompts or assigned workflows and validate a representative business task through the same dispatcher, approvals and persistence path. In-flight work must not acquire new permissions merely because configuration was edited.

## Conversation model

- A team room contains the owner and the companions assigned to that team.
- The All Teams room is the company-wide operating chat. Team tags identify responsibility and origin.
- Chat messages can reference goals, tasks, approvals, and artifacts directly.
- Completed work must surface in the chat where it was requested and remain accessible from its goal and task records.
- Chat history and task memory load from local persistence and survive application restarts.
- Missing required models block execution and present a prominent download action.

## Connectors and approvals

Connector definitions live in `src/config/companyConnectors.js`; execution and policy logic live under `src/services/company/`. The catalog should represent common SMB accounting, payments, commerce, CRM, communications, and productivity systems. Sage remains a supported first-class accounting connector.

Connector access follows least privilege:

- credentials remain in secure local storage;
- read and write capabilities are declared separately;
- external writes, financial actions, publishing, and destructive operations require explicit owner approval;
- every execution records actor, intent, target, result, and relevant evidence in the audit log;
- connector failures are visible and actionable, never silently converted into success.

## Local persistence

Company records are stored locally in SQLite through `src/main/db/`. Schema changes use numbered migrations and repository methods; the migration files are the source of truth. Do not store company memory solely in renderer state or chat text.

### Billing, purchasing and contract maintenance

Migrations `0020`–`0023` add company-scoped billing, contract-control evidence and purchasing records. `src/shared/companyOperations.js` is the explicit IPC allowlist; `operationalActions.js` and `operationalToolInputs.js` expose the corresponding typed tools to staffed business roles. Existing charters receive the local tools once without replacing their policies or restoring subsequently revoked skills.

- **Billing** is a direct operational destination. Ordinary service invoices can be prepared without inventing maintenance work orders. Contract invoices retain work-order/service-acceptance checks, admitted amounts, contract profiles, period controls, advance deductions and notified index revisions. Draft edits recalculate cents; validated invoice content and numbering are locked. Submission, acceptance, partial payment and payment are separate evidence-backed states. Customer records, signed subcontracting dossiers and retained PDFs are available in the same view.
- **Chorus Pro** uses PISTE OAuth and the published Factures API from Electron main. Credentials use the existing encrypted connector store. A frozen invoice profile binds the sandbox or production environment, connector, supplier identity, VAT regime and billing frame. PDF upload is separate from final invoice submission. Each write is journalled before dispatch, keeps its response as a local attachment, and blocks replay after an uncertain result. An external status such as `MISE_EN_PAIEMENT` does not record money received. SUBCLIC remains an explicit portal handoff with exported documents, signatures and acceptance receipts; there is no claimed automatic SUBCLIC integration.
- **Purchasing** has its own workspace and team. It handles catalogue items, supplier contacts, technical confirmation, quotations, named approval/deputy policy, numbered purchase orders, partial receipts, stock reservations, invoice matching and verified settlement records. Tool custody, equipment defects, historical imports, DPGF line coverage and due review tasks share the same evidence model. Owner-approved RFQs use the existing email/WhatsApp connectors; provider acceptance is distinct from delivery or a supplier reply. Ambiguous outcomes require reconciliation before retry. Optional Brave Search adds owner-approved public supplier searches for the Purchasing Manager. The exact query leaves the device only after approval; source URLs, titles and snippets are retained as unverified local evidence in Deliverables. A search neither verifies stock/prices nor creates or contacts suppliers. Local requests create an idempotent purchasing task. A matched supplier invoice can create a linked finance preparation dossier and task; missing bank details remain explicit. Purchasing does not initiate a bank transfer. Supplier replies are recorded with their actual correspondence; background mailbox polling is not implemented.
- **Contract controls** are optional validated site profiles. They include personnel/vehicle access, safety documents, annual programmes, approved rescheduling and shutdowns, regulatory plans, visit evidence, signatures, report deadlines and equipment history. Periodic reports create persisted preparation tasks; their approved messaging receipts satisfy the corresponding report obligation. XFA fallback pages are flagged for human review and their originals retained. Inventory and gamme importers preserve source context, quantities and condition-based frequencies.

Parts are linked to customer invoice lines by procurement ID and a stable line key. Saving and validating an invoice checks work-order ownership, contract-included treatment and quantities already allocated to other invoices. Linked part quantities/descriptions cannot be silently rewritten. Shared purchasing retains supplier-invoice evidence in the originating work-order history; restored teams display archived evidence without reviving the live route.

Work orders, customer invoices and supplier invoices expose the same record follow-up controls. Email can attach a generated work-order/customer-invoice PDF or an uploaded original supplier invoice; SMS carries the reviewed text/reference, not a PDF or a public link. Preparation freezes the record version and attachment. Sending requires explicit confirmation; stale drafts, interrupted attempts and uncertain receipts cannot be blindly replayed. Provider acceptance, confirmed delivery, invoice acceptance and settlement remain separate states. The `records.*` native harness tools use the same APIs and approval rules.

Per-record reminder policies create a single open Backlog task after a configured number of days without a status change. Electron checks active teams every minute, independently of the displayed view. Status changes restart the interval; completed/paid/cancelled records stop reminders. Reminders never send automatically. Backlog tasks link directly to the relevant work order or invoice. Communication journals, PDFs and reminder policies participate in memory and backup; restored reminders are disabled until reviewed.

The supplied gas sheet's ST3/ST04 and €300/€350 discrepancies remain explicit validation points. Other ST1/ST2/ESP pricing uses a versioned profile, explicit equipment category and capped eight-hour labour deduction. The conflicting ST2 €100 branches, lifting treatment, report cadence and purchasing approval thresholds require documented decisions; models cannot silently resolve them.

These records and attached blobs participate in team memory and full backup. Restores remap local references, preserve immutable receipts, remove live purchasing handoff routes and keep the team paused. Financial and supplier actions still require owner approval through the native harness; demo mode never sends them. Approval and uncertain-outcome screens link to the exact invoice or supplier request and flag revisions changed since the approval was requested.

Focused verification:

```bash
node --test test/company-billing.test.mjs test/company-purchasing.test.mjs test/gmao-maintenance.test.mjs test/maintenance-rules.test.mjs test/contract-pricing.test.mjs test/company-operational-actions.test.mjs test/company-operational-recovery.test.mjs test/operational-backup-maintenance.test.mjs test/chorus-connector.test.mjs test/chorus-billing.test.mjs test/company-approval-record.test.mjs test/supplier-sourcing.test.mjs test/company-supplier-sourcing.test.mjs test/company-record-followup.test.mjs
BONZAI_UI_URL=http://127.0.0.1:5187 node --test test/company-billing.browser.test.mjs test/company-purchasing.browser.test.mjs test/gmao-maintenance.browser.test.mjs test/company-inbox.browser.test.mjs test/company-record-flow.browser.test.mjs
```

Fixtures use isolated SQLite databases, fake connector responses and synthetic browser records. They do not prove production PISTE authorization, supplier delivery or contract acceptance; run those account-specific checks with test recipients and explicit approval before operational rollout. Restart Electron after changing these main-process IPC handlers.

Artifacts must have stable identifiers, metadata, provenance, and a resolvable local location. Removing a message must not silently delete a retained business deliverable.

## Main implementation paths

| Path | Responsibility |
| --- | --- |
| `src/components/Company.vue` | Company module shell |
| `src/components/company/` | Rooms, dashboard, intake, connectors, and artifact preview |
| `src/stores/companyStore.js` | Renderer state and orchestration |
| `src/services/company.service.js` | Company service boundary |
| `src/services/company/` | Goals, dispatch, connectors, governance, audit, and streams |
| `src/main/db/` | Durable schema, migrations, and repositories |
| `src/config/companyConnectors.js` | Connector catalog and capabilities |

## Verification

At minimum, company changes should verify:

```bash
npm run test:company
npm run build:vite
```

Also exercise persistence across restart, model-missing behavior, approval-required connector actions, multi-team chat routing, artifact reopening, and large chat histories when those areas change.

## Durable task execution

Each task stores an ordered, versioned execution plan in SQLite (`0016_company_execution.sql`). Steps are checkpointed before dispatch and after their result. Completed steps are skipped on continuation. A later action can consume a prior structured result with `{ "$ref": "stepId.field" }`; unresolved fields block execution instead of inventing identifiers. Dependent tasks remain unavailable until their prerequisite is done. Role inheritance selects the staffing agent without changing the task's logical queue or permissions.

Approval requests reference the exact task, step and resolved inputs. Approval resumes the saved plan under an exclusive renewable company lease. Rejection blocks the task. A crash during an effect, or between approval and dispatch, requires outcome review; uncertain effects are never replayed automatically. The task's **Review outcome** control records the owner's evidence as a retained artifact. Confirming that nothing occurred allows a fresh attempt and fresh external approval. Company pause prevents subsequent steps.

A task is done only after every step has a recorded result. Cancelled tasks do not complete goals. Unsupported handlers, simulations, empty acknowledgements, pending payments and missing interactive input remain incomplete. Generated reports and company artifacts are local drafts. Email and SMS submission receipts do not claim delivery. Payment and refund receipts require owner verification and ledger reconciliation; the local treasury is a recorded ledger, not a bank-balance feed.

The goal rollup verifies completion of its recorded tasks, not the commercial success or semantic quality of their outputs. Owners must review deliverables against the intended business outcome.

## Smart Workflows discovery and results

The access introduction previews the actual installed workflow catalog before checkout: categories, search, expected inputs, saved outputs, requirements and current limitations. Maintenance, purchasing, billing and grants appear alongside creation, wellness, research and other personal workflows. Previewing a template never starts payment, downloads or generation. Existing payment recovery, read-only access and the temporary Skip path remain available. The displayed unlock is 1 ETH; the current test charge remains 1 USDC (wallet) or US$1 (card).

Personal workflow setup asks for an optional workspace name and a worker, without company identification fields. Operational templates retain their relevant business context. New interactive workflow teams start with one assigned coordinator; existing team staffing is preserved. My workflows provides searchable cards with real task, review and saved-file counts. Shared operational brief controls do not send generic business goals to personal workflows.

Personal workflow navigation is **Workflow → Review → Results → Getting started**. Review combines explicit execution permissions and task results awaiting approval; it does not include unstarted briefs or unrelated business intake. Opening a result returns to the exact task and saved result version without approving it. Operational teams retain Inbox and their domain queues. Native workflow teams omit the Mission and Chat goal-planning controls because their runner waits for explicit tasks; old links resolve to Workflow. Worker, task, activity, tool and settings controls remain available.

Results opens **Creations & files** for every team, including outputs not yet approved. Users can search and filter text, images, audio, video and other files, preview them, open their originating task or download the real binary media. **Task history** remains separate; **Documents & records** appears only for operational teams. A failed catalog read shows a retry state and retains previously loaded results. Missing or unsupported media shows a preview error with retry/download options. No placeholder result is counted as a completed output.

## Smart-agent workflow tasks

Installed workflows are available to every agent. Workflow templates create focused Smart Workflows teams; they do not grant new permissions or require specialist tokens. Each requested task retains its team, worker and execution context. Workflow teams wait for explicit production requests rather than inventing unrelated business goals.

Headless tasks use model preflight, generation coordination and durable outputs. Mixed results save usable artifacts but remain blocked with the actual failure details. Media is stored as separate local blobs, not embedded in a JSON report. External market-data access and other external effects keep their existing approval boundaries.

Interactive tasks open their native production interface. Completion events automatically normalize script, audio, images, video and other evidence into local task results. `saveWorkflowResult` atomically saves the catalog records and marks the task ready for review. The owner previews the exact saved content IDs and explicitly approves them; generation alone cannot complete the task.

A scoped local recovery manifest (`workflowResultRecovery.v1.*`) backs up media before attempting the task save. Reopening the same task replays only pending saves, never generation or approval. An old desktop bridge blocks new tasks before generation; an already-running task can preserve its result for recovery after an update. Backup activity disables review of earlier outputs. Replaying an already-saved source after approval only acknowledges the existing records and cannot reopen or replace the approved result.

Meditation uses its assigned worker's model for an isolated script request. Script budgets cover 30 seconds–15 minutes; incomplete or badly sized text gets a bounded rewrite. Narration is mandatory. The audio endpoint measures narrated chunks and adds breathing pauses; export measures the actual WAV and preserves the closing speech even if it exceeds the requested length. Older unpaced sessions retain their measured length. Stored sessions can be deliberately reused for a task, while merely browsing history never attaches a result. Exported video is captured back into the task. Missing artwork is explicit and can be retried independently without regenerating the script or narration. Video export requires a readable image. Current Kokoro voices remain English/British; multilingual timing validation is not multilingual speech support.

Focused regressions:

```bash
node --test test/company-workflow-recovery.test.mjs test/company-workflow-results.test.mjs test/company-workflow-results-persistence.test.mjs test/company-workflow-execution-results.test.mjs test/workflow-skill-outcomes.test.mjs test/meditation-timing.test.mjs
python3 test/test_meditation_timing.py
BONZAI_UI_URL=http://127.0.0.1:5279 node --test test/company-workflow-results.browser.test.mjs test/meditation-outcome.browser.test.mjs test/workflow-approval.browser.test.mjs
```

Browser fixtures mock desktop APIs and inference; the timing suite additionally runs real FFmpeg against synthetic narration. These checks do not certify live model quality or live brokerage/streaming connectivity.

## Backup and restore

Version 2 backups read the current SQLite repositories in one snapshot: charter, goals, tasks and attempts, approvals, ledger, artifacts, audit, public connector metadata, human roster, maintenance records, scheduling history and company memory. Referenced binary attachments are included and checksum-validated. Export reports missing attachments explicitly. Credentials are excluded.

Restore creates a separate company, remaps linked records, validates company scope and foreign references, and commits transactionally. It never overwrites an existing company. Restored companies are paused, connector authentication must be renewed, prior approvals expire, and interrupted steps require review. Legacy version 1 bundles are rejected because they lack the current task database; export a fresh backup from the original company.

## Validated business workflow

`npm run test:company` includes an isolated Electron/SQLite integration test using the production repositories and dispatcher: maintenance evidence → owner-approved service acceptance → invoice draft calculated from its quote. It verifies exact result passing, inherited staffing, approval continuation, cancellation, interrupted-effect review, exclusive leases, complete backup/paused restore, attachment integrity and cross-company isolation. No email, payment, live connector or model inference is performed by this fixture.

Renderer verification: `BONZAI_UI_URL=http://127.0.0.1:5179 node --test test/ownership-workspace.browser.test.mjs`. It uses isolated fixtures and blocks external requests.

## Audit fonctionnel et UX — 30 septembre 2026

Périmètre : équipes agentiques, constitution des équipes, rôles/workflows, objectifs et tâches, exécution/approbations/reprise, connecteurs, sauvegarde, et parcours HVAC/GMAO du client à la facturation. Lecture des interfaces et des services jusqu'aux dépôts SQLite ; vérifications ciblées sur une base en mémoire utilisant les migrations et dépôts de production ; inspection du composant GMAO avec données isolées en thèmes clair/sombre à 1440, 700 et 390 px. Les inspections de composant ne constituent pas une recette complète de l'application Electron.

**Conclusion de l’audit avant corrections : socle utile, mais pas encore prêt pour une exploitation PME ni pour une démo présentée comme un cycle OI entièrement exécuté.** La persistance et les approbations génériques sont sensiblement plus avancées que leur raccordement à la GMAO. Les principaux risques sont les états métier affirmés sans preuve, le cloisonnement des données, les envois absents, et la fragmentation du dossier entre vues/équipes.

Objectif communiqué : démo OI le **mercredi 7 octobre 2026**, avec **envois réels vers des destinataires de test**. Aucun message, achat, paiement ou publication n'a été effectué pendant l'audit. Les comptes fournisseur et la livraison réelle restent à valider.

### Fonctionnement actuel

1. L'utilisateur crée un espace depuis une conversation ou un modèle métier. L'interface appelle cet espace une équipe, mais il possède un `companyId`, une charte, ses propres rôles, connecteurs, objectifs et données.
2. Un brief devient un objectif et des tâches. Le coordinateur peut aussi proposer des objectifs lors de ses cycles périodiques. Le rôle attribué détermine l’agent, ses permissions et son modèle ; les workflows installés restent accessibles à tous les agents.
3. Le modèle propose un plan d'actions typées. Le moteur sauvegarde les étapes, résout les références aux résultats antérieurs, applique les permissions et suspend les effets soumis à approbation.
4. Une étape exécutée conserve son résultat ; une interruption dont l'effet est incertain demande une vérification humaine avant reprise. Les workflows interactifs ouvrent leur espace de production, enregistrent automatiquement les résultats et demandent leur validation.
5. Les données GMAO vivent dans des tables spécialisées : sites, équipements, gammes, OI/OT, visites, achats, devis, service fait, factures et documents. Leur interface appelle souvent directement ces dépôts, sans emprunter le circuit des tâches agentiques.
6. La vue Toutes les équipes agrège les activités et peut créer le même objectif dans plusieurs espaces. Elle ne constitue pas un mécanisme de transmission et d'accusé de réception entre GMAO et Achats.
7. Le planificateur s’exécute dans un moteur local supervisé par Electron, indépendant de la vue affichée, tant que BonzAI tourne. Les sauvegardes incluent les tables GMAO et les blobs reconnus ; les restaurations sont mises en pause, les connecteurs demandent une réauthentification et les anciennes autorisations ne sont pas rejouées.

### Points solides à conserver

- SQLite, migrations et journaux durables ; sauvegarde/restauration testée sur les dépôts réels.
- Plans d'exécution versionnés, résultats référencés, étapes déjà terminées non rejouées, dépendances de tâches et verrou d'exécution renouvelé.
- Approbation liée à l'action exacte, pas seulement au nom de l'agent ; les effets externes génériques restent soumis à approbation.
- Résultat incertain distinct du succès ; contrôle des handlers non implémentés, des simulations et des simples accusés de lancement.
- Workflows des smart agents réutilisés ; fichiers et livrables conservés localement ; accès local utile sans wallet.
- Objets métier GMAO déjà nombreux : inutile de repartir de zéro ou de remplacer ces objets par de simples conversations.

### Constats prioritaires

Les mentions « reproduit » décrivent des essais sur des données synthétiques isolées. Les autres constats viennent de la lecture du code et des interfaces. Les priorités ci-dessous sont des critères de préparation de la démo, pas une certification de sécurité.

| Réf. | Priorité | Constat et impact | Correction attendue |
| --- | --- | --- | --- |
| A01 | Bloquant | **Cloisonnement incomplet, reproduit.** `saveProcurement` vérifie l'existence dans l'espace appelant puis fait un `ON CONFLICT(id)` sans restriction d'espace. Avec l'identifiant d'un achat de A, B peut changer sa description et son état. `createQuote` accepte aussi une référence d'achat d'un autre espace. | Vérifier l'appartenance de chaque identifiant parent/enfant avant toute écriture ; rejeter une mise à jour visant un autre espace ; définir explicitement le partage autorisé entre équipes d'une même entreprise. Tests négatifs sur toutes les écritures GMAO. |
| A02 | Bloquant | **Progression métier non fiable, reproduit.** `createWorkOrder` accepte directement `status: completed` sans service fait. `field.completeJob` utilise `advanceTo` pour fabriquer successivement réception, affectation, acquittement, trajet, présence et rétablissement, même sans preuve terrain. L'approbation du moteur ne prouve pas que ces faits ont eu lieu. | Création limitée aux états initiaux ; transitions explicites et vérifiables ; arrivée, diagnostic, réparation, service fait et clôture ne peuvent pas être déduits du simple succès d'une fonction. |
| A03 | Bloquant | **Envoi GMAO confondu avec saisie locale, reproduit.** Un devis devient « envoyé » et crée une notification `sent` même sans destinataire. `sendInvoice` appelle `saveGmaoInvoice`, pas un transport. « Marquer envoyée » est une déclaration manuelle. | Outbox durable liée à l'OI et au document : brouillon → validation → soumission fournisseur → livraison/échec. Conserver le reçu fournisseur ; distinguer une déclaration manuelle de l'envoi BonzAI. |
| A04 | Bloquant pour la démo email/SMS | **Connecteurs présents, chaîne incomplète.** SendGrid et Twilio ont des handlers réels, mais la notification GMAO n'y est pas raccordée. Le payload email actuel ne contient pas de pièces jointes. Le devis GMAO est un enregistrement de calcul, sans génération PDF raccordée au parcours. | Produire une version consultable du devis/OI, faire valider destinataire et contenu, joindre le PDF à l'email ; envoyer un résumé SMS et, si nécessaire, un lien explicitement autorisé. Vérifier réception sur les deux canaux de test. |
| A05 | Prioritaire | **Pas de véritable dimension client.** Le snapshot charge un contrat/contact par espace et agrège ses sites. Le cockpit n'a aucun filtre client. Créer une équipe par client multiplierait modèles, connecteurs et configurations. | Une entreprise, ses équipes, puis clients → contrats → sites → équipements → OI. Cockpit « Tous les clients » ou client choisi, conservant ce contexte dans les vues. |
| A06 | Prioritaire | **Pas de calendrier de maintenance.** Le préventif présente des gammes et une barre réalisée/planifiée. Il manque une vue semaine/mois, les créneaux, durées, conflits et charges techniciens. | Agenda des occurrences prévues et des OI planifiées ; filtres client/site/technicien ; couleurs d'avancement avec libellés et icônes ; replanification tracée. |
| A07 | Prioritaire | **Génération du préventif incorrecte, reproduit.** Une gamme ST1 réservée aux splits s'applique à tous les équipements ST1, y compris groupes froids ; les OI produites n'ont pas de `scheduledAt`. Le générateur colore selon la parité de l'année, tandis que l'interface et les visites utilisent le semestre. La clôture remet systématiquement la prochaine visite à six mois. | Filtrer le type exact, l'équipement actif et le périmètre ; séparer échéance et rendez-vous ; respecter la périodicité réelle ; unifier les campagnes et ne pas les confondre avec les couleurs de statut. |
| A08 | Prioritaire | **Dossier OI fragmenté.** Les relations existent en base, mais le numéro d'OI n'ouvre pas un dossier. Les alertes ouvrent la liste entière ; devis, achats, documents et événements sont dispersés. Les lignes de documents n'offrent pas d'ouverture du fichier. | Une fiche OI stable, accessible en un clic depuis partout : synthèse, prochaine action, planning, visites, devis, achats, communications et pièces. Liens directs aux documents et retour conservant les filtres. |
| A09 | Prioritaire | **Achats partiels.** Il existe une demande liée à l'OI, mais pas un espace Achats complet : fournisseur saisi en texte libre, pas de catalogue structuré ni de lignes/quantités/réceptions partielles. Les statuts d'achat ne sont pas validés par une machine de transitions. Dans le circuit avec devis, le BC client suffit à autoriser la reprogrammation, sans vérifier la réception des pièces. | Demande → consultation/proforma → validation → commande fournisseur → réception → disponibilité pour intervention. Fournisseur et lignes persistants ; rattachement OI obligatoire ; coût prévu/réel et quantité reçue. |
| A10 | Prioritaire | **Toutes les équipes diffuse, mais ne coordonne pas.** Chaque équipe affichée est un espace indépendant. Un brief global crée plusieurs objectifs ; aucune transmission GMAO → Achats avec responsable, attente, accusé de réception et retour de résultat n'est implémentée. | Dossier partagé au niveau entreprise et demande interéquipe persistante, identifiée et idempotente. L'équipe Achats traite une demande unique ; GMAO reçoit son résultat sans recopier l'OI. |
| A11 | Prioritaire | **Contexte métier insuffisant pour les agents.** Le planificateur reçoit charte, tâche, résultats prérequis et mémoire ; les manifests GMAO exposent surtout des mutations, pas une recherche explicite des sites/OI/devis par référence métier. Une demande naturelle peut nécessiter des UUID que l'utilisateur ne connaît pas. | Outils de lecture/recherche déterministes et dossier contextuel actualisé. Résoudre les références avant de demander un plan, demander une clarification si plusieurs OI correspondent, ne jamais inventer un identifiant. |
| A12 | Prioritaire | **Validation documentaire trompeuse, reproduit.** Une proforma peut être acceptée avec `result: null`. `applyDocumentIntake` applique seulement les OI, BC et services faits ; les autres catégories sont néanmoins marquées acceptées. L'UI ne permet pas de corriger les champs extraits ni le rattachement avant validation. | Aperçu du document et formulaire de correction ; séparer « document vérifié » et « opération appliquée ». Chaque type doit produire sa vraie écriture métier ou signaler qu'il reste à traiter. |
| A13 | Prioritaire | **Indicateurs trop rassurants.** Sans document de conformité, le snapshot renvoie 100 %. L'état initial des équipements est présenté comme un score de santé. Les KPI OI sont calculés sur les 500 dernières lignes sans indicateur de troncature. | États « Non évalué » et « Données incomplètes », périmètre et date visibles ; agrégations SQL complètes distinctes de la pagination ; aucune note de santé présentée comme une probabilité mesurée. |
| A14 | Prioritaire pour l'exploitation | **Automatisation dépendante du poste.** Les timers d’équipes résident dans un moteur local supervisé ; la fermeture de la vue seule ne les arrête pas. Fermer l'application ou suspendre le poste interrompt l'exécution ; les contrôles GMAO ne constituent pas un service autonome de notification. | Afficher la prochaine exécution et l'état réel du moteur ; rattrapage explicite au retour. Définir le poste de démo toujours disponible, puis décider séparément du mode d'exploitation permanent. |
| A15 | UX | **Approbations techniques.** Le propriétaire voit le nom de l'action, la classe, les identifiants et le JSON. Des approbations en masse existent. Cela rend difficile de comprendre « qui reçoit quoi, pour quel montant, à propos de quelle OI ». | Résumé métier et aperçu final ; contenu technique dans un détail secondaire. Pour envois/achats, approuver la cible, le document/version, le montant et l'effet. Une correction doit invalider l'ancienne autorisation. |
| A16 | UX / terrain | **Saisie terrain encore administrative.** Planning par nom libre ; photos comme références texte ; signature stockée comme champ, sans parcours mobile dédié vérifié. Une fiche de personnel n'est pas un compte technicien avec droits propres. | Parcours technicien centré sur ses interventions : arrivée, photos réelles, mesures, pièces utilisées, signature, compte-rendu. Contrôles de droits, gestion des conflits et retour hors ligne à définir avant usage collectif. |
| A17 | UX / données | **Données de marché prédéfinies hors mode démo.** Le bootstrap remplit un marché, titulaire, territoire, dates, TVA et sites de référence précis. Cela peut apparaître comme les données de la PME et fausser son cockpit. | Réserver ce jeu au mode démo explicite. Un nouvel espace opérationnel commence avec ses propres clients/contrats ; valeurs et SLA métier à confirmer dans l'onboarding. |
| A18 | UX | **Trop d'interfaces pour une même action.** Navigation d'équipe, canaux, sept vues GMAO, panneaux et `window.prompt/confirm` ; vocabulaire anglais/français, OT/OI, équipes/companies. Sur 390 px, les six KPI s'empilent avant les actions métier. | Langue cohérente, OI comme terme principal, détails avancés secondaires, prochaine action immédiatement accessible. Garder quatre destinations principales et une fiche dossier commune. |

Références d'implémentation principales :

- `src/main/db/repos/gmao.js` : bootstrap (35), snapshot/KPI (155), création OI (366), transitions (463), achats (608), notifications (651), devis (832/897), factures (961), préventif (1048), validation documentaire (1158).
- `src/services/company/gmao.js` : exécution des actions locales (143), progression automatique terrain (`advanceTo`, fin du fichier).
- `src/components/company/CompanyGmao.vue` : cockpit, liste OI, préventif, documents/finance, et gestionnaires d'envoi.
- `src/components/company/CompanyAllTeamsRoom.vue` : `submit`, création d'un objectif par équipe cible.
- `src/services/company/dispatcher.js` et `skillManifests.js` : contexte, plans et actions accessibles aux agents.
- `src/services/company/connectorExecutors.js` : SendGrid/Twilio et limites des payloads.
- `src/components/company/CompanyDashboard.vue` : approbations JSON ; `heartbeat.js` : planification dans le moteur local supervisé.
- `src/main/db/repos/companyPortability.js` : sauvegarde, remappage, pause et invalidation des autorisations à la restauration.

### Expérience PME recommandée

Quatre entrées principales : **Aujourd'hui**, **Interventions**, **Planning**, **Clients**. Les achats, documents et communications doivent rester accessibles depuis le dossier concerné. Les réglages d'agents, modèles et connecteurs appartiennent aux paramètres, pas au parcours quotidien du responsable d'exploitation.

- **Aujourd'hui** répond à « que dois-je décider ou débloquer ? » : OI à planifier, retards, pièces attendues, devis à valider, service fait manquant. Chaque ligne précise client, site, responsable, échéance et prochaine action.
- **Cockpit client** conserve les mêmes indicateurs, filtrés, avec ses contacts, sites, contrats et historique. Les zéros ne valent pas une preuve de conformité.
- **Planning** distingue créneaux confirmés, échéances préventives et interventions non affectées. Proposition de couleurs : gris à planifier, bleu planifié, violet en cours, orange bloqué, vert terminé, rouge en retard ; texte/icône toujours présents. La couleur de campagne reste une information séparée.
- **Fiche OI** sert de point d'entrée universel. Résumé lisible en haut, une action principale, fil chronologique factuel, devis et pièces ouvrables. Un email, une proforma ou une demande d'achat ne crée pas un deuxième dossier parallèle.
- **Assistant contextuel** : « Prépare le devis », « Demande la pièce au fournisseur », « Préviens le client ». Il doit montrer ce qu'il a trouvé, préparer une action concrète et demander la seule validation nécessaire avant effet externe.
- **Équipe Achats** : acheteur responsable + assistant de consultation + suivi réception. Son unité de travail est la demande d'achat rattachée à l'OI ; son résultat est une disponibilité confirmée, pas un rapport générique.

### Critères de recette pour la démo du 7 octobre

Scénario proposé : un client avec deux sites, deux équipements, un technicien, un fournisseur, une OI corrective nécessitant une pièce et un devis, et une visite préventive au calendrier.

1. Ouvrir le cockpit du client ; tous les compteurs et dossiers correspondent à ce client.
2. Importer une OI ou la créer ; revoir les champs et les rattachements ; aucune priorité ou référence inventée ne passe silencieusement.
3. Planifier le technicien depuis le calendrier ; refuser un créneau contradictoire. L'OI et le calendrier reflètent la même modification.
4. Préparer, valider puis envoyer réellement la confirmation par email et SMS vers les destinataires de test. Enregistrer les reçus ; vérifier la réception. Une soumission fournisseur seule reste « acceptée pour envoi ».
5. Saisir le diagnostic et les preuves terrain ; créer une demande d'achat liée à cette OI. Elle apparaît une seule fois dans l'équipe Achats.
6. Rattacher la proforma, calculer et prévisualiser le devis. Cliquer depuis l'OI pour ouvrir ce document exact ; valider et envoyer l'email avec sa pièce jointe.
7. Enregistrer l'accord et le BC client avec preuve ; traiter la commande et réception fournisseur. Une commande simulée reste explicitement une simulation. Ne pas replanifier en prétendant les pièces disponibles avant réception.
8. Terminer la visite, récupérer le service fait, clôturer selon les validations métier, préparer la facture et ouvrir le dossier complet.
9. Répéter une demande ou un clic : aucune double OI, double commande ni double communication. Simuler une panne réseau après soumission et vérifier l'issue avant reprise.
10. Redémarrer BonzAI : retrouver dossier, documents, tâches et reçus. Exporter/restaurer dans un espace isolé : relations intactes, équipe en pause, aucune communication rejouée.

Les étapes 4 et 6 nécessitent des comptes expéditeurs configurés, un email et un numéro de test autorisés, des modèles de messages approuvés et une décision sur la manière de vérifier la livraison. Cette préparation n'est pas un test d'envoi déjà accompli.

Ordre de correction recommandé : invariants/cloisonnement → fiche OI et contexte de lecture → chaîne d'envoi réelle → demande Achats et retour vers GMAO → planning/préventif → cockpit → recette complète avec panne et redémarrage. Les relations métier doivent être stabilisées avant de produire les nouveaux écrans.

### Vérification et limites

- `npm run test:company` : **65 tests réussis** ; couvre notamment l'exécution, les workflows, approbations, persistance et restauration. Ne prouve pas la validité de tous les états GMAO ni l'envoi réel.
- `npm run test:connectors` : **29 tests réussis**, dont certains recouvrent la suite précédente ; réponses externes simulées, aucun compte réel sollicité.
- Essais supplémentaires sur SQLite en mémoire : reproductions A01/A02/A03/A07/A12, dont modification interespaces d'un achat, création d'OI clôturée sans preuve, progression terrain automatique, devis envoyé sans destinataire, mauvais type d'équipement au préventif et proforma acceptée sans opération.
- Inspection navigateur ciblée : cockpit et préventif, données synthétiques, thèmes clair/sombre, trois largeurs. La navigation client et le calendrier demandés sont absents ; le parcours complet de tous les écrans et des rôles humains reste à recetter.
- Non vérifiés en réel : qualité/latence du LLM sur ce parcours, OCR de dossiers clients représentatifs, connecteurs authentifiés, réception email/SMS, usage simultané de plusieurs utilisateurs et exploitation continue poste fermé.

Ces constats décrivent l’état avant corrections. La mise en œuvre et les limites de validation actuelles figurent ci-dessous.


## Maintenance et achats : fonctionnement actuel (30 septembre 2026)

L’espace GMAO s’ouvre sur **Aujourd’hui** et propose directement **Planning, Interventions, Clients et À traiter**. Les demandes de pièces sont accessibles depuis Interventions ; l’équipe et ses réglages sont séparés des activités quotidiennes. Les messages et documents à relire sont regroupés avec les approbations dans **À traiter**. Le filtre client suit la navigation. Les réglages regroupent équipements, gammes, accès/conformité, astreintes, tarifs, fournisseurs et sous-traitants ; leurs formulaires s’ouvrent à la demande. Les vues utilisent les couleurs de thème, les métriques BonzAI et des listes adaptées aux petits écrans.

### Parcours opérationnel

1. Créer le client, son contrat et ses sites, puis importer ou saisir ses équipements. L’import d’inventaire exige des sites existants et affiche un aperçu avant écriture. Les délais et la TVA sont propres au contrat ; aucun délai ni pénalité monétaire du marché historique n’est imposé à un nouveau client.
2. Créer l’OI ou relire un document entrant. Le formulaire permet de corriger les données et le rattachement ; le fichier original peut être ouvert. Une proforma met à jour une demande achats identifiée. Un BC exige le bon devis. Les pièces seulement classées ne prétendent pas avoir déclenché une opération.
3. Planifier un créneau, une durée et un intervenant nommé. Le calendrier propose mois, semaine et liste, avec filtres client/site/intervenant et états lisibles sans dépendre de la couleur. Un conflit horaire est refusé. Les occurrences préventives ont une échéance distincte du rendez-vous confirmé, respectent la périodicité et le type exact d’équipement, et ne sont pas recréées lors d’un deuxième passage.
4. Enregistrer chaque étape terrain explicitement. Le compte-rendu exige des travaux, un technicien et des photos locales appartenant au dossier. Une demande de pièces reste attachée à son OI. « Transmettre à une équipe » permet de sélectionner une équipe Achats indépendante et un membre affecté. La transmission crée une seule tâche dans cette équipe ; un simple enregistrement de la demande ne signifie ni transmission ni prise en charge.
5. Les achats conservent fournisseur, lignes/quantités, proforma, référence de commande et bons de livraison. La réception peut être partielle. Une intervention avec devis attend le BC client **et** les pièces avant replanification. La commande fournisseur est un enregistrement contrôlé, pas un achat automatiquement passé auprès du fournisseur ; un éventuel email doit suivre la validation d’envoi.
6. Préparer le devis, le bon d’intervention ou la facture en PDF local. Les versions sont identifiées par le contenu, consultables depuis l’OI et jointes à l’email. Un PDF devenu obsolète est refusé à l’envoi. Une facture transmise devient immuable.
7. Recueillir le service fait et sa preuve ou son signataire explicitement déclaré, puis clôturer et facturer. Une saisie du signataire trace une déclaration de l’opérateur ; elle ne constitue pas une signature électronique certifiée.

### Envois et reprise

Configurer **un compte SendGrid actif et/ou un compte Twilio actif** dans les connecteurs de l’entreprise. Les clés restent dans le stockage sécurisé existant. Le formulaire Messages fait relire expéditeur, destinataire, texte et version du document, puis demande une confirmation explicite. Les PDF sont joints aux emails ; les SMS portent le texte validé sans téléverser de document vers un hébergement public.

Les états persistants sont `draft → submitting → submitted → delivered`, avec `failed` pour un refus/échec établi et `unknown` lorsque le résultat est incertain. « Accepté pour envoi » ne signifie jamais « livré ». Le reçu et le compte fournisseur restent associés au message. La vérification de livraison consulte Twilio ou SendGrid Email Activity ; ce dernier nécessite les droits d’accès correspondants. Un timeout ou un redémarrage en cours d’envoi interdit une répétition aveugle : l’opérateur rapproche le résultat avec une preuve fournisseur. Aucun envoi n’est rejoué automatiquement après restauration.

Références de transport : [SendGrid Mail Send](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send), [Twilio Message resource](https://www.twilio.com/docs/messaging/api/message-resource), [SendGrid Email Activity](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/getting-started-email-activity-api).

### Moteur, données et périmètre

- La migration additive `0018_gmao_operations.sql` conserve les anciens contrats/sites et crée clients, contrats de service, fournisseurs, transmissions et outbox. Elle ne reconstruit pas les tables historiques.
- Les écritures vérifient l’entreprise et le dossier des références. Les photos doivent correspondre à des fichiers locaux. Le client d’un site portant des OI ne peut pas être réattribué silencieusement. Les sauvegardes vérifient aussi les liens historiques sans contrainte SQL et restaurent une copie en pause, sans clés ni autorisations héritées.
- Les outils `gmao.searchWorkOrders` / `gmao.getDossier` et le contexte local du planificateur utilisent ces mêmes dossiers. `gmao.notifyClient` prépare un brouillon, jamais une fausse livraison. Les approbations affichent un résumé métier avec montants, quantités et références ; le détail exact reste inspectable. Le tableau de bord demande une validation individuelle et ne propose plus d’approbation en bloc.
- Les compteurs opérationnels portent sur toutes les lignes du périmètre. La pagination concerne l’affichage, pas le calcul. Sans évaluation, la santé est « Non évalué » ; une évaluation calculée reste une estimation. Sans preuve de conformité, aucun 100 % n’est affiché.
- **Maintenance, Achats et Commercial sont des équipes indépendantes**, avec leurs membres, tâches, permissions, connecteurs et mémoire. Les modèles `purchasing_team` et `sales_team` sont accessibles à la création. Les nouvelles équipes maintenance ne reçoivent plus un rôle Achats interne par défaut. Les affectations personnalisées existantes sont conservées.
- « Échanges entre équipes » est accessible depuis chaque équipe et depuis la vue globale. Chaque message enregistre le nom du membre, son rôle, son équipe et la date. Le nom est celui de l’affectation réelle, pas une identité fournie par le modèle. Une demande crée une tâche dans l’équipe destinataire ; son état reste distinct de l’enregistrement du message. Une réponse ne marque pas automatiquement cette tâche terminée et ne déclenche pas une chaîne automatique de nouvelles tâches.
- Les outils `team.directory`, `team.requestWork`, `team.readConversation` et `team.reply` permettent aux agents de demander et restituer du travail. Les échanges restent locaux et visibles dans les deux équipes ; les agents peuvent lire les conversations auxquelles leur équipe participe. Les actions externes conservent leurs validations habituelles. Le répertoire ne contient que l’identité des équipes et leurs rôles affectés. Les demandes et réponses sont persistées et dédupliquées par clé d’exécution.
- Pour les pièces, `team.readProcurement` ne lit que la demande explicitement jointe et la référence de son OI. `team.updateProcurement` permet à l’équipe destinataire de retourner une mise à jour contrôlée dans le dossier d’origine, après approbation. Cela ne partage ni la mémoire, ni les contacts clients, ni les fichiers privés, ni les clés des deux équipes. Cela ne passe pas une commande auprès d’un fournisseur.
- La migration `0019_team_communication.sql` ajoute conversations, messages et déduplication. Les anciennes tâches automatiques Achats encore ouvertes dans Maintenance sont bloquées pour revue : le responsable choisit une vraie équipe destinataire. Une restauration conserve les conversations comme archives en lecture seule, sans réactiver de liens vers les équipes d’origine.
- Les automatismes nécessitent BonzAI ouvert et le poste disponible. Il n’y a pas de service permanent poste fermé, de portail technicien distant ni d’authentification multiutilisateur introduits ici. Les contrôles locaux et leur dernière exécution restent visibles ; leur lancement manuel est possible.
- Les PDF sont des documents opérationnels. Les mentions fiscales/juridiques et conditions propres à l’entreprise doivent encore être complétées avant facturation de production ; aucun agrément de facturation électronique n’est revendiqué.

### Processus OI et pièces de marché

`gmaoProcess.js` traduit les étapes du `Process.pdf` fourni : prise en compte (blanc), intervention/en attente (vert), fin technicien (gris clair), devis à préparer (jaune), devis à transmettre (rouge), accord/BC (bleu clair), SF demandé/reçu (violet), transmission facturation (marron), clôture responsable après accord client (gris foncé). Les couleurs accompagnent toujours un libellé. Le dossier affiche toutes les étapes et leur responsable ; le planning reprend ces couleurs. Une photo est requise seulement si le plan de maintenance l’exige. Chaque visite conserve arrivée, départ et compte-rendu. « En attente » garde l’OI en cours sans inventer un achat.

Pour une réparation avec devis, la reprise exige un BC reçu, sa copie signée conservée et un email de retour accepté pour envoi ou livré, adressé au client avec cette même pièce jointe. La signature manuscrite se dessine et se place dans le PDF local ; elle crée une copie avec référence à l’original, signataire et date. Elle n’est pas une signature électronique qualifiée. Après les travaux, la demande SF doit avoir son propre reçu d’envoi ; le numéro SF reçu ne clôture pas l’OI. « Transmettre à la facturation » autorise la préparation d’une facture. La clôture reste une validation distincte avec identité du client et référence de son accord. Les preuves `process_*` ne peuvent pas être forgées via l’ajout de notes ordinaires.

Les validations préparent des notifications client à approuver dans Messages. Un brouillon ne constitue pas un envoi. Une notification préparée est liée à son message et affiche ensuite son état réel. Aucun envoi externe implicite n’est déclenché par la progression d’une barre.

Le profil optionnel **Franchise gaz du CCTP 25-004** conserve le document tel que fourni : pièces cumulées par appareil jusqu’à **300 € HT** incluses avec main-d’œuvre, déplacement et levage ; au-delà, déduction de **350 € HT**, main-d’œuvre jusqu’à **8 h** et déplacement. Le calcul des heures incluses répartit le montant de main-d’œuvre au prorata des heures saisies. Le document porte **ST 04**, son nom porte **ST3** : le responsable doit valider explicitement les termes et la section applicable dans chaque contrat client. Le profil s’applique aux appareils gaz (`REG`) identifiés, jamais automatiquement aux équipements sous pression (`ESP`). Un appareil manquant ou une section incohérente bloque le calcul. Le devis conserve le profil validé et son détail de calcul ; les totaux PDF reprennent ces mêmes déductions.

L’import local accepte CSV, XLS et XLSX sur toutes les feuilles. Il conserve feuille/ligne source, immeuble, bâtiment (zéros initiaux), fluide, composants associés, contenance, longueur réseau et dates source. Une ligne sans numéro reçoit une référence interne stable signalée pour revue ; aucune identité équipement, date ou condition n’est inventée. Les inventaires fournis ont été vérifiés en lecture seule (12 lignes gaz, 11 lignes ESP) ; ils ne sont pas embarqués dans le dépôt et leur import reste une action de l’utilisateur.

### Langue et libellés

Les écrans Maintenance et ses réglages utilisent un catalogue explicite français/anglais (`src/i18n/operations-copy.json`) ; dates, nombres et montants suivent la langue choisie sans réinitialiser les formulaires. Les autres langues utilisent les traductions existantes lorsqu’elles sont disponibles, sinon l’anglais. Les nouveaux échanges disposent de libellés dans les sept langues de l’application. Les messages métier, noms d’équipe et documents ne sont pas traduits par le pont DOM historique. Les titres désignent la fonction, sans slogan ni résultat promis.

### Vérification reproductible

```bash
npm run test:company
npm run test:connectors
npm run test:gmao
node --test test/team-communication.test.mjs test/company-workflow-progress.test.mjs
BONZAI_UI_URL=http://127.0.0.1:5187 node --test test/team-communication.browser.test.mjs
BONZAI_PDF_SMOKE=1 node --test test/gmao-pdf.test.mjs
BONZAI_UI_URL=http://127.0.0.1:5187 node --test test/gmao-operations.browser.test.mjs test/company-native-workspace.browser.test.mjs test/company-pdf-signature.browser.test.mjs
npm run build:main
npm run build:preload
npm run build:renderer
```

La recette SQLite isolée parcourt OI → diagnostic → achats → devis/PDF → accord/BC → réception partielle/complète → BC signé/retourné → réparation → demande/réception SF → transmission facturation → facture → accord de clôture, puis sauvegarde/restauration. Elle couvre aussi changements de version, doubles clics, conflits horaires, indisponibilité réseau, reprise et cloisonnement. Le transport fournisseur y est simulé. Le test PDF optionnel imprime réellement avec Electron dans un profil temporaire. La recette navigateur utilise les composants réels avec données synthétiques, cinq thèmes et des largeurs de 1440, 700 et 390 px.

**À valider sur le poste de démonstration :** comptes expéditeurs authentifiés, email et téléphone de test autorisés, réception réelle sur les deux canaux et qualité d’extraction des documents clients représentatifs. Aucun envoi réel n’a été effectué pendant les tests de développement. La validation complète de la démo dépend de ces éléments ; les tests locaux ne la remplacent pas.

## Grants team and supervised portal browser

Company automation now requires a one-time workspace license; a wallet, stake, NFT or subscription is not required when paying by card. Existing records remain readable/exportable while locked, and isolated business rehearsals remain available. See [workspace activation](WORKSPACE_ACCESS.md) for the temporary 1 USDC / USD 1 test price and payment configuration. Optional
hired onchain workers and third-party service charges remain separate.

The `government_grants` template is available through company templates and brief
classification (including CEE, EDF primes and subventions). It installs grants,
local-browser and inter-team communication tools for the CEO, Document Controller
and CFO. Its primary workspace is **Grant dossiers**, not customer billing.

- Dossiers record beneficiary, territory, official rule source/version, chronology
  and document checklist, portal/reference, intervention reference, next action,
  deadline and separate estimated/awarded/received amounts.
- Company documents can be reused. Beneficiary-specific documents cannot be linked
  to a different beneficiary. Uploaded originals are stored in local blob storage;
  local text drafts are explicitly marked as drafts. PDF/text extraction and local
  OCR reuse the maintenance document reader; scans need the OCR service. Extraction
  is bounded (40 PDF pages / 6 OCR pages); unreadable or unsupported files require
  review. Drafts cannot count as external receipts.
- The linear workflow is qualification → documents → review → submitted →
  instruction → awarded → settled. Refusal and withdrawal are explicit closures.
  Submission, award and settlement require attached evidence; clicks never advance
  these states. Revision checks prevent overwriting another agent's changes.
- Due dossiers generate one persistent CEO follow-up task per due date while the
  app is open. No reminder automatically sends a message or repeats a submission.
- `company_grants_records` participates in company memory and portable backups;
  document references and blobs survive restore. Restored teams remain paused.

The **Tools → Portal browser** panel is available to every team. A dedicated,
visible Electron window has a persistent company-specific session, sandboxing,
no Node access and no application preload. Credentials remain in that session;
passwords, CAPTCHA, MFA and signatures are handled by the owner. Browser cookies
are not part of company exports.

Harness actions use `browser.navigate`, `browser.inspect`, `browser.interact`
and `browser.uploadDocument`. The latter three act on observed element IDs and
snapshot IDs, not arbitrary model-written JavaScript. Mutations require native
owner confirmation even when called by an agent. Uploads can only resolve documents
owned by the calling company. Page text is untrusted evidence. External downloads
use Electron's save dialog; attach the saved receipt to the dossier for a verified
transition. Uncertain submissions must be inspected, never blindly retried.

This is a generic supervised browser, **not an EDF-specific certified connector**.
Portal layouts, frames, popup authentication and anti-automation measures may need
manual handling. No live EDF account or real CEE submission has been validated.
Scheme hints are research entry points; eligibility and current territorial terms
must be verified from the relevant official source before committing a dossier.

Validation:

```bash
node --test test/company-grants.test.mjs test/company-grants-db.test.mjs
BONZAI_UI_URL=http://127.0.0.1:5187 node --test test/company-grants.browser.test.mjs
```

The browser tests use a simulated portal and an isolated UI fixture. They cover
fields, selects, uploads, receipts, stale snapshots and French responsive layouts;
they do not establish compatibility with a particular government portal.

### Grants batch preparation and reconciliation

`grants.importInstallations` accepts at most 100 installation records per call.
The installation reference and scheme are the deduplication key within the team;
a retry reuses the dossier and its Document Controller preparation task. This is
an explicit local import, not a live GMAO event subscription. Spreadsheet intake
accepts tab-separated rows in reference/beneficiary/territory/scheme/title order.

`grants.prepareBatch` processes up to 100 owned applications. Typed, unexpired
company documents can be reused; beneficiary documents must match exactly. It
records missing types and rule-review blockers without asserting eligibility,
advancing a stage or performing a portal action. Preparation snapshots are
invalidated by subsequent edits. The workspace shows 30 applications per page,
with stage/search filtering and separate information, documents and follow-up.

`browser.fillForm` fills up to 50 observed fields after a single native approval
of the exact values and origin. It cannot click, upload, enter credentials or
submit. Dynamic-form failures are uncertain outcomes and require inspection.
The browser panel can queue fields for this operation. This is not a saved EDF
portal adapter, automatic background poller or verified production integration.

`grants.recordCorrection` retains a provider notice and creates one preparation
task per request reference. `grants.reconcilePayment` requires an exact unique
application reference, bank transaction ID, amount, owner confirmation and bank
evidence. It supports partial receipts and rejects reused transactions and excess
amounts. Receipt matching itself does not close settlement or initiate a transfer.
Bank-feed ingestion remains separate; these are explicitly supplied transactions.

Validation includes bounded import/preparation of 1,000 SQLite dossiers, duplicate
intake and payment checks, beneficiary isolation and Chromium form-fill fixtures.
This does not establish 1,000 live portal submissions/year, automatic eligibility
updates, a continuously available worker, or unattended portal recovery. The live
portal and account-specific receipt/status flows require integration and acceptance
before those capabilities can be claimed.


### Cross-app execution visibility
The application shell keeps a team activity strip mounted outside every feature view. It reads saved team/run state and approval counts every five seconds, with live inference streams between refreshes. Each team opens its Activity view. Running, waiting, paused and unavailable states are distinct; a loaded model alone is not evidence of work.

The supervised executor prevents idle system suspension while at least one team is active (the display may sleep). Pausing all teams releases that blocker. Explicit OS sleep, closing the laptop, quitting, process failure and resource exhaustion remain interruptions; durable recovery still applies. The app does not claim continuous service while the device is offline.

Model unload and direct model replacement reject while inference is in flight. Cancelling a foreground chat only aborts that renderer's request, never the shared server as a fallback. Resource contention can delay work; it must not be represented as completion.

### Workspace presentation

Company views share `src/components/company/company-design.css`, imported from
their scripts so standalone previews and teleported dialogs receive the same
theme tokens. Use the `company-screen` root class and the existing BonzAI
typography, controls and semantic colours. Keep view-specific layout rules in
the component; avoid adding another independent visual system.

The operating pattern is a searchable work queue beside the selected record,
with evidence, current progress and the next action. `CompanyMetricStrip` only
renders a metric as a button when it opens a corresponding queue. Billing
balances, grant deadlines, purchasing approvals and sales follow-ups use their
own filters; they are not interchangeable task counts. Workflow progress uses
the saved execution state and switches to a vertical layout in narrow panels.

The daily overview links unfinished work to Backlog and completed work to its
saved result. Results opens Creations & files by default; Task history is separate,
and operational teams additionally have Documents & records. Getting Started lists the first real tasks and expected outputs
for the selected profile; demo rehearsals remain a separate section. The
all-teams overview shows each team's actual workload and opens that team's
queues. A failed refresh must remain an error, not an empty-work claim.

Presentation changes do not own or start the background executor. Mounting,
unmounting and changing tabs must preserve saved work, approvals and drafts.

UI validation uses isolated browser fixtures with `BONZAI_UI_URL` pointing to
a local renderer. Run the module-specific `test/company-*.browser.test.mjs`
tests, plus the getting-started,
workspace-navigation and workspace-blueprints unit tests. Check screenshots at
desktop and constrained widths in light/dark themes; overflow assertions alone
do not detect unreadable columns or overlapping content. The fixtures do not
perform live connector transactions or portal submissions.

## Choosing a worker's language model

Open **Team**, click **AI model** on the worker, and choose **Use this model**
(or **Download and use**). The same picker appears in team creation and member
editing. A role/device recommendation is preselected; **Choose a different
model** retains manual control. This assigns the worker's language/reasoning
model, not the separate image, voice or video engines invoked by its tools.

`services/company/workerModels.js` keeps a small, deterministic shortlist:
Qwen3.5 9B/4B are provisional general-purpose starting points; 27B is an
analysis candidate when memory permits, and Devstral Small 2 is a coding
candidate. These are editorial shortlists informed by publisher sources, not
measured winners. The picker says **Suggested starting point** and **Not yet
benchmarked in BonzAI**, and exposes role requirements and primary sources.
Manual selections remain available, including models not yet assessed.

`workerModelEvidence.js` maps all 32 charter roles explicitly to business
requirements. Unknown roles get no automatic suggestion. Purchasing includes
landed-cost reconciliation and cross-team dependencies; invoicing includes
financial extraction and evidence. Media workers select and coordinate tools;
their controller model does not replace the image, audio, vision or 3D engines.
Research coordination is not automatically treated as code generation.

Reasoning-specific Ministral is no longer automatically ranked above the
smaller general models. The current dispatcher defaults to thinking disabled,
plain completion-to-JSON parsing and 2,048 output tokens (some planning calls
use 1,536). That is not the publisher's recommended reasoning setup. The 2B
model remains manually selectable, but memory fit alone is insufficient to
recommend it for business execution. Derivatives and different quantizations
do not inherit verified performance from their base model.

Only models with comfortable estimated memory headroom are recommended. The
calculation uses the shared model-fit estimator plus the known weight file size;
dedicated GPU memory reported in MiB is normalized to bytes. CPU-only devices
are supported and labelled. Unknown hardware never produces a claimed hardware
recommendation. Fit is an estimate for the working context, not a guarantee
under simultaneous model loads or longer contexts. Existing device scheduling
and memory limits still govern execution.

Selecting a recommendation does not start inference or alter the global chat
model. Downloads reuse local files, verify every shard and auxiliary file, and
save the role binding only after verification; cancellation or download failure
preserves the previous assignment. A role-only language-model change preserves
active harness snapshots, leases and heartbeat timers; subsequent runs use the
new binding. Other charter changes still invalidate execution as before, and
approval bindings remain strict. The assignment is pinned until the user changes
it again. Company charter persistence, audit and memory updates use the existing
company service.

Validation: `test/company-worker-models.test.mjs`,
`test/company-worker-models.browser.test.mjs`, `test/company-harness.test.mjs`
and `test/company-companion-roster.browser.test.mjs`. Browser tests cover the
real catalogue, onboarding/member assignment, cancelled and failed downloads,
save failures, language/theme layouts and uninterrupted scheduling. They mock
model downloads and inference; they do not benchmark model output quality.


### Worker assessment evidence and reproducible probes

Source review: **2026-10-10**. Ten model families have publisher evidence entries;
other catalogue entries explicitly remain unassessed. No live model quality
results are bundled or claimed. Scores below are publisher-reported, not BonzAI
accuracy measurements. Different benchmark versions, settings and agent harnesses
must not be combined into a universal score.

| Candidate | Relevant evidence | Consequence for worker selection |
| --- | --- | --- |
| [Qwen3.5 9B](https://huggingface.co/Qwen/Qwen3.5-9B) | IFEval 91.5; BFCL-V4 66.1; TAU2 79.1; DeepPlanning 18.0 | Broad candidate; exact GGUF/MTP configuration and non-thinking business decisions still require testing. |
| [Qwen3.5 4B](https://huggingface.co/Qwen/Qwen3.5-4B) | IFEval 89.8; BFCL-V4 50.3; TAU2 79.9; DeepPlanning 17.6 | Lower-memory candidate. The higher TAU2 result than 9B illustrates why parameter count alone is not a task ranking. |
| [Qwen3.5 27B](https://huggingface.co/Qwen/Qwen3.5-27B) | IFEval 95.0; BFCL-V4 68.5; TAU2 79.0; DeepPlanning 22.6 | Analysis candidate with a larger memory cost; neither speed nor better BonzAI outcomes follows automatically. Values use the 27B column, not adjacent 35B-A3B results. |
| [Qwen3.5 2B](https://huggingface.co/Qwen/Qwen3.5-2B) | IFEval 61.2 non-thinking versus 78.6 thinking; BFCL-V4 43.6 thinking | Explicit mode sensitivity; no automatic promotion solely because it fits. |
| [Ministral 3 14B Reasoning](https://huggingface.co/mistralai/Ministral-3-14B-Reasoning-2512) | Documents French, function calling and JSON. Recommends its system prompt, retained reasoning traces and temperature 1. | Worth testing for document work; no demonstrated finance superiority in the current BonzAI runtime. |
| [Devstral Small 2 24B](https://huggingface.co/mistralai/Devstral-Small-2-24B-Instruct-2512) | SWE-bench Verified 68.0, Terminal Bench 2 22.5; designed for software tools and repository work. | Coding candidate. Its published harness and weights differ; this does not certify business decisions or visual 3D quality. |
| [Ministral 3 8B Instruct](https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512) | Documents French, JSON and tool use; recommends temperature below 0.1 for production use. | Relevant alternative to assess. Default BonzAI temperature and custom protocol require comparison. |
| [Phi-4 Mini](https://huggingface.co/microsoft/Phi-4-mini-instruct) | Documents function calling with a specific tool format; acknowledges possible invented function names/URLs. | Candidate for constrained hardware; test permitted actions and identifier fidelity. |
| [Nemotron 3 Nano 4B](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16) | Reasoning-off BFCL **v3** 61.1 and IFEval-Prompt 82.8. Documents English support. | Do not compare v3 directly with v4 or imply validated French support. |
| [Hermes 4 14B](https://huggingface.co/NousResearch/Hermes-4-14B) | Documents schema training, ChatML and tool-call tags. | Relevant structured-output candidate; native tool format is not BonzAI's decision JSON protocol. |

Actual worker requirements:

| Profile | Roles | Evaluation priorities |
| --- | --- | --- |
| Planning | CEO, CPO, COO, ProcessAnalyst, RnDLead | Decomposition, dependencies, cross-team results, bounded plans; experiments must use measured outcomes. |
| Finance | CFO, InvoicingSpecialist, PaymentsSpecialist, AccountingSpecialist, BillingController | Amounts, currencies, dates, reconciliation, payment evidence, duplicate-effect prevention. |
| Documents | GeneralCounsel, MaintenanceContractManager, QHSEManager, DocumentController | Source/record extraction, conflicting clauses, missing evidence, validity and policy compliance. |
| Purchasing | PurchasingManager | Landed cost, gross margin, supplier receipts, availability and scheduling dependencies. |
| Operations | MaintenancePlanner, DispatchCoordinator, FieldTech, Packer | Skills, availability, constraints, real-world evidence, scheduling and fulfillment. |
| Communication | CMO, CSO, BusinessDevelopment, ClientSuccess, Producer:text | Language, commitments, record references, drafts and approved sending. |
| Coding | Producer:skill | Valid code, actual tool APIs, tests, error recovery. |
| Media | Producer:image/audio/video/3d/music/vision/fineTune | Choose the right pipeline, preserve the brief, wait for its result, verify and deliver artifacts. |

All profiles also need instruction adherence, valid decision JSON, correct IDs,
approval boundaries, resistance to instructions embedded in incoming documents,
and usable latency. A role profile cannot establish suitability for every task
or language. Base-model vision scores do not establish that the text-only
controller receives images. Multilingual coverage is not evidence of correct
French business terminology. Native context size is not the effective deployed
context under compaction and memory limits. MTP and Q4 speed/quality must be
measured, not inferred from the name.

Run the initial **12 synthetic decision probes** on a **dedicated local server**.
They cover French invoice extraction, landed cost/margin, dispatch constraints,
missing grant evidence, payment promises, cross-team waiting, receipt references,
untrusted email, uncertain payment effects, approvals, physical completion and
saved outcomes. They reuse `AGENT_PROTOCOL`, supply synthetic tool schemas and
never execute tools. They do not call production company records, auto-load
models, change assignments or connect to the live worker pool.

Create a configuration outside the repository, for example:

```json
{
  "endpoint": "http://127.0.0.1:8199/v1",
  "dedicatedServer": true,
  "model": "exact-model-id-returned-by-v1-models",
  "artifactSha256": "actual-sha256-of-the-tested-gguf",
  "quantization": "Q4_K_XL",
  "runtimeVersion": "exact-llama.cpp-build",
  "contextTokens": 8192,
  "device": "actual-device-and-memory",
  "mtp": false,
  "temperature": 0.7,
  "repeats": 3
}
```

```bash
node scripts/assess-worker-model.mjs /tmp/worker-config.json /tmp/worker-report.json
node --test test/worker-model-assessment.test.mjs test/company-worker-models.test.mjs
```

The runner records the operator-supplied configuration separately from requested
settings and observed outputs. It checks the served model ID, uses loopback HTTP
only, forbids redirects, requests non-thinking responses with 2,048 output tokens,
and retains every error, truncation, response and duration. It does not verify
that a server honours every requested setting. Failed requests remain in the
denominator. Reports never auto-promote a model or label it production validated.

Grading is deterministic and deliberately strict about bare JSON, action names,
fields, references and required values. This detects concrete decision failures;
it is not a semantic grader of every claim in free prose, a translation-quality
assessment, an adversarial security audit or an end-to-end workflow test.
Repeated small fixtures are not statistical proof of reliability. Long-context
retrieval, scanned documents, multi-turn recovery, every supported language,
actual skill execution, memory pressure and concurrent-team throughput need
separate measurements before calling a model the best worker. Use runtime tools
for arithmetic, permissions and final state validation irrespective of model.

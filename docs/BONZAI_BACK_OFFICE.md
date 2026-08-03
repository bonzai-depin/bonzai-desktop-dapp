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
- external writes, financial actions, publishing, and destructive operations require the configured approval policy;
- every execution records actor, intent, target, result, and relevant evidence in the audit log;
- connector failures are visible and actionable, never silently converted into success.

## Local persistence

Company records are stored locally in SQLite through `src/main/db/`. Schema changes use numbered migrations and repository methods; the migration files are the source of truth. Do not store company memory solely in renderer state or chat text.

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
npm run test:connectors
npm run build:vite
```

Also exercise persistence across restart, model-missing behavior, approval-required connector actions, multi-team chat routing, artifact reopening, and large chat histories when those areas change.

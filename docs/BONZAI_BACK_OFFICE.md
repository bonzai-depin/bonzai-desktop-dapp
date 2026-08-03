# BonzAI Back Office

BonzAI Back Office is the small-business operations module inside BonzAI Desktop.

It is not a "zero-human company" demo. It is a private, local-first back-office assistant for existing businesses that need help with the repetitive work that keeps money, customers, and records moving: lead follow-up, invoices, unpaid invoices, payments, bookkeeping handoffs, weekly reporting, and process documentation.

The simplest product promise is:

> Pick one business workflow. BonzAI prepares the work, asks before anything sensitive happens, remembers corrections, and gets better at supporting the way this business already operates.

## Why This Exists

Small businesses do not usually need a fantasy org chart. They need relief from work that is important, repetitive, detail-heavy, and easy to postpone.

Research and online reports point to a few durable pain points:

- **Late payments and cash pressure.** QuickBooks' 2025 late payments report found that 56% of surveyed small businesses were owed money from unpaid invoices, averaging $17.5K per affected business. It also linked heavier overdue invoices to cash-flow problems, higher reliance on credit, difficulty hiring, and lower digital adoption. Source: [QuickBooks 2025 Small Business Late Payments Report](https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2025/).
- **Payment operations are a broad SMB problem.** The Federal Reserve's 2024 Small Business Credit Survey payments report says roughly four in five small firms face payment-related challenges, with slow-paying customers, processing delays, settlement delays, fees, and industry-specific payment problems all showing up. Source: [Federal Reserve Small Business Credit Survey: 2024 Report on Payments](https://www.fedsmallbusiness.org/reports/survey/2024/2024-report-on-payments).
- **Owners lose enormous time to admin.** A Time Etc survey reported that entrepreneurs spend 36% of their workweek on administrative tasks. In a typical week, 44% create invoices, 43% do data entry, 27% chase late payers, and 49% do research. Many do not delegate because giving instructions feels slower than doing it themselves, or because they do not trust someone else with the work. Source: [Time Etc: The Big Price of Small Tasks](https://www.timeetc.com/resources/how-to-achieve-more/the-big-price-of-small-tasks-how-entrepreneurs-may-be-unwittingly-keeping-their-businesses-small/).
- **Lead follow-up is fragile and emotionally tiring.** InsideSales reported that after five minutes, lead conversion rates drop sharply, while very few inbound leads are actually contacted within that window. A Reddit entrepreneur summarized the human side: "the mental gymnastics of crafting each email so it doesn't sound desperate or pushy is exhausting." Sources: [InsideSales Response Time Matters](https://www.insidesales.com/response-time-matters/) and [Reddit r/Entrepreneur lead follow-up thread](https://www.reddit.com/r/Entrepreneur/comments/1l4x9un/whats_your_biggest_pain_point_with_following_up/).
- **Payments are still fragmented and slow.** The Federal Reserve's 2024 Business Payments Study notes that small businesses rely heavily on checks, cash, and cards, and that slow payments hurt operational efficiency and cash-flow management. Small businesses specifically call out better cash flow as a priority. Source: [Federal Reserve 2024 Business Payments Study](https://fedpaymentsimprovement.org/wp-content/uploads/2024-federal-reserve-payments-insights-business-study.pdf).
- **Financial visibility is still hard.** Small-business accounting guidance repeatedly comes back to the same point: without a clear financial picture, owners struggle to make good decisions. Source: [QuickBooks small business accounting guide](https://quickbooks.intuit.com/accounting/small-business-accounting/).

BonzAI Back Office should therefore be designed around practical outcomes, not agent spectacle.

## The Product Position

BonzAI Back Office sits between three things:

1. **Manual admin:** flexible but slow, error-prone, and stuck in the owner's head.
2. **Rigid automation:** efficient when the process is perfectly defined, brittle when the real business is messy.
3. **Generic chatbots:** easy to start, but not connected to workflows, approvals, evidence, memory, or repeated business context.

BonzAI's answer is a workflow-first operating assistant:

- It starts with a real business workflow, not an org chart.
- It learns how the business currently works, instead of forcing a new process.
- It prepares work across tools and records.
- It asks humans to approve sensitive steps.
- It records evidence and corrections.
- It stores team and role memory so the support gets sharper over time.

## Who It Is For

Initial target customers:

- solo operators and owner-led small businesses;
- agencies, consultants, contractors, creators, service businesses, local businesses, and small online businesses;
- teams with 1-30 people that have real operations but no dedicated operations department;
- businesses that use a few common systems such as email, QuickBooks, Stripe, HubSpot, Notion, Slack, Google Calendar, or spreadsheets;
- founders who want help but do not want to lose control, expose private data, or replace their team.

The buying emotion is not "I want an autonomous company." It is:

> I am tired of forgetting follow-ups, chasing invoices, reconciling payments, and rewriting the same reports. I want the work prepared so I can approve it quickly.

## What BonzAI Back Office Does

BonzAI Back Office turns recurring operational pain into a managed work loop.

```text
Pick a workflow
→ describe how the business already does it
→ connect or list the relevant tools
→ BonzAI provisions the right operational roles
→ work appears in a review inbox
→ sensitive actions require approval
→ corrections become memory
→ future work gets better
```

The module currently focuses on five starter workflows.

### 1. Create And Send Invoices

Pain point:

Invoices are created late, line items are missing, billing details are scattered, and owners postpone invoicing because it feels administrative.

BonzAI value:

- prepares draft invoices;
- flags missing client, project, PO, rate, tax, or payment-link details;
- checks against the current business process;
- asks before sending;
- records why the invoice was approved or changed.

Day-one output:

- "These three invoices are ready to draft."
- "This invoice is blocked because the signed quote is missing."
- "This client needs a PO before sending."

### 2. Chase Unpaid Invoices

Pain point:

Late payments hurt cash flow, but follow-up feels awkward, repetitive, and easy to delay.

BonzAI value:

- builds an accounts receivable queue;
- drafts polite payment reminders by age and relationship;
- highlights overdue risk;
- separates gentle reminders from escalation candidates;
- asks before sending customer-facing messages.

Day-one output:

- "Five invoices are overdue. Two need gentle reminders, one needs a phone call, and two need owner review."

### 3. Follow Up With Leads

Pain point:

Speed matters, but consistent follow-up is mentally draining. Owners worry about sounding pushy, desperate, robotic, or generic.

BonzAI value:

- prepares personalized follow-ups;
- tracks last contact, next action, and deal context;
- drafts meeting requests or next-step emails;
- keeps a follow-up cadence without losing the human tone;
- asks before sending.

Day-one output:

- "These seven leads need follow-up today. Here are drafts based on their last interaction."

### 4. Reconcile Payments

Pain point:

Payments arrive through different channels. Owners or bookkeepers have to match payments, invoices, partial payments, failed charges, fees, refunds, and exceptions.

BonzAI value:

- compares payment records to open invoices;
- flags unmatched payments;
- lists partial payments, failed charges, duplicate payments, and refunds;
- prepares reconciliation notes for the owner, bookkeeper, or accountant.

Day-one output:

- "Four payments match open invoices. Two payments need review. One Stripe fee explains the difference."

### 5. Prepare Weekly Business Reports

Pain point:

Owners need a weekly picture of cash, sales, invoices, customer movement, and risks, but the information lives in multiple tools.

BonzAI value:

- gathers the state of leads, invoices, payments, customer issues, and open work;
- produces a short operating brief;
- lists wins, risks, blockers, and next actions;
- records what changed since last week.

Day-one output:

- "Here is the weekly operating brief: revenue movement, overdue invoices, pipeline changes, and the next five owner decisions."

## The Agentic Team, Explained Plainly

The product should not ask a small-business owner to build a company inside BonzAI. That is backwards.

Instead, BonzAI quietly provisions a small operational team behind the workflow:

- **Coordinator:** turns goals into work and routes tasks.
- **Business Development:** prepares lead follow-up and CRM updates.
- **Client Success:** monitors customer commitments and follow-ups.
- **Invoicing Specialist:** prepares invoices and checks billing details.
- **Payments Specialist:** tracks payment links, received payments, failed payments, and exceptions.
- **Accounting Specialist:** prepares bookkeeping and close-support notes.
- **Process Analyst:** documents how the business actually works and turns corrections into SOP memory.

The user should mostly see:

- prepared work;
- approvals;
- exceptions;
- summaries;
- evidence;
- memory updates.

The roles are infrastructure. The value is the business outcome.

## Why Memory Is The Moat

The hard part of SMB operations is not just executing a task. It is knowing the local rules:

- "Never invoice this client until the PO arrives."
- "Sarah approves refunds."
- "This customer pays by bank transfer."
- "Use a softer tone for old clients."
- "Follow up after 10 days, not 3."
- "The bookkeeper wants reconciliation notes grouped by payment method."
- "This contractor bills on milestones, not hours."

BonzAI Back Office should store this as:

- **team memory:** the business-wide operating context, SOPs, approval rules, tool preferences, and recurring constraints;
- **role memory:** the specific context learned by each operational role;
- **user memory:** the owner's preferences, corrections, and recurring decisions;
- **evidence memory:** records of approvals, rejected drafts, modified outputs, connector receipts, and completed work.

This makes the system more useful every week. The business is not just using AI; it is building a private operational memory.

That memory later becomes the basis for reinforcement learning:

- approved drafts become positive examples;
- rejected drafts become negative examples;
- human edits become correction data;
- completed work becomes procedural evidence;
- recurring exceptions become process-improvement candidates.

## Trust And Control Rules

BonzAI Back Office must not feel like a risky automation layer.

Default rules:

- Customer-facing messages are drafted first.
- Financial actions require approval.
- Legal, tax, payroll, refund, charge, contract, and irreversible actions require approval.
- Ambiguous connector data becomes an exception, not an automatic action.
- Every important step writes an audit entry.
- The system explains what evidence it used.
- The user can correct the output and save the correction as memory.

This is critical because SMB owners often resist delegation when it feels slower to explain, risky to trust, or hard to inspect. BonzAI has to make delegation feel safe.

## What The UI Should Optimize For

The UI should not lead with "company," "CEO," "departments," or "autonomous organization."

It should lead with:

1. **What do you want help with first?**
2. **How does your business currently do it?**
3. **Which tools hold the evidence?**
4. **Who approves sensitive actions?**
5. **Here is the work BonzAI prepared.**
6. **Approve, edit, reject, or teach BonzAI.**

Recommended labels:

- Back Office
- Work Inbox
- Prepared Work
- Needs Approval
- Exceptions
- Weekly Brief
- Business Memory
- Process Rules
- Team Behind The Work

Avoid:

- Zero-Human Company
- CEO command center
- autonomous company replacement
- product surface
- agentic org chart as the first experience

## Goal Rooms

The default Company experience is conversational. The owner describes a
business outcome in a Goal Room, using the language they would use with a
trusted operator. BonzAI stores that brief as a durable goal, asks the
coordinator to plan it, routes resulting work to companions, and brings
decisions and evidence back into the same timeline.

A Goal Room combines:

- owner briefs and active goals;
- companion planning and in-flight work;
- approval requests;
- completed actions and deliverables;
- the teammates accountable for the outcome;
- recorded revenue, completed work, and execution counts.

Technical failures remain available in Audit instead of overwhelming the
business conversation. Detailed Work, Approvals, Outputs, Tools, and Settings
views remain drill-down surfaces from the room.

The primary interaction is **Brief the team**. Advanced task forms exist for
inspection and correction, not as the normal way to delegate work.

## Work Event Model

Company goals, issues, approvals, connector actions, generated deliverables,
treasury entries, and model activity are persisted as structured records and
projected into the Goal Room and Audit views. Every visible claim should link
back to a goal, action, output, or receipt. Chat is a view over operational
state, not a separate source of unverified agent narration.

The event vocabulary is:

```text
goal_created -> task_created -> action_proposed -> approval_requested
-> action_executed -> artifact_created -> outcome_recorded
```

Private company payloads stay in the local SQLite-backed company data layer.
The inference mesh activity channel never carries company prompts, files,
wallet details, or generated outputs.

## Inference Mesh Presence

BonzAI joins peer discovery by default. The global Mesh Presence control shows
connected peers, LAN peers, privacy mode, and sanitized lifecycle activity.
Discovery combines:

- mDNS discovery for peers on the local network;
- active relay and LLM-provider records from the protocol provider registry;
- encrypted libp2p connections using Noise and Yamux.

Discovery and compute authority are separate:

| Mode | Discover peers | Send work | Execute inbound work |
|---|---:|---:|---:|
| Private | Yes | No | No |
| Consumer | Yes | Yes | No |
| Provider | Yes | Optional | Yes |

The main process checks the current mode for every inbound inference request.
Private and Consumer modes return `provider_disabled` before invoking any local
inference pipeline. Provider activity notifications expose a pseudonymous peer
alias and pipeline category only, never the request body.

Users can pause discovery from Network Settings. This is a privacy override;
the default is an active, visible mesh presence.

## Day-One User Scenarios

### Scenario A: Small Agency

The owner wants invoices sent on time without chasing project managers.

1. Chooses "Create and send invoices."
2. Enters current workflow: signed quote, completed milestone, client PO, monthly invoice.
3. Lists tools: QuickBooks, Stripe, Gmail, Notion.
4. BonzAI prepares invoices, flags missing POs, drafts client emails, and asks before sending.
5. Owner edits one invoice rule.
6. BonzAI remembers that rule for the next billing cycle.

Business value:

- faster billing;
- fewer forgotten invoices;
- less owner admin;
- better billing consistency.

### Scenario B: Contractor With Overdue Payments

The owner has open invoices and hates following up.

1. Chooses "Chase unpaid invoices."
2. BonzAI builds an overdue list.
3. It drafts reminders in different tones based on age and relationship.
4. It marks accounts that need escalation.
5. Owner approves selected reminders.

Business value:

- faster collections;
- less emotional friction;
- better cash visibility;
- consistent follow-up cadence.

### Scenario C: Local Service Business

Leads arrive through email, forms, referrals, and calls.

1. Chooses "Follow up with leads."
2. BonzAI drafts next-step messages.
3. It proposes meeting slots and CRM updates.
4. Owner approves or edits.
5. Edits become style and process memory.

Business value:

- fewer dropped leads;
- quicker response;
- more consistent sales motion;
- less owner context switching.

### Scenario D: Bookkeeper-Supported Business

The owner has a bookkeeper but poor weekly visibility.

1. Chooses "Prepare weekly business report."
2. BonzAI summarizes invoices, payments, exceptions, customer issues, and next actions.
3. The Accounting Specialist prepares notes for the bookkeeper.
4. The owner sees a short operating brief instead of opening five tools.

Business value:

- faster understanding;
- better handoff to accountant/bookkeeper;
- fewer surprises;
- clearer owner decisions.

## How This Connects To BonzAI's Larger Moat

BonzAI Desktop is already a local-first AI studio with generation, training, companions, memory, minting, and ownership rails.

BonzAI Back Office adds the business-operations layer:

```text
Private business data
→ local workflow assistance
→ prepared work and approvals
→ memory and audit trail
→ contribution evidence
→ stronger companion skills
→ future marketplace-ready business agents
```

The long-term moat is not that BonzAI can draft an invoice. Many tools can draft an invoice.

The moat is that BonzAI can accumulate private operational memory around a business, bind that memory to companions and teams, use approvals as training signals, and eventually let proven business companions carry verified skill histories into a marketplace.

That creates a path from simple SMB workflows to the future-of-work vision:

- companions learn from real operational work;
- their skill and memory become increasingly valuable;
- companies can hire or provision companions for specific roles;
- owners keep sovereignty over private data and business logic;
- useful work can feed proof-of-contribution and reward systems.

## Product Principles

1. **Workflow first.** The first question is never "what company do you want to build?" It is "what painful process should BonzAI help with?"
2. **Prepare before acting.** Draft, summarize, flag, and reconcile before executing.
3. **Humans approve sensitive work.** Money, customers, legal, tax, payroll, and irreversible actions need approval.
4. **Memory compounds.** Corrections are product value, not failure.
5. **Evidence beats confidence.** Every recommendation should point to the records, assumptions, or missing information behind it.
6. **Small business language only.** No unnecessary agent jargon in the primary UI.
7. **Fit existing processes.** BonzAI should support how the business already works before suggesting improvements.

## Metrics That Matter

The module should be judged by operational outcomes:

- time to first useful prepared draft;
- number of overdue invoices surfaced;
- number of payment exceptions detected;
- lead follow-up delay reduced;
- invoice cycle time reduced;
- weekly report preparation time reduced;
- approval turnaround time;
- number of corrections saved to memory;
- repeat-task accuracy over time;
- owner trust: approve/edit/reject ratio.

Vanity metrics to avoid:

- number of agents created;
- number of internal roles;
- number of tasks generated without completion;
- autonomous action count without evidence;
- complex dashboards that do not reduce owner work.

## Implementation Priorities

### Now

- Keep the simplified three-step setup: Workflow, Setup, Review.
- Default to practical workflows: invoices, unpaid invoices, leads, payments, weekly reports.
- Hide role complexity behind "Team behind the work."
- Write team and role memory during setup.
- Route financial and customer-facing actions through approvals.
- Make the Work Inbox the center of the experience.

### Next

- Add connector-backed evidence panels for QuickBooks, Stripe, HubSpot, email, Notion, Slack, and Calendar.
- Add "Teach BonzAI" after every edit or rejection.
- Add weekly recurring workflow scheduling.
- Add owner-facing confidence and evidence summaries.
- Add accountant/bookkeeper export packets.
- Add a plain-language "Process Rules" screen.

### Later

- Let a business provision new companion roles on demand.
- Turn repeated approvals and corrections into fine-tuning datasets.
- Let proven companions publish skill credentials.
- Connect business-work proof to the BonzAI contribution economy.
- Support marketplace hiring of companions with verifiable business memory and role-specific track records.

## One-Sentence Pitch

BonzAI Back Office helps small businesses stop losing time and money to neglected admin by preparing invoices, follow-ups, payment reconciliation, reports, and process documentation for human review, while privately learning how the business actually works.

## Short Website Copy

Your private AI back office.

Pick one workflow: invoices, late payments, lead follow-up, payment reconciliation, or weekly reporting. BonzAI prepares the work, asks before anything sensitive happens, and remembers your corrections so the business runs smoother every week.

## Internal Product North Star

BonzAI Back Office wins when a small-business owner says:

> "I still control the business, but I no longer carry every follow-up, invoice, payment exception, and weekly report in my head."

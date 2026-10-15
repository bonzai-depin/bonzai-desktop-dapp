# Company workspace activation and business rehearsals

The company workspace is a separate perpetual entitlement covering every local team. Personal inference, creation and records export remain available without it. The displayed standard unlock price is **1 ETH**. The clearly disclosed current test charge is **1 USDC by wallet or USD 1 by card**. It is not the protocol's existing unlock contract and grants no minting rights.

## Client demonstration

1. Restart Desktop after building main/preload. Open Company.
2. In **Try a business workflow**, choose Maintenance intervention, Invoice to payment, or Grant application to settlement. The same controls appear in every team's Getting Started section.
3. Each run creates a **separate paused DEMO team**, using actual SQLite repositories and business validation. It saves success/failure and step evidence. **Open demo records** navigates to that team; no client records are edited.
4. Maintenance records scheduling, technician arrival, completed work, acceptance and billing handoff. Billing produces a real PDF and checks partial then final payment. Grants prepare reusable documents and record a sample submission, award, bank reconciliation and settlement.
5. All external evidence is explicitly simulated. No emails, SMS, portal submissions or money movements occur. These are deterministic business rehearsals, **not tests of autonomous LLM decisions or live provider availability**. Real sends still require configured connectors, recipients and approval.

## Activation deployment

Run `node scripts/workspace/checkout.mjs` on a trusted server behind HTTPS. It uses existing dependencies. Keep its ledger on persistent private storage; run one authority process (the JSON ledger is not a multi-replica database). Configure reverse-proxy request throttling. Never ship Stripe or signing secrets in Desktop.

Generate an Ed25519 key pair outside the repository. Give the authority `BONZAI_WORKSPACE_PRIVATE_KEY` and Desktop only `BONZAI_WORKSPACE_PUBLIC_KEY`. Escaped PEM newlines are supported. Set Desktop `BONZAI_WORKSPACE_CHECKOUT_URL` to the authority URL. The main-process configuration is read from the process environment, not renderer VITE variables.

Card: configure `STRIPE_SECRET_KEY` and an HTTPS `BONZAI_CHECKOUT_RETURN_URL` that tells customers to return to BonzAI and select Check payment. Checkout collects the customer's email; optional Privy sign-in is available in the app, but does not currently provide automatic account-based license recovery. The authority retrieves the Stripe session and validates payment status, amount, currency, purchase and workspace before signing. A redirect never unlocks anything. Delayed payments remain pending. Stripe test-mode payments produce test receipts, accepted only in unpackaged Desktop with `BONZAI_WORKSPACE_TEST=1`.

Wallet: configure `VITE_BONZAI_ECONOMY_CHAIN_ID` consistently with the app, `BONZAI_WORKSPACE_RPC`, `BONZAI_WORKSPACE_USDC`, `BONZAI_WORKSPACE_RECIPIENT` and confirmations (default 12). Do not substitute another chain's token. Wallet checkout requires a signed workspace/purchase binding and an actual matching confirmed ERC-20 transfer. It rejects historical payments and reused transactions. The user signs and submits through their existing wallet (including Privy), with the wallet's normal transaction confirmation. Gas is separate. The service never sends funds on the customer's behalf.

The public verification key and service URL must be provisioned before payment buttons activate. No real payment has been performed by the development tests. Robinhood USDC availability and a receiving address are **not inferred**; a configured and verified token is required.

## Offline access and recovery

The issuer signs a receipt bound to a random local workspace ID. Desktop verifies it with Ed25519 in the main process and saves it in `workspace-license.json` under userData. The receipt is perpetual: a checkout outage cannot stop activated work. Writes are gated in database IPC and background automation does not start when locked. Existing records remain readable and exportable. Keep a license backup using **Back up license**; restore that file on a replacement installation. Treat this file as a bearer license. Email-only recovery, refunds/chargeback reconciliation and organization-seat administration are not implemented by this local license mechanism.

## Validation

`node --test test/workspace-license.test.mjs test/business-demo.test.mjs test/company-billing.test.mjs test/company-grants-db.test.mjs test/gmao-operations.test.mjs test/grant-preparation.test.mjs`

The business demo test uses an isolated production-schema SQLite database and valid PDF bytes. Desktop renders invoice HTML using the existing Chromium PDF service. Live Stripe/USDC settlement, real grant portals, bank transactions and message delivery require separately configured integration checks; simulated evidence must never be presented as those checks.

## Temporary access

Payment enforcement is currently disabled by default. Unlicensed users still see the workspace introduction; its temporary Skip button opens existing teams and permits new team creation without checkout. Skipping lasts for the mounted workspace session; no paid receipt is created. All company writes, connectors and background execution remain available without a receipt. Set `BONZAI_WORKSPACE_PAYMENT_REQUIRED=1` in the main-process environment and restart to restore payment enforcement. Existing signed licenses are preserved; temporary access never creates a paid receipt.

## Guided rehearsals

Getting started contains maintenance, billing and grants walkthroughs with step explanations and local saved evidence. Rehearsal charters are excluded from operating team lists and runtime discovery; their records can be inspected during the current session and are cleared at the next app launch. There is no demo-history list. They run real repository transitions and PDF creation, with explicitly simulated external evidence. They do not certify autonomous model execution or live portal, messaging or banking integrations.

Open demo workspace selects a rehearsal without adding it to operating teams. Its normal business views remain available, alongside a demo banner and a return action. View demo deliverables opens locally saved step reports and the generated billing PDF. Opening older rehearsals fills their deliverables once without duplicating them.

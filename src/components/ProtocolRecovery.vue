<template>
  <section class="protocol-recovery" aria-label="Payments and royalties">
    <h3 class="rewards-section-title"><span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>Payments &amp; Royalties</h3>
    <p>
      Recover escrow payments, refunds and contribution royalties directly from
      the chain, including on a new device.
    </p>
    <div class="recovery-tools">
      <button
        class="bz-btn bz-btn--ghost"
        :disabled="busy || !wallet"
        @click="load(false)"
      >
        Check Onchain Balances</button
      ><button
        v-if="more"
        class="bz-btn bz-btn--ghost"
        :disabled="busy"
        @click="load(true)"
      >
        Check More Routes
      </button>
    </div>
    <p v-if="checked && !rows.length && !busy && !error" role="status">
      No unpaid balances in the routes checked{{ more ? " so far" : "" }}.
    </p>
    <div v-for="row in rows" :key="key(row)" class="recovery-row">
      <div>
        <strong>{{
          row.kind === "payment"
            ? "Payment or refund"
            : row.kind === "treasury"
              ? "Treasury credit"
              : row.kind === "basket"
                ? "Holder rewards awaiting deposit"
                : "Contribution royalty"
        }}</strong
        ><small v-if="row.assetId">{{ row.assetId }}</small>
      </div>
      <span>{{ row.amount }} {{ row.symbol }}</span
      ><button
        class="bz-btn bz-btn--primary bz-btn--sm"
        :disabled="busy"
        @click="
          selected = row;
          recipient = wallet;
        "
      >
        {{ row.kind === "basket" ? "Review Deposit" : "Review Claim" }}
      </button>
    </div>
    <form v-if="selected" class="recovery-review" @submit.prevent="claim">
      <p>
        {{ selected.kind === "basket" ? "Deposit" : "Claim" }}
        {{ selected.amount }} {{ selected.symbol }}.
        {{
          selected.kind === "basket"
            ? "This sends the reserved holder allocation to the reward basket."
            : "Only your own earned balance can be withdrawn."
        }}
      </p>
      <label v-if="selected.kind !== 'basket'"
        >Receiving wallet<input v-model="recipient" required placeholder="0x…"
      /></label>
      <div class="recovery-tools">
        <button class="bz-btn bz-btn--primary" :disabled="busy">
          {{
            selected.kind === "basket" ? "Confirm Deposit" : "Confirm Claim"
          }}</button
        ><button
          type="button"
          class="bz-btn bz-btn--ghost"
          :disabled="busy"
          @click="selected = null"
        >
          Cancel
        </button>
      </div>
    </form>
    <details>
      <summary>Recover Workflow Deadlines</summary>
      <p>
        Find funded jobs after losing local history. Private briefs stay on the
        original device. An expired review pays the worker; expired acceptance
        or delivery refunds the customer. An expired dispute follows its
        submitted-work policy. Eligibility uses the last checked chain time;
        refresh the list when a deadline passes.
      </p>
      <button
        class="bz-btn bz-btn--ghost"
        :disabled="busy || !wallet"
        @click="loadJobs(false)"
      >
        Find My Jobs</button
      ><button
        v-if="jobsMore"
        class="bz-btn bz-btn--ghost"
        :disabled="busy"
        @click="loadJobs(true)"
      >
        More Jobs
      </button>
      <div v-for="job in jobs" :key="job.id" class="recovery-row">
        <div>
          <small>{{ job.id }}</small
          ><span v-if="job.deadline">{{
            new Date(job.deadline * 1000).toLocaleString()
          }}</span
          ><span v-else>Settled · royalties awaiting routing</span>
        </div>
        <button
          class="bz-btn bz-btn--ghost"
          v-if="job.deadline"
          :disabled="busy || !job.expired"
          @click="expire(job)"
        >
          Finalize Expired Job</button
        ><button
          class="bz-btn bz-btn--ghost"
          :disabled="busy"
          @click="reviewRecovered(job)"
        >
          Review Job and Fees
        </button>
      </div>
    </details>
    <details ref="settlementDetails">
      <summary>Resolve a Workflow Payment</summary>
      <form @submit.prevent="inspectJob">
        <label
          >Job ID<input v-model="lookupId" required placeholder="0x…"
        /></label>
        <button class="bz-btn bz-btn--ghost" :disabled="busy || !wallet">
          Inspect Job
        </button>
      </form>
      <div v-if="settlement" class="recovery-review">
        <p>
          Original payment: {{ settlement.amount }} {{ settlement.symbol }}. A
          settlement allocates the gross amount to the worker and refunds the
          remainder to the customer. Fees apply only to the worker’s portion.
        </p>
        <p class="bz-mono">{{ settlement.id }}</p>
        <div
          v-if="
            settlement.hasPendingRoyalties || settlement.hasPendingHolderRewards
          "
        >
          <p>
            Routing sends reserved fees to their original recipients. It never
            changes their allocation. If a destination is unavailable, the
            balance remains reserved for retry.
          </p>
          <p v-if="settlement.hasPendingRoyalties">
            Contributor royalties: {{ settlement.pendingRoyalties }}
            {{ settlement.symbol }}. Fallback available from
            {{ new Date(settlement.fallbackAt * 1000).toLocaleString() }}.
          </p>
          <p v-if="settlement.hasPendingHolderRewards">
            Holder rewards awaiting routing across this currency:
            {{ settlement.pendingHolderRewards }} {{ settlement.symbol }}.
          </p>
          <div class="recovery-tools">
            <button
              v-if="settlement.hasPendingRoyalties"
              class="bz-btn bz-btn--primary"
              :disabled="busy"
              @click="routeFees('routeContribution')"
            >
              Forward Royalties
            </button>
            <button
              v-if="settlement.canFallback"
              class="bz-btn bz-btn--ghost"
              :disabled="busy"
              @click="routeFees('distributeContributionFallback')"
            >
              Recover to Original Contributors
            </button>
            <button
              v-if="settlement.hasPendingHolderRewards"
              class="bz-btn bz-btn--ghost"
              :disabled="busy"
              @click="routeFees('routeBasketFees')"
            >
              Forward Holder Rewards
            </button>
          </div>
        </div>
        <template v-if="[1, 2, 3, 6].includes(settlement.status)">
          <form
            v-if="
              settlement.isParty ||
              (settlement.isArbitrator && settlement.canArbitrate)
            "
            @submit.prevent="
              settle(
                settlement.isParty ? 'proposeSettlement' : 'resolveDispute',
              )
            "
          >
            <label
              >Worker share (%)<input
                v-model.number="workerPercent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
            /></label>
            <p>
              Worker: {{ workerPercent }}% before fees · Customer refund:
              {{ (100 - Number(workerPercent)).toFixed(2) }}%.
            </p>
            <p v-if="settlement.isParty">
              This proposes terms. The other party must accept before funds are
              allocated.
            </p>
            <p v-else>
              Your arbitration decision settles the dispute immediately.
            </p>
            <button class="bz-btn bz-btn--primary" :disabled="busy">
              {{
                settlement.isParty ? "Confirm Proposal" : "Confirm Arbitration"
              }}
            </button>
          </form>
          <div v-if="settlement.proposer !== zeroAddress">
            <p>
              Current proposal: {{ settlement.workerBps / 100 }}% to the worker
              before fees, {{ (10000 - settlement.workerBps) / 100 }}% refunded.
              Proposed by {{ settlement.proposer }}.
            </p>
            <button
              v-if="
                settlement.isParty &&
                settlement.proposer.toLowerCase() !== wallet.toLowerCase()
              "
              class="bz-btn bz-btn--primary"
              :disabled="busy"
              @click="settle('acceptSettlement')"
            >
              Accept This Split and Settle
            </button>
          </div>
        </template>
        <p v-else>
          This job is already settled. Check onchain balances above to withdraw
          any credit.
        </p>
      </div>
    </details>
    <details v-if="CONFIG.mintPool.contractAddress">
      <summary>Native Reward Recovery</summary>
      <form @submit.prevent="poolAction('receiver')">
        <p>
          Choose where your future native holder and provider claims are sent.
          This only changes the receiving address; the earned balances remain
          yours.
        </p>
        <label
          >Native reward receiving wallet<input
            v-model="nativeReceiver"
            required
            placeholder="0x…" /></label
        ><button class="bz-btn bz-btn--ghost" :disabled="busy || !wallet">
          Confirm Receiving Wallet
        </button>
      </form>
      <form @submit.prevent="poolAction('roll')">
        <p>
          Move a closed pool allocation into the current earning period only
          when nobody earned it. Earned rewards cannot be moved. The contract
          verifies eligibility before allowing the transaction.
        </p>
        <div class="recovery-tools">
          <label
            >Closed epoch<input
              v-model.number="emptyEpoch"
              type="number"
              min="0"
              required /></label
          ><label
            >Pool<select v-model.number="emptyPool">
              <option
                v-for="(name, index) in [
                  'Text',
                  'Audio',
                  'Image',
                  'Video',
                  '3D',
                  'Training',
                ]"
                :key="name"
                :value="index"
              >
                {{ name }}
              </option>
            </select></label
          ><label
            >Allocation<select v-model="providerSide">
              <option :value="true">Providers</option>
              <option :value="false">Registered holders</option>
            </select></label
          >
        </div>
        <button class="bz-btn bz-btn--ghost" :disabled="busy || !wallet">
          Move Unearned Allocation
        </button>
      </form>
    </details>
    <p v-if="error" role="alert">{{ error }}</p>
    <details>
      <summary>
        Transaction Receipts <span>{{ transactions.length }}</span>
      </summary>
      <p>
        Submitted transactions are retained on this device. Check confirmation
        before repeating a payment.
      </p>
      <div
        v-for="tx in transactions"
        :key="tx.originalHash"
        class="recovery-row"
      >
        <a
          :href="`${network.explorer}/tx/${tx.hash}`"
          target="_blank"
          rel="noopener noreferrer"
          >{{ tx.hash.slice(0, 12) }}…</a
        ><span
          >{{ tx.status
          }}<small v-if="tx.storageWarning"
            >Local saving failed. Keep this transaction link before closing the
            app.</small
          ></span
        ><button
          v-if="tx.status === 'pending'"
          class="bz-btn bz-btn--ghost bz-btn--sm"
          :disabled="busy"
          @click="check(tx)"
        >
          Check Confirmation
        </button>
      </div>
    </details>
  </section>
</template>
<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { ZeroAddress } from "ethers";
import { CONFIG, ECONOMY_NETWORK_KEY } from "../config/web3.config.js";
import { web3Service } from "../services/web3.service.js";
import {
  discoverPayments,
  discoverRoyalties,
  claimRecovered,
  discoverWalletJobs,
  finalizeExpiredJob,
  setNativeRewardRecipient,
  rollEmptyRewards,
  inspectRecoveryJob,
  settleRecoveryJob,
  routeRecoveryFees,
} from "../services/protocolRecovery.js";
import {
  listTransactions,
  refreshTransaction,
} from "../services/transactionJournal.js";
const network = CONFIG.networks[ECONOMY_NETWORK_KEY],
  wallet = computed(() => web3Service.state.walletAddress);
const settlementDetails = ref(null);
const zeroAddress = ZeroAddress,
  lookupId = ref(""),
  settlement = ref(null),
  workerPercent = ref(50);
const nativeReceiver = ref(""),
  emptyEpoch = ref(0),
  emptyPool = ref(0),
  providerSide = ref(true);
const jobs = ref([]),
  jobsMore = ref(false),
  jobsOffset = ref(0);
const rows = ref([]),
  transactions = ref([]),
  busy = ref(false),
  error = ref(""),
  checked = ref(false),
  more = ref(false),
  offset = ref(0),
  selected = ref(null),
  recipient = ref("");
let revision = 0;
const key = (r) => `${r.kind}:${r.assetId || ""}:${r.currency}`;
function receipts() {
  transactions.value = listTransactions(
    CONFIG.contributionEconomy.chainId,
    wallet.value,
  );
}
async function load(next) {
  if (busy.value || !wallet.value) return;
  const rev = ++revision,
    account = wallet.value;
  busy.value = true;
  error.value = "";
  if (!next) {
    rows.value = [];
    offset.value = 0;
    more.value = false;
  }
  const payments = CONFIG.contributionEconomy.jobEscrowAddress,
    router = CONFIG.stakingEconomy.revenueRouterAddress;
  try {
    const results = await Promise.allSettled([
      !next && payments ? discoverPayments(account) : [],
      router
        ? discoverRoyalties(account, offset.value)
        : { rows: [], next: 0, hasMore: false },
    ]);
    if (rev !== revision) return;
    const found = [];
    if (results[0].status === "fulfilled") found.push(...results[0].value);
    else error.value = results[0].reason.message;
    if (results[1].status === "fulfilled") {
      found.push(...results[1].value.rows);
      offset.value = results[1].value.next;
      more.value = results[1].value.hasMore;
    } else
      error.value = [error.value, results[1].reason.message]
        .filter(Boolean)
        .join(" ");
    rows.value = [
      ...new Map([...rows.value, ...found].map((r) => [key(r), r])).values(),
    ];
    checked.value = true;
    if (!payments && !router)
      error.value =
        "Payment and royalty contracts are not configured on this network.";
  } finally {
    if (rev === revision) busy.value = false;
  }
}
async function loadJobs(next) {
  if (busy.value || !wallet.value) return;
  const rev = revision,
    account = wallet.value;
  busy.value = true;
  error.value = "";
  try {
    const page = await discoverWalletJobs(account, next ? jobsOffset.value : 0);
    if (rev === revision) {
      jobs.value = next ? [...jobs.value, ...page.rows] : page.rows;
      jobsOffset.value = page.next;
      jobsMore.value = page.hasMore;
    }
  } catch (e) {
    if (rev === revision) error.value = e.message;
  } finally {
    if (rev === revision) busy.value = false;
  }
}
async function expire(job) {
  if (busy.value) return;
  const rev = revision,
    account = wallet.value;
  busy.value = true;
  error.value = "";
  try {
    await finalizeExpiredJob(job.id, account);
    if (rev === revision) {
      jobs.value = jobs.value.filter((j) => j.id !== job.id);
    }
  } catch (e) {
    if (rev === revision) error.value = e.message;
  } finally {
    if (rev === revision) busy.value = false;
    receipts();
  }
}
async function reviewRecovered(job) {
  lookupId.value = job.id;
  if (settlementDetails.value) settlementDetails.value.open = true;
  await inspectJob();
}
async function routeFees(action) {
  if (busy.value || !wallet.value || !settlement.value) return;
  const rev = revision,
    account = wallet.value,
    id = settlement.value.id;
  busy.value = true;
  error.value = "";
  try {
    await routeRecoveryFees(id, action, account);
    if (rev === revision) lookupId.value = id;
  } catch (e) {
    if (rev === revision) error.value = e.shortMessage || e.message;
  } finally {
    if (rev === revision) busy.value = false;
    receipts();
  }
  if (rev === revision && !error.value) await inspectJob();
}
async function inspectJob() {
  if (busy.value || !wallet.value) return;
  const rev = revision,
    account = wallet.value,
    id = lookupId.value.trim();
  busy.value = true;
  error.value = "";
  settlement.value = null;
  try {
    const job = await inspectRecoveryJob(id, account);
    if (rev === revision) settlement.value = job;
  } catch (e) {
    if (rev === revision) error.value = e.shortMessage || e.message;
  } finally {
    if (rev === revision) busy.value = false;
  }
}
async function settle(action) {
  if (busy.value || !wallet.value || !settlement.value) return;
  const rev = revision,
    account = wallet.value,
    job = settlement.value;
  const percentage = Number(workerPercent.value);
  if (
    action !== "acceptSettlement" &&
    (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)
  ) {
    error.value = "Worker share must be between 0% and 100%.";
    return;
  }
  const bps =
    action === "acceptSettlement"
      ? job.workerBps
      : Math.round(percentage * 100);
  busy.value = true;
  error.value = "";
  try {
    await settleRecoveryJob(job.id, action, bps, account);
    if (rev === revision) {
      settlement.value = null;
      lookupId.value = job.id;
    }
  } catch (e) {
    if (rev === revision) error.value = e.shortMessage || e.message;
  } finally {
    if (rev === revision) busy.value = false;
    receipts();
  }
  if (rev === revision && !error.value) await inspectJob();
}
async function poolAction(action) {
  if (busy.value || !wallet.value) return;
  const rev = revision,
    account = wallet.value;
  busy.value = true;
  error.value = "";
  try {
    if (action === "receiver")
      await setNativeRewardRecipient(account, nativeReceiver.value);
    else
      await rollEmptyRewards(
        account,
        emptyEpoch.value,
        emptyPool.value,
        providerSide.value,
      );
  } catch (e) {
    if (rev === revision) error.value = e.shortMessage || e.message;
  } finally {
    if (rev === revision) busy.value = false;
    receipts();
  }
}
async function claim() {
  if (busy.value || !selected.value) return;
  const rev = revision,
    account = wallet.value,
    row = selected.value,
    receiver = recipient.value;
  busy.value = true;
  error.value = "";
  try {
    await claimRecovered(row, account, receiver);
    if (rev === revision) {
      rows.value = rows.value.filter((r) => key(r) !== key(row));
      selected.value = null;
    }
  } catch (e) {
    if (rev === revision) error.value = e.message;
  } finally {
    if (rev === revision) busy.value = false;
    receipts();
  }
}
async function check(tx) {
  if (busy.value || !wallet.value) return;
  const rev = revision;
  busy.value = true;
  error.value = "";
  try {
    const receipt = await refreshTransaction(
      tx,
      await web3Service.getProvider(ECONOMY_NETWORK_KEY),
    );
    if (rev === revision && !receipt)
      error.value =
        "Confirmation is still unknown. Check the explorer; do not repeat the payment.";
  } catch (e) {
    if (rev === revision) error.value = e.message;
  } finally {
    if (rev === revision) busy.value = false;
    receipts();
  }
}
watch(wallet, () => {
  ++revision;
  settlement.value = null;
  lookupId.value = "";
  nativeReceiver.value = "";
  recipient.value = "";
  jobs.value = [];
  jobsMore.value = false;
  jobsOffset.value = 0;
  rows.value = [];
  selected.value = null;
  checked.value = false;
  more.value = false;
  error.value = "";
  busy.value = false;
  receipts();
});
onMounted(() => {
  receipts();
  window.addEventListener("bonzai:protocol-transactions", receipts);
});
onBeforeUnmount(() => {
  ++revision;
  window.removeEventListener("bonzai:protocol-transactions", receipts);
});
</script>
<style scoped>
.protocol-recovery {
  min-width: 0;
  overflow-wrap: anywhere;
  border-top: 1px solid var(--bz-border);
  padding-block: var(--bz-space-6);
  margin-top: var(--bz-space-6);
}
.protocol-recovery form {
  display: grid;
  gap: var(--bz-space-3);
  margin-block: var(--bz-space-3);
}
.protocol-recovery form > button {
  justify-self: start;
}
.protocol-recovery p {
  color: var(--bz-fg-mid);
  line-height: 1.5;
}
.recovery-tools,
.recovery-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bz-space-3);
  padding-block: var(--bz-space-3);
}
.recovery-row {
  border-bottom: 1px solid var(--bz-border);
}
.recovery-row > div {
  flex: 1;
  min-width: 160px;
}
.recovery-row small {
  display: block;
  overflow-wrap: anywhere;
}
.recovery-review label {
  display: grid;
  gap: var(--bz-space-2);
}
input,
select {
  padding: 12px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-sm);
  width: 100%;
}
details {
  margin-top: var(--bz-space-5);
}

.rewards-section-title{display:flex;align-items:center;gap:12px;font-family:var(--bz-font-metric);font-weight:900;font-style:italic;font-size:26px;line-height:1.2;margin:0 0 16px}.rewards-section-title>span{font-size:24px;color:var(--bz-accent);font-variation-settings:'wght' 200}section>p{max-width:85ch;margin:12px 0 20px}details{border-top:1px solid var(--bz-border);padding:20px 0;margin-top:16px}summary{cursor:pointer;font-weight:600;padding:4px 0 12px;font-size:16px}details p{max-width:85ch;margin:12px 0 16px}details button{margin-top:8px}details label{display:grid;gap:8px}input{box-sizing:border-box}section{padding-bottom:24px}@media(max-width:600px){.rewards-section-title{font-size:22px}details{padding:16px 0}}
</style>

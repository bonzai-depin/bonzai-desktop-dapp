<template>
  <div class="browse-agents">
    <header class="browse-agents__head">
      <div>
        <p class="bz-eyebrow">Earn</p>
        <h2 class="browse-agents__title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined" aria-hidden="true">person_pin</span>
          My Companions
        </h2>
      </div>
    </header>

    <BonzaiEmptyState
      v-if="isLoading"
      size="compact"
      icon="hourglass_empty"
      title="Loading companions"
      :show-orb="false"
    />
    <BonzaiEmptyState
      v-else-if="companions.length === 0"
      size="small"
      icon="person_pin"
      title="No companions yet"
      subtitle="Mint or import an agentic specialist to bring their workflows into BonzAI and Company."
      :show-orb="false"
    />
    <div v-else class="companions-grid">
      <article
        v-for="companion in companions"
        :key="companion.id"
        class="companion-card"
        :class="{ 'bare-companion': companion.isBare }"
        @click="companion.isBare ? openSetupWizard(companion) : selectCompanion(companion)"
      >
        <div class="companion-card__avatar">
          <img
            v-if="companion.image"
            :src="companion.image"
            :alt="companion.name"
          />
          <span v-else class="material-symbols-outlined">person_add</span>
        </div>
        <div class="companion-card__body">
          <div class="companion-card__top">
            <strong class="fira-sans-condensed-black-italic">{{ companion.name }}</strong>
            <span v-if="companion.isBare" class="companion-pill companion-pill--warning">Needs setup</span>
          </div>
          <p>{{ companion.isBare ? 'Minted but not configured. Click to set up.' : companion.shortBio }}</p>
          <span v-if="careerFor(companion)" class="companion-career">
            {{ careerFor(companion).title }} · ${{ careerFor(companion).tokenSymbol }}
          </span>
          <button
            v-if="companion.isBare"
            class="bz-btn bz-btn--sm bz-btn--agent-cta fira-sans-condensed-black-italic"
            @click.stop="openSetupWizard(companion)"
          >
            <span class="material-symbols-outlined" aria-hidden="true">build</span>
            Set up
          </button>
        </div>
      </article>
    </div>

    <!-- Companion Details Modal -->
    <div v-if="selectedCompanion" class="agent-modal" role="dialog" aria-modal="true">
      <div class="agent-modal__backdrop" @click="closeCompanionModal"></div>
      <div class="agent-modal__panel agent-modal__panel--wide">
        <header class="agent-modal__head">
          <div>
            <p class="bz-eyebrow">Companion</p>
            <h3 class="agent-modal__title fira-sans-condensed-black-italic">
              {{ selectedCompanion?.name }}
            </h3>
          </div>
          <BzCloseButton
            size="sm"
            aria-label="Close companion details"
            @click="closeCompanionModal"
          />
        </header>
        <section class="agent-modal__body" v-if="selectedCompanion">
          <div v-if="selectedCareer" class="agent-section companion-career-panel">
            <p class="bz-eyebrow">Agentic specialization</p>
            <h4 class="agent-section__title fira-sans-condensed-black-italic">{{ selectedCareer.title }}</h4>
            <p>{{ selectedCareer.summary }}</p>
            <div class="agent-chip-grid">
              <span class="agent-score-chip">${{ selectedCareer.tokenSymbol }}</span>
              <span v-for="skill in selectedCareer.companySkills" :key="skill" class="agent-score-chip">
                {{ skill.replace('skill.', '').replaceAll('_', ' ') }}
              </span>
            </div>
            <p class="agent-help">Hire {{ selectedCareer.firstName }} in Company to add these workflows to the role.</p>
          </div>
          <!-- Wallet Info -->
          <div class="agent-section">
            <div class="agent-wallet-row">
              <span class="agent-wallet-row__label">Wallet Address</span>
              <code class="agent-wallet-row__value bz-mono">{{ selectedCompanion.agentWallet || 'Not set' }}</code>
              <span v-if="companionWalletProvider === 'ows'" class="agent-pill agent-pill--success">OWS</span>
              <span v-else-if="companionWalletProvider === 'privy'" class="agent-pill agent-pill--info">Privy</span>
              <span v-else-if="companionWalletProvider === 'local'" class="agent-pill agent-pill--warning">Legacy</span>
            </div>
            <div v-if="companionEthBalance !== null" class="agent-wallet-row">
              <span class="agent-wallet-row__label">Balance (Ethereum)</span>
              <span class="agent-wallet-row__value bz-mono">{{ companionEthBalance }} ETH</span>
            </div>
            <div v-if="selectedCompanionUP" class="agent-wallet-row">
              <span class="agent-wallet-row__label">Universal Profile</span>
              <a :href="'https://universaleverything.io/' + selectedCompanionUP" target="_blank" class="agent-wallet-row__value bz-mono">
                {{ selectedCompanionUP.slice(0, 10) }}...{{ selectedCompanionUP.slice(-8) }}
              </a>
            </div>
            <div v-if="!selectedCompanionUP && !selectedCompanion?.isBare" class="agent-inline-action">
              <button
                class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic attach-up-btn"
                @click="attachUniversalProfile"
                :disabled="isDeployingUP"
                :class="{ 'bz-btn--running': isDeployingUP }"
              >
                <span class="material-symbols-outlined" aria-hidden="true">person_pin</span>
                {{ upDeployStatus || 'Attach Universal Profile' }}
              </button>
              <p class="agent-help">
                Deploys a LUKSO Universal Profile for this companion and returns to Ethereum.
              </p>
            </div>
            <div v-if="selectedCompanion?.isBare && !selectedCompanionUP" class="agent-help agent-help--warning">
                <span class="material-symbols-outlined" aria-hidden="true">info</span>
                Complete companion setup first to attach a Universal Profile.
            </div>
          </div>

          <!-- Revenue Info -->
          <div class="companion-metrics">
            <div class="companion-metric">
              <span class="companion-metric__label">Weekly Revenue</span>
              <strong class="companion-metric__value fira-sans-condensed-black-italic">
                {{ companionRevenue?.weekly?.toFixed(4) || '0.0000' }} ETH
              </strong>
            </div>
            <div class="companion-metric">
              <span class="companion-metric__label">Monthly Revenue</span>
              <strong class="companion-metric__value fira-sans-condensed-black-italic">
                {{ companionRevenue?.monthly?.toFixed(4) || '0.0000' }} ETH
              </strong>
            </div>
          </div>

          <!-- Spending Profile -->
          <div class="agent-section" v-if="selectedCompanion.spendingHabits">
            <h4 class="agent-section__title fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined" aria-hidden="true">radar</span>
              Spending Profile
            </h4>
            <div class="agent-chip-grid">
              <span
                v-for="(score, category) in selectedCompanion.spendingHabits"
                :key="category"
                class="agent-score-chip"
                :class="score >= 7 ? 'agent-score-chip--success' : score >= 5 ? 'agent-score-chip--warning' : ''"
              >
                {{ getCategoryMeta(category)?.icon ? '' : '' }}
                <span class="material-symbols-outlined" aria-hidden="true">{{ getCategoryMeta(category)?.icon || 'category' }}</span>
                {{ getCategoryMeta(category)?.label || category }}: {{ score }}
              </span>
            </div>
          </div>

          <!-- Co-owned Skills -->
          <div class="agent-section">
            <h4 class="agent-section__title fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined" aria-hidden="true">workspace_premium</span>
              Co-owned Skills
            </h4>
            <BonzaiEmptyState
              v-if="isLoadingSkills"
              size="compact"
              icon="hourglass_empty"
              title="Loading skills"
              :show-orb="false"
            />
            <BonzaiDataTable
              v-else
              :columns="ownedSkillColumns"
              :rows="companionOwnedSkills"
              :row-key="row => row.skillId"
              density="compact"
              empty-title="No skills registered"
              empty-subtitle="Register this companion for a skill to start earning co-owner revenue."
            >
              <template #cell-name="{ row }">
                <span>{{ row.name || row.skillId.slice(0, 10) + '...' }}</span>
              </template>
              <template #cell-action="{ row }">
                <button
                  class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                  :class="{ 'bz-btn--running': updatingSkillId === row.skillId }"
                  :disabled="!!updatingSkillId"
                  @click="updateRegistrationForSkill(row)"
                  title="Re-attest to refresh spending profile / agent wallet on-chain"
                >
                  Update
                </button>
              </template>
            </BonzaiDataTable>

            <!-- Historical distribution breakdown -->
            <h4 class="agent-section__title fira-sans-condensed-black-italic agent-section__title--spaced">
              <span class="material-symbols-outlined" aria-hidden="true">history</span>
              Distribution History
              <button
                class="bz-iconbtn bz-iconbtn--sm"
                :class="{ 'bz-btn--running': isLoadingHistory }"
                @click="loadDistributionHistory"
                title="Refresh"
              >
                <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
              </button>
            </h4>
            <BonzaiDataTable
              :columns="distributionColumns"
              :rows="distributionHistory.slice(0, 20)"
              :row-key="row => row.txHash + row.blockNumber"
              density="compact"
              empty-title="No distributions yet"
              empty-subtitle="Revenue entries appear here after a skill purchase pays out to this companion."
            >
              <template #cell-when="{ row }">
                <span :title="new Date(row.timestamp * 1000).toISOString()">
                  {{ formatRelativeTime(row.timestamp) }}
                </span>
              </template>
              <template #cell-skill="{ row }">
                {{ row.skillName || row.skillId.slice(0, 10) + '...' }}
              </template>
              <template #cell-share="{ row }">
                {{ formatUsdc(row.share) }} USDC
              </template>
              <template #cell-weight="{ row }">
                <span :title="'weight ' + row.weight + ' / ' + row.totalWeight">
                  {{ (row.ratio * 100).toFixed(1) }}%
                </span>
              </template>
              <template #cell-action="{ row }">
                <a
                  :href="'https://etherscan.io/tx/' + row.txHash"
                  target="_blank"
                  rel="noopener"
                  class="bz-iconbtn bz-iconbtn--sm"
                  title="Open transaction"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
                </a>
              </template>
            </BonzaiDataTable>
          </div>

          <!-- Wallet Policies (OWS only) -->
          <div v-if="companionWalletProvider === 'ows'" class="agent-section">
            <h4 class="agent-section__title fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined" aria-hidden="true">policy</span>
              Wallet Policies
            </h4>
            <div v-if="companionPolicies.length === 0" class="agent-muted">
              No policies configured.
            </div>
            <div v-else class="agent-list">
              <div v-for="policy in companionPolicies" :key="policy.id" class="agent-list-row">
                <strong class="bz-mono">{{ policy.id?.slice(0, 12) }}...</strong>
                <span v-if="policy.rules?.allowed_chains">Chains: {{ policy.rules.allowed_chains.join(', ') }}</span>
                <span v-if="policy.rules?.daily_limit_eth">Limit: {{ policy.rules.daily_limit_eth }} ETH/day</span>
              </div>
            </div>
            <button class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic" @click="showPolicyModal = true">
              <span class="material-symbols-outlined" aria-hidden="true">add</span>
              Add Policy
            </button>
          </div>

          <!-- API Keys (OWS only) -->
          <div v-if="companionWalletProvider === 'ows'" class="agent-section">
            <h4 class="agent-section__title fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined" aria-hidden="true">vpn_key</span>
              API Keys
            </h4>
            <div v-if="companionApiKeys.length === 0" class="agent-muted">
              No API keys.
            </div>
            <div v-else class="agent-list">
              <div v-for="key in companionApiKeys" :key="key.id" class="agent-list-row agent-list-row--split">
                <span>
                  <strong>{{ key.name }}</strong>
                  <code class="bz-mono">...{{ (key.id || '').slice(-8) }}</code>
                </span>
                <button class="bz-btn bz-btn--sm bz-btn--destructive fira-sans-condensed-black-italic" @click="revokeApiKey(key.id)">Revoke</button>
              </div>
            </div>
            <button class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic" @click="createApiKey">
              <span class="material-symbols-outlined" aria-hidden="true">add</span>
              Create New Key
            </button>
          </div>

          <!-- Action Buttons -->
          <div class="agent-action-row">
            <button
              class="bz-btn bz-btn--agent-cta fira-sans-condensed-black-italic"
              :class="{ 'bz-btn--running': isClaimingRevenue }"
              :disabled="!companionRevenue || companionRevenue.monthly <= 0"
              @click="claimRevenue"
            >
              <span class="material-symbols-outlined" aria-hidden="true">payments</span>
              Claim Revenue
            </button>
            <button
              class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
              @click="showRegisterModal = true"
            >
              <span class="material-symbols-outlined" aria-hidden="true">app_registration</span>
              Register for Skill
            </button>
            <button v-if="companionWalletProvider === 'ows'" class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="showBackupModal = true">
              <span class="material-symbols-outlined" aria-hidden="true">download</span>
              Export Wallet
            </button>
            <button v-else class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="showBackupModal = true">
              <span class="material-symbols-outlined" aria-hidden="true">key</span>
              Backup Private Key
            </button>
            <button
              v-if="companionWalletProvider === 'local'"
              class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
              :class="{ 'bz-btn--running': isMigrating }"
              :disabled="isMigrating"
              @click="migrateToOWS"
            >
              <span class="material-symbols-outlined" aria-hidden="true">upgrade</span>
              Migrate to OWS
            </button>
          </div>
        </section>
      </div>
    </div>

    <!-- Private Key Backup Modal -->
    <div v-if="showBackupModal" class="agent-modal" role="dialog" aria-modal="true">
      <div class="agent-modal__backdrop" @click="closeBackupModal"></div>
      <div class="agent-modal__panel">
        <header class="agent-modal__head">
          <div>
            <p class="bz-eyebrow">Wallet</p>
            <h3 class="agent-modal__title fira-sans-condensed-black-italic">Backup Private Key</h3>
          </div>
          <BzCloseButton size="sm" aria-label="Close" @click="closeBackupModal" />
        </header>
        <section class="agent-modal__body">
          <div class="bz-notice bz-notice--danger">
            <span class="bz-notice__icon"><span class="material-symbols-outlined" aria-hidden="true">warning</span></span>
            <div class="bz-notice__body">
              <p class="bz-notice__title">Security Warning</p>
              <p class="bz-notice__text">Never share your private key. Anyone with this key can control the companion's agent wallet and all its funds.</p>
            </div>
          </div>
          <div class="agent-field">
            <label class="agent-label">Private Key</label>
            <input
              class="agent-input bz-mono"
              :type="showPrivateKey ? 'text' : 'password'"
              :value="backupKeyValue"
              readonly
              @click="showPrivateKey = true"
            />
            <p class="agent-help" v-if="!showPrivateKey">Click to reveal. It auto-hides in 30 seconds.</p>
            <p class="agent-help agent-help--danger" v-else>Key visible. Auto-hides in {{ backupCountdown }}s.</p>
          </div>
        </section>
        <footer class="agent-modal__foot">
          <button class="bz-btn bz-btn--primary fira-sans-condensed-black-italic" @click="copyPrivateKey">
            <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
            Copy to Clipboard
          </button>
          <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="closeBackupModal">Close</button>
        </footer>
      </div>
    </div>

    <!-- Register for Skill Modal -->
    <div v-if="showRegisterModal" class="agent-modal" role="dialog" aria-modal="true">
      <div class="agent-modal__backdrop" @click="showRegisterModal = false"></div>
      <div class="agent-modal__panel">
        <header class="agent-modal__head">
          <div>
            <p class="bz-eyebrow">Co-ownership</p>
            <h3 class="agent-modal__title fira-sans-condensed-black-italic">Register for Skill</h3>
          </div>
          <BzCloseButton size="sm" aria-label="Close" @click="showRegisterModal = false" />
        </header>
        <section class="agent-modal__body">
          <p class="agent-help">
            Select a skill to register your companion as a co-owner.
            Requires a spending profile score of 5+ in the skill's category.
          </p>
          <div v-if="registrationError" class="bz-notice bz-notice--danger">
            <span class="bz-notice__icon"><span class="material-symbols-outlined" aria-hidden="true">error</span></span>
            <div class="bz-notice__body"><p class="bz-notice__text">{{ registrationError }}</p></div>
          </div>
          <div v-if="signerState && !signerState.ready" class="bz-notice bz-notice--warning bz-notice--stacked">
            <div class="bz-notice__body">
              <p class="bz-notice__title">Attestation signer not configured</p>
              <p class="bz-notice__text">Local: <code class="bz-mono">{{ signerState.local }}</code></p>
              <p class="bz-notice__text">On-chain: <code class="bz-mono">{{ signerState.onChain || 'not set' }}</code></p>
              <p class="bz-notice__text">
              Registration will fail until the contract owner runs
                <code class="bz-mono">scripts/sync-attestation-signer.js</code>.
              </p>
            </div>
          </div>
          <div v-if="eligibleSkills.length === 0" class="bz-notice bz-notice--warning">
            <span class="bz-notice__icon"><span class="material-symbols-outlined" aria-hidden="true">info</span></span>
            <div class="bz-notice__body"><p class="bz-notice__text">No eligible skills found. Your companion needs a spending profile score of at least 5 in a skill's category.</p></div>
          </div>
          <div v-else class="agent-register-list">
            <div
              v-for="skill in eligibleSkills"
              :key="skill.id"
              class="agent-register-card"
              @click="registerForSkill(skill)"
            >
              <div>
                <strong>{{ skill.name }}</strong>
                <div class="agent-register-card__meta">
                  <span class="agent-pill agent-pill--info">{{ skill.category }}</span>
                  <span class="bz-mono">Score: {{ skill.companionScore }}/15</span>
                </div>
              </div>
                <button
                  class="bz-btn bz-btn--sm bz-btn--agent-cta fira-sans-condensed-black-italic"
                  :class="{ 'bz-btn--running': registeringSkillId === skill.id }"
                >
                  Register
                </button>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- Add Policy Modal (OWS) -->
    <div v-if="showPolicyModal" class="agent-modal" role="dialog" aria-modal="true">
      <div class="agent-modal__backdrop" @click="showPolicyModal = false"></div>
      <div class="agent-modal__panel agent-modal__panel--narrow">
        <header class="agent-modal__head">
          <div>
            <p class="bz-eyebrow">OWS</p>
            <h3 class="agent-modal__title fira-sans-condensed-black-italic">Add Wallet Policy</h3>
          </div>
          <BzCloseButton size="sm" aria-label="Close" @click="showPolicyModal = false" />
        </header>
        <section class="agent-modal__body">
          <div class="agent-field">
            <label class="agent-label">Allowed Chains (CAIP-2)</label>
            <input class="agent-input" v-model="newPolicyData.chains" placeholder="eip155:1" />
            <p class="agent-help">Comma-separated chain IDs.</p>
          </div>
          <div class="agent-field">
            <label class="agent-label">Daily Limit (ETH)</label>
            <input class="agent-input" type="number" step="0.001" v-model="newPolicyData.dailyLimit" />
          </div>
          <div class="agent-field">
            <label class="agent-label">Expiry (days from now)</label>
            <input class="agent-input" type="number" v-model.number="newPolicyData.expiryDays" />
          </div>
        </section>
        <footer class="agent-modal__foot">
          <button class="bz-btn bz-btn--agent-cta fira-sans-condensed-black-italic" @click="createPolicy">Create Policy</button>
          <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="showPolicyModal = false">Cancel</button>
        </footer>
      </div>
    </div>

    <!-- New API Key Token Modal (OWS) -->
    <div v-if="showNewApiKeyModal" class="agent-modal" role="dialog" aria-modal="true">
      <div class="agent-modal__backdrop" @click="showNewApiKeyModal = false; newApiKeyToken = null"></div>
      <div class="agent-modal__panel">
        <header class="agent-modal__head">
          <div>
            <p class="bz-eyebrow">OWS</p>
            <h3 class="agent-modal__title fira-sans-condensed-black-italic">API Key Created</h3>
          </div>
          <BzCloseButton size="sm" aria-label="Close" @click="showNewApiKeyModal = false; newApiKeyToken = null" />
        </header>
        <section class="agent-modal__body">
          <div class="bz-notice bz-notice--warning">
            <span class="bz-notice__icon"><span class="material-symbols-outlined" aria-hidden="true">key</span></span>
            <div class="bz-notice__body"><p class="bz-notice__text">Copy this token now. It will only be shown once.</p></div>
          </div>
          <div class="agent-field">
            <input class="agent-input bz-mono" :value="newApiKeyToken" readonly />
          </div>
        </section>
        <footer class="agent-modal__foot">
          <button class="bz-btn bz-btn--primary fira-sans-condensed-black-italic" @click="navigator.clipboard.writeText(newApiKeyToken || ''); showNewApiKeyModal = false; newApiKeyToken = null">
            <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
            Copy & Close
          </button>
        </footer>
      </div>
    </div>

    <!-- Setup Wizard Modal -->
    <div v-if="showSetupWizard" class="agent-modal" role="dialog" aria-modal="true">
      <div class="agent-modal__backdrop" @click="closeSetupWizard"></div>
      <div class="agent-modal__panel agent-modal__panel--wide">
        <header class="agent-modal__head">
          <div>
            <p class="bz-eyebrow">Bare Companion</p>
            <h3 class="agent-modal__title fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined" aria-hidden="true">build</span>
              Set Up Companion #{{ setupTarget?.tokenId }}
            </h3>
          </div>
          <BzCloseButton size="sm" aria-label="Close" @click="closeSetupWizard" />
        </header>
        <section class="agent-modal__body">
          <!-- Progress bar -->
          <div v-if="isFinalizing" class="agent-finalize-progress">
            <BonzaiPulse variant="bar" :percent="finalizeProgress.percent" />
            <p class="agent-help">
              {{ finalizeProgress.message }}
            </p>
          </div>

          <!-- Step indicators -->
          <div v-if="!isFinalizing" class="agent-stepper">
            <div class="agent-chip-grid agent-chip-grid--steps">
              <span class="agent-step-chip" :class="{ 'agent-step-chip--active': setupStep >= 1 }">1. Identity</span>
              <span class="agent-step-chip" :class="{ 'agent-step-chip--active': setupStep >= 2 }">2. Personality</span>
              <span class="agent-step-chip" :class="{ 'agent-step-chip--active': setupStep >= 3 }">3. Appearance</span>
              <span class="agent-step-chip" :class="{ 'agent-step-chip--active': setupStep >= 4 }">4. Portrait</span>
              <span class="agent-step-chip" :class="{ 'agent-step-chip--active': setupStep >= 5 }">5. Confirm</span>
            </div>
          </div>

          <!-- Step 1: Identity -->
          <div v-if="setupStep === 1 && !isFinalizing">
            <div class="agent-field">
              <label class="agent-label">First Name</label>
              <input class="agent-input" v-model="setupData.firstName" placeholder="e.g. Luna" />
            </div>
            <div class="agent-field">
              <label class="agent-label">Family Name</label>
              <input class="agent-input" v-model="setupData.familyName" placeholder="e.g. Starling" />
            </div>
            <div class="agent-field">
              <label class="agent-label">Gender</label>
                <select class="agent-input" v-model="setupData.gender">
                  <option :value="0">Neutral</option>
                  <option :value="1">Female</option>
                  <option :value="2">Male</option>
                </select>
            </div>
            <div class="agent-field">
              <label class="agent-label">Age</label>
              <input class="agent-input" type="number" v-model.number="setupData.age" min="18" max="999" />
            </div>
            <div class="agent-field">
              <label class="agent-label">Short Bio</label>
              <textarea class="agent-input agent-textarea" v-model="setupData.shortBio" placeholder="A brief description of this companion..." rows="2"></textarea>
            </div>
          </div>

          <!-- Step 2: Personality (Big 5 / OCEAN) -->
          <div v-if="setupStep === 2 && !isFinalizing">
            <p class="agent-help">Rate each personality trait from 1 (low) to 10 (high).</p>
            <div class="agent-field">
              <label class="agent-label">Openness <span>(curiosity, creativity)</span></label>
              <div class="agent-range-row">
                <input type="range" min="1" max="10" v-model.number="setupData.openness" />
                <span class="agent-value-pill">{{ setupData.openness }}</span>
              </div>
            </div>
            <div class="agent-field">
              <label class="agent-label">Conscientiousness <span>(discipline, organisation)</span></label>
              <div class="agent-range-row">
                <input type="range" min="1" max="10" v-model.number="setupData.conscientiousness" />
                <span class="agent-value-pill">{{ setupData.conscientiousness }}</span>
              </div>
            </div>
            <div class="agent-field">
              <label class="agent-label">Extraversion <span>(sociability, energy)</span></label>
              <div class="agent-range-row">
                <input type="range" min="1" max="10" v-model.number="setupData.extraversion" />
                <span class="agent-value-pill">{{ setupData.extraversion }}</span>
              </div>
            </div>
            <div class="agent-field">
              <label class="agent-label">Agreeableness <span>(cooperation, empathy)</span></label>
              <div class="agent-range-row">
                <input type="range" min="1" max="10" v-model.number="setupData.agreeableness" />
                <span class="agent-value-pill">{{ setupData.agreeableness }}</span>
              </div>
            </div>
            <div class="agent-field">
              <label class="agent-label">Neuroticism <span>(emotional sensitivity)</span></label>
              <div class="agent-range-row">
                <input type="range" min="1" max="10" v-model.number="setupData.neuroticism" />
                <span class="agent-value-pill">{{ setupData.neuroticism }}</span>
              </div>
            </div>
            <hr />
            <div class="agent-field">
              <label class="agent-label">Background</label>
              <textarea class="agent-input agent-textarea" v-model="setupData.background" placeholder="Their backstory, history, where they come from..." rows="3"></textarea>
            </div>
            <div class="agent-field">
              <label class="agent-label">Voice Style</label>
              <input class="agent-input" v-model="setupData.voiceStyle" placeholder="e.g. warm, sultry, professional, playful" />
            </div>
            <div class="agent-field">
              <label class="agent-label">First Message</label>
              <textarea class="agent-input agent-textarea" v-model="setupData.firstMessage" placeholder="What they say when you first meet them..." rows="2"></textarea>
            </div>
          </div>

          <!-- Step 3: Appearance -->
          <div v-if="setupStep === 3 && !isFinalizing">
            <div class="agent-field">
              <label class="agent-label">Appearance</label>
              <textarea class="agent-input agent-textarea" v-model="setupData.appearance" placeholder="Physical description: hair, eyes, build, clothing style..." rows="4"></textarea>
            </div>
            <div class="agent-field">
              <label class="agent-label">Style</label>
                <select class="agent-input" v-model="setupData.style">
                  <option value="romantic">Romantic</option>
                  <option value="cyberpunk">Cyberpunk</option>
                  <option value="fantasy">Fantasy</option>
                  <option value="anime">Anime</option>
                  <option value="realistic">Realistic</option>
                  <option value="gothic">Gothic</option>
                </select>
            </div>
          </div>

          <!-- Step 4: Portrait -->
          <div v-if="setupStep === 4 && !isFinalizing">
            <div class="agent-portrait-stage">
              <div v-if="setupPreviewImage" class="agent-portrait-preview">
                <img :src="setupPreviewImage" alt="Generated portrait" />
              </div>
              <div v-else class="agent-portrait-empty">
                <span class="material-symbols-outlined" aria-hidden="true">image</span>
              </div>
              <button
                class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
                :class="{ 'bz-btn--running': isGeneratingImage }"
                :disabled="isGeneratingImage"
                @click="generateSetupImage"
              >
                <span class="material-symbols-outlined" aria-hidden="true">auto_fix_high</span>
                {{ setupPreviewImage ? 'Regenerate Portrait' : 'Generate Portrait' }}
              </button>
              <p class="agent-help">
                Uses your appearance description to generate a portrait via the image pipeline.
              </p>
            </div>
          </div>

          <!-- Step 5: Confirm -->
          <div v-if="setupStep === 5 && !isFinalizing">
            <div class="bz-notice bz-notice--info bz-notice--stacked agent-summary">
              <h4 class="agent-section__title fira-sans-condensed-black-italic">Summary</h4>
              <p><strong>Name:</strong> {{ setupData.firstName }} {{ setupData.familyName }}</p>
              <p><strong>Gender:</strong> {{ setupData.gender === 1 ? 'Female' : setupData.gender === 2 ? 'Male' : 'Neutral' }}</p>
              <p><strong>Age:</strong> {{ setupData.age }}</p>
              <p><strong>Bio:</strong> {{ setupData.shortBio || '(none)' }}</p>
              <p><strong>Personality (OCEAN):</strong> O:{{ setupData.openness }} C:{{ setupData.conscientiousness }} E:{{ setupData.extraversion }} A:{{ setupData.agreeableness }} N:{{ setupData.neuroticism }}</p>
              <p><strong>Appearance:</strong> {{ (setupData.appearance || '').slice(0, 80) }}{{ (setupData.appearance || '').length > 80 ? '...' : '' }}</p>
              <p><strong>Style:</strong> {{ setupData.style }}</p>
              <p><strong>Portrait:</strong> {{ setupPreviewImage ? 'Generated' : 'None (will be generated during finalization)' }}</p>
            </div>
            <div class="bz-notice bz-notice--warning">
              <span class="bz-notice__icon"><span class="material-symbols-outlined" aria-hidden="true">warning</span></span>
              <div class="bz-notice__body">
                <p class="bz-notice__text"><strong>This will execute multiple on-chain transactions:</strong>
                setAgentURI, setAgentWallet, setSpendingProfile, setPersonalityHash, and setMetadataBatch.
                Make sure you have enough ETH on Ethereum for gas fees.</p>
              </div>
            </div>
          </div>

          <!-- Finalization error -->
          <div v-if="finalizeError" class="bz-notice bz-notice--danger">
            <span class="bz-notice__icon"><span class="material-symbols-outlined" aria-hidden="true">error</span></span>
            <div class="bz-notice__body"><p class="bz-notice__text">{{ finalizeError }}</p></div>
          </div>
        </section>
        <footer class="agent-modal__foot" v-if="!isFinalizing">
          <button
            v-if="setupStep > 1"
            class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
            @click="setupStep--"
          >
            Back
          </button>
          <button
            v-if="setupStep < 5"
            class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
            @click="setupStep++"
            :disabled="!canAdvanceStep"
          >
            Next
          </button>
          <button
            v-if="setupStep === 5"
            class="bz-btn bz-btn--agent-cta fira-sans-condensed-black-italic"
            @click="executeFinalization"
          >
            <span class="material-symbols-outlined" aria-hidden="true">rocket_launch</span>
            Finalize Companion
          </button>
          <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="closeSetupWizard">Cancel</button>
        </footer>
      </div>
    </div>

    <hr />
    <header class="browse-agents__head">
      <div>
        <p class="bz-eyebrow">Leaderboard</p>
        <h2 class="browse-agents__title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined" aria-hidden="true">leaderboard</span>
          Top 10 Companions
        </h2>
        <p v-if="isMockData" class="leaderboard-source bz-meta">
          Demo data shown until on-chain companion leaderboard data is available.
        </p>
      </div>
      <button class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic" @click="loadLeaderboard">
        <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
        Refresh
      </button>
    </header>
    <BonzaiEmptyState
      v-if="isLeaderboardLoading"
      size="compact"
      icon="hourglass_empty"
      title="Loading leaderboard"
      :show-orb="false"
    />
    <div v-else-if="leaderboardError" class="browse-agents__notice browse-agents__notice--danger">
      <span class="material-symbols-outlined" aria-hidden="true">error</span>
      <span>Failed to load leaderboard: {{ leaderboardError }}</span>
    </div>
    <BonzaiDataTable
      v-else
      :columns="leaderboardColumns"
      :rows="leaderboard"
      :row-key="row => row.rank"
      density="compact"
      empty-title="No leaderboard entries"
    >
      <template #cell-name="{ row }">
        <span class="companion-rank">#{{ row.rank }}</span>
        <span class="fira-sans-condensed-black-italic">{{ row.name }}</span>
      </template>
      <template #cell-universalProfile="{ row }">
        <a
          v-if="row.universalProfile"
          :href="`https://universaleverything.io/${row.universalProfile}`"
          target="_blank"
          class="leaderboard-up bz-mono"
        >
          {{ shortAddress(row.universalProfile) }}
        </a>
        <span v-else class="muted">Not attached</span>
      </template>
      <template #cell-action="{ row }">
        <a
          v-if="row.tokenAddress"
          :href="`https://app.uniswap.org/#/swap?chain=mainnet&outputCurrency=${row.tokenAddress}`"
          target="_blank"
          class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
        >
          Buy token
        </a>
        <span v-else class="muted">No token</span>
      </template>
    </BonzaiDataTable>
  </div>
</template>

<script>
import { ref, onMounted, watch, computed } from "vue";
import { companionService } from "../../services/companion.service.js";
import { getLeaderboard, isUsingMockData } from "../../services/leaderboard.service.js";
import { skillOwnershipService } from "../../services/skillOwnership.service.js";
import { web3Service, switchNetwork } from "../../services/web3.service.js";
import { ECONOMY_NETWORK_KEY } from "../../config/web3.config.js";
import { walletProviderService } from "../../services/walletProvider.service.js";
import { owsMigrationService } from "../../services/owsMigration.service.js";
import { SKILL_CATEGORY_META } from "../../skills/types.js";
import { validateCompanionAge } from "../../skills/flagship.js";
import { getCompanionCareer } from "../../skills/companionSkillRoadmap.js";
import BonzaiPulse from "../BonzaiPulse.vue";
import BzCloseButton from "../BzCloseButton.vue";
import BonzaiDataTable from "../BonzaiDataTable.vue";
import BonzaiEmptyState from "../BonzaiEmptyState.vue";

export default {
  name: "BrowseAgents",
  components: {
    BzCloseButton,
    BonzaiDataTable,
    BonzaiEmptyState,
    BonzaiPulse,
  },
  props: {
    skills: {
      type: Array,
      default: () => [],
    },
  },
  setup(props) {
    const companions = ref([]);
    const isLoading = ref(true);
    const selectedCompanion = ref(null);
    const careerFor = (companion) => getCompanionCareer(companion?.id || companion?.companionId);
    const selectedCareer = computed(() => careerFor(selectedCompanion.value));
    const companionRevenue = ref(null);
    const companionOwnedSkills = ref([]);
    const isLoadingSkills = ref(false);
    const isClaimingRevenue = ref(false);

    const leaderboard = ref([]);
    const isLeaderboardLoading = ref(true);
    const leaderboardError = ref(null);
    const isMockData = ref(true);
    const currencyFmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    const leaderboardColumns = [
      { key: "name", title: "Companion", width: "280px" },
      {
        key: "netWorth",
        title: "Market capitalization",
        width: "180px",
        align: "right",
        mono: true,
        formatter: (value) => currencyFmt.format(value || 0),
      },
      {
        key: "monthlyRevenue",
        title: "Revenue",
        width: "160px",
        align: "right",
        mono: true,
        formatter: (value) => currencyFmt.format(value || 0),
      },
      { key: "universalProfile", title: "Universal Profile", width: "170px" },
      { key: "action", title: "", width: "112px", align: "right" },
    ];
    const ownedSkillColumns = [
      { key: "name", title: "Skill", width: "220px" },
      {
        key: "unclaimed",
        title: "Unclaimed revenue",
        width: "160px",
        align: "right",
        mono: true,
        formatter: (value) => `${value || "0"} USDC`,
      },
      { key: "action", title: "", width: "96px", align: "right" },
    ];
    const distributionColumns = [
      { key: "when", title: "When", width: "96px" },
      { key: "skill", title: "Skill", width: "180px" },
      { key: "share", title: "Share", width: "140px", align: "right", mono: true },
      { key: "weight", title: "Weight", width: "96px", align: "right", mono: true },
      { key: "action", title: "", width: "60px", align: "right" },
    ];

    // Backup modal state
    const showBackupModal = ref(false);
    const showPrivateKey = ref(false);
    const backupKeyValue = ref('');
    const backupCountdown = ref(30);
    let backupTimer = null;

    // Register modal state
    const showRegisterModal = ref(false);
    const registeringSkillId = ref(null);

    // Setup wizard state
    const showSetupWizard = ref(false);
    const setupTarget = ref(null);
    const setupStep = ref(1);
    const setupData = ref({
      firstName: '', familyName: '', gender: 0, age: 25, shortBio: '',
      openness: 5, conscientiousness: 5, extraversion: 5, agreeableness: 5, neuroticism: 5,
      background: '', voiceStyle: '', firstMessage: '',
      appearance: '', style: 'openness',
    });
    const setupPreviewImage = ref(null);
    const isGeneratingImage = ref(false);
    const isFinalizing = ref(false);
    const finalizeProgress = ref({ stage: '', message: '', percent: 0 });
    const finalizeError = ref(null);

    // Universal Profile state
    const selectedCompanionUP = ref(null);
    const isDeployingUP = ref(false);
    const shortAddress = (address) => {
      if (!address) return "";
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // OWS wallet state
    const companionWalletProvider = ref(null); // 'ows' | 'privy' | 'local'
    const companionEthBalance = ref(null);
    const companionTxHistory = ref([]);
    const companionPolicies = ref([]);
    const companionApiKeys = ref([]);
    const isMigrating = ref(false);
    const showPolicyModal = ref(false);
    const newPolicyData = ref({ chains: 'eip155:1', dailyLimit: '0.005', expiryDays: 365 });
    const showNewApiKeyModal = ref(false);
    const newApiKeyToken = ref(null);

    const loadCompanionUP = async (companionId) => {
      try {
        const upData = await companionService.agentWallet.getCompanionUP(companionId);
        selectedCompanionUP.value = upData?.upAddress || null;
      } catch {
        selectedCompanionUP.value = null;
      }
    };

    const upDeployStatus = ref(null);

    /**
     * Streamlined Universal Profile attachment:
     * 1. Switch to LUKSO
     * 2. Deploy UP via LSP23
     * 3. Switch back to Ethereum
     */
    const attachUniversalProfile = async () => {
      if (!selectedCompanion.value || isDeployingUP.value) return;
      if (!web3Service.state.address) {
        alert('Please connect your wallet first.');
        return;
      }

      isDeployingUP.value = true;
      const companionId = selectedCompanion.value.id || selectedCompanion.value.tokenId;

      try {
        // Step 1: Switch to LUKSO
        upDeployStatus.value = 'Switching to LUKSO...';
        await switchNetwork('lukso');

        // Step 2: Deploy UP
        upDeployStatus.value = 'Deploying Universal Profile...';
        const result = await companionService.deployCompanionUP(companionId, selectedCompanion.value);
        selectedCompanionUP.value = result.upAddress;

        // Step 3: Switch back to Ethereum
        upDeployStatus.value = 'Returning to Ethereum...';
        try {
          await switchNetwork(ECONOMY_NETWORK_KEY);
        } catch {
          // Non-fatal — UP is deployed, user can switch manually
          console.warn('[BrowseAgents] Could not auto-switch back to Ethereum');
        }

        upDeployStatus.value = null;
      } catch (err) {
        console.error('[BrowseAgents] UP attachment failed:', err);
        upDeployStatus.value = null;
        alert('Universal Profile attachment failed: ' + err.message);

        // Try to return to Ethereum even on failure
        try { await switchNetwork(ECONOMY_NETWORK_KEY); } catch { /* best effort */ }
      } finally {
        isDeployingUP.value = false;
      }
    };

    // Load wallet provider type and ETH balance for selected companion
    async function loadCompanionWalletInfo(companion) {
      const id = companion.id || companion.tokenId;
      try {
        const creds = await walletProviderService.getAgentWalletCredentials(id);
        companionWalletProvider.value = creds?.provider || 'local';

        // Load ETH balance
        const balance = await walletProviderService.getAgentWalletBalance(id, 1);
        companionEthBalance.value = parseFloat(balance).toFixed(6);
      } catch (err) {
        console.warn('[BrowseAgents] Wallet info load failed:', err.message);
        companionWalletProvider.value = 'local';
        companionEthBalance.value = null;
      }
    }

    // Load OWS-specific data (policies, API keys)
    async function loadOWSData() {
      if (companionWalletProvider.value !== 'ows') {
        companionPolicies.value = [];
        companionApiKeys.value = [];
        return;
      }
      try {
        const [policies, keys] = await Promise.all([
          walletProviderService.getOWSPolicies(),
          walletProviderService.getOWSApiKeys(),
        ]);
        companionPolicies.value = Array.isArray(policies) ? policies : [];
        companionApiKeys.value = Array.isArray(keys) ? keys : [];
      } catch {
        companionPolicies.value = [];
        companionApiKeys.value = [];
      }
    }

    // Migrate legacy wallet to OWS
    async function migrateToOWS() {
      if (!selectedCompanion.value || isMigrating.value) return;
      const id = selectedCompanion.value.id || selectedCompanion.value.tokenId;
      isMigrating.value = true;
      try {
        const result = await owsMigrationService.migrateCompanion(id);
        if (result.success) {
          companionWalletProvider.value = 'ows';
          await loadOWSData();
        } else {
          alert('Migration failed: ' + result.error);
        }
      } catch (err) {
        alert('Migration error: ' + err.message);
      } finally {
        isMigrating.value = false;
      }
    }

    // Create OWS policy
    async function createPolicy() {
      try {
        await walletProviderService.createOWSPolicy({
          allowed_chains: newPolicyData.value.chains.split(',').map(c => c.trim()),
          daily_limit_eth: newPolicyData.value.dailyLimit,
          expires_at: new Date(Date.now() + newPolicyData.value.expiryDays * 86400000).toISOString(),
        });
        showPolicyModal.value = false;
        await loadOWSData();
      } catch (err) {
        alert('Policy creation failed: ' + err.message);
      }
    }

    // Create OWS API key
    async function createApiKey() {
      if (!selectedCompanion.value) return;
      const id = selectedCompanion.value.id || selectedCompanion.value.tokenId;
      try {
        const owsMapping = await window.electronAPI?.store?.get(`ows-wallet-${id}`);
        const passphrase = await window.electronAPI?.store?.get(`ows-passphrase-${id}`);
        if (!owsMapping || !passphrase) return;

        const { owsService } = await import('../../services/ows.service.js');
        const result = await owsService.createApiKey(
          `${owsMapping.walletName}-key-${Date.now()}`,
          [owsMapping.walletName],
          [],
          passphrase,
          new Date(Date.now() + 365 * 86400000).toISOString()
        );
        if (result?.token) {
          newApiKeyToken.value = result.token;
          showNewApiKeyModal.value = true;
          await loadOWSData();
        }
      } catch (err) {
        alert('API key creation failed: ' + err.message);
      }
    }

    // Revoke OWS API key
    async function revokeApiKey(keyId) {
      try {
        const { owsService } = await import('../../services/ows.service.js');
        await owsService.revokeApiKey(keyId);
        await loadOWSData();
      } catch (err) {
        alert('Revoke failed: ' + err.message);
      }
    }

    // Eligible skills for registration (profile score >= 5)
    const eligibleSkills = computed(() => {
      if (!selectedCompanion.value?.spendingHabits || !props.skills) return [];
      return props.skills
        .filter(skill => {
          const score = selectedCompanion.value.spendingHabits[skill.category] || 0;
          return score >= 5;
        })
        .map(skill => ({
          ...skill,
          companionScore: selectedCompanion.value.spendingHabits[skill.category] || 0,
        }));
    });

    function getCategoryMeta(category) {
      return SKILL_CATEGORY_META[category] || { label: category, icon: 'category' };
    }

    async function selectCompanion(companion) {
      selectedCompanion.value = companion;
      const id = companion.id || companion.tokenId;
      if (id) {
        loadCompanionUP(id);
        loadCompanionWalletInfo(companion);
      }
    }

    function closeCompanionModal() {
      selectedCompanion.value = null;
      selectedCompanionUP.value = null;
      companionOwnedSkills.value = [];
      companionWalletProvider.value = null;
      companionEthBalance.value = null;
      companionPolicies.value = [];
      companionApiKeys.value = [];
    }

    async function loadCompanionSkills(companion) {
      if (!companion?.agentWallet) {
        companionOwnedSkills.value = [];
        return;
      }

      isLoadingSkills.value = true;
      try {
        const allSkillIds = props.skills?.map(s => s.onChain?.id).filter(Boolean) || [];
        if (allSkillIds.length === 0) {
          companionOwnedSkills.value = [];
          return;
        }

        const ownedIds = await skillOwnershipService.getCompanionOwnedSkills(
          companion.tokenId,
          allSkillIds
        );

        companionOwnedSkills.value = await Promise.all(
          ownedIds.map(async (skillId) => {
            const unclaimed = await skillOwnershipService.getCompanionSkillRevenue(
              companion.agentWallet,
              skillId
            );
            const skillData = props.skills.find(s => s.onChain?.id === skillId);
            return {
              skillId,
              category: skillData?.category,
              name: skillData?.name || 'Unknown Skill',
              unclaimed: parseFloat(unclaimed).toFixed(6),
            };
          })
        );

        // Kick off history fetch in parallel with the above — non-blocking.
        loadDistributionHistory();
      } catch (err) {
        console.warn('Failed to load companion skills:', err);
        companionOwnedSkills.value = [];
      } finally {
        isLoadingSkills.value = false;
      }
    }

    // ─── Distribution history (CompanionRevenueShare events) ────────────
    const distributionHistory = ref([]);
    const isLoadingHistory = ref(false);

    async function loadDistributionHistory() {
      if (!selectedCompanion.value?.agentWallet) {
        distributionHistory.value = [];
        return;
      }
      isLoadingHistory.value = true;
      try {
        const events = await skillOwnershipService.getDistributionHistory(
          selectedCompanion.value.agentWallet
        );
        // Enrich with human-readable skill name where we can resolve it.
        const skillLookup = new Map(
          (props.skills || []).map((s) => [s.onChain?.id, s])
        );
        distributionHistory.value = events.map((e) => ({
          ...e,
          skillName: skillLookup.get(e.skillId)?.name || null,
        }));
      } catch (err) {
        console.warn('Failed to load distribution history:', err);
      } finally {
        isLoadingHistory.value = false;
      }
    }

    function formatRelativeTime(unixSec) {
      const delta = Date.now() / 1000 - unixSec;
      if (delta < 60) return 'just now';
      if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
      if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
      if (delta < 30 * 86400) return `${Math.floor(delta / 86400)}d ago`;
      return new Date(unixSec * 1000).toISOString().slice(0, 10);
    }

    function formatUsdc(raw) {
      return (Number(raw) / 1_000_000).toFixed(2);
    }

    async function claimRevenue() {
      isClaimingRevenue.value = true;
      try {
        await skillOwnershipService.claimAllRevenue();
        // Refresh revenue after claiming
        if (selectedCompanion.value) {
          companionRevenue.value = await companionService.getCompanionRevenue(selectedCompanion.value);
          await loadCompanionSkills(selectedCompanion.value);
        }
      } catch (err) {
        console.error('Failed to claim revenue:', err);
      } finally {
        isClaimingRevenue.value = false;
      }
    }

    const registrationError = ref(null);
    const updatingSkillId = ref(null);
    const signerState = ref(null);

    // Check attestation signer state when the register modal opens so we can
    // warn the user before they waste gas. Only re-fetch once per session
    // unless explicitly refreshed.
    watch(showRegisterModal, async (open) => {
      if (!open || signerState.value) return;
      try {
        signerState.value = await skillOwnershipService.checkAttestationSignerState();
      } catch (e) {
        console.warn("[BrowseAgents] Failed to check signer state:", e.message);
      }
    });

    async function updateRegistrationForSkill(skill) {
      if (!selectedCompanion.value || updatingSkillId.value) return;
      updatingSkillId.value = skill.skillId;
      registrationError.value = null;
      try {
        const companion = selectedCompanion.value;
        const ageCheck = validateCompanionAge(companion);
        if (!ageCheck.valid) {
          registrationError.value = ageCheck.reason || 'Companion failed age validation.';
          return;
        }
        // Derive current profile score from the companion's spending habits.
        // Skill category is stored on the on-chain record; look it up by name
        // if available, else fall back to 5 (minimum acceptable).
        const category = skill.category || skill.skill?.category;
        const profileScore = category
          ? (companion.spendingHabits?.[category] || 5)
          : 5;
        await skillOwnershipService.updateCompanionRegistration(
          skill.skillId,
          companion.tokenId,
          companion.agentWallet,
          profileScore
        );
        await loadCompanionSkills(companion);
      } catch (err) {
        console.error('Failed to update registration:', err);
        registrationError.value = err.message || 'Update failed.';
      } finally {
        updatingSkillId.value = null;
      }
    }

    async function registerForSkill(skill) {
      if (!selectedCompanion.value) return;
      registeringSkillId.value = skill.id;
      registrationError.value = null;
      try {
        // Safety: refuse to register a companion that fails age validation,
        // even if it slipped past earlier checks (e.g. imported from a file).
        const ageCheck = validateCompanionAge(selectedCompanion.value);
        if (!ageCheck.valid) {
          registrationError.value = ageCheck.reason || 'Companion failed age validation.';
          return;
        }

        const profileScore = selectedCompanion.value.spendingHabits[skill.category] || 0;
        await skillOwnershipService.registerCompanionForSkill(
          skill.onChain?.id || skill.id,
          selectedCompanion.value.tokenId,
          selectedCompanion.value.agentWallet,
          profileScore
        );
        showRegisterModal.value = false;
        await loadCompanionSkills(selectedCompanion.value);
      } catch (err) {
        console.error('Failed to register for skill:', err);
        registrationError.value = err.message || 'Registration failed. Please try again.';
      } finally {
        registeringSkillId.value = null;
      }
    }

    // Private key backup
    async function loadPrivateKey() {
      if (!selectedCompanion.value) return;
      try {
        const wallet = await companionService.agentWallet.getAgentWallet(
          selectedCompanion.value.id
        );
        backupKeyValue.value = wallet?.privateKey || 'Could not retrieve key';
      } catch {
        backupKeyValue.value = 'Could not retrieve key';
      }
    }

    function closeBackupModal() {
      showBackupModal.value = false;
      showPrivateKey.value = false;
      backupKeyValue.value = '';
      backupCountdown.value = 30;
      if (backupTimer) {
        clearInterval(backupTimer);
        backupTimer = null;
      }
    }

    function copyPrivateKey() {
      if (backupKeyValue.value && backupKeyValue.value !== 'Could not retrieve key') {
        navigator.clipboard.writeText(backupKeyValue.value);
      }
    }

    watch(showPrivateKey, (visible) => {
      if (visible) {
        backupCountdown.value = 30;
        backupTimer = setInterval(() => {
          backupCountdown.value--;
          if (backupCountdown.value <= 0) {
            showPrivateKey.value = false;
            clearInterval(backupTimer);
            backupTimer = null;
          }
        }, 1000);
      }
    });

    watch(showBackupModal, async (visible) => {
      if (visible) {
        await loadPrivateKey();
      } else {
        closeBackupModal();
      }
    });

    watch(selectedCompanion, async (newVal) => {
      if (newVal) {
        companionRevenue.value = await companionService.getCompanionRevenue(newVal);
        await loadCompanionSkills(newVal);
      } else {
        companionRevenue.value = null;
        companionOwnedSkills.value = [];
      }
    });

    // Load OWS data when wallet provider is detected as OWS
    watch(companionWalletProvider, async (provider) => {
      if (provider === 'ows') {
        await loadOWSData();
      }
    });

    // Setup wizard methods
    function openSetupWizard(companion) {
      setupTarget.value = companion;
      setupStep.value = 1;
      setupPreviewImage.value = null;
      finalizeError.value = null;
      isFinalizing.value = false;
      setupData.value = {
        firstName: '', familyName: '',
        gender: companion.gender === 'female' ? 1 : companion.gender === 'male' ? 2 : 0,
        age: 25, shortBio: '',
        openness: 5, conscientiousness: 5, extraversion: 5, agreeableness: 5, neuroticism: 5,
        background: '', voiceStyle: '', firstMessage: '',
        appearance: '', style: 'openness',
      };
      showSetupWizard.value = true;
    }

    function closeSetupWizard() {
      showSetupWizard.value = false;
      setupTarget.value = null;
      isFinalizing.value = false;
      finalizeError.value = null;
    }

    const canAdvanceStep = computed(() => {
      if (setupStep.value === 1) return !!setupData.value.firstName;
      if (setupStep.value === 2) return true; // Big 5 sliders always have valid defaults
      if (setupStep.value === 3) return !!setupData.value.appearance;
      return true;
    });

    async function generateSetupImage() {
      isGeneratingImage.value = true;
      try {
        const { generateCompanionPicture } = await import('../../skills/flagship.js');
        const result = await generateCompanionPicture(setupData.value);
        if (result?.base64) {
          setupPreviewImage.value = `data:image/png;base64,${result.base64}`;
          setupData.value.imageBase64 = result.base64;
        } else if (result?.image) {
          setupPreviewImage.value = result.image;
          setupData.value.imageBase64 = result.base64 || result.image;
        }
      } catch (err) {
        console.error('[BrowseAgents] Image generation failed:', err);
        finalizeError.value = 'Image generation failed: ' + err.message;
      } finally {
        isGeneratingImage.value = false;
      }
    }

    async function executeFinalization() {
      if (!setupTarget.value || isFinalizing.value) return;
      isFinalizing.value = true;
      finalizeError.value = null;

      const result = await companionService.finalizeCompanion(
        setupTarget.value.tokenId,
        { ...setupData.value },
        {
          skipImageGeneration: !!setupData.value.imageBase64,
          onProgress: (stage, message, percent) => {
            finalizeProgress.value = { stage, message, percent };
          },
        }
      );

      if (result.success) {
        // Refresh companion list
        const userAddress = web3Service.state.walletAddress;
        if (userAddress) {
          companions.value = await companionService.loadOwnedCompanions(userAddress);
        }
        closeSetupWizard();
      } else {
        finalizeError.value = result.error || 'Finalization failed';
        isFinalizing.value = false;
      }
    }

    async function loadLeaderboard() {
      isLeaderboardLoading.value = true;
      leaderboardError.value = null;
      try {
        leaderboard.value = await getLeaderboard();
        isMockData.value = isUsingMockData() || leaderboard.value.some((row) => row.isMock);
      } catch (err) {
        leaderboardError.value = err.message;
      } finally {
        isLeaderboardLoading.value = false;
      }
    }

    onMounted(async () => {
      const userAddress = web3Service.state.walletAddress;
      if (userAddress) {
        companions.value =
          await companionService.loadOwnedCompanions(userAddress);
      }
      isLoading.value = false;

      await loadLeaderboard();
    });

    return {
      companions,
      isLoading,
      selectedCompanion,
      selectedCareer,
      careerFor,
      companionRevenue,
      companionOwnedSkills,
      isLoadingSkills,
      isClaimingRevenue,
      leaderboard,
      leaderboardColumns,
      ownedSkillColumns,
      distributionColumns,
      shortAddress,
      isLeaderboardLoading,
      leaderboardError,
      isMockData,
      showBackupModal,
      showPrivateKey,
      backupKeyValue,
      backupCountdown,
      showRegisterModal,
      registeringSkillId,
      registrationError,
      eligibleSkills,
      selectCompanion,
      closeCompanionModal,
      claimRevenue,
      registerForSkill,
      updatingSkillId,
      updateRegistrationForSkill,
      signerState,
      distributionHistory,
      isLoadingHistory,
      loadDistributionHistory,
      formatRelativeTime,
      formatUsdc,
      closeBackupModal,
      copyPrivateKey,
      loadLeaderboard,
      getCategoryMeta,
      selectedCompanionUP,
      isDeployingUP,
      upDeployStatus,
      attachUniversalProfile,
      // OWS wallet
      companionWalletProvider,
      companionEthBalance,
      companionTxHistory,
      companionPolicies,
      companionApiKeys,
      isMigrating,
      showPolicyModal,
      newPolicyData,
      showNewApiKeyModal,
      newApiKeyToken,
      migrateToOWS,
      createPolicy,
      createApiKey,
      revokeApiKey,
      // Setup wizard
      showSetupWizard,
      setupTarget,
      setupStep,
      setupData,
      setupPreviewImage,
      isGeneratingImage,
      isFinalizing,
      finalizeProgress,
      finalizeError,
      canAdvanceStep,
      openSetupWizard,
      closeSetupWizard,
      generateSetupImage,
      executeFinalization,
    };
  },
};
</script>
<style scoped>
.browse-agents {
  width: 100%;
  max-width: none;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: var(--bz-fg);
}

.browse-agents__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.browse-agents__head .bz-eyebrow {
  margin: 0 0 var(--bz-space-1);
}

.browse-agents__title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--bz-fg);
  font-size: clamp(1.6rem, 2vw, 2.35rem);
  line-height: 0.95;
  letter-spacing: 0;
}

.browse-agents__title .material-symbols-outlined {
  color: var(--bz-accent);
  font-size: 0.85em;
}

.leaderboard-source {
  margin: var(--bz-space-2) 0 0;
  color: var(--bz-fg-mid);
}

.companions-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
  gap: 12px;
}

.companion-card {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 16px;
  min-height: 128px;
  padding: 14px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
  box-shadow: var(--bz-shadow-soft);
  color: var(--bz-fg);
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.companion-card:hover {
  border-color: var(--bz-accent);
  background: var(--bz-surface);
}

.companion-card__avatar {
  width: 88px;
  height: 88px;
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-canvas);
  display: grid;
  place-items: center;
  color: var(--bz-muted);
}

.companion-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.companion-card__avatar .material-symbols-outlined {
  font-size: 28px;
}

.companion-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.companion-card__top {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.companion-card__top strong {
  min-width: 0;
  color: var(--bz-fg);
  font-size: 1.18rem;
  line-height: 1.18;
  letter-spacing: 0;
  overflow-wrap: anywhere;
  word-break: normal;
  hyphens: auto;
  text-wrap: balance;
}

.companion-card__body p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--bz-muted);
  font-size: 0.86rem;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.companion-career {
  display: block;
  margin-top: var(--bz-space-2);
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
}

.companion-career-panel > p:not(.bz-eyebrow):not(.agent-help) {
  color: var(--bz-fg-mid);
  line-height: var(--bz-line-body);
}

.companion-pill {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid var(--bz-border);
  border-radius: 999px;
  color: var(--bz-muted);
  font-size: 0.7rem;
  line-height: 1;
  text-transform: uppercase;
}

.companion-pill--warning {
  border-color: color-mix(in srgb, var(--bz-warning) 55%, transparent);
  color: var(--bz-warning);
}

.browse-agents__notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
  color: var(--bz-muted);
}

.browse-agents__notice--danger {
  border-color: color-mix(in srgb, var(--bz-danger) 42%, var(--bz-border));
  color: var(--bz-danger);
}

.companion-rank {
  display: inline-flex;
  min-width: 42px;
  color: var(--bz-muted);
  font-family: var(--bz-font-mono);
}

.muted {
  color: var(--bz-muted);
}

.leaderboard-up {
  color: var(--bz-purple-100);
  text-decoration: none;
}

.leaderboard-up:hover {
  color: var(--bz-control-selected-fg);
  text-decoration: underline;
}

.companion-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.companion-metric {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-card);
}

.companion-metric__label {
  display: block;
  color: var(--bz-muted);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.companion-metric__value {
  display: block;
  margin-top: 6px;
  color: var(--bz-fg);
  font-size: 1.35rem;
  line-height: 1;
}

.agent-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: var(--bz-space-5);
}

.agent-modal__backdrop {
  position: absolute;
  inset: 0;
  background: var(--bz-overlay);
}

.agent-modal__panel {
  position: relative;
  z-index: 1;
  width: min(560px, calc(100vw - 32px));
  max-height: min(86vh, 920px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--bz-border-strong);
  border-radius: 8px;
  background: var(--bz-card);
  box-shadow: var(--bz-shadow-xl);
}

.agent-modal__panel--narrow {
  width: min(460px, calc(100vw - 32px));
}

.agent-modal__panel--wide {
  width: min(760px, calc(100vw - 32px));
}

.agent-modal__head,
.agent-modal__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  padding: var(--bz-space-4) var(--bz-space-5);
  border-bottom: 1px solid var(--bz-border);
  background: var(--bz-panel);
}

.agent-modal__foot {
  justify-content: flex-end;
  flex-wrap: wrap;
  border-top: 1px solid var(--bz-border);
  border-bottom: 0;
}

.agent-modal__title {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin: 0;
  color: var(--bz-fg);
  font-size: 1.7rem;
  line-height: 1;
}

.agent-modal__body {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-4);
  min-height: 0;
  overflow-y: auto;
  padding: var(--bz-space-5);
}

.agent-section {
  display: grid;
  gap: var(--bz-space-3);
}

.agent-section__title {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin: 0;
  color: var(--bz-fg);
  font-size: 1.25rem;
  line-height: 1;
}

.agent-section__title--spaced {
  margin-top: var(--bz-space-4);
}

.agent-wallet-row {
  display: grid;
  grid-template-columns: 138px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bz-space-2);
  min-width: 0;
  padding: var(--bz-space-2) 0;
  border-bottom: 1px solid var(--bz-border);
}

.agent-wallet-row__label {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}

.agent-wallet-row__value {
  min-width: 0;
  overflow: hidden;
  color: var(--bz-fg-mid);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-pill,
.agent-score-chip,
.agent-step-chip,
.agent-value-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  min-height: 26px;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: 999px;
  background: var(--bz-panel);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-micro);
  line-height: 1;
  text-transform: uppercase;
}

.agent-pill--success,
.agent-score-chip--success {
  border-color: color-mix(in srgb, var(--bz-emerald-500) 46%, var(--bz-border));
  background: var(--bz-emerald-soft);
  color: var(--bz-emerald-300);
}

.agent-pill--info {
  border-color: color-mix(in srgb, var(--bz-info) 46%, var(--bz-border));
  color: var(--bz-info);
}

.agent-pill--warning,
.agent-score-chip--warning,
.agent-step-chip--active,
.agent-value-pill {
  border-color: color-mix(in srgb, var(--bz-warning) 52%, var(--bz-border));
  background: var(--bz-warning-soft);
  color: var(--bz-warning);
}

.agent-chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}

.agent-chip-grid--steps {
  justify-content: center;
}

.agent-score-chip .material-symbols-outlined {
  font-size: 15px;
}

.agent-inline-action,
.agent-finalize-progress,
.agent-stepper {
  display: grid;
  gap: var(--bz-space-2);
}

.agent-help,
.agent-muted {
  margin: 0;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  line-height: 1.4;
}

.agent-help--warning,
.agent-help--danger {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
}

.agent-help--warning {
  color: var(--bz-warning);
}

.agent-help--danger {
  color: var(--bz-danger);
}

.agent-list,
.agent-register-list {
  display: grid;
  gap: var(--bz-space-2);
}

.agent-list-row,
.agent-register-card {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  min-width: 0;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}

.agent-list-row--split,
.agent-register-card {
  justify-content: space-between;
}

.agent-register-card {
  cursor: pointer;
}

.agent-register-card:hover {
  border-color: var(--bz-border-strong);
  background: var(--bz-raised);
}

.agent-register-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-2);
}

.agent-action-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}

.agent-field {
  display: grid;
  gap: var(--bz-space-2);
}

.agent-label {
  display: flex;
  align-items: baseline;
  gap: var(--bz-space-1);
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
}

.agent-label span {
  color: var(--bz-fg-low);
}

.agent-input {
  width: 100%;
  min-height: 40px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  outline: 0;
  background: var(--bz-panel);
  color: var(--bz-fg);
  font: inherit;
}

.agent-input:focus {
  border-color: var(--bz-border-brand);
}

.agent-textarea {
  min-height: 84px;
  padding-top: var(--bz-space-3);
  resize: vertical;
}

.agent-range-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px;
  align-items: center;
  gap: var(--bz-space-3);
}

.agent-range-row input[type="range"] {
  width: 100%;
  accent-color: var(--bz-purple-300);
}

.agent-value-pill {
  justify-content: center;
  min-width: 42px;
  font-family: var(--bz-font-mono);
}

.agent-portrait-stage {
  display: grid;
  justify-items: center;
  gap: var(--bz-space-3);
}

.agent-portrait-preview,
.agent-portrait-empty {
  width: min(300px, 100%);
  aspect-ratio: 1;
  overflow: hidden;
  display: grid;
  place-items: center;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
}

.agent-portrait-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agent-portrait-empty .material-symbols-outlined {
  color: var(--bz-fg-faint);
  font-size: 56px;
}

.agent-summary {
  gap: var(--bz-space-2);
}

.agent-summary p {
  margin: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}

.tag.is-fullwidth {
  display: flex;
}

hr {
  margin: 12px 0;
  width: 100%;
  border: none;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    var(--bz-fg),
    transparent
  );
}

.is-clickable {
  cursor: pointer;
  transition: background-color 0.15s;
}
.is-clickable:hover {
  background-color: var(--bz-canvas);
}

.attach-up-btn {
  display: inline-flex;
  align-items: center;
}

.bare-companion {
  border: 2px dashed rgba(255, 153, 51, 0.4);
  background: rgba(255, 153, 51, 0.03);
}
.bare-companion:hover {
  border-color: rgba(255, 153, 51, 0.7);
}
</style>

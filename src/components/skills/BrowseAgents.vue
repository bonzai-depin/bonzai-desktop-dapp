<template>
  <div>
    <h2
      class="fira-sans-condensed-black-italic is-size-2 mt-5 mb-5 has-text-left"
    >
      <span class="has-text-brand pt-5">
        <span class="material-symbols-outlined mr-2 is-size-1">person_pin</span>
        My Companions
      </span>
    </h2>
    <div v-if="isLoading" class="has-text-centered">
      <p class="has-text-grey-light">Loading your companions...</p>
    </div>
    <div v-else-if="companions.length === 0" class="notification is-info">
      <p>You haven't minted any companions yet.</p>
    </div>
    <div v-else class="columns is-multiline">
      <div
        v-for="companion in companions"
        :key="companion.id"
        class="column is-one-third"
      >
        <div
          class="box companion-card"
          :class="{ 'bare-companion': companion.isBare }"
          @click="companion.isBare ? openSetupWizard(companion) : selectCompanion(companion)"
        >
          <article class="media">
            <div class="media-left">
              <figure class="image is-64x64" v-if="companion.image">
                <img
                  :src="companion.image"
                  :alt="companion.name"
                  class="is-rounded"
                />
              </figure>
              <div v-else class="bare-avatar is-flex is-justify-content-center is-align-items-center" style="width: 64px; height: 64px; border-radius: 50%; background: rgba(255,255,255,0.08)">
                <span class="material-symbols-outlined" style="font-size: 32px; color: #ff9933">person_add</span>
              </div>
            </div>
            <div class="media-content">
              <div class="content">
                <p>
                  <strong>{{ companion.name }}</strong>
                  <span v-if="companion.isBare" class="tag is-warning is-light ml-2" style="vertical-align: middle; font-size: 0.7em">Needs Setup</span>
                  <br />
                  <small v-if="companion.isBare" class="has-text-grey">Minted but not configured. Click to set up.</small>
                  <small v-else>{{ companion.shortBio }}</small>
                </p>
              </div>
              <button
                v-if="companion.isBare"
                class="button is-warning is-small"
                @click.stop="openSetupWizard(companion)"
              >
                <span class="material-symbols-outlined mr-1" style="font-size: 16px">build</span>
                Set Up Companion
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>

    <!-- Companion Details Modal -->
    <div class="modal" :class="{ 'is-active': !!selectedCompanion }">
      <div class="modal-background" @click="closeCompanionModal"></div>
      <div class="modal-card" style="max-width: 700px">
        <header class="modal-card-head">
          <p class="modal-card-title">{{ selectedCompanion?.name }}</p>
          <button
            class="delete"
            aria-label="close"
            @click="closeCompanionModal"
          ></button>
        </header>
        <section class="modal-card-body" v-if="selectedCompanion">
          <!-- Wallet Info -->
          <div class="mb-4">
            <p>
              <strong>Wallet Address:</strong>
              <code class="is-size-7">{{ selectedCompanion.agentWallet || 'Not set' }}</code>
              <span v-if="companionWalletProvider === 'ows'" class="tag is-success is-light ml-2" style="font-size: 0.65em; vertical-align: middle">OWS</span>
              <span v-else-if="companionWalletProvider === 'privy'" class="tag is-link is-light ml-2" style="font-size: 0.65em; vertical-align: middle">Privy</span>
              <span v-else-if="companionWalletProvider === 'local'" class="tag is-warning is-light ml-2" style="font-size: 0.65em; vertical-align: middle">Legacy</span>
            </p>
            <p v-if="companionEthBalance !== null">
              <strong>Balance (Base):</strong>
              <span class="is-size-7">{{ companionEthBalance }} ETH</span>
            </p>
            <p v-if="selectedCompanionUP">
              <strong>Universal Profile:</strong>
              <a :href="'https://universaleverything.io/' + selectedCompanionUP" target="_blank" class="is-size-7">
                {{ selectedCompanionUP.slice(0, 10) }}...{{ selectedCompanionUP.slice(-8) }}
              </a>
            </p>
            <div v-if="!selectedCompanionUP && !selectedCompanion?.isBare" class="mt-2">
              <button
                class="button is-link is-outlined attach-up-btn"
                @click="attachUniversalProfile"
                :disabled="isDeployingUP"
                :class="{ 'is-loading': isDeployingUP }"
              >
                <span class="material-symbols-outlined mr-1" style="font-size: 18px">person_pin</span>
                {{ upDeployStatus || 'Attach Universal Profile' }}
              </button>
              <p class="help has-text-grey-light mt-1">
                Deploys a LUKSO Universal Profile for this companion and returns to Base.
              </p>
            </div>
            <div v-if="selectedCompanion?.isBare && !selectedCompanionUP" class="mt-2">
              <p class="help has-text-warning">
                <span class="material-symbols-outlined mr-1" style="font-size: 14px; vertical-align: middle">info</span>
                Complete companion setup first to attach a Universal Profile.
              </p>
            </div>
          </div>

          <!-- Revenue Info -->
          <div class="columns mb-4">
            <div class="column">
              <div class="notification is-success is-light">
                <p class="heading">Weekly Revenue</p>
                <p class="title is-5">
                  {{ companionRevenue?.weekly?.toFixed(4) || '0.0000' }} ETH
                </p>
              </div>
            </div>
            <div class="column">
              <div class="notification is-info is-light">
                <p class="heading">Monthly Revenue</p>
                <p class="title is-5">
                  {{ companionRevenue?.monthly?.toFixed(4) || '0.0000' }} ETH
                </p>
              </div>
            </div>
          </div>

          <!-- Spending Profile -->
          <div class="mb-4" v-if="selectedCompanion.spendingHabits">
            <h4 class="subtitle is-5 mb-2">
              <span class="material-symbols-outlined mr-1" style="vertical-align: middle">radar</span>
              Spending Profile
            </h4>
            <div class="tags are-medium">
              <span
                v-for="(score, category) in selectedCompanion.spendingHabits"
                :key="category"
                class="tag"
                :class="score >= 7 ? 'is-success' : score >= 5 ? 'is-warning' : 'is-light'"
              >
                {{ getCategoryMeta(category)?.icon ? '' : '' }}
                <span class="material-symbols-outlined mr-1" style="font-size: 16px">{{ getCategoryMeta(category)?.icon || 'category' }}</span>
                {{ getCategoryMeta(category)?.label || category }}: {{ score }}
              </span>
            </div>
          </div>

          <!-- Co-owned Skills -->
          <div class="mb-4">
            <h4 class="subtitle is-5 mb-2">
              <span class="material-symbols-outlined mr-1" style="vertical-align: middle">workspace_premium</span>
              Co-owned Skills
            </h4>
            <div v-if="isLoadingSkills" class="has-text-grey-light is-size-7">Loading skills...</div>
            <div v-else-if="companionOwnedSkills.length === 0" class="has-text-grey-light is-size-7">
              No skills registered yet.
            </div>
            <table v-else class="table is-fullwidth is-hoverable is-size-7">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th class="has-text-right">Unclaimed Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="skill in companionOwnedSkills" :key="skill.skillId">
                  <td>{{ skill.name || skill.skillId.slice(0, 10) + '...' }}</td>
                  <td class="has-text-right">{{ skill.unclaimed }} ETH</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Wallet Policies (OWS only) -->
          <div v-if="companionWalletProvider === 'ows'" class="mb-4">
            <h4 class="subtitle is-5 mb-2">
              <span class="material-symbols-outlined mr-1" style="vertical-align: middle">policy</span>
              Wallet Policies
            </h4>
            <div v-if="companionPolicies.length === 0" class="has-text-grey-light is-size-7">
              No policies configured.
            </div>
            <div v-else>
              <div v-for="policy in companionPolicies" :key="policy.id" class="notification is-light is-size-7 p-2 mb-1">
                <strong>{{ policy.id?.slice(0, 12) }}...</strong>
                <span v-if="policy.rules?.allowed_chains"> Chains: {{ policy.rules.allowed_chains.join(', ') }}</span>
                <span v-if="policy.rules?.daily_limit_eth"> | Limit: {{ policy.rules.daily_limit_eth }} ETH/day</span>
              </div>
            </div>
            <button class="button is-small is-info is-outlined mt-2" @click="showPolicyModal = true">
              <span class="material-symbols-outlined mr-1" style="font-size: 14px">add</span>
              Add Policy
            </button>
          </div>

          <!-- API Keys (OWS only) -->
          <div v-if="companionWalletProvider === 'ows'" class="mb-4">
            <h4 class="subtitle is-5 mb-2">
              <span class="material-symbols-outlined mr-1" style="vertical-align: middle">vpn_key</span>
              API Keys
            </h4>
            <div v-if="companionApiKeys.length === 0" class="has-text-grey-light is-size-7">
              No API keys.
            </div>
            <div v-else>
              <div v-for="key in companionApiKeys" :key="key.id" class="is-flex is-justify-content-space-between is-align-items-center mb-1">
                <span class="is-size-7">
                  <strong>{{ key.name }}</strong>
                  <code class="ml-1">...{{ (key.id || '').slice(-8) }}</code>
                </span>
                <button class="button is-small is-danger is-outlined" @click="revokeApiKey(key.id)">Revoke</button>
              </div>
            </div>
            <button class="button is-small is-info is-outlined mt-2" @click="createApiKey">
              <span class="material-symbols-outlined mr-1" style="font-size: 14px">add</span>
              Create New Key
            </button>
          </div>

          <!-- Action Buttons -->
          <div class="buttons">
            <button
              class="button is-success"
              :class="{ 'is-loading': isClaimingRevenue }"
              :disabled="!companionRevenue || companionRevenue.monthly <= 0"
              @click="claimRevenue"
            >
              <span class="material-symbols-outlined mr-1">payments</span>
              Claim Revenue
            </button>
            <button
              class="button is-info"
              @click="showRegisterModal = true"
            >
              <span class="material-symbols-outlined mr-1">app_registration</span>
              Register for Skill
            </button>
            <button v-if="companionWalletProvider === 'ows'" class="button is-warning" @click="showBackupModal = true">
              <span class="material-symbols-outlined mr-1">download</span>
              Export Wallet
            </button>
            <button v-else class="button is-warning" @click="showBackupModal = true">
              <span class="material-symbols-outlined mr-1">key</span>
              Backup Private Key
            </button>
            <button
              v-if="companionWalletProvider === 'local'"
              class="button is-link"
              :class="{ 'is-loading': isMigrating }"
              :disabled="isMigrating"
              @click="migrateToOWS"
            >
              <span class="material-symbols-outlined mr-1">upgrade</span>
              Migrate to OWS
            </button>
          </div>
        </section>
      </div>
    </div>

    <!-- Private Key Backup Modal -->
    <div class="modal" :class="{ 'is-active': showBackupModal }">
      <div class="modal-background" @click="closeBackupModal"></div>
      <div class="modal-card" style="max-width: 550px">
        <header class="modal-card-head">
          <p class="modal-card-title">Backup Private Key</p>
          <button class="delete" aria-label="close" @click="closeBackupModal"></button>
        </header>
        <section class="modal-card-body">
          <div class="notification is-danger is-light mb-4">
            <strong>Security Warning:</strong> Never share your private key.
            Anyone with this key can control the companion's agent wallet and all its funds.
            Store it securely offline.
          </div>
          <div class="field">
            <label class="label">Private Key</label>
            <div class="control">
              <input
                class="input is-family-monospace"
                :type="showPrivateKey ? 'text' : 'password'"
                :value="backupKeyValue"
                readonly
                @click="showPrivateKey = true"
              />
            </div>
            <p class="help" v-if="!showPrivateKey">Click to reveal (auto-hides in 30 seconds)</p>
            <p class="help has-text-danger" v-else>Key visible — will auto-hide in {{ backupCountdown }}s</p>
          </div>
        </section>
        <footer class="modal-card-foot">
          <button class="button is-info" @click="copyPrivateKey">
            <span class="material-symbols-outlined mr-1">content_copy</span>
            Copy to Clipboard
          </button>
          <button class="button" @click="closeBackupModal">Close</button>
        </footer>
      </div>
    </div>

    <!-- Register for Skill Modal -->
    <div class="modal" :class="{ 'is-active': showRegisterModal }">
      <div class="modal-background" @click="showRegisterModal = false"></div>
      <div class="modal-card" style="max-width: 550px">
        <header class="modal-card-head">
          <p class="modal-card-title">Register for Skill</p>
          <button class="delete" aria-label="close" @click="showRegisterModal = false"></button>
        </header>
        <section class="modal-card-body">
          <p class="mb-3 is-size-7 has-text-grey-light">
            Select a skill to register your companion as a co-owner.
            Requires a spending profile score of 5+ in the skill's category.
          </p>
          <div v-if="registrationError" class="notification is-danger is-light mb-3">
            {{ registrationError }}
          </div>
          <div v-if="eligibleSkills.length === 0" class="notification is-warning is-light">
            No eligible skills found. Your companion needs a spending profile score of at least 5 in a skill's category.
          </div>
          <div v-else>
            <div
              v-for="skill in eligibleSkills"
              :key="skill.id"
              class="box is-clickable mb-2 p-3"
              @click="registerForSkill(skill)"
            >
              <div class="is-flex is-justify-content-space-between is-align-items-center">
                <div>
                  <strong>{{ skill.name }}</strong>
                  <br />
                  <span class="tag is-info is-light is-small">{{ skill.category }}</span>
                  <span class="is-size-7 ml-2 has-text-grey-light">Score: {{ skill.companionScore }}/15</span>
                </div>
                <button
                  class="button is-small is-success"
                  :class="{ 'is-loading': registeringSkillId === skill.id }"
                >
                  Register
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- Add Policy Modal (OWS) -->
    <div class="modal" :class="{ 'is-active': showPolicyModal }">
      <div class="modal-background" @click="showPolicyModal = false"></div>
      <div class="modal-card" style="max-width: 450px">
        <header class="modal-card-head">
          <p class="modal-card-title">Add Wallet Policy</p>
          <button class="delete" aria-label="close" @click="showPolicyModal = false"></button>
        </header>
        <section class="modal-card-body">
          <div class="field">
            <label class="label">Allowed Chains (CAIP-2)</label>
            <input class="input" v-model="newPolicyData.chains" placeholder="eip155:8453" />
            <p class="help">Comma-separated chain IDs</p>
          </div>
          <div class="field">
            <label class="label">Daily Limit (ETH)</label>
            <input class="input" type="number" step="0.001" v-model="newPolicyData.dailyLimit" />
          </div>
          <div class="field">
            <label class="label">Expiry (days from now)</label>
            <input class="input" type="number" v-model.number="newPolicyData.expiryDays" />
          </div>
        </section>
        <footer class="modal-card-foot">
          <button class="button is-success" @click="createPolicy">Create Policy</button>
          <button class="button" @click="showPolicyModal = false">Cancel</button>
        </footer>
      </div>
    </div>

    <!-- New API Key Token Modal (OWS) -->
    <div class="modal" :class="{ 'is-active': showNewApiKeyModal }">
      <div class="modal-background" @click="showNewApiKeyModal = false; newApiKeyToken = null"></div>
      <div class="modal-card" style="max-width: 500px">
        <header class="modal-card-head">
          <p class="modal-card-title">API Key Created</p>
          <button class="delete" aria-label="close" @click="showNewApiKeyModal = false; newApiKeyToken = null"></button>
        </header>
        <section class="modal-card-body">
          <div class="notification is-warning is-light mb-3">
            <strong>Copy this token now.</strong> It will only be shown once.
          </div>
          <div class="field">
            <div class="control">
              <input class="input is-family-monospace" :value="newApiKeyToken" readonly />
            </div>
          </div>
        </section>
        <footer class="modal-card-foot">
          <button class="button is-info" @click="navigator.clipboard.writeText(newApiKeyToken || ''); showNewApiKeyModal = false; newApiKeyToken = null">
            <span class="material-symbols-outlined mr-1">content_copy</span>
            Copy & Close
          </button>
        </footer>
      </div>
    </div>

    <!-- Setup Wizard Modal -->
    <div class="modal" :class="{ 'is-active': showSetupWizard }">
      <div class="modal-background" @click="closeSetupWizard"></div>
      <div class="modal-card" style="max-width: 650px">
        <header class="modal-card-head">
          <p class="modal-card-title">
            <span class="material-symbols-outlined mr-1" style="vertical-align: middle">build</span>
            Set Up Companion #{{ setupTarget?.tokenId }}
          </p>
          <button class="delete" aria-label="close" @click="closeSetupWizard"></button>
        </header>
        <section class="modal-card-body">
          <!-- Progress bar -->
          <div v-if="isFinalizing" class="mb-4">
            <progress class="progress is-warning" :value="finalizeProgress.percent" max="100">
              {{ finalizeProgress.percent }}%
            </progress>
            <p class="has-text-centered is-size-7 has-text-grey-light">
              {{ finalizeProgress.message }}
            </p>
          </div>

          <!-- Step indicators -->
          <div v-if="!isFinalizing" class="mb-4">
            <div class="tags has-addons is-centered">
              <span class="tag" :class="setupStep >= 1 ? 'is-warning' : 'is-light'">1. Identity</span>
              <span class="tag" :class="setupStep >= 2 ? 'is-warning' : 'is-light'">2. Personality</span>
              <span class="tag" :class="setupStep >= 3 ? 'is-warning' : 'is-light'">3. Appearance</span>
              <span class="tag" :class="setupStep >= 4 ? 'is-warning' : 'is-light'">4. Portrait</span>
              <span class="tag" :class="setupStep >= 5 ? 'is-warning' : 'is-light'">5. Confirm</span>
            </div>
          </div>

          <!-- Step 1: Identity -->
          <div v-if="setupStep === 1 && !isFinalizing">
            <div class="field">
              <label class="label">First Name</label>
              <input class="input" v-model="setupData.firstName" placeholder="e.g. Luna" />
            </div>
            <div class="field">
              <label class="label">Family Name</label>
              <input class="input" v-model="setupData.familyName" placeholder="e.g. Starling" />
            </div>
            <div class="field">
              <label class="label">Gender</label>
              <div class="select is-fullwidth">
                <select v-model="setupData.gender">
                  <option :value="0">Neutral</option>
                  <option :value="1">Female</option>
                  <option :value="2">Male</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label class="label">Age</label>
              <input class="input" type="number" v-model.number="setupData.age" min="18" max="999" />
            </div>
            <div class="field">
              <label class="label">Short Bio</label>
              <textarea class="textarea" v-model="setupData.shortBio" placeholder="A brief description of this companion..." rows="2"></textarea>
            </div>
          </div>

          <!-- Step 2: Personality (Big 5 / OCEAN) -->
          <div v-if="setupStep === 2 && !isFinalizing">
            <p class="is-size-7 has-text-grey-light mb-3">Rate each personality trait from 1 (low) to 10 (high).</p>
            <div class="field">
              <label class="label">Openness <span class="has-text-grey-light is-size-7">(curiosity, creativity)</span></label>
              <div class="is-flex is-align-items-center">
                <input type="range" min="1" max="10" v-model.number="setupData.openness" class="mr-3" style="flex: 1" />
                <span class="tag is-warning" style="min-width: 2.2em">{{ setupData.openness }}</span>
              </div>
            </div>
            <div class="field">
              <label class="label">Conscientiousness <span class="has-text-grey-light is-size-7">(discipline, organisation)</span></label>
              <div class="is-flex is-align-items-center">
                <input type="range" min="1" max="10" v-model.number="setupData.conscientiousness" class="mr-3" style="flex: 1" />
                <span class="tag is-warning" style="min-width: 2.2em">{{ setupData.conscientiousness }}</span>
              </div>
            </div>
            <div class="field">
              <label class="label">Extraversion <span class="has-text-grey-light is-size-7">(sociability, energy)</span></label>
              <div class="is-flex is-align-items-center">
                <input type="range" min="1" max="10" v-model.number="setupData.extraversion" class="mr-3" style="flex: 1" />
                <span class="tag is-warning" style="min-width: 2.2em">{{ setupData.extraversion }}</span>
              </div>
            </div>
            <div class="field">
              <label class="label">Agreeableness <span class="has-text-grey-light is-size-7">(cooperation, empathy)</span></label>
              <div class="is-flex is-align-items-center">
                <input type="range" min="1" max="10" v-model.number="setupData.agreeableness" class="mr-3" style="flex: 1" />
                <span class="tag is-warning" style="min-width: 2.2em">{{ setupData.agreeableness }}</span>
              </div>
            </div>
            <div class="field">
              <label class="label">Neuroticism <span class="has-text-grey-light is-size-7">(emotional sensitivity)</span></label>
              <div class="is-flex is-align-items-center">
                <input type="range" min="1" max="10" v-model.number="setupData.neuroticism" class="mr-3" style="flex: 1" />
                <span class="tag is-warning" style="min-width: 2.2em">{{ setupData.neuroticism }}</span>
              </div>
            </div>
            <hr />
            <div class="field">
              <label class="label">Background</label>
              <textarea class="textarea" v-model="setupData.background" placeholder="Their backstory, history, where they come from..." rows="3"></textarea>
            </div>
            <div class="field">
              <label class="label">Voice Style</label>
              <input class="input" v-model="setupData.voiceStyle" placeholder="e.g. warm, sultry, professional, playful" />
            </div>
            <div class="field">
              <label class="label">First Message</label>
              <textarea class="textarea" v-model="setupData.firstMessage" placeholder="What they say when you first meet them..." rows="2"></textarea>
            </div>
          </div>

          <!-- Step 3: Appearance -->
          <div v-if="setupStep === 3 && !isFinalizing">
            <div class="field">
              <label class="label">Appearance</label>
              <textarea class="textarea" v-model="setupData.appearance" placeholder="Physical description: hair, eyes, build, clothing style..." rows="4"></textarea>
            </div>
            <div class="field">
              <label class="label">Style</label>
              <div class="select is-fullwidth">
                <select v-model="setupData.style">
                  <option value="romantic">Romantic</option>
                  <option value="cyberpunk">Cyberpunk</option>
                  <option value="fantasy">Fantasy</option>
                  <option value="anime">Anime</option>
                  <option value="realistic">Realistic</option>
                  <option value="gothic">Gothic</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Step 4: Portrait -->
          <div v-if="setupStep === 4 && !isFinalizing">
            <div class="has-text-centered mb-4">
              <div v-if="setupPreviewImage" class="mb-3">
                <img :src="setupPreviewImage" alt="Generated portrait" style="max-width: 300px; border-radius: 12px" />
              </div>
              <div v-else class="mb-3" style="width: 300px; height: 300px; margin: 0 auto; border-radius: 12px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center">
                <span class="material-symbols-outlined" style="font-size: 64px; color: #666">image</span>
              </div>
              <button
                class="button is-warning"
                :class="{ 'is-loading': isGeneratingImage }"
                :disabled="isGeneratingImage"
                @click="generateSetupImage"
              >
                <span class="material-symbols-outlined mr-1">auto_fix_high</span>
                {{ setupPreviewImage ? 'Regenerate Portrait' : 'Generate Portrait' }}
              </button>
              <p class="help has-text-grey-light mt-2">
                Uses your appearance description to generate a portrait via the image pipeline.
              </p>
            </div>
          </div>

          <!-- Step 5: Confirm -->
          <div v-if="setupStep === 5 && !isFinalizing">
            <div class="notification is-info is-light">
              <h4 class="subtitle is-5 mb-2">Summary</h4>
              <p><strong>Name:</strong> {{ setupData.firstName }} {{ setupData.familyName }}</p>
              <p><strong>Gender:</strong> {{ setupData.gender === 1 ? 'Female' : setupData.gender === 2 ? 'Male' : 'Neutral' }}</p>
              <p><strong>Age:</strong> {{ setupData.age }}</p>
              <p><strong>Bio:</strong> {{ setupData.shortBio || '(none)' }}</p>
              <p><strong>Personality (OCEAN):</strong> O:{{ setupData.openness }} C:{{ setupData.conscientiousness }} E:{{ setupData.extraversion }} A:{{ setupData.agreeableness }} N:{{ setupData.neuroticism }}</p>
              <p><strong>Appearance:</strong> {{ (setupData.appearance || '').slice(0, 80) }}{{ (setupData.appearance || '').length > 80 ? '...' : '' }}</p>
              <p><strong>Style:</strong> {{ setupData.style }}</p>
              <p><strong>Portrait:</strong> {{ setupPreviewImage ? 'Generated' : 'None (will be generated during finalization)' }}</p>
            </div>
            <div class="notification is-warning is-light">
              <p class="is-size-7">
                <strong>This will execute multiple on-chain transactions:</strong>
                setAgentURI, setAgentWallet, setSpendingProfile, setPersonalityHash, and setMetadataBatch.
                Make sure you have enough ETH on Base for gas fees.
              </p>
            </div>
          </div>

          <!-- Finalization error -->
          <div v-if="finalizeError" class="notification is-danger is-light mt-3">
            {{ finalizeError }}
          </div>
        </section>
        <footer class="modal-card-foot" v-if="!isFinalizing">
          <button
            v-if="setupStep > 1"
            class="button"
            @click="setupStep--"
          >
            Back
          </button>
          <button
            v-if="setupStep < 5"
            class="button is-warning"
            @click="setupStep++"
            :disabled="!canAdvanceStep"
          >
            Next
          </button>
          <button
            v-if="setupStep === 5"
            class="button is-success"
            @click="executeFinalization"
          >
            <span class="material-symbols-outlined mr-1">rocket_launch</span>
            Finalize Companion
          </button>
          <button class="button" @click="closeSetupWizard">Cancel</button>
        </footer>
      </div>
    </div>

    <hr />
    <h2
      class="fira-sans-condensed-black-italic is-size-2 mt-5 mb-5 has-text-left"
    >
      <span class="has-text-brand pt-5">
        <span class="material-symbols-outlined is-size-1 mr-2">
          leaderboard
        </span>
        Top 10 Companions (Demo)
      </span>
    </h2>
    <div v-if="isLeaderboardLoading" class="has-text-centered">
      <p class="has-text-grey-light">Loading leaderboard...</p>
    </div>
    <div v-else-if="leaderboardError" class="notification is-danger is-light">
      <p>Failed to load leaderboard: {{ leaderboardError }}</p>
      <button class="button is-small mt-2" @click="loadLeaderboard">Retry</button>
    </div>
    <div v-else class="models__activity--payouts">
      <!-- Leaderboard Header -->
      <div class="columns is-vcentered has-text-left mb-2">
        <div class="column is-4">
          <h4 class="fira-sans-condensed-black-italic is-size-5 has-text-white">
            Companion
          </h4>
        </div>
        <div class="column is-3">
          <h4
            class="fira-sans-condensed-black-italic is-size-5 has-text-white has-text-right"
          >
            Market Capitalization
          </h4>
        </div>
        <div class="column is-3">
          <h4
            class="fira-sans-condensed-black-italic is-size-5 has-text-white has-text-right"
          >
            Revenue
          </h4>
        </div>
        <div class="column is-2"></div>
      </div>

      <!-- Leaderboard Rows -->
      <div class="models__activity--payouts">
        <div
          v-for="companion in leaderboard"
          :key="companion.rank"
          class="columns is-vcentered leaderboard-row"
        >
          <!-- Rank & Name -->
          <div class="column is-4">
            <div class="tags has-addons">
              <span
                class="tag is-warning is-large fira-sans-condensed-black-italic m-0"
                style="min-width: 60px"
              >
                #{{ companion.rank }}
              </span>
              <span
                class="tag is-dark is-large fira-sans-condensed-black-italic m-0 is-flex-grow-1"
              >
                {{ companion.name }}
              </span>
            </div>
          </div>
          <!-- MCap -->
          <div class="column is-3 pt-5">
            <span
              class="tag is-info is-large fira-sans-condensed-black-italic m-0 is-fullwidth"
            >
              <span class="is-flex-grow-1"></span>
              <span>
                {{
                  new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(companion.netWorth)
                }}
              </span>
            </span>
          </div>
          <!-- Revenue -->
          <div class="column is-3 pt-5">
            <span
              class="tag is-success is-large fira-sans-condensed-black-italic m-0 is-fullwidth"
            >
              <span class="is-flex-grow-1"></span>
              <span>
                {{
                  new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(companion.monthlyRevenue)
                }}
              </span>
            </span>
          </div>
          <!-- Action Button -->
          <div class="column is-2 has-text-right pt-5">
            <a
              v-if="companion.tokenAddress"
              :href="`https://app.uniswap.org/#/swap?outputCurrency=${companion.tokenAddress}`"
              target="_blank"
              class="button is-info is-outlined"
            >
              Buy Token
            </a>
            <button v-else class="button is-info is-outlined" disabled> No Token</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch, computed } from "vue";
import { companionService } from "../../services/companion.service.js";
import { getLeaderboard, isUsingMockData } from "../../services/leaderboard.service.js";
import { skillOwnershipService } from "../../services/skillOwnership.service.js";
import { web3Service, switchNetwork } from "../../services/web3.service.js";
import { walletProviderService } from "../../services/walletProvider.service.js";
import { owsMigrationService } from "../../services/owsMigration.service.js";
import { SKILL_CATEGORY_META } from "../../skills/types.js";
import ContextBanner from "../ContextBanner.vue";

export default {
  name: "BrowseAgents",
  components: {
    ContextBanner,
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
    const companionRevenue = ref(null);
    const companionOwnedSkills = ref([]);
    const isLoadingSkills = ref(false);
    const isClaimingRevenue = ref(false);

    const leaderboard = ref([]);
    const isLeaderboardLoading = ref(true);
    const leaderboardError = ref(null);
    const isMockData = ref(true);

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

    // OWS wallet state
    const companionWalletProvider = ref(null); // 'ows' | 'privy' | 'local'
    const companionEthBalance = ref(null);
    const companionTxHistory = ref([]);
    const companionPolicies = ref([]);
    const companionApiKeys = ref([]);
    const isMigrating = ref(false);
    const showPolicyModal = ref(false);
    const newPolicyData = ref({ chains: 'eip155:8453', dailyLimit: '0.005', expiryDays: 365 });
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
     * 3. Switch back to Base
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

        // Step 3: Switch back to Base
        upDeployStatus.value = 'Returning to Base...';
        try {
          await switchNetwork('base');
        } catch {
          // Non-fatal — UP is deployed, user can switch manually
          console.warn('[BrowseAgents] Could not auto-switch back to Base');
        }

        upDeployStatus.value = null;
      } catch (err) {
        console.error('[BrowseAgents] UP attachment failed:', err);
        upDeployStatus.value = null;
        alert('Universal Profile attachment failed: ' + err.message);

        // Try to return to Base even on failure
        try { await switchNetwork('base'); } catch { /* best effort */ }
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
        const balance = await walletProviderService.getAgentWalletBalance(id, 8453);
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
              name: skillData?.name || 'Unknown Skill',
              unclaimed: parseFloat(unclaimed).toFixed(6),
            };
          })
        );
      } catch (err) {
        console.warn('Failed to load companion skills:', err);
        companionOwnedSkills.value = [];
      } finally {
        isLoadingSkills.value = false;
      }
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

    async function registerForSkill(skill) {
      if (!selectedCompanion.value) return;
      registeringSkillId.value = skill.id;
      registrationError.value = null;
      try {
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
        isMockData.value = isUsingMockData();
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
      companionRevenue,
      companionOwnedSkills,
      isLoadingSkills,
      isClaimingRevenue,
      leaderboard,
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
.companion-card {
  cursor: pointer;
  transition: transform 0.2s;
}
.companion-card:hover {
  transform: translateY(-5px);
}

.has-text-brand {
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}

.leaderboard-row {
  margin-bottom: 0.5rem;
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
    rgba(255, 255, 255, 1),
    transparent
  );
}

.is-clickable {
  cursor: pointer;
  transition: background-color 0.15s;
}
.is-clickable:hover {
  background-color: rgba(255, 255, 255, 0.05);
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

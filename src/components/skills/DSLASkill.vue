<template>
  <div class="dsla-skill">
    <div class="dsla-usecase-stage skill-panel">
      <div class="dsla-foundry-board">
        <div class="dsla-orbit">
          <span v-for="idx in 6" :key="idx" :class="['dsla-orbit-dot', 'dsla-orbit-dot--' + idx]"></span>
          <span class="material-symbols-outlined">online_prediction</span>
        </div>
        <div class="dsla-board-metric">
          <span class="dsla-console-label">Template</span>
          <strong>{{ selectedUseCase?.label || 'Unselected' }}</strong>
        </div>
        <div class="dsla-board-metric">
          <span class="dsla-console-label">Leverage</span>
          <strong>{{ slaForm.leverage }}x</strong>
        </div>
        <div class="dsla-board-metric">
          <span class="dsla-console-label">Sources</span>
          <strong>{{ configuredSources }}</strong>
        </div>
        <div class="dsla-board-metric">
          <span class="dsla-console-label">Readiness</span>
          <strong>{{ foundryProgress }}%</strong>
        </div>
      </div>
      <!-- Use Case Selector -->
      <div class="columns">
        <div class="column is-12">
          <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left mb-4">
            Use Case
          </h2>
          <span class="category-selector">
            <template v-for="useCase in useCases" :key="useCase.key">
              <input
                type="radio"
                name="dsla_usecase_selector"
                :id="'dsla_uc_' + useCase.key"
                :value="useCase.key"
                :checked="selectedUseCase?.key === useCase.key"
                @change="selectUseCase(useCase)"
              />
              <label :for="'dsla_uc_' + useCase.key" class="radio category">
                {{ useCase.label }}
              </label>
            </template>
          </span>
        </div>
      </div>

      <!-- Generated Future Event Example -->
      <div v-if="selectedUseCase && generatedEvent" class="bz-notice bz-notice--info mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-3 mb-2">
          Example Prediction Market
        </h4>
        <p class="is-size-6">{{ generatedEvent }}</p>
      </div>
    </div>

    <!-- SLA Configuration -->
    <div v-if="selectedUseCase" class="dsla-foundry skill-panel mt-5">
      <h2 class="dsla-stage-title fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left mb-4">
        <span class="dsla-stage-number">02</span>
        Market Configuration
      </h2>

      <!-- Service Details -->
      <div class="columns">
        <div class="field column is-4">
          <label class="label has-text-white has-text-left">
            Service Name
          </label>
          <div class="control">
            <input
              class="skill-input"
              v-model="slaForm.serviceName"
              placeholder="e.g. Ethereum Staking Rewards"
            />
          </div>
        </div>
        <div class="field column is-3">
          <label class="label has-text-white has-text-left">
            Service Ticker
          </label>
          <div class="control">
            <input
              class="skill-input"
              v-model="slaForm.serviceTicker"
              placeholder="e.g. ETH"
              maxlength="10"
            />
          </div>
        </div>
        <div class="field column is-5">
          <label class="label has-text-white has-text-left">
            Service Address
            <span class="has-text-grey-light is-size-7 ml-1">(identifier)</span>
          </label>
          <div class="control">
            <input
              class="skill-input"
              v-model="slaForm.serviceAddress"
              placeholder="e.g. 0x..., validator.eth, api.example.com"
            />
          </div>
        </div>
      </div>

      <!-- SLO Configuration -->
      <h3 class="dsla-section-kicker fira-sans-condensed-black-italic is-size-4 has-text-white has-text-left mb-3 mt-4">
        <span>03</span>
        Service Level Objective (SLO)
      </h3>
      <div class="columns">
        <div class="field column is-4">
          <label class="label has-text-white has-text-left">
            SLO Type
          </label>
          <span class="category-selector slo-type-selector">
            <template v-for="sloType in sloTypes" :key="sloType.key">
              <input
                type="radio"
                name="slo_type_selector"
                :id="'slo_type_' + sloType.key"
                :value="sloType.key"
                :checked="slaForm.sloType === sloType.key"
                @change="slaForm.sloType = sloType.key"
              />
              <label :for="'slo_type_' + sloType.key" class="radio category">
                {{ sloType.symbol }}
              </label>
            </template>
          </span>
        </div>
        <div class="field column is-3">
          <label class="label has-text-white has-text-left">
            Target Value
            <span class="has-text-grey-light is-size-7 ml-1">(10000 = 100%)</span>
          </label>
          <div class="control">
            <input
              class="skill-input"
              type="number"
              v-model.number="slaForm.sloValue"
              placeholder="99000"
              min="0"
              max="10000000"
            />
          </div>
        </div>
        <div class="field column is-5">
          <label class="label has-text-white has-text-left">
            Leverage
            <span class="has-text-grey-light is-size-7 ml-1">(1-100x)</span>
          </label>
          <div class="control">
            <input
              class="skill-input"
              type="number"
              v-model.number="slaForm.leverage"
              placeholder="1"
              min="1"
              max="100"
            />
          </div>
        </div>
      </div>

      <!-- Time Period -->
      <h3 class="dsla-section-kicker fira-sans-condensed-black-italic is-size-4 has-text-white has-text-left mb-3 mt-4">
        <span>04</span>
        Time Period
      </h3>
      <div class="columns">
        <div class="field column is-6">
          <label class="label has-text-white has-text-left">
            Start Date
          </label>
          <div class="control">
            <input
              class="skill-input"
              type="datetime-local"
              v-model="slaForm.startDate"
            />
          </div>
        </div>
        <div class="field column is-6">
          <label class="label has-text-white has-text-left">
            End Date (Resolution)
          </label>
          <div class="control">
            <input
              class="skill-input"
              type="datetime-local"
              v-model="slaForm.endDate"
            />
          </div>
        </div>
      </div>

      <!-- Severity & Penalty -->
      <h3 class="dsla-section-kicker fira-sans-condensed-black-italic is-size-4 has-text-white has-text-left mb-3 mt-4">
        <span>05</span>
        Severity & Penalty Tiers
      </h3>
      <div class="severity-tiers">
        <div
          v-for="(tier, idx) in slaForm.severityTiers"
          :key="idx"
          class="columns is-vcentered"
        >
          <div class="field column is-5">
            <label class="label has-text-white has-text-left is-size-7">
              Severity Threshold {{ idx + 1 }}
            </label>
            <div class="control">
              <input
                class="skill-input"
                type="number"
                v-model.number="tier.severity"
                placeholder="90000"
              />
            </div>
          </div>
          <div class="field column is-5">
            <label class="label has-text-white has-text-left is-size-7">
              Penalty (basis points)
            </label>
            <div class="control">
              <input
                class="skill-input"
                type="number"
                v-model.number="tier.penalty"
                placeholder="2500"
                max="2500"
              />
            </div>
          </div>
          <div class="column is-2">
            <button
              v-if="slaForm.severityTiers.length > 1"
              class="bz-btn bz-btn--destructive bz-btn--lg mt-3"
              @click="removeSeverityTier(idx)"
            >
              <span class="material-symbols-outlined">remove</span>
            </button>
          </div>
        </div>
        <button
          v-if="slaForm.severityTiers.length < 5"
          class="bz-btn bz-btn--primary m-5"
          @click="addSeverityTier"
        >
          <span class="material-symbols-outlined">add</span>
          Add Tier
        </button>
      </div>

      <!-- Data Sources -->
      <h3 class="fira-sans-condensed-black-italic is-size-4 has-text-white has-text-left mb-3 mt-4">
        Data Sources
        <span class="has-text-grey-light is-size-7 ml-2">(for SLI verification)</span>
      </h3>
      <p class="is-size-6 has-text-grey-light has-text-left mb-4">
        Specify the data sources that will be used to verify the Service Level Indicator (SLI) at resolution time.
        These endpoints should return verifiable data for the metric being tracked.
      </p>
      <div class="data-sources">
        <div
          v-for="(source, idx) in slaForm.dataSources"
          :key="idx"
          class="data-source-item mb-4"
        >
          <div class="columns is-vcentered">
            <div class="field column is-3">
              <label class="label has-text-white has-text-left is-size-7">
                Source Name
              </label>
              <div class="control">
                <input
                  class="skill-input"
                  v-model="source.name"
                  placeholder="e.g. Chainlink Oracle"
                />
              </div>
            </div>
            <div class="field column is-5">
              <label class="label has-text-white has-text-left is-size-7">
                Endpoint URL
              </label>
              <div class="control">
                <input
                  class="skill-input"
                  v-model="source.endpoint"
                  placeholder="https://api.example.com/metric"
                />
              </div>
            </div>
            <div class="field column is-3">
              <label class="label has-text-white has-text-left is-size-7">
                Description
              </label>
              <div class="control">
                <input
                  class="skill-input"
                  v-model="source.description"
                  placeholder="Primary oracle feed"
                />
              </div>
            </div>
            <div class="column is-1">
              <button
                v-if="slaForm.dataSources.length > 1"
                class="bz-btn bz-btn--destructive bz-btn--lg mt-3"
                @click="removeDataSource(idx)"
              >
                <span class="material-symbols-outlined">remove</span>
              </button>
            </div>
          </div>
        </div>
        <button
          v-if="slaForm.dataSources.length < 10"
          class="bz-btn bz-btn--primary m-3 mb-5"
          @click="addDataSource"
        >
          <span class="material-symbols-outlined">add</span>
          Add Data Source
        </button>
      </div>

      <!-- Whitelisted Staking -->
      <div class="field mt-5">
        <label class="checkbox has-text-white">
          <input type="checkbox" v-model="slaForm.whitelisted" />
          Restrict staking to whitelisted addresses only
        </label>
      </div>

      <!-- Preview -->
      <div class="bz-notice bz-notice--warning mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-3 mb-2">
          Market Preview
        </h4>
        <p class="is-size-5">
          <strong class="fira-sans-condensed-black-italic is-size-4">{{ slaForm.serviceName || '[Service Name]' }}
          ({{ slaForm.serviceTicker || 'TKR' }})</strong>
          {{ sloTypeLabel }}
          <strong class="fira-sans-condensed-black-italic is-size-4">{{ formatSloValue(slaForm.sloValue) }}</strong>
          by <strong class="fira-sans-condensed-black-italic is-size-4">{{ formatDate(slaForm.endDate) }}</strong>
        </p>
        <p class="is-size-6 mt-2">
          <strong>Leverage</strong>: {{ slaForm.leverage }}x |
          <strong>Tiers</strong>: {{ slaForm.severityTiers.length }} |
          <strong>Data Sources</strong>: {{ slaForm.dataSources.filter(s => s.name || s.endpoint).length }} |
          <strong>{{ slaForm.whitelisted ? 'Whitelisted' : 'Open' }}</strong> staking
        </p>
      </div>

      <!-- Create Market Button -->
      <div class="control mt-5 has-text-centered">
        <button
          class="bz-btn bz-btn--success bz-btn--lg"
          @click="createPredictionMarket"
          :disabled="!canCreate || isCreating"
        >
          <span
            v-if="isCreating"
            class="material-symbols-outlined rotating"
          >
            progress_activity
          </span>
          <span v-else class="material-symbols-outlined">
            online_prediction
          </span>
          {{ isCreating ? 'Creating...' : 'Create Prediction Market' }}
        </button>
      </div>
    </div>

    <!-- Active Markets -->
    <div v-if="markets.length > 0" class="skill-panel mt-5 has-text-left">
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-brand has-text-left mb-4">
        Your Prediction Markets
      </h2>
      <div
        v-for="market in markets"
        :key="market.id"
        class="market-card p-4 mb-3"
      >
        <div class="columns is-vcentered">
          <div class="column">
            <p class="fira-sans-condensed-black-italic is-size-5 has-text-white">
              {{ market.serviceName }}
            </p>
            <p class="is-size-6 has-text-grey-light">
              {{ market.question }}
            </p>
          </div>
          <div class="column is-narrow">
            <span class="skill-chip skill-chip--info">{{ market.useCase }}</span>
            <span class="skill-chip skill-chip--warning ml-2">{{ market.leverage }}x</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed } from 'vue';
import { hasPurchasedSkill, isDevMode } from '../../services/agent.service.js';

const SKILL_ID = 'prediction-market-maker-v1.0.0';

export default {
  name: 'DSLASkill',
  props: {
    skill: {
      type: Object,
      default: null,
    },
  },
  emits: ['market-created'],
  setup(props, { emit }) {
    // State
    const isCreating = ref(false);
    const selectedUseCase = ref(null);
    const markets = ref([]);

    // Use Cases with example events
    const useCases = [
      {
        key: 'vol_returns',
        label: 'Returns',
        context: 'DeFi yields, staking rewards, lending rates',
        examples: [
          'Will ETH staking APY exceed 5% by Q2 2025?',
          'Will AAVE lending rates stay above 3%?',
          'Will Lido stETH yield maintain 4.5% APR?',
        ],
        defaults: {
          serviceName: 'Staking Rewards',
          serviceTicker: 'ETH',
          sloValue: 50000,
          sloType: 'gte',
          dataSources: [
            { name: 'Lido API', endpoint: 'https://stake.lido.fi/api/stats', description: 'stETH APR data' },
          ],
        },
      },
      {
        key: 'vol_availability',
        label: 'Availability',
        context: 'Blockchain uptime, API availability, node reliability',
        examples: [
          'Will Ethereum maintain 99.9% uptime in March?',
          'Will Chainlink oracles have <1s latency?',
          'Will Solana achieve 99.5% block finality rate?',
        ],
        defaults: {
          serviceName: 'Network Uptime',
          serviceTicker: 'ETH',
          sloValue: 99900,
          sloType: 'gte',
          dataSources: [
            { name: 'Etherscan', endpoint: 'https://api.etherscan.io/api', description: 'Block data & uptime' },
          ],
        },
      },
      {
        key: 'vol_asset_floors',
        label: 'Asset Floors',
        context: 'NFT floor prices, token minimums, collateral ratios',
        examples: [
          'Will BAYC floor exceed 30 ETH by April?',
          'Will CryptoPunks maintain 50 ETH floor?',
          'Will Azuki floor stay above 10 ETH?',
        ],
        defaults: {
          serviceName: 'NFT Floor Price',
          serviceTicker: 'BAYC',
          sloValue: 300000,
          sloType: 'gte',
          dataSources: [
            { name: 'OpenSea API', endpoint: 'https://api.opensea.io/api/v2', description: 'Collection floor price' },
            { name: 'Reservoir', endpoint: 'https://api.reservoir.tools/oracle', description: 'On-chain floor oracle' },
          ],
        },
      },
      {
        key: 'vol_currency_pegs',
        label: 'Currency Pegs',
        context: 'Stablecoin pegs, wrapped token ratios, synthetic assets',
        examples: [
          'Will USDC maintain $0.99-$1.01 peg in Q1?',
          'Will wBTC stay within 0.5% of BTC?',
          'Will DAI hold its dollar peg above $0.995?',
        ],
        defaults: {
          serviceName: 'Stablecoin Peg',
          serviceTicker: 'USDC',
          sloValue: 9950,
          sloType: 'gte',
          dataSources: [
            { name: 'Chainlink', endpoint: 'https://data.chain.link', description: 'USDC/USD price feed' },
            { name: 'CoinGecko', endpoint: 'https://api.coingecko.com/api/v3', description: 'Market price backup' },
          ],
        },
      },
      {
        key: 'vol_response_time',
        label: 'Response Time',
        context: 'Block times, transaction confirmations, oracle updates',
        examples: [
          'Will Solana block times stay under 500ms?',
          'Will Polygon confirm txs in <3 seconds?',
          'Will Chainlink update prices within 1 minute?',
        ],
        defaults: {
          serviceName: 'Block Time',
          serviceTicker: 'SOL',
          sloValue: 500,
          sloType: 'lte',
          dataSources: [
            { name: 'Solana Beach', endpoint: 'https://api.solanabeach.io', description: 'Block time metrics' },
          ],
        },
      },
      {
        key: 'vol_delivery_time',
        label: 'Delivery Time',
        context: 'NFT mints, token distributions, airdrop claims',
        examples: [
          'Will Project X deliver tokens by March 15?',
          'Will the NFT mint complete within 1 hour?',
          'Will the airdrop be claimable by end of month?',
        ],
        defaults: {
          serviceName: 'Token Delivery',
          serviceTicker: 'AIRDROP',
          sloValue: 100,
          sloType: 'eq',
          dataSources: [
            { name: 'Contract Events', endpoint: '', description: 'On-chain transfer events' },
          ],
        },
      },
    ];

    // SLO Types
    const sloTypes = [
      { key: 'eq', symbol: '=', label: 'Equal To' },
      { key: 'neq', symbol: '!=', label: 'Not Equal To' },
      { key: 'lt', symbol: '<', label: 'Less Than' },
      { key: 'lte', symbol: '<=', label: 'Less Or Equal' },
      { key: 'gt', symbol: '>', label: 'Greater Than' },
      { key: 'gte', symbol: '>=', label: 'Greater Or Equal' },
    ];

    // Form state
    const slaForm = reactive({
      serviceName: '',
      serviceTicker: '',
      serviceAddress: '',
      sloType: 'gte',
      sloValue: 99000,
      leverage: 1,
      startDate: '',
      endDate: '',
      whitelisted: false,
      severityTiers: [
        { severity: 90000, penalty: 2500 },
        { severity: 95000, penalty: 1500 },
        { severity: 99000, penalty: 500 },
      ],
      dataSources: [
        { name: '', endpoint: '', description: '' },
      ],
    });

    // Generated event based on use case
    const generatedEvent = computed(() => {
      if (!selectedUseCase.value) return null;
      const examples = selectedUseCase.value.examples;
      return examples[Math.floor(Math.random() * examples.length)];
    });

    // SLO type label for preview
    const sloTypeLabel = computed(() => {
      const type = sloTypes.find(t => t.key === slaForm.sloType);
      return type ? type.symbol : '>=';
    });

    // Validation
    const configuredSources = computed(() => slaForm.dataSources.filter((s) => s.name || s.endpoint).length);
    const foundryProgress = computed(() => {
      const checks = [
        !!selectedUseCase.value,
        !!slaForm.serviceName,
        !!slaForm.serviceTicker,
        slaForm.sloValue > 0,
        !!slaForm.startDate,
        !!slaForm.endDate,
        configuredSources.value > 0,
      ];
      return Math.round((checks.filter(Boolean).length / checks.length) * 100);
    });

    const canCreate = computed(() => {
      return (
        selectedUseCase.value &&
        slaForm.serviceName &&
        slaForm.serviceTicker &&
        slaForm.sloValue > 0 &&
        slaForm.startDate &&
        slaForm.endDate &&
        new Date(slaForm.endDate) > new Date(slaForm.startDate)
      );
    });

    // Methods
    const selectUseCase = (useCase) => {
      selectedUseCase.value = useCase;

      // Populate form with use case defaults
      if (useCase.defaults) {
        slaForm.serviceName = useCase.defaults.serviceName;
        slaForm.serviceTicker = useCase.defaults.serviceTicker;
        slaForm.sloValue = useCase.defaults.sloValue;
        slaForm.sloType = useCase.defaults.sloType;

        // Populate data sources from use case defaults
        if (useCase.defaults.dataSources && useCase.defaults.dataSources.length > 0) {
          slaForm.dataSources = useCase.defaults.dataSources.map(ds => ({
            name: ds.name || '',
            endpoint: ds.endpoint || '',
            description: ds.description || '',
          }));
        } else {
          slaForm.dataSources = [{ name: '', endpoint: '', description: '' }];
        }
      }

      // Set default dates (start: now + 1 day, end: now + 30 days)
      const now = new Date();
      const startDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      slaForm.startDate = startDate.toISOString().slice(0, 16);
      slaForm.endDate = endDate.toISOString().slice(0, 16);
    };

    const addSeverityTier = () => {
      if (slaForm.severityTiers.length < 5) {
        slaForm.severityTiers.push({ severity: 0, penalty: 0 });
      }
    };

    const removeSeverityTier = (idx) => {
      slaForm.severityTiers.splice(idx, 1);
    };

    const addDataSource = () => {
      if (slaForm.dataSources.length < 10) {
        slaForm.dataSources.push({ name: '', endpoint: '', description: '' });
      }
    };

    const removeDataSource = (idx) => {
      slaForm.dataSources.splice(idx, 1);
    };

    const formatSloValue = (value) => {
      if (!value) return '[Target]';
      if (value >= 10000) {
        return `${(value / 100).toFixed(2)}%`;
      }
      return value.toString();
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return '[Date]';
      return new Date(dateStr).toLocaleDateString();
    };

    const createPredictionMarket = async () => {
      if (!canCreate.value) return;
      if (!isDevMode() && !(await hasPurchasedSkill(SKILL_ID))) {
        console.warn('[DSLA] Skill not purchased — execution blocked.');
        return;
      }

      isCreating.value = true;

      try {
        const question = `Will ${slaForm.serviceName} (${slaForm.serviceTicker}) ${sloTypeLabel.value} ${formatSloValue(slaForm.sloValue)} by ${formatDate(slaForm.endDate)}?`;

        const market = {
          id: `dsla-${Date.now()}`,
          useCase: selectedUseCase.value.label,
          serviceName: slaForm.serviceName,
          serviceTicker: slaForm.serviceTicker,
          serviceAddress: slaForm.serviceAddress,
          sloType: slaForm.sloType,
          sloValue: slaForm.sloValue,
          leverage: slaForm.leverage,
          startDate: new Date(slaForm.startDate).getTime(),
          endDate: new Date(slaForm.endDate).getTime(),
          whitelisted: slaForm.whitelisted,
          severity: slaForm.severityTiers.map(t => t.severity),
          penalty: slaForm.severityTiers.map(t => t.penalty),
          dataSources: slaForm.dataSources.filter(s => s.name || s.endpoint),
          question,
          createdAt: new Date().toISOString(),
        };

        markets.value.push(market);
        emit('market-created', market);

        // Reset form but keep use case selected
        slaForm.serviceName = selectedUseCase.value.defaults?.serviceName || '';
        slaForm.serviceAddress = '';

        // Reset data sources to use case defaults
        if (selectedUseCase.value.defaults?.dataSources) {
          slaForm.dataSources = selectedUseCase.value.defaults.dataSources.map(ds => ({
            name: ds.name || '',
            endpoint: ds.endpoint || '',
            description: ds.description || '',
          }));
        } else {
          slaForm.dataSources = [{ name: '', endpoint: '', description: '' }];
        }

      } catch (e) {
        console.error('[DSLASkill] Creation error:', e);
      } finally {
        isCreating.value = false;
      }
    };

    return {
      isCreating,
      selectedUseCase,
      useCases,
      sloTypes,
      slaForm,
      generatedEvent,
      sloTypeLabel,
      configuredSources,
      foundryProgress,
      canCreate,
      markets,
      selectUseCase,
      addSeverityTier,
      removeSeverityTier,
      addDataSource,
      removeDataSource,
      formatSloValue,
      formatDate,
      createPredictionMarket,
    };
  },
};
</script>

<style scoped>
/* Design-system compatibility layer for migrated skill workflow surfaces. */
.skill-panel {
  padding: var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r) !important;
  color: var(--bz-fg);
}
.skill-panel + .skill-panel,
.analysis-history .skill-panel + .skill-panel {
  margin-top: var(--bz-space-5);
}
.skill-card {
  padding: var(--bz-space-4);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
}
.skill-title-row {
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-4);
}
.skill-title-icon,
.skill-name .material-symbols-outlined {
  color: var(--bz-purple-300) !important;
  font-size: 42px !important;
  line-height: 1;
}
.skill-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  min-height: 24px;
  padding: 2px var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: 1.2;
}
.skill-chip--brand { background: var(--bz-purple-soft); border-color: var(--bz-border-brand); color: var(--bz-fg); }
.skill-chip--success { background: var(--bz-emerald-soft); border-color: var(--bz-emerald-500); color: var(--bz-emerald-300); }
.skill-chip--warning { background: var(--bz-warning-soft); border-color: var(--bz-warning); color: var(--bz-warning); }
.skill-chip--info { background: var(--bz-info-soft); border-color: var(--bz-info); color: var(--bz-info); }
.skill-chip--danger { background: var(--bz-danger-soft); border-color: var(--bz-danger); color: var(--bz-danger); }
.skill-input,
.config-input {
  width: 100%;
  height: 40px;
  padding: 0 var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  font: inherit;
}
.skill-input--sm { height: 32px; }
.skill-input:focus,
.config-input:focus {
  outline: none;
  border-color: var(--bz-border-brand);
}
.skill-textarea {
  width: 100%;
  min-height: 120px;
  padding: var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  font: inherit;
}
.skill-unit {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
  color: var(--bz-fg-low);
  pointer-events: none;
}
.skill-fullwidth { width: 100%; }
.skill-progress {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border: 0;
  border-radius: var(--bz-r-pill);
  background: var(--bz-canvas);
}
.skill-progress::-webkit-progress-value { background: var(--bz-gradient-brand); }
.bz-btn--running { opacity: 0.72; }

.dsla-skill {
  width: 100%;
}

/* Selector styles matching Browse tab */
.category-selector {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.5em;
}

.category-selector input[type='radio'] {
  display: none;
}

.category-selector input[type='radio'] + label.radio.category {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  font-family: 'Fira Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  background: transparent;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  color: var(--bz-fg-faint);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.category-selector input[type='radio'] + label.radio.category:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg-mid);
}

.category-selector input[type='radio']:checked + label.radio.category {
  color: var(--bz-control-selected-fg);
  border: 1px solid var(--bz-control-selected-border);
  background: var(--bz-control-selected-bg);
}

/* SLO Type selector - compact version */
.slo-type-selector {
  grid-template-columns: repeat(6, 1fr);
}

.slo-type-selector input[type='radio'] + label.radio.category {
  font-weight: bold;
  font-size: 16px;
}

/* Market card */
.market-card {
  background: var(--bz-scrim);
  border-radius: 8px;
  border: 1px solid var(--bz-border);
}

/* Severity tiers */
.severity-tiers {
  background: var(--bz-scrim-soft);
  padding: 1rem;
  border-radius: 8px;
}

/* Data sources */
.data-sources {
  background: var(--bz-scrim-soft);
  padding: 1rem;
  border-radius: 8px;
}

.data-source-item {
  border-bottom: 1px solid var(--bz-border);
  padding-bottom: 1rem;
}

.data-source-item:last-of-type {
  border-bottom: none;
}

/* Form inputs */
.input,
.select select {
  background: var(--bz-scrim);
  border-color: var(--bz-border-strong);
  color: var(--bz-fg);
}

.input::placeholder {
  color: var(--bz-fg-low);
}

.label {
  font-weight: normal;
}

/* Checkbox styling */
.checkbox {
  cursor: pointer;
}

.checkbox input[type='checkbox'] {
  margin-right: 0.5rem;
}

/* Rotating animation */
.rotating {
  animation: bz-spin 1s linear infinite;
}


.skill-panel {
  padding: 2em;
  border: 1px solid var(--bz-border);
  border-radius: 4px !important;
}

.skill-name {
  font-size: 1.5rem;
  margin: 0;
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}

.has-text-brand {
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}

.skill-description {
  color: var(--bz-fg-mid);
  margin-bottom: 0.5em;
  text-align: left;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Agentic redesign: SLA Market Foundry */
.dsla-usecase-stage {
  display: grid;
  gap: var(--bz-space-4);
  background:
    linear-gradient(135deg, rgba(82, 196, 26, 0.1), transparent 44%),
    var(--bz-panel);
}
.dsla-usecase-stage .columns,
.dsla-usecase-stage .column {
  margin: 0;
  padding: 0;
}
.dsla-usecase-stage h2::before {
  content: '01';
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 24px;
  margin-right: var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-emerald-300);
  font-size: 12px;
}
.dsla-usecase-stage .category-selector {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
.dsla-foundry {
  background: var(--bz-panel);
}
.dsla-foundry > .columns {
  display: grid;
  grid-template-columns: 1fr 0.75fr 1.2fr;
  gap: var(--bz-space-4);
  margin: 0;
}
.dsla-foundry > .columns > .column {
  width: auto;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-canvas);
}
.dsla-stage-title,
.dsla-section-kicker {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  letter-spacing: 0;
}
.dsla-stage-number,
.dsla-section-kicker span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 24px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-emerald-300);
  font-size: 12px;
}
.dsla-foundry .columns:not(:first-of-type) {
  margin: 0;
}
.dsla-foundry .field.column {
  padding: var(--bz-space-3);
}
.severity-tiers,
.data-sources {
  border: 1px solid var(--bz-border);
  background: var(--bz-canvas);
}
@media (max-width: 980px) {
  .dsla-foundry > .columns {
    grid-template-columns: 1fr;
  }
}


/* Signature upgrade: foundry instrument board */
.dsla-foundry-board {
  display: grid;
  grid-template-columns: minmax(120px, 180px) repeat(4, minmax(120px, 1fr));
  gap: var(--bz-space-3);
  align-items: stretch;
}
.dsla-orbit {
  position: relative;
  min-height: 116px;
  display: grid;
  place-items: center;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background:
    radial-gradient(circle at center, rgba(82, 196, 26, 0.18), transparent 42%),
    var(--bz-canvas);
  overflow: hidden;
}
.dsla-orbit::before,
.dsla-orbit::after {
  content: '';
  position: absolute;
  border: 1px solid rgba(82, 196, 26, 0.28);
  border-radius: 50%;
}
.dsla-orbit::before { width: 86px; height: 86px; }
.dsla-orbit::after { width: 128px; height: 58px; transform: rotate(-24deg); }
.dsla-orbit .material-symbols-outlined { color: var(--bz-emerald-300); font-size: 34px; z-index: 2; }
.dsla-orbit-dot { position: absolute; width: 6px; height: 6px; border-radius: 999px; background: var(--bz-emerald-300); }
.dsla-orbit-dot--1 { top: 20%; left: 52%; }
.dsla-orbit-dot--2 { top: 42%; left: 78%; }
.dsla-orbit-dot--3 { top: 72%; left: 61%; }
.dsla-orbit-dot--4 { top: 72%; left: 32%; }
.dsla-orbit-dot--5 { top: 42%; left: 18%; }
.dsla-orbit-dot--6 { top: 20%; left: 38%; }
.dsla-board-metric {
  min-height: 116px;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-canvas);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.dsla-board-metric strong {
  margin-top: var(--bz-space-1);
  color: var(--bz-fg);
  font-size: clamp(20px, 2.3vw, 32px);
  line-height: 1.05;
  overflow-wrap: anywhere;
}
@media (max-width: 1040px) {
  .dsla-foundry-board { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

</style>

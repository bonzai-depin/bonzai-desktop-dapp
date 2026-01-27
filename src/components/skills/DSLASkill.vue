<template>
  <div class="dsla-skill">
    <!-- Skill Header -->
    <div class="models__activity--payouts mb-4 has-text-left">
      <div class="columns is-vcentered">
        <div class="column">
          <h3 class="skill-name is-size-1 fira-sans-condensed-black-italic">
            <span
              class="material-symbols-outlined mr-2"
              style="font-size: 48px; color: var(--bulma-primary)"
            >
              online_prediction
            </span>
            {{ skill?.name || 'Prediction Market Maker' }}
          </h3>
          <p class="is-size-5 mt-3 skill-description">
            {{ skill?.description || 'Create prediction markets using the DSLA Protocol. Define verifiable SLA-based outcomes for any measurable metric.' }}
          </p>
        </div>
      </div>
    </div>

    <div
      class="models__activity--payouts pt-5 pb-5"
      style="position: relative; bottom: -40px; z-index: 11"
    >
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
              <label :for="'dsla_uc_' + useCase.key" class="radio category pt-3 pb-3">
                {{ useCase.label }}
              </label>
            </template>
          </span>
        </div>
      </div>

      <!-- Generated Future Event Example -->
      <div v-if="selectedUseCase && generatedEvent" class="notification is-info mt-5 has-text-left">
        <h4 class="fira-sans-condensed-black-italic is-size-3 mb-2">
          Example Prediction Market
        </h4>
        <p class="is-size-6">{{ generatedEvent }}</p>
      </div>
    </div>

    <!-- SLA Configuration -->
    <div v-if="selectedUseCase" class="models__activity--payouts mt-5">
      <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left mb-4">
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
              class="input is-large"
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
              class="input is-large"
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
              class="input is-large"
              v-model="slaForm.serviceAddress"
              placeholder="e.g. 0x..., validator.eth, api.example.com"
            />
          </div>
        </div>
      </div>

      <!-- SLO Configuration -->
      <h3 class="fira-sans-condensed-black-italic is-size-4 has-text-white has-text-left mb-3 mt-4">
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
              <label :for="'slo_type_' + sloType.key" class="radio category p-2">
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
              class="input is-large"
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
              class="input is-large"
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
      <h3 class="fira-sans-condensed-black-italic is-size-4 has-text-white has-text-left mb-3 mt-4">
        Time Period
      </h3>
      <div class="columns">
        <div class="field column is-6">
          <label class="label has-text-white has-text-left">
            Start Date
          </label>
          <div class="control">
            <input
              class="input is-large"
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
              class="input is-large"
              type="datetime-local"
              v-model="slaForm.endDate"
            />
          </div>
        </div>
      </div>

      <!-- Severity & Penalty -->
      <h3 class="fira-sans-condensed-black-italic is-size-4 has-text-white has-text-left mb-3 mt-4">
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
                class="input is-large"
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
                class="input is-large"
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
              class="button is-danger is-large mt-3"
              @click="removeSeverityTier(idx)"
            >
              <span class="material-symbols-outlined">remove</span>
            </button>
          </div>
        </div>
        <button
          v-if="slaForm.severityTiers.length < 5"
          class="button is-info is-medium m-5"
          @click="addSeverityTier"
        >
          <span class="material-symbols-outlined mr-1">add</span>
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
                  class="input is-large"
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
                  class="input is-large"
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
                  class="input is-large"
                  v-model="source.description"
                  placeholder="Primary oracle feed"
                />
              </div>
            </div>
            <div class="column is-1">
              <button
                v-if="slaForm.dataSources.length > 1"
                class="button is-danger is-large mt-3"
                @click="removeDataSource(idx)"
              >
                <span class="material-symbols-outlined">remove</span>
              </button>
            </div>
          </div>
        </div>
        <button
          v-if="slaForm.dataSources.length < 10"
          class="button is-info is-medium m-3 mb-5"
          @click="addDataSource"
        >
          <span class="material-symbols-outlined mr-1">add</span>
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
      <div class="notification is-warning mt-5 has-text-left">
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
          class="button is-success is-large"
          @click="createPredictionMarket"
          :disabled="!canCreate || isCreating"
        >
          <span
            v-if="isCreating"
            class="material-symbols-outlined rotating mr-2"
          >
            progress_activity
          </span>
          <span v-else class="material-symbols-outlined mr-2">
            online_prediction
          </span>
          {{ isCreating ? 'Creating...' : 'Create Prediction Market' }}
        </button>
      </div>
    </div>

    <!-- Active Markets -->
    <div v-if="markets.length > 0" class="models__activity--payouts mt-5 has-text-left">
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
            <span class="tag is-info is-medium">{{ market.useCase }}</span>
            <span class="tag is-warning is-medium ml-2">{{ market.leverage }}x</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed } from 'vue';

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
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  backdrop-filter: blur(32px);
}

.category-selector input[type='radio'] + label.radio.category:hover {
  background: rgba(97, 55, 142, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
  color: rgba(255, 255, 255, 0.8);
}

.category-selector input[type='radio']:checked + label.radio.category {
  color: rgba(255, 255, 255, 1);
  border: 1px solid rgba(255, 255, 255, 1);
  background: rgba(97, 55, 142, 0.33);
  backdrop-filter: blur(64px);
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
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Severity tiers */
.severity-tiers {
  background: rgba(0, 0, 0, 0.2);
  padding: 1rem;
  border-radius: 8px;
}

/* Data sources */
.data-sources {
  background: rgba(0, 0, 0, 0.2);
  padding: 1rem;
  border-radius: 8px;
}

.data-source-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 1rem;
}

.data-source-item:last-of-type {
  border-bottom: none;
}

/* Form inputs */
.input,
.select select {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.2);
  color: white;
}

.input::placeholder {
  color: rgba(255, 255, 255, 0.4);
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
  animation: rotate 1s linear infinite;
}


.models__activity--payouts {
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
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
  color: rgba(255, 255, 255, 0.8);
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
</style>

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
              build_circle
            </span>
            {{ skill?.name || 'DSLA Prediction Market Factory' }}
          </h3>
          <p class="is-size-5 mt-3">
            {{ skill?.description || 'Create prediction market skills using DSLA framework.' }}
          </p>
        </div>
      </div>
    </div>

    <div class="models__activity--payouts">
      <div class="bonzai__agent">
        <div class="desc">
          <span class="material-symbols-outlined is-size-1 has-text-white">
            build_circle
          </span>
          <p class="notification is-info">
            Create a new Prediction Market Skill using the Decentralized Service
            Level Agreement (DSLA) framework. Select a use case, define your
            skill's identity and token economics.
          </p>
        </div>

        <!-- Use Case Selection -->
        <h2 class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-4">
          Use Case
        </h2>
        <div class="columns">
          <div class="column is-12">
            <div class="control usecase-selector">
              <template v-for="useCase in useCases" :key="useCase.key">
                <input
                  type="radio"
                  name="usecase_selector"
                  :id="'usecase_' + useCase.key"
                  :value="useCase.key"
                  :checked="selectedUseCase && selectedUseCase.key === useCase.key"
                  @change="selectUseCase(useCase)"
                />
                <label :for="'usecase_' + useCase.key" class="radio">
                  {{ useCase.label }}
                </label>
              </template>
            </div>
            <p v-if="selectedUseCase" class="has-text-grey-light mt-2 is-size-7">
              {{ selectedUseCase.context }}
            </p>
          </div>
        </div>
        <hr />

        <!-- Project Identity -->
        <h2 class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-4 mt-5">
          Project Identity
        </h2>
        <div class="columns">
          <div class="field column is-6">
            <label class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5">
              Project Name *
            </label>
            <div class="control">
              <input
                class="input is-large"
                v-model="projectForm.name"
                placeholder="Enter project name"
              />
            </div>
          </div>
          <div class="field column is-6">
            <label class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5">
              Token Symbol *
            </label>
            <div class="control">
              <input
                class="input is-large"
                v-model="projectForm.tokenSymbol"
                placeholder="e.g. BTC, ETH, DSLA"
              />
            </div>
          </div>
        </div>
        <div class="field">
          <label class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5">
            Project Description *
          </label>
          <div class="control">
            <textarea
              class="textarea is-large"
              v-model="projectForm.description"
              placeholder="Describe your project and its goals"
            ></textarea>
          </div>
        </div>

        <hr />

        <!-- Token Economics -->
        <h2 class="fira-sans-condensed-black-italic is-size-2 has-text-white has-text-left mb-4 mt-5">
          Token Economics
        </h2>
        <div class="columns">
          <div class="field column is-6">
            <label class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5">
              Total Supply
              <span v-if="projectForm.tokenSymbol">
                ({{ projectForm.tokenSymbol }})
              </span>
            </label>
            <div class="control">
              <input
                class="input is-large"
                v-model="projectForm.totalSupply"
                placeholder="e.g. 1000000000"
              />
            </div>
          </div>
          <div class="field column is-6">
            <label class="label has-text-white has-text-left fira-sans-condensed-black-italic is-size-5">
              Price (ETH)
            </label>
            <div class="control">
              <input
                class="input is-large"
                type="number"
                step="0.01"
                v-model.number="projectForm.price"
                placeholder="0.1"
              />
            </div>
          </div>
        </div>

        <!-- Create Skill Button -->
        <div class="control mt-4 has-text-centered mt-5">
          <button
            class="button is-success is-large mt-5"
            @click="createPredictionMarketSkill"
            :disabled="!projectForm.name || !projectForm.tokenSymbol || !selectedUseCase || isCreating"
          >
            <span
              v-if="isCreating"
              class="material-symbols-outlined rotating mr-2 is-size-3"
            >
              progress_activity
            </span>
            <span v-else class="material-symbols-outlined mr-2 is-size-3">
              build_circle
            </span>
            {{ isCreating ? 'Creating...' : 'Create Prediction Market Skill' }}
            <div class="tags has-addons ml-3">
              <span class="tag is-warning partner fira-sans-condensed-black-italic">
                {{ projectForm.price || 0.1 }} ETH
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive } from 'vue';
import { useSkillStore } from '../../stores/skillStore.js';

export default {
  name: 'DSLASkill',
  props: {
    skill: {
      type: Object,
      default: null,
    },
  },
  emits: ['skill-created'],
  setup(props, { emit }) {
    const skillStore = useSkillStore();

    // State
    const isCreating = ref(false);
    const selectedUseCase = ref(null);
    const projectForm = reactive({
      name: '',
      tokenSymbol: '',
      description: '',
      totalSupply: '',
      price: 0.1,
    });

    // Configuration
    const useCases = [
      {
        key: 'vol_returns',
        label: 'Volatility of Returns',
        context: 'DeFi yields, staking rewards, lending rates',
      },
      {
        key: 'vol_availability',
        label: 'Volatility of Availability',
        context: 'blockchain uptime, API availability, node reliability',
      },
      {
        key: 'vol_asset_floors',
        label: 'Volatility of Asset Floors',
        context: 'NFT floor prices, token minimums, collateral ratios',
      },
      {
        key: 'vol_currency_pegs',
        label: 'Volatility of Currency Pegs',
        context: 'stablecoin pegs, wrapped token ratios, synthetic assets',
      },
      {
        key: 'vol_response_time',
        label: 'Volatility of Response Time',
        context: 'block times, transaction confirmations, oracle updates',
      },
      {
        key: 'vol_delivery_time',
        label: 'Volatility of Delivery Time',
        context: 'NFT mints, token distributions, airdrop claims',
      },
    ];

    // Methods
    const selectUseCase = (useCase) => {
      selectedUseCase.value = useCase;
    };

    const createPredictionMarketSkill = async () => {
      if (!projectForm.name || !projectForm.tokenSymbol || !selectedUseCase.value) {
        return;
      }

      isCreating.value = true;

      try {
        // Create skill definition
        const skillForm = {
          name: `${projectForm.name} Prediction Market`,
          description: `${selectedUseCase.value.label} prediction market for ${projectForm.name}. ${projectForm.description}`,
          category: 'finance',
          usesLLM: true,
          steps: [
            {
              type: 'llm',
              prompt: `Analyze ${selectedUseCase.value.label} for ${projectForm.name}: ${projectForm.description}`,
            },
          ],
        };

        // Publish via skill store
        const result = await skillStore.publishSkill(skillForm);

        if (result.success) {
          emit('skill-created', result.skill);

          // Reset form
          projectForm.name = '';
          projectForm.tokenSymbol = '';
          projectForm.description = '';
          projectForm.totalSupply = '';
          projectForm.price = 0.1;
          selectedUseCase.value = null;
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
      projectForm,
      useCases,
      selectUseCase,
      createPredictionMarketSkill,
    };
  },
};
</script>

<style scoped>
.dsla-skill {
  width: 100%;
}

.usecase-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.usecase-selector input[type='radio'] {
  display: none;
}

.usecase-selector .radio {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.3);
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 4px;
}

.usecase-selector .radio:hover {
  background: rgba(255, 255, 255, 0.1);
}

.usecase-selector input[type='radio']:checked + .radio {
  background: var(--bulma-primary);
  border-color: var(--bulma-primary);
}

.rotating {
  animation: rotate 1s linear infinite;
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

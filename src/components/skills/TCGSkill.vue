<template>
  <div class="tcg-skill">
    <!-- Skill Header -->
    <div class="models__activity--payouts mb-4 has-text-left">
      <div class="columns is-vcentered">
        <div class="column">
          <h3 class="skill-name is-size-1 fira-sans-condensed-black-italic">
            <span
              class="material-symbols-outlined mr-2"
              style="font-size: 48px; color: var(--bulma-primary)"
            >
              amp_stories
            </span>
            {{ skill?.name || 'Trading Card Game Insurance' }}
          </h3>
          <p class="skill-description is-size-5 mt-3">
            {{ skill?.description || 'Create prediction markets for trading card prices.' }}
          </p>
        </div>
      </div>
    </div>

    <!-- Collection Selector -->
    <div
      class="models__activity--payouts pt-5 pb-5"
      style="position: relative; bottom: -40px; z-index: 11"
    >
      <div class="columns">
        <div class="column is-12">
          <span class="category-selector">
            <template v-for="col in collections" :key="col.id">
              <input
                type="radio"
                name="tcg_collection"
                :id="'tcg_col_' + col.id"
                :value="col.id"
                :checked="selectedCollection === col.id"
                @change="selectCollection(col.id)"
              />
              <label :for="'tcg_col_' + col.id" class="radio category">
                {{ col.name }}
              </label>
            </template>
          </span>
        </div>
      </div>
    </div>

    <hr />

    <div class="columns">
      <!-- Left: Top Cards & Search -->
      <div class="column is-7">
        <div class="tcg-section models__activity--payouts">
          <!-- Search -->
          <div class="field has-addons mb-4">
            <div class="control is-expanded">
              <input
                class="input no-shadow"
                type="text"
                v-model="searchQuery"
                placeholder="Search cards..."
                @input="searchCards"
              />
            </div>
            <div class="control">
              <button class="button is-info no-shadow" @click="searchCards">
                <span class="material-symbols-outlined">search</span>
              </button>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="isLoading" class="has-text-centered p-5">
            <span class="material-symbols-outlined rotating" style="font-size: 64px">
              progress_activity
            </span>
          </div>

          <!-- Search Results -->
          <div
            v-else-if="searchResults.length > 0"
            class="tcg-cards has-text-left"
          >
            <p class="has-text-grey-light is-size-7 mb-2">Search Results:</p>
            <div
              v-for="card in searchResults"
              :key="card.id"
              class="tcg-card-item"
            >
              <div class="tcg-card-info">
                <strong>{{ card.name }}</strong>
                <span class="has-text-grey-light is-size-7 ml-2">
                  {{ card.set }}
                </span>
              </div>
              <div class="tcg-card-actions">
                <button
                  class="button is-small is-warning no-shadow"
                  @click="addToPortfolio(card)"
                  :disabled="portfolio.some((c) => c.id === card.id)"
                >
                  <span class="material-symbols-outlined" style="font-size: 16px">
                    add
                  </span>
                </button>
              </div>
            </div>
          </div>

          <!-- Top Cards -->
          <div v-else class="tcg-cards has-text-left">
            <div
              v-for="card in topCards"
              :key="card.id"
              class="tcg-card-item"
            >
              <div class="tcg-card-info">
                <strong class="has-text-brand">{{ card.name }}</strong>
                <span class="has-text-grey-light is-size-7 ml-2">
                  {{ card.set }}
                </span>
                <span class="tag is-info is-small ml-2">
                  {{ card.rarity }}
                </span>
              </div>
              <div class="tcg-card-actions">
                <button
                  class="button is-warning no-shadow"
                  @click="addToPortfolio(card)"
                  :disabled="portfolio.some((c) => c.id === card.id)"
                >
                  <span class="material-symbols-outlined" style="font-size: 24px">
                    add
                  </span>
                </button>
              </div>
            </div>
            <div v-if="topCards.length === 0" class="has-text-centered p-5">
              <p class="has-text-grey-light">
                Select a collection to load cards
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Your Portfolio -->
      <div class="column is-5">
        <div class="tcg-section portfolio-section models__activity--payouts">
          <h4 class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-4">
            <span class="material-symbols-outlined is-size-1">amp_stories</span>
            My Cards
            <span class="tag is-info ml-2 is-pulled-right is-large">
              {{ portfolio.length }} cards
            </span>
          </h4>

          <div class="tcg-portfolio-cards mt-4">
            <div
              v-for="card in portfolio"
              :key="'portfolio-' + card.id"
              class="tcg-portfolio-card pb-5"
            >
              <div class="portfolio-card-header has-text-brand has-text-left">
                <strong>{{ card.collection }} — {{ card.name }}</strong>
              </div>
              <hr />
              <div class="portfolio-card-actions mt-2">
                <button
                  class="button is-medium is-success fira-sans-condensed-black-italic mr-5"
                  @click="openMarketModal(card)"
                >
                  <span class="material-symbols-outlined mr-1 is-size-1">
                    online_prediction
                  </span>
                  Issue Market
                </button>
                <button
                  class="button is-small is-danger"
                  @click="removeFromPortfolio(card.id)"
                >
                  <span class="material-symbols-outlined" style="font-size: 14px">
                    cancel
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Active TCG Markets -->
    <div v-if="markets.length > 0" class="tcg-markets-section mt-5">
      <h4 class="fira-sans-condensed-black-italic has-text-white is-size-4 mb-3 has-text-left">
        <span class="material-symbols-outlined mr-2 is-size-1">
          online_prediction
        </span>
        Active Prediction Markets
      </h4>
      <div class="tcg-markets-list">
        <div
          v-for="market in markets"
          :key="market.id"
          class="tcg-market-card models__activity--payouts mt-5"
        >
          <div class="columns is-multiline">
            <div class="column is-12">
              <div class="sla-preview p-1">
                <span
                  class="tag is-warning fira-sans-condensed-black-italic is-size-5"
                  style="width: 100%"
                >
                  <strong>{{ market.question }}</strong>
                </span>
              </div>
              <hr />
              <!-- Position Display -->
              <div v-if="positions[market.id]" class="current-positions">
                <span
                  v-if="positions[market.id]?.for"
                  class="tag is-medium is-success fira-sans-condensed-black-italic mr-2"
                >
                  FOR: {{ positions[market.id].for.amount }} tokens
                </span>
                <span
                  v-if="positions[market.id]?.against"
                  class="tag is-medium is-danger fira-sans-condensed-black-italic"
                >
                  AGAINST: {{ positions[market.id].against.amount }} tokens
                </span>
              </div>
            </div>
            <div class="column is-3 is-offset-3">
              <button
                class="button is-success fira-sans-condensed-black-italic is-fullwidth"
                @click="takePosition(market.id, 'for', market)"
              >
                <span class="material-symbols-outlined mr-1">thumb_up</span>
                YES
              </button>
            </div>
            <div class="column is-3">
              <button
                class="button is-danger fira-sans-condensed-black-italic is-fullwidth"
                @click="takePosition(market.id, 'against', market)"
              >
                <span class="material-symbols-outlined mr-1">thumb_down</span>
                NO
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Market Creation Modal -->
    <div v-if="marketModal.show" class="tcg-modal-overlay" @click.self="closeMarketModal">
      <div class="tcg-modal">
        <button class="delete is-large modal-close" @click="closeMarketModal"></button>

        <div class="tcg-modal-header has-text-center">
          <h3 class="fira-sans-condensed-black-italic is-size-3 has-text-white mb-3">
            <span class="material-symbols-outlined mr-2">online_prediction</span>
            Create Prediction Market
          </h3>
          <p class="has-text-grey-light">
            {{ marketModal.card?.name }} ({{ marketModal.card?.collection }})
          </p>
        </div>

        <div class="tcg-modal-body mt-4">
          <div class="field">
            <label class="label has-text-white">Price Condition</label>
            <div class="control">
              <div class="select is-fullwidth">
                <select v-model="marketModal.operator">
                  <option value=">">Will exceed ($)</option>
                  <option value="<">Will fall below ($)</option>
                  <option value=">=">Will reach at least ($)</option>
                  <option value="<=">Will stay at or below ($)</option>
                  <option value="=">Will equal exactly ($)</option>
                </select>
              </div>
            </div>
          </div>

          <div class="field">
            <label class="label has-text-white">Target Price ($)</label>
            <div class="control">
              <input
                class="input"
                type="number"
                v-model.number="marketModal.targetPrice"
                placeholder="Enter target price"
              />
            </div>
          </div>

          <div class="field">
            <label class="label has-text-white">Resolution Date</label>
            <div class="control">
              <input
                class="input"
                type="date"
                v-model="marketModal.targetDate"
              />
            </div>
          </div>
        </div>

        <div class="tcg-modal-footer mt-5">
          <button
            class="button is-success is-large is-fullwidth"
            @click="createMarket"
            :disabled="!marketModal.targetPrice || !marketModal.targetDate"
          >
            <span class="material-symbols-outlined mr-2">add_circle</span>
            Create Market
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from 'vue';

export default {
  name: 'TCGSkill',
  props: {
    skill: {
      type: Object,
      default: null,
    },
  },
  emits: ['market-created'],
  setup(props, { emit }) {
    // State
    const isLoading = ref(false);
    const selectedCollection = ref('pokemon');
    const searchQuery = ref('');
    const searchResults = ref([]);
    const topCards = ref([]);
    const portfolio = ref([]);
    const markets = ref([]);
    const positions = reactive({});

    const marketModal = reactive({
      show: false,
      card: null,
      operator: '>',
      targetPrice: null,
      targetDate: '',
    });

    // Configuration
    const collections = [
      { id: 'pokemon', name: 'Pokemon', icon: 'amp_stories' },
      { id: 'mtg', name: 'Magic: The Gathering', icon: 'amp_stories' },
      { id: 'yugioh', name: 'Yu-Gi-Oh!', icon: 'amp_stories' },
      { id: 'onepiece', name: 'One Piece', icon: 'amp_stories' },
      { id: 'lorcana', name: 'Lorcana', icon: 'amp_stories' },
    ];

    // Mock data for different collections
    const mockCards = {
      pokemon: [
        { id: 'p1', name: 'Charizard VMAX', set: "Champion's Path", rarity: 'Ultra Rare', price: 350, priceChange: 15 },
        { id: 'p2', name: 'Pikachu VMAX', set: 'Vivid Voltage', rarity: 'Ultra Rare', price: 180, priceChange: -5 },
        { id: 'p3', name: 'Mewtwo V', set: 'Pokemon GO', rarity: 'Ultra Rare', price: 45, priceChange: 8 },
        { id: 'p4', name: 'Umbreon VMAX', set: 'Evolving Skies', rarity: 'Secret Rare', price: 280, priceChange: 22 },
      ],
      mtg: [
        { id: 'm1', name: 'Black Lotus', set: 'Alpha', rarity: 'Rare', price: 250000, priceChange: 1000 },
        { id: 'm2', name: 'Mox Sapphire', set: 'Beta', rarity: 'Rare', price: 12000, priceChange: 500 },
        { id: 'm3', name: 'Time Walk', set: 'Alpha', rarity: 'Rare', price: 8000, priceChange: 200 },
      ],
      yugioh: [
        { id: 'y1', name: 'Blue-Eyes White Dragon', set: 'LOB', rarity: 'Ultra Rare', price: 2500, priceChange: 100 },
        { id: 'y2', name: 'Dark Magician', set: 'LOB', rarity: 'Ultra Rare', price: 1200, priceChange: 50 },
      ],
      onepiece: [
        { id: 'o1', name: 'Monkey D. Luffy', set: 'Romance Dawn', rarity: 'Leader', price: 85, priceChange: 12 },
        { id: 'o2', name: 'Roronoa Zoro', set: 'Romance Dawn', rarity: 'Super Rare', price: 45, priceChange: 5 },
      ],
      lorcana: [
        { id: 'l1', name: 'Elsa - Snow Queen', set: 'The First Chapter', rarity: 'Legendary', price: 120, priceChange: 20 },
        { id: 'l2', name: 'Mickey Mouse - Brave Hero', set: 'The First Chapter', rarity: 'Legendary', price: 90, priceChange: 15 },
      ],
    };

    // Methods
    const selectCollection = (collectionId) => {
      selectedCollection.value = collectionId;
      loadTopCards();
    };

    const loadTopCards = async () => {
      isLoading.value = true;
      searchResults.value = [];

      try {
        // Use mock data
        topCards.value = mockCards[selectedCollection.value] || [];
      } catch (e) {
        console.error('[TCGSkill] Load error:', e);
      } finally {
        isLoading.value = false;
      }
    };

    const searchCards = async () => {
      if (!searchQuery.value) {
        searchResults.value = [];
        return;
      }

      isLoading.value = true;

      try {
        const query = searchQuery.value.toLowerCase();
        searchResults.value = topCards.value.filter((c) =>
          c.name.toLowerCase().includes(query)
        );
      } catch (e) {
        console.error('[TCGSkill] Search error:', e);
      } finally {
        isLoading.value = false;
      }
    };

    const addToPortfolio = (card) => {
      if (!portfolio.value.some((c) => c.id === card.id)) {
        portfolio.value.push({
          ...card,
          collection: selectedCollection.value,
        });
      }
    };

    const removeFromPortfolio = (cardId) => {
      portfolio.value = portfolio.value.filter((c) => c.id !== cardId);
    };

    const openMarketModal = (card) => {
      marketModal.show = true;
      marketModal.card = card;
      marketModal.operator = '>';
      marketModal.targetPrice = Math.round(card.price * 1.2);
      marketModal.targetDate = '';
    };

    const closeMarketModal = () => {
      marketModal.show = false;
      marketModal.card = null;
    };

    const createMarket = () => {
      if (!marketModal.targetPrice || !marketModal.targetDate) return;

      const operatorText = {
        '>': 'exceed',
        '<': 'fall below',
        '>=': 'reach at least',
        '<=': 'stay at or below',
        '=': 'equal exactly',
      };

      const market = {
        id: `tcg-${Date.now()}`,
        cardId: marketModal.card.id,
        cardName: marketModal.card.name,
        collection: marketModal.card.collection,
        question: `Will ${marketModal.card.name} ${operatorText[marketModal.operator]} $${marketModal.targetPrice} by ${marketModal.targetDate}?`,
        operator: marketModal.operator,
        targetPrice: marketModal.targetPrice,
        targetDate: marketModal.targetDate,
        createdAt: new Date().toISOString(),
      };

      markets.value.push(market);
      emit('market-created', market);
      closeMarketModal();
    };

    const takePosition = (marketId, side, market) => {
      if (!positions[marketId]) {
        positions[marketId] = {};
      }
      positions[marketId][side] = {
        amount: 100,
        side,
        timestamp: new Date().toISOString(),
      };
    };

    onMounted(() => {
      loadTopCards();
    });

    return {
      isLoading,
      selectedCollection,
      searchQuery,
      searchResults,
      topCards,
      portfolio,
      markets,
      positions,
      marketModal,
      collections,
      selectCollection,
      loadTopCards,
      searchCards,
      addToPortfolio,
      removeFromPortfolio,
      openMarketModal,
      closeMarketModal,
      createMarket,
      takePosition,
    };
  },
};
</script>

<style scoped>
.tcg-skill {
  width: 100%;
}

/* Selector styles matching Browse tab */
.category-selector {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
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

.tcg-section {
  padding: 1rem;
  border-radius: 8px;
}

.tcg-card-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tcg-card-item:last-child {
  border-bottom: none;
}

.tcg-portfolio-card {
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tcg-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.tcg-modal {
  background: #1a1a2e;
  padding: 2rem;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  position: relative;
}

.modal-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
}

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

/*
 * TCG Prediction Market Agent
 *
 * This agent connects to JustTCG.com to fetch Trading Card Game pricing data.
 * Users can build a virtual portfolio of cards they own and issue or join
 * prediction markets on card price movements.
 *
 * Supported TCGs:
 * - Pokemon
 * - Magic: The Gathering
 * - Yu-Gi-Oh!
 * - One Piece
 * - Lorcana
 *
 * NOTE: This agent uses the Electron proxy (window.externalProxy) to
 * bypass CORS restrictions when fetching from JustTCG endpoints.
 */

const TCG_COLLECTIONS = [
  { id: 'pokemon', name: 'Pokemon', icon: 'amp_stories' },
  { id: 'mtg', name: 'Magic: The Gathering', icon: 'amp_stories' },
  { id: 'yugioh', name: 'Yu-Gi-Oh!', icon: 'amp_stories' },
  { id: 'onepiece', name: 'One Piece', icon: 'amp_stories' },
  { id: 'lorcana', name: 'Lorcana', icon: 'amp_stories' },
];

export default {
  /**
   * A human readable name for the agent.
   */
  name: 'TCG Prediction Market',

  /**
   * A short description explaining what the agent does.
   */
  description: 'Build your TCG portfolio and issue or join prediction markets on card prices using JustTCG.com data.',

  /**
   * The category under which this agent should appear.
   */
  category: 'trading',

  /**
   * Available TCG collections
   */
  collections: TCG_COLLECTIONS,

  /**
   * Input fields for customizing the agent's behavior.
   */
  inputs: {
    collection: {
      type: 'select',
      default: 'pokemon',
      label: 'TCG Collection',
      options: TCG_COLLECTIONS.map(c => ({ value: c.id, label: c.name })),
    },
    topCount: {
      type: 'number',
      default: 10,
      label: 'Number of top cards to display',
    },
  },

  /**
   * Fetch data via the Electron proxy to bypass CORS.
   *
   * @param {string} url - The URL to fetch
   * @returns {Promise<any>}
   */
  async fetchViaProxy(url) {
    // Use Electron proxy if available
    if (window.externalProxy?.get) {
      const result = await window.externalProxy.get(url);
      if (!result.success) {
        throw new Error(result.error || `Request failed for ${url}`);
      }
      return result.data;
    }
    // Fallback for development
    throw new Error(
      'External proxy not available. Please ensure you are running in Electron with the preload script loaded.'
    );
  },

  /**
   * Fetch top cards for a specific TCG collection.
   *
   * @param {string} collectionId - The collection ID (pokemon, mtg, etc.)
   * @param {number} limit - Number of top cards to fetch
   * @returns {Promise<Array>} Array of card objects
   */
  async fetchTopCards(collectionId, limit = 10) {
    // JustTCG API disabled for now - using mock data
    console.log('[TCG Agent] Using mock data (JustTCG API disabled)');
    return this.getMockTopCards(collectionId, limit);
  },

  /**
   * Search cards by name within a collection.
   *
   * @param {string} collectionId - The collection ID
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of matching cards
   */
  async searchCards(collectionId, query) {
    // JustTCG API disabled for now - using mock data
    console.log('[TCG Agent] Using mock search (JustTCG API disabled)');
    return this.getMockSearchResults(collectionId, query);
  },

  /**
   * Get mock top cards for development/demo purposes.
   */
  getMockTopCards(collectionId, limit) {
    const mockCards = {
      pokemon: [
        { id: 'pkmn-1', name: 'Charizard VMAX', set: 'Shining Fates', rarity: 'Secret Rare', price: 185.00, priceChange24h: 2.5, priceChange7d: -3.2 },
        { id: 'pkmn-2', name: 'Pikachu VMAX', set: 'Vivid Voltage', rarity: 'Rainbow Rare', price: 142.50, priceChange24h: -1.2, priceChange7d: 5.8 },
        { id: 'pkmn-3', name: 'Umbreon VMAX Alt Art', set: 'Evolving Skies', rarity: 'Alternate Art', price: 320.00, priceChange24h: 4.1, priceChange7d: 12.3 },
        { id: 'pkmn-4', name: 'Mewtwo V Alt Art', set: 'Pokemon GO', rarity: 'Alternate Art', price: 95.00, priceChange24h: 0.8, priceChange7d: -2.1 },
        { id: 'pkmn-5', name: 'Rayquaza VMAX Alt Art', set: 'Evolving Skies', rarity: 'Alternate Art', price: 275.00, priceChange24h: 1.5, priceChange7d: 8.7 },
        { id: 'pkmn-6', name: 'Gengar VMAX Alt Art', set: 'Fusion Strike', rarity: 'Alternate Art', price: 165.00, priceChange24h: -0.5, priceChange7d: 3.2 },
        { id: 'pkmn-7', name: 'Moonbreon', set: 'Evolving Skies', rarity: 'Alternate Art', price: 450.00, priceChange24h: 3.2, priceChange7d: 15.6 },
        { id: 'pkmn-8', name: 'Lugia V Alt Art', set: 'Silver Tempest', rarity: 'Alternate Art', price: 125.00, priceChange24h: 2.1, priceChange7d: 6.4 },
        { id: 'pkmn-9', name: 'Giratina V Alt Art', set: 'Lost Origin', rarity: 'Alternate Art', price: 110.00, priceChange24h: -1.8, priceChange7d: 4.2 },
        { id: 'pkmn-10', name: 'Arceus VSTAR Rainbow', set: 'Brilliant Stars', rarity: 'Rainbow Rare', price: 88.00, priceChange24h: 0.3, priceChange7d: -1.5 },
      ],
      mtg: [
        { id: 'mtg-1', name: 'Black Lotus', set: 'Alpha', rarity: 'Rare', price: 85000.00, priceChange24h: 0.1, priceChange7d: 2.3 },
        { id: 'mtg-2', name: 'Mox Sapphire', set: 'Beta', rarity: 'Rare', price: 12500.00, priceChange24h: -0.5, priceChange7d: 1.8 },
        { id: 'mtg-3', name: 'Time Walk', set: 'Alpha', rarity: 'Rare', price: 8500.00, priceChange24h: 0.3, priceChange7d: -0.7 },
        { id: 'mtg-4', name: 'Ancestral Recall', set: 'Beta', rarity: 'Rare', price: 7200.00, priceChange24h: 1.2, priceChange7d: 3.5 },
        { id: 'mtg-5', name: 'Underground Sea', set: 'Revised', rarity: 'Rare', price: 650.00, priceChange24h: -0.8, priceChange7d: 2.1 },
        { id: 'mtg-6', name: 'Tropical Island', set: 'Revised', rarity: 'Rare', price: 520.00, priceChange24h: 0.5, priceChange7d: -1.2 },
        { id: 'mtg-7', name: 'Force of Will', set: 'Alliances', rarity: 'Uncommon', price: 125.00, priceChange24h: 2.1, priceChange7d: 5.8 },
        { id: 'mtg-8', name: 'Gaea\'s Cradle', set: 'Urza\'s Saga', rarity: 'Rare', price: 1100.00, priceChange24h: -1.5, priceChange7d: 4.2 },
        { id: 'mtg-9', name: 'The One Ring', set: 'LOTR', rarity: 'Mythic', price: 2200.00, priceChange24h: 3.5, priceChange7d: 12.4 },
        { id: 'mtg-10', name: 'Ragavan', set: 'Modern Horizons 2', rarity: 'Mythic', price: 75.00, priceChange24h: -2.3, priceChange7d: -5.1 },
      ],
      yugioh: [
        { id: 'ygo-1', name: 'Blue-Eyes White Dragon (LOB)', set: 'Legend of Blue Eyes', rarity: 'Ultra Rare', price: 850.00, priceChange24h: 1.5, priceChange7d: 4.2 },
        { id: 'ygo-2', name: 'Dark Magician (LOB)', set: 'Legend of Blue Eyes', rarity: 'Ultra Rare', price: 420.00, priceChange24h: -0.8, priceChange7d: 2.1 },
        { id: 'ygo-3', name: 'Exodia the Forbidden One', set: 'Legend of Blue Eyes', rarity: 'Ultra Rare', price: 380.00, priceChange24h: 2.3, priceChange7d: 6.7 },
        { id: 'ygo-4', name: 'Ghost Rare Blue-Eyes', set: 'Ghost From the Past', rarity: 'Ghost Rare', price: 225.00, priceChange24h: 0.5, priceChange7d: -1.8 },
        { id: 'ygo-5', name: 'Starlight Rare Accesscode', set: 'Eternity Code', rarity: 'Starlight Rare', price: 650.00, priceChange24h: -1.2, priceChange7d: 3.5 },
        { id: 'ygo-6', name: 'Ash Blossom (Starlight)', set: 'Battles of Legend', rarity: 'Starlight Rare', price: 485.00, priceChange24h: 1.8, priceChange7d: 5.2 },
        { id: 'ygo-7', name: 'Red-Eyes Black Dragon (LOB)', set: 'Legend of Blue Eyes', rarity: 'Ultra Rare', price: 185.00, priceChange24h: 0.3, priceChange7d: 1.5 },
        { id: 'ygo-8', name: 'Pot of Greed (LOB)', set: 'Legend of Blue Eyes', rarity: 'Super Rare', price: 95.00, priceChange24h: -0.5, priceChange7d: 0.8 },
        { id: 'ygo-9', name: 'Tearlaments Kitkallos', set: 'Power of Elements', rarity: 'Secret Rare', price: 145.00, priceChange24h: 3.2, priceChange7d: 8.5 },
        { id: 'ygo-10', name: 'Spright Blue', set: 'Power of Elements', rarity: 'Ultra Rare', price: 68.00, priceChange24h: -2.1, priceChange7d: -4.3 },
      ],
      onepiece: [
        { id: 'op-1', name: 'Shanks (Alt Art)', set: 'OP-01', rarity: 'Secret Rare', price: 285.00, priceChange24h: 4.5, priceChange7d: 18.2 },
        { id: 'op-2', name: 'Roronoa Zoro (Manga)', set: 'OP-02', rarity: 'Secret Rare', price: 165.00, priceChange24h: 2.1, priceChange7d: 12.5 },
        { id: 'op-3', name: 'Monkey D. Luffy (Leader)', set: 'OP-01', rarity: 'Leader', price: 95.00, priceChange24h: 1.8, priceChange7d: 5.3 },
        { id: 'op-4', name: 'Nami (Alt Art)', set: 'OP-01', rarity: 'Super Rare', price: 125.00, priceChange24h: -0.5, priceChange7d: 8.7 },
        { id: 'op-5', name: 'Portgas D. Ace', set: 'OP-02', rarity: 'Secret Rare', price: 78.00, priceChange24h: 3.2, priceChange7d: 6.4 },
        { id: 'op-6', name: 'Boa Hancock (Alt Art)', set: 'OP-03', rarity: 'Secret Rare', price: 145.00, priceChange24h: 1.5, priceChange7d: 9.8 },
        { id: 'op-7', name: 'Trafalgar Law', set: 'OP-01', rarity: 'Super Rare', price: 52.00, priceChange24h: -1.2, priceChange7d: 2.3 },
        { id: 'op-8', name: 'Kaido (Alt Art)', set: 'OP-04', rarity: 'Secret Rare', price: 195.00, priceChange24h: 5.8, priceChange7d: 22.1 },
        { id: 'op-9', name: 'Eustass Kid', set: 'OP-02', rarity: 'Super Rare', price: 42.00, priceChange24h: 0.8, priceChange7d: 3.5 },
        { id: 'op-10', name: 'Yamato (Leader)', set: 'OP-05', rarity: 'Leader', price: 88.00, priceChange24h: 2.5, priceChange7d: 11.2 },
      ],
      lorcana: [
        { id: 'lor-1', name: 'Elsa - Spirit of Winter', set: 'The First Chapter', rarity: 'Enchanted', price: 385.00, priceChange24h: 3.2, priceChange7d: 15.8 },
        { id: 'lor-2', name: 'Mickey Mouse - Wayward Sorcerer', set: 'The First Chapter', rarity: 'Enchanted', price: 275.00, priceChange24h: 1.5, priceChange7d: 8.3 },
        { id: 'lor-3', name: 'Stitch - Rock Star', set: 'The First Chapter', rarity: 'Enchanted', price: 195.00, priceChange24h: -0.8, priceChange7d: 5.2 },
        { id: 'lor-4', name: 'Maleficent - Monstrous Dragon', set: 'Rise of Floodborn', rarity: 'Enchanted', price: 165.00, priceChange24h: 2.8, priceChange7d: 12.4 },
        { id: 'lor-5', name: 'Belle - Strange but Special', set: 'The First Chapter', rarity: 'Legendary', price: 45.00, priceChange24h: 0.5, priceChange7d: 2.1 },
        { id: 'lor-6', name: 'Gaston - Baritone Bully', set: 'Rise of Floodborn', rarity: 'Enchanted', price: 125.00, priceChange24h: 4.1, priceChange7d: 18.5 },
        { id: 'lor-7', name: 'Simba - Returned King', set: 'Into the Inklands', rarity: 'Enchanted', price: 155.00, priceChange24h: 1.2, priceChange7d: 7.8 },
        { id: 'lor-8', name: 'Ursula - Sea Witch Queen', set: 'The First Chapter', rarity: 'Legendary', price: 38.00, priceChange24h: -1.5, priceChange7d: 3.2 },
        { id: 'lor-9', name: 'Robin Hood - Capable Fighter', set: 'The First Chapter', rarity: 'Super Rare', price: 22.00, priceChange24h: 0.3, priceChange7d: 1.5 },
        { id: 'lor-10', name: 'Hercules - True Hero', set: 'Into the Inklands', rarity: 'Legendary', price: 52.00, priceChange24h: 2.5, priceChange7d: 9.3 },
      ],
    };

    return (mockCards[collectionId] || mockCards.pokemon).slice(0, limit).map(card => ({
      ...card,
      collection: collectionId,
      imageUrl: null, // No images in mock data
    }));
  },

  /**
   * Get mock search results for development.
   */
  getMockSearchResults(collectionId, query) {
    const allCards = this.getMockTopCards(collectionId, 10);
    const lowerQuery = query.toLowerCase();
    return allCards.filter(card =>
      card.name.toLowerCase().includes(lowerQuery) ||
      card.set.toLowerCase().includes(lowerQuery)
    );
  },

  /**
   * Create a prediction market for a card's price.
   *
   * @param {Object} card - The card object
   * @param {string} operator - Comparison operator (>, <, >=, <=, =)
   * @param {number} targetPrice - Target price threshold
   * @param {string} targetDate - Target date in YYYY-MM-DD format
   * @returns {Object} Prediction market object
   */
  createPredictionMarket(card, operator, targetPrice, targetDate) {
    const operatorText = {
      '>': 'exceed',
      '<': 'fall below',
      '>=': 'reach at least',
      '<=': 'stay at or below',
      '=': 'equal exactly',
    };

    const dateFormatted = new Date(targetDate).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    return {
      id: `tcg-${card.id}-${Date.now()}`,
      card: {
        id: card.id,
        name: card.name,
        set: card.set,
        collection: card.collection,
        currentPrice: card.price,
      },
      question: `Will ${card.name}'s market price ${operatorText[operator]} $${targetPrice} by ${dateFormatted}?`,
      operator,
      targetPrice,
      targetDate,
      currentPrice: card.price,
      createdAt: new Date().toISOString(),
      positions: { for: 0, against: 0 },
    };
  },

  /**
   * Main execution entry point.
   *
   * @param {Object} inputs - User provided input values
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Results including top cards
   */
  async execute(inputs, context) {
    const collectionId = inputs.collection || 'pokemon';
    const topCount = Math.max(1, Math.min(20, inputs.topCount || 10));

    const topCards = await this.fetchTopCards(collectionId, topCount);
    const collection = TCG_COLLECTIONS.find(c => c.id === collectionId);

    return {
      collection: collection || { id: collectionId, name: collectionId },
      topCards,
      timestamp: new Date().toISOString(),
    };
  },
};

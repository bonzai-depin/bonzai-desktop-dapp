/**
 * BonzAI Marketplace Service
 * 
 * Handles marketplace functionality:
 * - P2P Inference Orderbook (matching compute requests with providers)
 * - Prediction Market Projects (buy/sell)
 * - Smart Agent Trading (buy/sell)
 * 
 * All trades are paid in wTAO, with fees routed to treasury.
 * 
 * NOTE: This implementation is MOCKED for launch.
 * Real blockchain integration will be added post-launch.
 */

import { reactive, readonly, computed } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  // P2P Inference Orderbook
  orderbook: {
    bids: [], // Users wanting to outsource computation
    asks: [], // Users willing to provide computation
  },
  
  // User's active orders
  myOrders: [],
  
  // Prediction Markets
  predictionMarkets: [],
  
  // Smart Agents
  smartAgents: [],
  
  // Trade history
  tradeHistory: [],
  
  // Loading states
  isLoading: false,
  error: null,
});

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

const generateMockOrderbook = () => {
  const taskTypes = ['LVL1', 'LVL2', 'LVL3', 'LVL4', 'LVL5', 'LVL6'];
  const bids = [];
  const asks = [];
  
  // Generate mock bids (compute requests)
  for (let i = 0; i < 15; i++) {
    const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
    bids.push({
      id: `bid-${Date.now()}-${i}`,
      type: 'bid',
      taskType,
      price: (Math.random() * 5 + 0.1).toFixed(4),
      amount: Math.floor(Math.random() * 10) + 1,
      maker: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
      timestamp: Date.now() - Math.random() * 3600000,
      status: 'open',
    });
  }
  
  // Generate mock asks (compute offers)
  for (let i = 0; i < 15; i++) {
    const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
    asks.push({
      id: `ask-${Date.now()}-${i}`,
      type: 'ask',
      taskType,
      price: (Math.random() * 5 + 0.5).toFixed(4),
      amount: Math.floor(Math.random() * 10) + 1,
      maker: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
      timestamp: Date.now() - Math.random() * 3600000,
      status: 'open',
    });
  }
  
  // Sort bids by price (descending) and asks by price (ascending)
  bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  
  return { bids, asks };
};

const generateMockPredictionMarkets = () => {
  return [
    {
      id: 'pm-1',
      title: 'GPT-5 Release Date',
      description: 'When will GPT-5 be publicly released?',
      creator: '0x1234...5678',
      outcomes: [
        { id: 'q1-2025', label: 'Q1 2025', probability: 0.15, volume: 1250 },
        { id: 'q2-2025', label: 'Q2 2025', probability: 0.35, volume: 3800 },
        { id: 'q3-2025', label: 'Q3 2025', probability: 0.30, volume: 2900 },
        { id: 'later', label: 'Q4 2025 or later', probability: 0.20, volume: 1800 },
      ],
      totalVolume: 9750,
      endDate: '2025-12-31',
      status: 'active',
      price: 150, // wTAO to buy this market
    },
    {
      id: 'pm-2',
      title: 'Bitcoin All-Time High',
      description: 'Will Bitcoin reach $200,000 before 2026?',
      creator: '0xabcd...ef01',
      outcomes: [
        { id: 'yes', label: 'Yes', probability: 0.42, volume: 8500 },
        { id: 'no', label: 'No', probability: 0.58, volume: 11200 },
      ],
      totalVolume: 19700,
      endDate: '2025-12-31',
      status: 'active',
      price: 300,
    },
    {
      id: 'pm-3',
      title: 'First AGI Announcement',
      description: 'Which company will announce AGI first?',
      creator: '0x9999...aaaa',
      outcomes: [
        { id: 'openai', label: 'OpenAI', probability: 0.35, volume: 4200 },
        { id: 'anthropic', label: 'Anthropic', probability: 0.25, volume: 3100 },
        { id: 'google', label: 'Google DeepMind', probability: 0.20, volume: 2500 },
        { id: 'other', label: 'Other', probability: 0.20, volume: 2400 },
      ],
      totalVolume: 12200,
      endDate: '2027-12-31',
      status: 'active',
      price: 500,
    },
  ];
};

const generateMockSmartAgents = () => {
  return [
    {
      id: 'agent-1',
      name: 'TrendTrader Pro',
      description: 'Automated crypto trading agent using sentiment analysis and technical indicators',
      creator: '0xaaaa...bbbb',
      category: 'Trading',
      price: 25, // wTAO
      sales: 142,
      rating: 4.7,
      reviews: 89,
      capabilities: ['sentiment-analysis', 'technical-analysis', 'auto-trading'],
      modelUsed: 'LLaMA 3.2',
      thumbnail: null,
    },
    {
      id: 'agent-2',
      name: 'ContentGenie',
      description: 'Multi-modal content creation agent for social media marketing',
      creator: '0xcccc...dddd',
      category: 'Content',
      price: 15,
      sales: 287,
      rating: 4.5,
      reviews: 156,
      capabilities: ['text-generation', 'image-generation', 'scheduling'],
      modelUsed: 'Flux + LLaMA',
      thumbnail: null,
    },
    {
      id: 'agent-3',
      name: 'DataMiner X',
      description: 'Web scraping and data analysis agent with natural language queries',
      creator: '0xeeee...ffff',
      category: 'Analytics',
      price: 35,
      sales: 76,
      rating: 4.8,
      reviews: 45,
      capabilities: ['web-scraping', 'data-analysis', 'report-generation'],
      modelUsed: 'LLaMA 3.2',
      thumbnail: null,
    },
    {
      id: 'agent-4',
      name: 'CodeAssistant AI',
      description: 'Full-stack development assistant with code review and debugging',
      creator: '0x1111...2222',
      category: 'Development',
      price: 50,
      sales: 198,
      rating: 4.9,
      reviews: 167,
      capabilities: ['code-generation', 'code-review', 'debugging', 'documentation'],
      modelUsed: 'DeepSeek Coder',
      thumbnail: null,
    },
  ];
};

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export const initializeMarketplace = async () => {
  state.isLoading = true;
  state.error = null;
  
  try {
    // Load mock data
    const { bids, asks } = generateMockOrderbook();
    state.orderbook.bids = bids;
    state.orderbook.asks = asks;
    
    state.predictionMarkets = generateMockPredictionMarkets();
    state.smartAgents = generateMockSmartAgents();
    
    return true;
  } catch (e) {
    state.error = e.message;
    console.error('[Marketplace] Initialization failed:', e);
    return false;
  } finally {
    state.isLoading = false;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// P2P INFERENCE ORDERBOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Place a bid (request computation from peers)
 */
export const placeBid = async (taskType, price, amount) => {
  const userAddress = web3Service.state.walletAddress;
  if (!userAddress) throw new Error('Wallet not connected');
  
  const order = {
    id: `bid-${Date.now()}`,
    type: 'bid',
    taskType,
    price: parseFloat(price).toFixed(4),
    amount,
    maker: `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`,
    makerFull: userAddress,
    timestamp: Date.now(),
    status: 'open',
  };
  
  // In production, this would submit to blockchain
  state.orderbook.bids.unshift(order);
  state.orderbook.bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  state.myOrders.push(order);
  
  console.log('[Marketplace] Bid placed:', order);
  return order;
};

/**
 * Place an ask (offer computation to peers)
 */
export const placeAsk = async (taskType, price, amount) => {
  const userAddress = web3Service.state.walletAddress;
  if (!userAddress) throw new Error('Wallet not connected');
  
  const order = {
    id: `ask-${Date.now()}`,
    type: 'ask',
    taskType,
    price: parseFloat(price).toFixed(4),
    amount,
    maker: `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`,
    makerFull: userAddress,
    timestamp: Date.now(),
    status: 'open',
  };
  
  state.orderbook.asks.unshift(order);
  state.orderbook.asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  state.myOrders.push(order);
  
  console.log('[Marketplace] Ask placed:', order);
  return order;
};

/**
 * Cancel an order
 */
export const cancelOrder = async (orderId) => {
  const userAddress = web3Service.state.walletAddress;
  if (!userAddress) throw new Error('Wallet not connected');
  
  // Find and remove from orderbook
  const bidIndex = state.orderbook.bids.findIndex(o => o.id === orderId);
  if (bidIndex >= 0) {
    state.orderbook.bids.splice(bidIndex, 1);
  }
  
  const askIndex = state.orderbook.asks.findIndex(o => o.id === orderId);
  if (askIndex >= 0) {
    state.orderbook.asks.splice(askIndex, 1);
  }
  
  // Update my orders
  const myOrderIndex = state.myOrders.findIndex(o => o.id === orderId);
  if (myOrderIndex >= 0) {
    state.myOrders[myOrderIndex].status = 'cancelled';
  }
  
  console.log('[Marketplace] Order cancelled:', orderId);
  return true;
};

/**
 * Take an existing order (match trade)
 */
export const takeOrder = async (orderId) => {
  const userAddress = web3Service.state.walletAddress;
  if (!userAddress) throw new Error('Wallet not connected');
  
  // Find the order
  let order = state.orderbook.bids.find(o => o.id === orderId);
  let orderType = 'bid';
  
  if (!order) {
    order = state.orderbook.asks.find(o => o.id === orderId);
    orderType = 'ask';
  }
  
  if (!order) throw new Error('Order not found');
  
  // Calculate fee
  const tradeAmount = parseFloat(order.price) * order.amount;
  const feeRate = CONFIG.treasury.fees.p2pInference / 10000;
  const fee = tradeAmount * feeRate;
  
  // Record trade
  const trade = {
    id: `trade-${Date.now()}`,
    orderId,
    orderType,
    taskType: order.taskType,
    price: order.price,
    amount: order.amount,
    totalAmount: tradeAmount,
    fee,
    maker: order.makerFull || order.maker,
    taker: userAddress,
    timestamp: Date.now(),
  };
  
  state.tradeHistory.unshift(trade);
  
  // Remove order from book
  if (orderType === 'bid') {
    state.orderbook.bids = state.orderbook.bids.filter(o => o.id !== orderId);
  } else {
    state.orderbook.asks = state.orderbook.asks.filter(o => o.id !== orderId);
  }
  
  console.log('[Marketplace] Trade executed:', trade);
  return trade;
};

// ═══════════════════════════════════════════════════════════════════════════
// PREDICTION MARKETS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Buy a prediction market project
 */
export const buyPredictionMarket = async (marketId) => {
  const userAddress = web3Service.state.walletAddress;
  if (!userAddress) throw new Error('Wallet not connected');
  
  const market = state.predictionMarkets.find(m => m.id === marketId);
  if (!market) throw new Error('Market not found');
  
  // Calculate fee
  const feeRate = CONFIG.treasury.fees.predictionMarket / 10000;
  const fee = market.price * feeRate;
  
  const purchase = {
    id: `pm-purchase-${Date.now()}`,
    marketId,
    marketTitle: market.title,
    price: market.price,
    fee,
    buyer: userAddress,
    timestamp: Date.now(),
  };
  
  state.tradeHistory.unshift(purchase);
  console.log('[Marketplace] Prediction market purchased:', purchase);
  
  return purchase;
};

/**
 * Sell a prediction market project (list for sale)
 */
export const listPredictionMarket = async (marketData) => {
  const userAddress = web3Service.state.walletAddress;
  if (!userAddress) throw new Error('Wallet not connected');
  
  const newMarket = {
    id: `pm-${Date.now()}`,
    ...marketData,
    creator: userAddress,
    status: 'active',
    totalVolume: 0,
  };
  
  state.predictionMarkets.unshift(newMarket);
  console.log('[Marketplace] Prediction market listed:', newMarket);
  
  return newMarket;
};

// ═══════════════════════════════════════════════════════════════════════════
// SMART AGENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Buy a smart agent
 */
export const buySmartAgent = async (agentId) => {
  const userAddress = web3Service.state.walletAddress;
  if (!userAddress) throw new Error('Wallet not connected');
  
  const agent = state.smartAgents.find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  
  // Calculate fee
  const feeRate = CONFIG.treasury.fees.smartAgentSale / 10000;
  const fee = agent.price * feeRate;
  
  const purchase = {
    id: `agent-purchase-${Date.now()}`,
    agentId,
    agentName: agent.name,
    price: agent.price,
    fee,
    buyer: userAddress,
    seller: agent.creator,
    timestamp: Date.now(),
  };
  
  // Update agent sales count
  agent.sales += 1;
  
  state.tradeHistory.unshift(purchase);
  console.log('[Marketplace] Smart agent purchased:', purchase);
  
  return purchase;
};

/**
 * List a smart agent for sale
 */
export const listSmartAgent = async (agentData) => {
  const userAddress = web3Service.state.walletAddress;
  if (!userAddress) throw new Error('Wallet not connected');
  
  const newAgent = {
    id: `agent-${Date.now()}`,
    ...agentData,
    creator: userAddress,
    sales: 0,
    rating: 0,
    reviews: 0,
  };
  
  state.smartAgents.unshift(newAgent);
  console.log('[Marketplace] Smart agent listed:', newAgent);
  
  return newAgent;
};

// ═══════════════════════════════════════════════════════════════════════════
// FEE CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate fee for a trade
 */
export const calculateFee = (amount, feeType) => {
  const feeRate = CONFIG.treasury.fees[feeType] || 0;
  return (amount * feeRate) / 10000;
};

/**
 * Get treasury address
 */
export const getTreasuryAddress = () => CONFIG.treasury.address;

// ═══════════════════════════════════════════════════════════════════════════
// COMPUTED VALUES
// ═══════════════════════════════════════════════════════════════════════════

export const bestBid = computed(() => {
  return state.orderbook.bids[0] || null;
});

export const bestAsk = computed(() => {
  return state.orderbook.asks[0] || null;
});

export const spread = computed(() => {
  if (!bestBid.value || !bestAsk.value) return null;
  return (parseFloat(bestAsk.value.price) - parseFloat(bestBid.value.price)).toFixed(4);
});

export const totalTradeVolume = computed(() => {
  return state.tradeHistory.reduce((sum, trade) => sum + (trade.totalAmount || trade.price || 0), 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const marketplaceService = {
  state: readonly(state),
  
  // Initialization
  initializeMarketplace,
  
  // P2P Inference
  placeBid,
  placeAsk,
  cancelOrder,
  takeOrder,
  
  // Prediction Markets
  buyPredictionMarket,
  listPredictionMarket,
  
  // Smart Agents
  buySmartAgent,
  listSmartAgent,
  
  // Fees
  calculateFee,
  getTreasuryAddress,
  
  // Computed
  bestBid,
  bestAsk,
  spread,
  totalTradeVolume,
  
  // Config
  CONFIG,
};

export default marketplaceService;

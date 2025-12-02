/**
 * BonzAI — Unified Vue Composable
 * 
 * Single integration point for all BonzAI production features:
 * - Token gating (99/999/9999 BONZAI tiers)
 * - NFT minting for AI outputs
 * - P2P inference offloading with USDC bidding
 * - ZK privacy for prompts/results
 * - Smart agent marketplace
 * - Inference history tracking
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { tokenGating } from '../services/tokenGating.js';
import { nftMinter } from '../services/nftMinter.js';
import { peerNetwork } from '../services/peerNetwork.js';
import { zkPrivacy } from '../services/zkPrivacy.js';
import { agentMarketplace } from '../services/agentMarketplace.js';
import { useInferenceStore } from '../stores/inferenceStore.js';

/**
 * Main BonzAI composable
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoConnect - Auto-connect wallet on mount
 * @param {boolean} options.autoInitP2P - Auto-initialize P2P network
 * @param {boolean} options.autoInitZK - Auto-initialize ZK prover
 */
export function useBonzai(options = {}) {
  const {
    autoConnect = false,
    autoInitP2P = false,
    autoInitZK = false,
  } = options;

  // Store
  const inferenceStore = useInferenceStore();

  // Local state
  const isInitializing = ref(false);
  const initError = ref(null);
  const walletConnected = ref(false);
  const walletAddress = ref(null);

  // ==================== Initialization ====================

  const initialize = async () => {
    if (isInitializing.value) return;
    isInitializing.value = true;
    initError.value = null;

    try {
      // Connect wallet if requested
      if (autoConnect) {
        await connectWallet();
      }

      // Initialize P2P if requested
      if (autoInitP2P) {
        await peerNetwork.loadFriends?.();
      }

      // Initialize ZK if requested
      if (autoInitZK) {
        await zkPrivacy.initialize();
      }

      // Load saved agents
      await agentMarketplace.loadAgents();

      console.log('[BonzAI] Initialized successfully');
    } catch (error) {
      console.error('[BonzAI] Initialization error:', error);
      initError.value = error.message;
    } finally {
      isInitializing.value = false;
    }
  };

  // ==================== Wallet & Token Gating ====================

  const connectWallet = async () => {
    const result = await tokenGating.connectWallet();
    if (result.success) {
      walletConnected.value = true;
      walletAddress.value = result.address;
    }
    return result;
  };

  const checkAccess = async (tier) => {
    return await tokenGating.verifyAccess(tier);
  };

  // Tier-specific access checks
  const canGenerate = computed(() => tokenGating.canGenerate?.value ?? false);
  const canMint = computed(() => tokenGating.canMint?.value ?? false);
  const canUseMarketplace = computed(() => tokenGating.canUseSmartAgents?.value ?? false);
  const currentTier = computed(() => tokenGating.currentTier?.value ?? 'none');
  const bonzaiBalance = computed(() => tokenGating.balance?.value ?? 0);

  // ==================== Generation with Token Gating ====================

  /**
   * Execute a generation with automatic token gating and history tracking
   */
  const executeGeneration = async (type, params, options = {}) => {
    const {
      onProgress = null,
      enableZK = false,
      enableP2P = false,
      p2pMaxBid = 0,
    } = options;

    // Check generation access
    const access = await checkAccess(99);
    if (!access.allowed) {
      throw new Error(`Generation requires ${access.needed} BONZAI. ${access.buyUrl ? `Buy at ${access.buyUrl}` : ''}`);
    }

    let result;
    let zkProof = null;
    let peerId = null;

    // Handle ZK privacy
    if (enableZK) {
      const zkInitResult = await zkPrivacy.initialize();
      if (zkInitResult.success) {
        const promptStr = typeof params.prompt === 'string' ? params.prompt : JSON.stringify(params);
        const commitment = await zkPrivacy.generateCommitment(promptStr);
        params._zkCommitment = commitment.commitment;
      }
    }

    // Handle P2P offloading
    if (enableP2P && p2pMaxBid > 0) {
      const p2pResult = await peerNetwork.requestFromPeers(
        { type, payload: params },
        'all'
      );
      
      if (p2pResult) {
        // Wait for bids and execution through P2P
        // This is async and handled by the P2P network
        peerId = p2pResult.id;
        result = { status: 'p2p_pending', requestId: p2pResult.id };
      }
    } else {
      // Execute locally
      result = await executeLocal(type, params, onProgress);
    }

    // Generate ZK proof if enabled
    if (enableZK && result && result.status !== 'p2p_pending') {
      const promptStr = typeof params.prompt === 'string' ? params.prompt : JSON.stringify(params);
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      zkProof = await zkPrivacy.generateProof(promptStr, resultStr, type);
    }

    // Track in inference store
    const trackingData = {
      prompt: params.prompt || params,
      ...result,
    };

    if (zkProof) trackingData.zkProof = zkProof;
    if (peerId) trackingData.peerId = peerId;

    switch (type) {
      case 'text':
        inferenceStore.addTextInference(trackingData);
        break;
      case 'image':
        inferenceStore.addImageInference(trackingData);
        break;
      case 'video':
        inferenceStore.addVideoInference(trackingData);
        break;
      case 'audio':
        inferenceStore.addAudioInference(trackingData);
        break;
      case 'game':
        inferenceStore.addGameInference(trackingData);
        break;
      case 'robotic':
        inferenceStore.addRoboticDataset(trackingData);
        break;
    }

    return { result, zkProof, peerId };
  };

  /**
   * Execute generation locally via diffusion server
   */
  const executeLocal = async (type, params, onProgress) => {
    const endpoints = {
      image: '/generate-image',
      video: '/generate-video',
      audio: '/generate-music',
      text: '/generate-text',
    };

    const endpoint = endpoints[type];
    if (!endpoint) {
      throw new Error(`Unsupported generation type: ${type}`);
    }

    // Set up progress tracking via Socket.IO
    if (onProgress && window.io) {
      const socket = window.io('http://127.0.0.1:5556', {
        transports: ['websocket'],
        path: '/socket.io',
      });

      socket.on('generation_progress', (data) => {
        onProgress(data);
      });

      // Clean up after generation
      setTimeout(() => socket.disconnect(), 300000); // 5 min timeout
    }

    const response = await fetch(`http://127.0.0.1:5556${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.statusText}`);
    }

    return await response.json();
  };

  // ==================== NFT Minting ====================

  /**
   * Mint an inference result as NFT
   */
  const mintAsNFT = async (inferenceId, options = {}) => {
    // Check minting access
    const access = await checkAccess(999);
    if (!access.allowed) {
      throw new Error(`NFT minting requires ${access.needed} BONZAI. ${access.buyUrl ? `Buy at ${access.buyUrl}` : ''}`);
    }

    // Find the inference
    const inference = inferenceStore.allInferences.find(i => i.id === inferenceId);
    if (!inference) {
      throw new Error('Inference not found');
    }

    // Prepare content based on type
    let content;
    let contentType;

    switch (inference.type) {
      case 'image':
        content = inference.imageData || inference.imagePath;
        contentType = 'image';
        break;
      case 'video':
        content = inference.videoPath;
        contentType = 'video';
        break;
      case 'audio':
        content = inference.audioPath;
        contentType = 'audio';
        break;
      case 'game':
        content = inference.code;
        contentType = 'game';
        break;
      case 'text':
        content = inference.response;
        contentType = 'text';
        break;
      default:
        throw new Error(`Cannot mint type: ${inference.type}`);
    }

    // Mint
    const mintResult = await nftMinter.mint(content, contentType, {
      name: options.name || `BonzAI ${inference.type} #${Date.now()}`,
      description: options.description || `AI-generated ${inference.type} from BonzAI`,
      prompt: inference.prompt,
      ...options,
    });

    // Update inference store
    if (mintResult.success) {
      inferenceStore.markAsMinted(inferenceId, {
        tokenId: mintResult.tokenId,
        transactionHash: mintResult.transactionHash,
        metadataUrl: mintResult.metadataUrl,
      });
    }

    return mintResult;
  };

  // ==================== P2P Network ====================

  const p2pState = peerNetwork.state;
  const p2pFriends = computed(() => peerNetwork.state.friends);
  const p2pOnlineFriends = peerNetwork.onlineFriends;
  const p2pPendingRequests = peerNetwork.pendingOutgoing;
  const p2pIncomingRequests = peerNetwork.pendingIncoming;

  const addP2PFriend = async (walletAddress, ip, nickname) => {
    return await peerNetwork.addFriend(walletAddress, ip, nickname);
  };

  const removeP2PFriend = async (friendId) => {
    return await peerNetwork.removeFriend(friendId);
  };

  const requestFromPeer = async (type, params, maxBidUSDC, targetPeerIds = 'all') => {
    return await peerNetwork.requestFromPeers({ type, payload: params }, targetPeerIds);
  };

  const placeBid = async (requestId, bidAmountUSDC) => {
    return await peerNetwork.placeBid(requestId, bidAmountUSDC);
  };

  const acceptBid = async (requestId, bidId) => {
    return await peerNetwork.acceptBid(requestId, bidId);
  };

  // ==================== ZK Privacy ====================

  const zkAvailable = computed(() => zkPrivacy.state?.isInitialized ?? false);
  const zkProverType = computed(() => zkPrivacy.state?.proverType ?? 'none');

  const generateZKProof = async (prompt, result, modelId) => {
    return await zkPrivacy.generateProof(prompt, result, modelId);
  };

  const verifyZKProof = async (proof, publicInputs) => {
    return await zkPrivacy.verifyProofLocal(proof, publicInputs);
  };

  // ==================== Smart Agents ====================

  const myAgents = computed(() => agentMarketplace.state.myAgents);
  const purchasedAgents = computed(() => agentMarketplace.state.purchasedAgents);
  const listedAgents = agentMarketplace.listedAgents;

  const createAgent = async (name, description, category) => {
    // Check marketplace access
    const access = await checkAccess(9999);
    if (!access.allowed) {
      throw new Error(`Smart agent marketplace requires ${access.needed} BONZAI. ${access.buyUrl ? `Buy at ${access.buyUrl}` : ''}`);
    }
    return await agentMarketplace.createAgent(name, description, category);
  };

  const executeAgent = async (agentId, inputs = {}) => {
    return await agentMarketplace.executeAgent(agentId, inputs);
  };

  const listAgentForSale = async (agentId, priceInBonzai) => {
    return await agentMarketplace.listAgent(agentId, priceInBonzai);
  };

  const purchaseAgent = async (agentId, seller) => {
    // Check marketplace access
    const access = await checkAccess(9999);
    if (!access.allowed) {
      throw new Error(`Smart agent marketplace requires ${access.needed} BONZAI. ${access.buyUrl ? `Buy at ${access.buyUrl}` : ''}`);
    }
    return await agentMarketplace.purchaseAgent(agentId, seller);
  };

  // ==================== Inference History ====================

  const inferences = computed(() => inferenceStore.allInferences);
  const mintedInferences = computed(() => inferenceStore.mintedInferences);
  const zkProtectedInferences = computed(() => inferenceStore.zkProtectedInferences);

  // ==================== Lifecycle ====================

  onMounted(() => {
    initialize();
  });

  onUnmounted(() => {
    // Cleanup if needed
  });

  // ==================== Return ====================

  return {
    // State
    isInitializing,
    initError,
    walletConnected,
    walletAddress,

    // Wallet & Token Gating
    connectWallet,
    checkAccess,
    canGenerate,
    canMint,
    canUseMarketplace,
    currentTier,
    bonzaiBalance,

    // Generation
    executeGeneration,

    // NFT Minting
    mintAsNFT,

    // P2P Network
    p2pState,
    p2pFriends,
    p2pOnlineFriends,
    p2pPendingRequests,
    p2pIncomingRequests,
    addP2PFriend,
    removeP2PFriend,
    requestFromPeer,
    placeBid,
    acceptBid,

    // ZK Privacy
    zkAvailable,
    zkProverType,
    generateZKProof,
    verifyZKProof,

    // Smart Agents
    myAgents,
    purchasedAgents,
    listedAgents,
    createAgent,
    executeAgent,
    listAgentForSale,
    purchaseAgent,

    // Inference History
    inferences,
    mintedInferences,
    zkProtectedInferences,

    // Direct service access for advanced usage
    services: {
      tokenGating,
      nftMinter,
      peerNetwork,
      zkPrivacy,
      agentMarketplace,
    },
  };
}

/**
 * Composable for token-gated generation UI
 * Use in individual generation views (Image, Video, etc.)
 */
export function useTokenGatedGeneration(generationType) {
  const bonzai = useBonzai();
  
  const isGenerating = ref(false);
  const progress = ref(0);
  const progressStage = ref('');
  const lastResult = ref(null);
  const lastError = ref(null);
  
  // Options
  const enableZK = ref(false);
  const enableP2P = ref(false);
  const p2pMaxBid = ref(0);

  const generate = async (params) => {
    isGenerating.value = true;
    progress.value = 0;
    progressStage.value = 'Starting...';
    lastError.value = null;

    try {
      const result = await bonzai.executeGeneration(generationType, params, {
        enableZK: enableZK.value,
        enableP2P: enableP2P.value,
        p2pMaxBid: p2pMaxBid.value,
        onProgress: (data) => {
          progress.value = data.percentage || 0;
          progressStage.value = data.stage || '';
        },
      });

      lastResult.value = result;
      return result;
    } catch (error) {
      lastError.value = error.message;
      throw error;
    } finally {
      isGenerating.value = false;
    }
  };

  const mintResult = async (inferenceId, options = {}) => {
    return await bonzai.mintAsNFT(inferenceId, options);
  };

  return {
    // State
    isGenerating,
    progress,
    progressStage,
    lastResult,
    lastError,

    // Options
    enableZK,
    enableP2P,
    p2pMaxBid,

    // Methods
    generate,
    mintResult,

    // Access
    canGenerate: bonzai.canGenerate,
    canMint: bonzai.canMint,
    bonzaiBalance: bonzai.bonzaiBalance,
    currentTier: bonzai.currentTier,
  };
}

/**
 * Composable for P2P friend management
 */
export function useP2PFriends() {
  const { 
    p2pFriends, 
    p2pOnlineFriends, 
    addP2PFriend, 
    removeP2PFriend 
  } = useBonzai();

  const isAdding = ref(false);
  const addError = ref(null);

  const addFriend = async (walletAddress, ip, nickname) => {
    isAdding.value = true;
    addError.value = null;

    try {
      const result = await addP2PFriend(walletAddress, ip, nickname);
      return result;
    } catch (error) {
      addError.value = error.message;
      throw error;
    } finally {
      isAdding.value = false;
    }
  };

  const removeFriend = async (friendId) => {
    return await removeP2PFriend(friendId);
  };

  const refreshFriends = async () => {
    return await peerNetwork.pingAllFriends();
  };

  return {
    friends: p2pFriends,
    onlineFriends: p2pOnlineFriends,
    isAdding,
    addError,
    addFriend,
    removeFriend,
    refreshFriends,
    maxFriends: peerNetwork.MAX_FRIENDS,
  };
}

/**
 * Composable for smart agent workflow editor
 */
export function useAgentEditor(agentId) {
  const agent = ref(null);
  const isDirty = ref(false);

  // Load agent
  const loadAgent = () => {
    const found = agentMarketplace.state.myAgents.find(a => a.id === agentId.value || a.id === agentId);
    agent.value = found || null;
  };

  // Watch for agent ID changes
  if (typeof agentId === 'object' && agentId.value !== undefined) {
    watch(agentId, loadAgent, { immediate: true });
  } else {
    loadAgent();
  }

  const addNode = (nodeType, position, config) => {
    if (!agent.value) return null;
    const node = agentMarketplace.addNode(agent.value.id, nodeType, position, config);
    isDirty.value = true;
    return node;
  };

  const updateNode = (nodeId, updates) => {
    if (!agent.value) return;
    agentMarketplace.updateNode(agent.value.id, nodeId, updates);
    isDirty.value = true;
  };

  const removeNode = (nodeId) => {
    if (!agent.value) return;
    agentMarketplace.removeNode(agent.value.id, nodeId);
    isDirty.value = true;
  };

  const connectNodes = (sourceNodeId, sourceOutput, targetNodeId, targetInput) => {
    if (!agent.value) return null;
    const connection = agentMarketplace.connectNodes(
      agent.value.id, 
      sourceNodeId, 
      sourceOutput, 
      targetNodeId, 
      targetInput
    );
    isDirty.value = true;
    return connection;
  };

  const save = async () => {
    // Persisted automatically by agentMarketplace
    isDirty.value = false;
  };

  const execute = async (inputs = {}) => {
    if (!agent.value) throw new Error('No agent loaded');
    return await agentMarketplace.executeAgent(agent.value.id, inputs);
  };

  return {
    agent,
    isDirty,
    nodeTypes: agentMarketplace.NODE_TYPES,
    addNode,
    updateNode,
    removeNode,
    connectNodes,
    save,
    execute,
  };
}

export default useBonzai;

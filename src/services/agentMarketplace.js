/**
 * BonzAI — Smart Agent Marketplace Service
 * 
 * No-code smart agent creation, buying, selling, and execution.
 * Agents are visual workflows that chain together:
 * - Text generation (LLM)
 * - Image generation (SDXL/Flux)
 * - Video generation (LTX/Wan)
 * - Audio generation (VibeVoice)
 * - Game generation (Three.js/P5.js)
 * - Robotic training (LeRobot)
 * 
 * Requires 9999 BONZAI tokens for marketplace access.
 */

import { reactive, readonly, computed } from 'vue';
import { ethers } from 'ethers';
import { tokenGating } from './tokenGating.js';
import { nftMinter } from './nftMinter.js';

// Agent Marketplace Contract (to be deployed on Arbitrum)
const MARKETPLACE_ADDRESS = '0x0000000000000000000000000000000000000000';
const BONZAI_ADDRESS = '0x0a84edf70f30325151631ce7a61307d1f4d619a3';

const MARKETPLACE_ABI = [
  'function listAgent(bytes32 agentId, uint256 price, string calldata metadataUri) external',
  'function delistAgent(bytes32 agentId) external',
  'function purchaseAgent(bytes32 agentId) external',
  'function updatePrice(bytes32 agentId, uint256 newPrice) external',
  'function getAgent(bytes32 agentId) view returns (tuple(address creator, uint256 price, string metadataUri, uint256 salesCount, bool isListed))',
  'function getCreatorAgents(address creator) view returns (bytes32[])',
  'function getPurchasedAgents(address buyer) view returns (bytes32[])',
  'event AgentListed(bytes32 indexed agentId, address indexed creator, uint256 price)',
  'event AgentPurchased(bytes32 indexed agentId, address indexed buyer, uint256 price)',
  'event AgentDelisted(bytes32 indexed agentId)'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

// Node types available in the workflow editor
const NODE_TYPES = {
  // Inputs
  TEXT_INPUT: { id: 'text_input', name: 'Text Input', category: 'input', outputs: ['text'] },
  IMAGE_INPUT: { id: 'image_input', name: 'Image Input', category: 'input', outputs: ['image'] },
  VIDEO_INPUT: { id: 'video_input', name: 'Video Input', category: 'input', outputs: ['video'] },
  AUDIO_INPUT: { id: 'audio_input', name: 'Audio Input', category: 'input', outputs: ['audio'] },
  NUMBER_INPUT: { id: 'number_input', name: 'Number Input', category: 'input', outputs: ['number'] },
  
  // Generation
  TEXT_GEN: { id: 'text_gen', name: 'Text Generation', category: 'generation', inputs: ['prompt'], outputs: ['text'], config: ['model', 'temperature', 'maxTokens'] },
  IMAGE_GEN: { id: 'image_gen', name: 'Image Generation', category: 'generation', inputs: ['prompt', 'negativePrompt?'], outputs: ['image'], config: ['pipeline', 'width', 'height', 'steps', 'seed'] },
  VIDEO_GEN: { id: 'video_gen', name: 'Video Generation', category: 'generation', inputs: ['prompt', 'image?'], outputs: ['video'], config: ['pipeline', 'width', 'height', 'frames', 'seed'] },
  AUDIO_GEN: { id: 'audio_gen', name: 'Audio Generation', category: 'generation', inputs: ['prompt'], outputs: ['audio'], config: ['duration', 'style'] },
  GAME_GEN: { id: 'game_gen', name: 'Game Generation', category: 'generation', inputs: ['prompt'], outputs: ['code'], config: ['framework'] },
  
  // Processing
  TEXT_TEMPLATE: { id: 'text_template', name: 'Text Template', category: 'processing', inputs: ['text', 'variables?'], outputs: ['text'], config: ['template'] },
  IMAGE_RESIZE: { id: 'image_resize', name: 'Image Resize', category: 'processing', inputs: ['image'], outputs: ['image'], config: ['width', 'height'] },
  IMAGE_TO_TEXT: { id: 'image_to_text', name: 'Image to Text', category: 'processing', inputs: ['image', 'prompt?'], outputs: ['text'] },
  VIDEO_TO_FRAMES: { id: 'video_to_frames', name: 'Video to Frames', category: 'processing', inputs: ['video'], outputs: ['images'] },
  CONCAT_TEXT: { id: 'concat_text', name: 'Concatenate Text', category: 'processing', inputs: ['text1', 'text2'], outputs: ['text'] },
  
  // Logic
  CONDITION: { id: 'condition', name: 'Condition', category: 'logic', inputs: ['value'], outputs: ['true', 'false'], config: ['operator', 'compareValue'] },
  LOOP: { id: 'loop', name: 'Loop', category: 'logic', inputs: ['items'], outputs: ['item', 'index', 'done'] },
  DELAY: { id: 'delay', name: 'Delay', category: 'logic', inputs: ['trigger'], outputs: ['trigger'], config: ['milliseconds'] },
  
  // Outputs
  TEXT_OUTPUT: { id: 'text_output', name: 'Text Output', category: 'output', inputs: ['text'] },
  IMAGE_OUTPUT: { id: 'image_output', name: 'Image Output', category: 'output', inputs: ['image'] },
  VIDEO_OUTPUT: { id: 'video_output', name: 'Video Output', category: 'output', inputs: ['video'] },
  AUDIO_OUTPUT: { id: 'audio_output', name: 'Audio Output', category: 'output', inputs: ['audio'] },
  FILE_OUTPUT: { id: 'file_output', name: 'File Output', category: 'output', inputs: ['data'], config: ['filename', 'format'] },
};

const state = reactive({
  // User's agents
  myAgents: [],
  purchasedAgents: [],
  
  // Marketplace listings
  featuredAgents: [],
  searchResults: [],
  
  // Current editing state
  currentAgent: null,
  isEditing: false,
  
  // Execution state
  runningAgents: {},
  executionLogs: {},
  
  // UI state
  isLoading: false,
  error: null,
});

// ==================== Agent CRUD ====================

/**
 * Create a new agent
 */
export const createAgent = async (name, description = '', category = 'general') => {
  // Verify marketplace access
  const access = await tokenGating.verifyAccess(9999);
  if (!access.allowed) {
    throw new Error(`Marketplace access requires ${access.needed} BONZAI tokens`);
  }
  
  const agent = {
    id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    description,
    category,
    version: '1.0.0',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    
    // Workflow definition
    nodes: [],
    connections: [],
    
    // Metadata
    author: await getWalletAddress(),
    tags: [],
    thumbnail: null,
    
    // Marketplace state
    isListed: false,
    price: 0,
    salesCount: 0,
    
    // Execution config
    defaultInputs: {},
  };
  
  state.myAgents.push(agent);
  await persistAgents();
  
  return agent;
};

/**
 * Update an agent
 */
export const updateAgent = async (agentId, updates) => {
  const agent = state.myAgents.find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  
  Object.assign(agent, updates, { updatedAt: Date.now() });
  await persistAgents();
  
  return agent;
};

/**
 * Delete an agent
 */
export const deleteAgent = async (agentId) => {
  const idx = state.myAgents.findIndex(a => a.id === agentId);
  if (idx === -1) throw new Error('Agent not found');
  
  // Cannot delete if listed on marketplace
  if (state.myAgents[idx].isListed) {
    throw new Error('Delist agent from marketplace before deleting');
  }
  
  state.myAgents.splice(idx, 1);
  await persistAgents();
};

/**
 * Clone an agent (for purchased agents or templates)
 */
export const cloneAgent = async (agentId, newName = null) => {
  const source = [...state.myAgents, ...state.purchasedAgents].find(a => a.id === agentId);
  if (!source) throw new Error('Agent not found');
  
  const clone = {
    ...JSON.parse(JSON.stringify(source)),
    id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: newName || `${source.name} (Copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    author: await getWalletAddress(),
    isListed: false,
    price: 0,
    salesCount: 0,
    clonedFrom: agentId,
  };
  
  state.myAgents.push(clone);
  await persistAgents();
  
  return clone;
};

// ==================== Workflow Editor ====================

/**
 * Add a node to the current agent's workflow
 */
export const addNode = (agentId, nodeType, position = { x: 100, y: 100 }, config = {}) => {
  const agent = state.myAgents.find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  
  const nodeDefinition = Object.values(NODE_TYPES).find(n => n.id === nodeType);
  if (!nodeDefinition) throw new Error(`Unknown node type: ${nodeType}`);
  
  const node = {
    id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: nodeType,
    position,
    config: { ...config },
    
    // Runtime state (not persisted)
    _status: 'idle',
    _output: null,
  };
  
  agent.nodes.push(node);
  agent.updatedAt = Date.now();
  
  return node;
};

/**
 * Update a node's configuration
 */
export const updateNode = (agentId, nodeId, updates) => {
  const agent = state.myAgents.find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  
  const node = agent.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error('Node not found');
  
  if (updates.config) {
    node.config = { ...node.config, ...updates.config };
  }
  if (updates.position) {
    node.position = updates.position;
  }
  
  agent.updatedAt = Date.now();
  return node;
};

/**
 * Remove a node and its connections
 */
export const removeNode = (agentId, nodeId) => {
  const agent = state.myAgents.find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  
  const nodeIdx = agent.nodes.findIndex(n => n.id === nodeId);
  if (nodeIdx === -1) throw new Error('Node not found');
  
  agent.nodes.splice(nodeIdx, 1);
  
  // Remove connections involving this node
  agent.connections = agent.connections.filter(
    c => c.sourceNode !== nodeId && c.targetNode !== nodeId
  );
  
  agent.updatedAt = Date.now();
};

/**
 * Connect two nodes
 */
export const connectNodes = (agentId, sourceNode, sourceOutput, targetNode, targetInput) => {
  const agent = state.myAgents.find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  
  // Validate nodes exist
  const source = agent.nodes.find(n => n.id === sourceNode);
  const target = agent.nodes.find(n => n.id === targetNode);
  if (!source || !target) throw new Error('Invalid node reference');
  
  // Validate ports
  const sourceType = Object.values(NODE_TYPES).find(n => n.id === source.type);
  const targetType = Object.values(NODE_TYPES).find(n => n.id === target.type);
  
  if (!sourceType.outputs?.includes(sourceOutput)) {
    throw new Error(`Invalid output port: ${sourceOutput}`);
  }
  if (!targetType.inputs?.includes(targetInput) && !targetType.inputs?.includes(targetInput + '?')) {
    throw new Error(`Invalid input port: ${targetInput}`);
  }
  
  // Check for existing connection to same input
  const existingIdx = agent.connections.findIndex(
    c => c.targetNode === targetNode && c.targetInput === targetInput
  );
  if (existingIdx !== -1) {
    agent.connections.splice(existingIdx, 1);
  }
  
  const connection = {
    id: `conn_${Date.now()}`,
    sourceNode,
    sourceOutput,
    targetNode,
    targetInput,
  };
  
  agent.connections.push(connection);
  agent.updatedAt = Date.now();
  
  return connection;
};

/**
 * Remove a connection
 */
export const disconnectNodes = (agentId, connectionId) => {
  const agent = state.myAgents.find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  
  const idx = agent.connections.findIndex(c => c.id === connectionId);
  if (idx === -1) throw new Error('Connection not found');
  
  agent.connections.splice(idx, 1);
  agent.updatedAt = Date.now();
};

// ==================== Agent Execution ====================

/**
 * Execute an agent with given inputs
 */
export const executeAgent = async (agentId, inputs = {}, options = {}) => {
  const agent = [...state.myAgents, ...state.purchasedAgents].find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  
  const executionId = `exec_${Date.now()}`;
  
  state.runningAgents[executionId] = {
    agentId,
    status: 'running',
    startedAt: Date.now(),
    progress: 0,
    currentNode: null,
  };
  
  state.executionLogs[executionId] = [];
  
  const log = (message, level = 'info') => {
    state.executionLogs[executionId].push({
      timestamp: Date.now(),
      level,
      message,
    });
  };
  
  try {
    log(`Starting execution of "${agent.name}"`);
    
    // Build execution graph
    const nodeOutputs = {};
    const executionOrder = topologicalSort(agent.nodes, agent.connections);
    
    log(`Execution order: ${executionOrder.map(n => n.type).join(' → ')}`);
    
    // Execute nodes in order
    for (let i = 0; i < executionOrder.length; i++) {
      const node = executionOrder[i];
      state.runningAgents[executionId].currentNode = node.id;
      state.runningAgents[executionId].progress = ((i + 1) / executionOrder.length) * 100;
      
      log(`Executing node: ${node.type} (${node.id})`);
      
      // Gather inputs from connections
      const nodeInputs = {};
      for (const conn of agent.connections.filter(c => c.targetNode === node.id)) {
        nodeInputs[conn.targetInput] = nodeOutputs[conn.sourceNode]?.[conn.sourceOutput];
      }
      
      // Add direct inputs for input nodes
      if (node.type.endsWith('_input') && inputs[node.id]) {
        nodeInputs.value = inputs[node.id];
      }
      
      // Execute the node
      const output = await executeNode(node, nodeInputs, options);
      nodeOutputs[node.id] = output;
      
      log(`Node ${node.id} completed`, 'success');
    }
    
    // Collect outputs from output nodes
    const results = {};
    for (const node of agent.nodes.filter(n => n.type.endsWith('_output'))) {
      results[node.id] = nodeOutputs[node.id];
    }
    
    state.runningAgents[executionId].status = 'completed';
    state.runningAgents[executionId].completedAt = Date.now();
    state.runningAgents[executionId].results = results;
    
    log('Execution completed successfully', 'success');
    
    return { executionId, results };
    
  } catch (error) {
    log(`Execution failed: ${error.message}`, 'error');
    state.runningAgents[executionId].status = 'failed';
    state.runningAgents[executionId].error = error.message;
    throw error;
  }
};

/**
 * Execute a single node
 */
async function executeNode(node, inputs, options = {}) {
  const { onProgress } = options;
  
  switch (node.type) {
    // Input nodes
    case 'text_input':
      return { text: inputs.value || node.config.defaultValue || '' };
    case 'image_input':
      return { image: inputs.value || node.config.defaultValue };
    case 'video_input':
      return { video: inputs.value || node.config.defaultValue };
    case 'audio_input':
      return { audio: inputs.value || node.config.defaultValue };
    case 'number_input':
      return { number: parseFloat(inputs.value || node.config.defaultValue || 0) };
    
    // Generation nodes
    case 'text_gen':
      return await executeTextGeneration(inputs, node.config);
    case 'image_gen':
      return await executeImageGeneration(inputs, node.config, onProgress);
    case 'video_gen':
      return await executeVideoGeneration(inputs, node.config, onProgress);
    case 'audio_gen':
      return await executeAudioGeneration(inputs, node.config, onProgress);
    case 'game_gen':
      return await executeGameGeneration(inputs, node.config);
    
    // Processing nodes
    case 'text_template':
      return executeTextTemplate(inputs, node.config);
    case 'image_resize':
      return await executeImageResize(inputs, node.config);
    case 'image_to_text':
      return await executeImageToText(inputs, node.config);
    case 'concat_text':
      return { text: `${inputs.text1 || ''}${inputs.text2 || ''}` };
    
    // Logic nodes
    case 'condition':
      return executeCondition(inputs, node.config);
    case 'delay':
      await new Promise(resolve => setTimeout(resolve, node.config.milliseconds || 1000));
      return { trigger: true };
    
    // Output nodes
    case 'text_output':
      return { text: inputs.text };
    case 'image_output':
      return { image: inputs.image };
    case 'video_output':
      return { video: inputs.video };
    case 'audio_output':
      return { audio: inputs.audio };
    
    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

/**
 * Execute text generation node
 */
async function executeTextGeneration(inputs, config) {
  // This would integrate with node-llama-cpp or other LLM
  // For now, using a placeholder
  const prompt = inputs.prompt || '';
  
  // In production, this would call the actual LLM
  const response = await fetch('http://127.0.0.1:5000/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: config.model,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 512,
    }),
  }).catch(() => null);
  
  if (response?.ok) {
    const data = await response.json();
    return { text: data.response || data.text };
  }
  
  // Fallback for development
  return { text: `[LLM Response to: "${prompt.slice(0, 50)}..."]` };
}

/**
 * Execute image generation node
 */
async function executeImageGeneration(inputs, config, onProgress) {
  const response = await fetch('http://127.0.0.1:5000/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: inputs.prompt || '',
      negative_prompt: inputs.negativePrompt || '',
      pipeline: config.pipeline || 'SDXL Turbo',
      width: config.width || 512,
      height: config.height || 512,
      num_inference_steps: config.steps || 4,
      seed: config.seed || -1,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Image generation failed: ${response.statusText}`);
  }
  
  const data = await response.json();
  return { image: data.image }; // base64
}

/**
 * Execute video generation node
 */
async function executeVideoGeneration(inputs, config, onProgress) {
  const response = await fetch('http://127.0.0.1:5000/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: inputs.prompt || '',
      image: inputs.image || null,
      pipeline: config.pipeline || 'LTX',
      width: config.width || 512,
      height: config.height || 512,
      frames: config.frames || 65,
      seed: config.seed || -1,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Video generation failed: ${response.statusText}`);
  }
  
  const data = await response.json();
  return { video: data.output_path };
}

/**
 * Execute audio generation node
 */
async function executeAudioGeneration(inputs, config, onProgress) {
  // Placeholder for VibeVoice integration
  throw new Error('Audio generation not yet implemented');
}

/**
 * Execute game generation node
 */
async function executeGameGeneration(inputs, config) {
  // Use LLM to generate game code
  const prompt = `Generate a ${config.framework === 'p5js' ? 'P5.js' : 'Three.js'} game based on: ${inputs.prompt}`;
  const result = await executeTextGeneration({ prompt }, { maxTokens: 4096 });
  return { code: result.text };
}

/**
 * Execute text template node
 */
function executeTextTemplate(inputs, config) {
  let result = config.template || '';
  
  // Replace {{text}} with input text
  result = result.replace(/\{\{text\}\}/g, inputs.text || '');
  
  // Replace {{var.name}} with variables
  if (inputs.variables && typeof inputs.variables === 'object') {
    for (const [key, value] of Object.entries(inputs.variables)) {
      result = result.replace(new RegExp(`\\{\\{var\\.${key}\\}\\}`, 'g'), value);
    }
  }
  
  return { text: result };
}

/**
 * Execute image resize node
 */
async function executeImageResize(inputs, config) {
  // Use canvas to resize
  const img = new Image();
  
  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = config.width || img.width;
      canvas.height = config.height || img.height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      resolve({ image: canvas.toDataURL('image/png').split(',')[1] });
    };
    img.onerror = reject;
    img.src = `data:image/png;base64,${inputs.image}`;
  });
}

/**
 * Execute image to text node (vision)
 */
async function executeImageToText(inputs, config) {
  // Would use a vision model
  // Placeholder
  return { text: '[Image description]' };
}

/**
 * Execute condition node
 */
function executeCondition(inputs, config) {
  const value = inputs.value;
  const compareValue = config.compareValue;
  const operator = config.operator || 'equals';
  
  let result = false;
  
  switch (operator) {
    case 'equals':
      result = value === compareValue;
      break;
    case 'notEquals':
      result = value !== compareValue;
      break;
    case 'contains':
      result = String(value).includes(String(compareValue));
      break;
    case 'greaterThan':
      result = Number(value) > Number(compareValue);
      break;
    case 'lessThan':
      result = Number(value) < Number(compareValue);
      break;
    case 'isEmpty':
      result = !value || value === '' || (Array.isArray(value) && value.length === 0);
      break;
  }
  
  return { true: result ? value : null, false: result ? null : value };
}

/**
 * Topological sort of nodes for execution order
 */
function topologicalSort(nodes, connections) {
  const inDegree = {};
  const adjList = {};
  
  // Initialize
  for (const node of nodes) {
    inDegree[node.id] = 0;
    adjList[node.id] = [];
  }
  
  // Build adjacency list and in-degree count
  for (const conn of connections) {
    adjList[conn.sourceNode].push(conn.targetNode);
    inDegree[conn.targetNode]++;
  }
  
  // Find all nodes with no incoming edges
  const queue = nodes.filter(n => inDegree[n.id] === 0);
  const result = [];
  
  while (queue.length > 0) {
    const node = queue.shift();
    result.push(node);
    
    for (const targetId of adjList[node.id]) {
      inDegree[targetId]--;
      if (inDegree[targetId] === 0) {
        const targetNode = nodes.find(n => n.id === targetId);
        if (targetNode) queue.push(targetNode);
      }
    }
  }
  
  if (result.length !== nodes.length) {
    throw new Error('Workflow contains a cycle');
  }
  
  return result;
}

// ==================== Marketplace ====================

/**
 * List an agent on the marketplace
 */
export const listAgent = async (agentId, priceInBonzai) => {
  const agent = state.myAgents.find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  
  // Verify marketplace access
  const access = await tokenGating.verifyAccess(9999);
  if (!access.allowed) {
    throw new Error(`Marketplace access requires ${access.needed} BONZAI tokens`);
  }
  
  // Upload agent metadata to IPFS
  const metadata = {
    name: agent.name,
    description: agent.description,
    category: agent.category,
    version: agent.version,
    author: agent.author,
    tags: agent.tags,
    thumbnail: agent.thumbnail,
    nodeCount: agent.nodes.length,
    connectionCount: agent.connections.length,
    workflow: {
      nodes: agent.nodes,
      connections: agent.connections,
    },
  };
  
  // Use nftMinter's IPFS upload
  const metadataUri = await uploadToIPFS(metadata);
  
  if (MARKETPLACE_ADDRESS !== '0x0000000000000000000000000000000000000000') {
    // List on-chain
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
    
    const agentIdBytes = ethers.id(agentId);
    const priceWei = ethers.parseEther(priceInBonzai.toString());
    
    const tx = await marketplace.listAgent(agentIdBytes, priceWei, metadataUri);
    await tx.wait();
    
    agent.isListed = true;
    agent.price = priceInBonzai;
    agent.listingTx = tx.hash;
  } else {
    // Simulate for development
    agent.isListed = true;
    agent.price = priceInBonzai;
    agent.metadataUri = metadataUri;
  }
  
  await persistAgents();
  return agent;
};

/**
 * Delist an agent from marketplace
 */
export const delistAgent = async (agentId) => {
  const agent = state.myAgents.find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  if (!agent.isListed) throw new Error('Agent is not listed');
  
  if (MARKETPLACE_ADDRESS !== '0x0000000000000000000000000000000000000000') {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
    
    const agentIdBytes = ethers.id(agentId);
    const tx = await marketplace.delistAgent(agentIdBytes);
    await tx.wait();
  }
  
  agent.isListed = false;
  await persistAgents();
  
  return agent;
};

/**
 * Purchase an agent from the marketplace
 */
export const purchaseAgent = async (agentId, seller) => {
  // Verify marketplace access
  const access = await tokenGating.verifyAccess(9999);
  if (!access.allowed) {
    throw new Error(`Marketplace access requires ${access.needed} BONZAI tokens`);
  }
  
  // Fetch agent metadata
  const agentData = await fetchAgentFromMarketplace(agentId);
  
  if (MARKETPLACE_ADDRESS !== '0x0000000000000000000000000000000000000000') {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    
    // Approve BONZAI spend
    const bonzai = new ethers.Contract(BONZAI_ADDRESS, ERC20_ABI, signer);
    const priceWei = ethers.parseEther(agentData.price.toString());
    
    const allowance = await bonzai.allowance(await signer.getAddress(), MARKETPLACE_ADDRESS);
    if (allowance < priceWei) {
      const approveTx = await bonzai.approve(MARKETPLACE_ADDRESS, priceWei);
      await approveTx.wait();
    }
    
    // Purchase
    const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
    const agentIdBytes = ethers.id(agentId);
    const tx = await marketplace.purchaseAgent(agentIdBytes);
    await tx.wait();
  }
  
  // Add to purchased agents
  const purchasedAgent = {
    ...agentData,
    purchasedAt: Date.now(),
    purchasedFrom: seller,
  };
  
  state.purchasedAgents.push(purchasedAgent);
  await persistPurchasedAgents();
  
  return purchasedAgent;
};

/**
 * Search marketplace for agents
 */
export const searchMarketplace = async (query = '', filters = {}) => {
  // In production, this would query an indexer or the contract
  // For now, return mock data
  state.searchResults = [];
  
  // Simulate search
  // TODO: Implement actual marketplace indexer
  
  return state.searchResults;
};

/**
 * Fetch agent details from marketplace
 */
async function fetchAgentFromMarketplace(agentId) {
  if (MARKETPLACE_ADDRESS !== '0x0000000000000000000000000000000000000000') {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, provider);
    
    const agentIdBytes = ethers.id(agentId);
    const agentInfo = await marketplace.getAgent(agentIdBytes);
    
    // Fetch metadata from IPFS
    const metadataResponse = await fetch(agentInfo.metadataUri);
    const metadata = await metadataResponse.json();
    
    return {
      ...metadata,
      creator: agentInfo.creator,
      price: parseFloat(ethers.formatEther(agentInfo.price)),
      salesCount: agentInfo.salesCount.toNumber(),
      isListed: agentInfo.isListed,
    };
  }
  
  throw new Error('Marketplace not available');
}

// ==================== Utility Functions ====================

async function getWalletAddress() {
  if (!window.ethereum) return null;
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return await signer.getAddress();
}

async function uploadToIPFS(data) {
  // Use the same IPFS logic as nftMinter
  // For now, return a data URI
  const jsonString = JSON.stringify(data);
  return `data:application/json;base64,${btoa(jsonString)}`;
}

async function persistAgents() {
  try {
    await window.electronAPI?.store?.set?.('myAgents', JSON.parse(JSON.stringify(state.myAgents)));
  } catch (e) {
    console.error('[AgentMarketplace] Persist agents failed:', e);
  }
}

async function persistPurchasedAgents() {
  try {
    await window.electronAPI?.store?.set?.('purchasedAgents', JSON.parse(JSON.stringify(state.purchasedAgents)));
  } catch (e) {
    console.error('[AgentMarketplace] Persist purchased agents failed:', e);
  }
}

/**
 * Load agents from storage
 */
export const loadAgents = async () => {
  try {
    const myAgents = await window.electronAPI?.store?.get?.('myAgents', []);
    const purchasedAgents = await window.electronAPI?.store?.get?.('purchasedAgents', []);
    
    if (Array.isArray(myAgents)) state.myAgents = myAgents;
    if (Array.isArray(purchasedAgents)) state.purchasedAgents = purchasedAgents;
  } catch (e) {
    console.error('[AgentMarketplace] Load agents failed:', e);
  }
};

// ==================== Computed Properties ====================

export const listedAgents = computed(() => state.myAgents.filter(a => a.isListed));
export const draftAgents = computed(() => state.myAgents.filter(a => !a.isListed));
export const allMyAgents = computed(() => [...state.myAgents, ...state.purchasedAgents]);
export const runningExecutions = computed(() => 
  Object.entries(state.runningAgents)
    .filter(([_, exec]) => exec.status === 'running')
    .map(([id, exec]) => ({ id, ...exec }))
);

// ==================== Export ====================

export const agentMarketplace = {
  state: readonly(state),
  NODE_TYPES,
  
  // CRUD
  createAgent,
  updateAgent,
  deleteAgent,
  cloneAgent,
  loadAgents,
  
  // Workflow
  addNode,
  updateNode,
  removeNode,
  connectNodes,
  disconnectNodes,
  
  // Execution
  executeAgent,
  
  // Marketplace
  listAgent,
  delistAgent,
  purchaseAgent,
  searchMarketplace,
  
  // Computed
  listedAgents,
  draftAgents,
  allMyAgents,
  runningExecutions,
};

export default agentMarketplace;

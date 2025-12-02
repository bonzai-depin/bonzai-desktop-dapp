<template>
  <div class="workflow-editor" ref="editorContainer" @mousemove="onMouseMove" @mouseup="onMouseUp">
    <!-- Toolbar -->
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <button @click="$emit('back')" class="btn-icon" title="Back">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <input v-model="localAgent.name" class="agent-name-input" placeholder="Agent Name" @blur="saveAgent" />
      </div>
      
      <div class="toolbar-center">
        <button @click="zoomOut" class="btn-icon" title="Zoom Out">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>
        </button>
        <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
        <button @click="zoomIn" class="btn-icon" title="Zoom In">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
        <button @click="fitToScreen" class="btn-icon" title="Fit to Screen">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/></svg>
        </button>
      </div>
      
      <div class="toolbar-right">
        <button @click="executeWorkflow" :disabled="isExecuting" class="btn-primary">
          <svg v-if="!isExecuting" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
          <svg v-else class="spin" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/></svg>
          {{ isExecuting ? 'Running...' : 'Run' }}
        </button>
        <button @click="saveAgent" class="btn-secondary">Save</button>
      </div>
    </div>
    
    <!-- Main Editor Area -->
    <div class="editor-main">
      <!-- Node Palette -->
      <div class="node-palette" :class="{ collapsed: isPaletteCollapsed }">
        <button class="palette-toggle" @click="isPaletteCollapsed = !isPaletteCollapsed">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" :d="isPaletteCollapsed ? 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z' : 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z'"/>
          </svg>
        </button>
        
        <template v-if="!isPaletteCollapsed">
          <div class="palette-search">
            <input v-model="nodeSearch" placeholder="Search nodes..." />
          </div>
          
          <div v-for="category in nodeCategories" :key="category.id" class="node-category">
            <div class="category-header" @click="toggleCategory(category.id)">
              <span>{{ category.name }}</span>
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" :d="expandedCategories.includes(category.id) ? 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z' : 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z'"/>
              </svg>
            </div>
            
            <div v-if="expandedCategories.includes(category.id)" class="category-nodes">
              <div 
                v-for="node in filteredNodes(category.id)" 
                :key="node.id"
                class="palette-node"
                :class="{ 'node-disabled': !isNodeEnabled(node) }"
                draggable="true"
                @dragstart="onNodeDragStart($event, node)"
              >
                <div class="node-icon" :style="{ background: getCategoryColor(category.id) }">
                  {{ getNodeIcon(node.id) }}
                </div>
                <span>{{ node.name }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
      
      <!-- Canvas -->
      <div 
        class="canvas-container" 
        ref="canvasContainer"
        @wheel="onWheel"
        @mousedown="onCanvasMouseDown"
        @dragover.prevent
        @drop="onCanvasDrop"
      >
        <svg class="connections-layer" :viewBox="viewBox">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--color-accent)" />
            </marker>
          </defs>
          
          <!-- Existing connections -->
          <path 
            v-for="conn in localAgent.connections" 
            :key="conn.id"
            :d="getConnectionPath(conn)"
            class="connection-line"
            :class="{ selected: selectedConnection === conn.id }"
            @click="selectConnection(conn.id)"
          />
          
          <!-- Connection being drawn -->
          <path 
            v-if="drawingConnection"
            :d="getTempConnectionPath()"
            class="connection-line temp"
          />
        </svg>
        
        <div 
          class="nodes-layer" 
          :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }"
        >
          <!-- Nodes -->
          <div 
            v-for="node in localAgent.nodes" 
            :key="node.id"
            class="workflow-node"
            :class="{ 
              selected: selectedNode === node.id,
              running: runningNodeId === node.id,
              completed: completedNodes.includes(node.id),
              error: errorNodes.includes(node.id)
            }"
            :style="{ left: node.position.x + 'px', top: node.position.y + 'px' }"
            @mousedown.stop="onNodeMouseDown($event, node)"
          >
            <div class="node-header" :style="{ background: getCategoryColor(getNodeCategory(node.type)) }">
              <span class="node-icon">{{ getNodeIcon(node.type) }}</span>
              <span class="node-title">{{ getNodeName(node.type) }}</span>
              <button class="node-delete" @click.stop="deleteNode(node.id)" title="Delete">×</button>
            </div>
            
            <div class="node-body">
              <!-- Input ports -->
              <div class="node-inputs">
                <div 
                  v-for="input in getNodeInputs(node.type)" 
                  :key="input"
                  class="node-port input"
                  :class="{ connected: isInputConnected(node.id, input), optional: input.endsWith('?') }"
                  @mouseup="onInputPortMouseUp(node.id, input.replace('?', ''))"
                >
                  <div class="port-dot"></div>
                  <span class="port-label">{{ formatPortName(input) }}</span>
                </div>
              </div>
              
              <!-- Node config (simplified inline editing) -->
              <div v-if="hasEditableConfig(node)" class="node-config">
                <template v-if="node.type === 'text_input'">
                  <textarea v-model="node.config.defaultValue" placeholder="Enter text..." rows="2" @blur="saveAgent"></textarea>
                </template>
                <template v-else-if="node.type === 'text_template'">
                  <textarea v-model="node.config.template" placeholder="Template with {{text}}..." rows="2" @blur="saveAgent"></textarea>
                </template>
                <template v-else-if="node.type === 'number_input'">
                  <input type="number" v-model.number="node.config.defaultValue" @blur="saveAgent" />
                </template>
                <template v-else-if="node.type === 'image_gen' || node.type === 'video_gen'">
                  <select v-model="node.config.pipeline" @change="saveAgent">
                    <option v-for="p in getPipelines(node.type)" :key="p" :value="p">{{ p }}</option>
                  </select>
                </template>
                <template v-else-if="node.type === 'delay'">
                  <input type="number" v-model.number="node.config.milliseconds" placeholder="ms" @blur="saveAgent" />
                </template>
              </div>
              
              <!-- Output ports -->
              <div class="node-outputs">
                <div 
                  v-for="output in getNodeOutputs(node.type)" 
                  :key="output"
                  class="node-port output"
                  :class="{ connected: isOutputConnected(node.id, output) }"
                  @mousedown.stop="onOutputPortMouseDown($event, node.id, output)"
                >
                  <span class="port-label">{{ formatPortName(output) }}</span>
                  <div class="port-dot"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Properties Panel -->
      <div class="properties-panel" v-if="selectedNode">
        <div class="panel-header">
          <h3>Node Properties</h3>
          <button @click="selectedNode = null" class="btn-icon">×</button>
        </div>
        
        <div class="panel-content">
          <div class="property-group">
            <label>Node Type</label>
            <div class="property-value">{{ getNodeName(getSelectedNodeData()?.type) }}</div>
          </div>
          
          <div class="property-group">
            <label>Node ID</label>
            <div class="property-value code">{{ selectedNode }}</div>
          </div>
          
          <template v-if="getSelectedNodeData()">
            <div v-for="(value, key) in getSelectedNodeData().config" :key="key" class="property-group">
              <label>{{ formatConfigKey(key) }}</label>
              <input 
                v-if="typeof value === 'number'" 
                type="number" 
                :value="value" 
                @input="updateNodeConfig(key, $event.target.valueAsNumber)"
              />
              <textarea 
                v-else-if="typeof value === 'string' && value.length > 50"
                :value="value"
                @input="updateNodeConfig(key, $event.target.value)"
                rows="3"
              ></textarea>
              <input 
                v-else 
                type="text" 
                :value="value" 
                @input="updateNodeConfig(key, $event.target.value)"
              />
            </div>
          </template>
        </div>
      </div>
    </div>
    
    <!-- Execution Log -->
    <div class="execution-log" v-if="showExecutionLog">
      <div class="log-header">
        <h4>Execution Log</h4>
        <button @click="showExecutionLog = false" class="btn-icon">×</button>
      </div>
      <div class="log-content" ref="logContent">
        <div v-for="(entry, idx) in executionLog" :key="idx" class="log-entry" :class="entry.level">
          <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
          <span class="log-message">{{ entry.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue';
import { agentMarketplace } from '../services/agentMarketplace.js';

const props = defineProps({
  agent: { type: Object, required: true }
});

const emit = defineEmits(['back', 'save', 'execute']);

// Local state
const localAgent = reactive({ ...props.agent });
const editorContainer = ref(null);
const canvasContainer = ref(null);
const logContent = ref(null);

// View state
const zoom = ref(1);
const pan = reactive({ x: 0, y: 0 });
const isPanning = ref(false);
const panStart = reactive({ x: 0, y: 0 });

// Selection state
const selectedNode = ref(null);
const selectedConnection = ref(null);

// Drag state
const isDraggingNode = ref(false);
const draggedNode = ref(null);
const dragOffset = reactive({ x: 0, y: 0 });

// Connection drawing state
const drawingConnection = ref(null);
const mousePos = reactive({ x: 0, y: 0 });

// UI state
const isPaletteCollapsed = ref(false);
const nodeSearch = ref('');
const expandedCategories = ref(['input', 'generation', 'processing', 'logic', 'output']);
const showExecutionLog = ref(false);

// Execution state
const isExecuting = ref(false);
const runningNodeId = ref(null);
const completedNodes = ref([]);
const errorNodes = ref([]);
const executionLog = ref([]);

// Node definitions from service
const NODE_TYPES = agentMarketplace.NODE_TYPES;

const nodeCategories = [
  { id: 'input', name: 'Inputs' },
  { id: 'generation', name: 'Generation' },
  { id: 'processing', name: 'Processing' },
  { id: 'logic', name: 'Logic' },
  { id: 'output', name: 'Outputs' }
];

// Computed
const viewBox = computed(() => {
  const container = canvasContainer.value;
  if (!container) return '0 0 1000 800';
  const w = container.clientWidth / zoom.value;
  const h = container.clientHeight / zoom.value;
  return `${-pan.x / zoom.value} ${-pan.y / zoom.value} ${w} ${h}`;
});

// Methods
const getCategoryColor = (category) => {
  const colors = {
    input: '#10b981',
    generation: '#8b5cf6',
    processing: '#3b82f6',
    logic: '#f59e0b',
    output: '#ef4444'
  };
  return colors[category] || '#6b7280';
};

const getNodeIcon = (nodeType) => {
  const icons = {
    text_input: '📝', text_gen: '💬', text_output: '📄', text_template: '📋', concat_text: '🔗',
    image_input: '🖼️', image_gen: '🎨', image_output: '🖼️', image_resize: '📐', image_to_text: '👁️',
    video_input: '🎬', video_gen: '🎥', video_output: '🎬', video_to_frames: '🎞️',
    audio_input: '🎵', audio_gen: '🎶', audio_output: '🔊',
    game_gen: '🎮',
    number_input: '#️⃣',
    condition: '❓', loop: '🔄', delay: '⏱️'
  };
  return icons[nodeType] || '⚙️';
};

const getNodeName = (nodeType) => {
  const node = Object.values(NODE_TYPES).find(n => n.id === nodeType);
  return node?.name || nodeType;
};

const getNodeCategory = (nodeType) => {
  const node = Object.values(NODE_TYPES).find(n => n.id === nodeType);
  return node?.category || 'processing';
};

const getNodeInputs = (nodeType) => {
  const node = Object.values(NODE_TYPES).find(n => n.id === nodeType);
  return node?.inputs || [];
};

const getNodeOutputs = (nodeType) => {
  const node = Object.values(NODE_TYPES).find(n => n.id === nodeType);
  return node?.outputs || [];
};

const filteredNodes = (categoryId) => {
  const search = nodeSearch.value.toLowerCase();
  return Object.values(NODE_TYPES)
    .filter(n => n.category === categoryId)
    .filter(n => !search || n.name.toLowerCase().includes(search));
};

const isNodeEnabled = (node) => {
  // Check if required services are available
  if (node.id === 'audio_gen') return false; // Not implemented yet
  return true;
};

const toggleCategory = (categoryId) => {
  const idx = expandedCategories.value.indexOf(categoryId);
  if (idx === -1) {
    expandedCategories.value.push(categoryId);
  } else {
    expandedCategories.value.splice(idx, 1);
  }
};

const formatPortName = (name) => {
  return name.replace('?', '').replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
};

const formatConfigKey = (key) => {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
};

const hasEditableConfig = (node) => {
  return ['text_input', 'text_template', 'number_input', 'image_gen', 'video_gen', 'delay'].includes(node.type);
};

const getPipelines = (nodeType) => {
  if (nodeType === 'image_gen') return ['SDXL Turbo', 'SDXL Intermediate', 'Flux Krea'];
  if (nodeType === 'video_gen') return ['LTX', 'Wan 14B'];
  return [];
};

const isInputConnected = (nodeId, inputName) => {
  return localAgent.connections.some(c => c.targetNode === nodeId && c.targetInput === inputName);
};

const isOutputConnected = (nodeId, outputName) => {
  return localAgent.connections.some(c => c.sourceNode === nodeId && c.sourceOutput === outputName);
};

const getSelectedNodeData = () => {
  return localAgent.nodes.find(n => n.id === selectedNode.value);
};

const updateNodeConfig = (key, value) => {
  const node = getSelectedNodeData();
  if (node) {
    node.config[key] = value;
    saveAgent();
  }
};

// Canvas interactions
const onWheel = (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  zoom.value = Math.max(0.25, Math.min(2, zoom.value + delta));
};

const zoomIn = () => zoom.value = Math.min(2, zoom.value + 0.1);
const zoomOut = () => zoom.value = Math.max(0.25, zoom.value - 0.1);

const fitToScreen = () => {
  if (!localAgent.nodes.length) return;
  
  const bounds = localAgent.nodes.reduce((acc, node) => ({
    minX: Math.min(acc.minX, node.position.x),
    minY: Math.min(acc.minY, node.position.y),
    maxX: Math.max(acc.maxX, node.position.x + 200),
    maxY: Math.max(acc.maxY, node.position.y + 100)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  
  const container = canvasContainer.value;
  if (!container) return;
  
  const padding = 50;
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  
  zoom.value = Math.min(
    container.clientWidth / width,
    container.clientHeight / height,
    1
  );
  
  pan.x = -bounds.minX * zoom.value + padding;
  pan.y = -bounds.minY * zoom.value + padding;
};

const onCanvasMouseDown = (e) => {
  if (e.target === canvasContainer.value || e.target.classList.contains('nodes-layer')) {
    isPanning.value = true;
    panStart.x = e.clientX - pan.x;
    panStart.y = e.clientY - pan.y;
    selectedNode.value = null;
    selectedConnection.value = null;
  }
};

const onMouseMove = (e) => {
  mousePos.x = e.clientX;
  mousePos.y = e.clientY;
  
  if (isPanning.value) {
    pan.x = e.clientX - panStart.x;
    pan.y = e.clientY - panStart.y;
  }
  
  if (isDraggingNode.value && draggedNode.value) {
    const container = canvasContainer.value;
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom.value - dragOffset.x;
    const y = (e.clientY - rect.top - pan.y) / zoom.value - dragOffset.y;
    
    const node = localAgent.nodes.find(n => n.id === draggedNode.value);
    if (node) {
      node.position.x = Math.round(x / 10) * 10; // Snap to grid
      node.position.y = Math.round(y / 10) * 10;
    }
  }
};

const onMouseUp = () => {
  if (isPanning.value) {
    isPanning.value = false;
  }
  if (isDraggingNode.value) {
    isDraggingNode.value = false;
    draggedNode.value = null;
    saveAgent();
  }
  if (drawingConnection.value) {
    drawingConnection.value = null;
  }
};

// Node interactions
const onNodeMouseDown = (e, node) => {
  selectedNode.value = node.id;
  selectedConnection.value = null;
  
  isDraggingNode.value = true;
  draggedNode.value = node.id;
  
  const container = canvasContainer.value;
  const rect = container.getBoundingClientRect();
  const x = (e.clientX - rect.left - pan.x) / zoom.value;
  const y = (e.clientY - rect.top - pan.y) / zoom.value;
  
  dragOffset.x = x - node.position.x;
  dragOffset.y = y - node.position.y;
};

const deleteNode = (nodeId) => {
  agentMarketplace.removeNode(localAgent.id, nodeId);
  const idx = localAgent.nodes.findIndex(n => n.id === nodeId);
  if (idx !== -1) localAgent.nodes.splice(idx, 1);
  localAgent.connections = localAgent.connections.filter(
    c => c.sourceNode !== nodeId && c.targetNode !== nodeId
  );
  if (selectedNode.value === nodeId) selectedNode.value = null;
  saveAgent();
};

// Connection interactions
const onOutputPortMouseDown = (e, nodeId, outputName) => {
  e.stopPropagation();
  drawingConnection.value = { sourceNode: nodeId, sourceOutput: outputName };
};

const onInputPortMouseUp = (nodeId, inputName) => {
  if (drawingConnection.value && drawingConnection.value.sourceNode !== nodeId) {
    const conn = agentMarketplace.connectNodes(
      localAgent.id,
      drawingConnection.value.sourceNode,
      drawingConnection.value.sourceOutput,
      nodeId,
      inputName
    );
    
    // Remove existing connection to this input
    const existingIdx = localAgent.connections.findIndex(
      c => c.targetNode === nodeId && c.targetInput === inputName
    );
    if (existingIdx !== -1) {
      localAgent.connections.splice(existingIdx, 1);
    }
    
    localAgent.connections.push(conn);
    saveAgent();
  }
  drawingConnection.value = null;
};

const selectConnection = (connId) => {
  selectedConnection.value = connId;
  selectedNode.value = null;
};

const getConnectionPath = (conn) => {
  const sourceNode = localAgent.nodes.find(n => n.id === conn.sourceNode);
  const targetNode = localAgent.nodes.find(n => n.id === conn.targetNode);
  
  if (!sourceNode || !targetNode) return '';
  
  const sourceOutputs = getNodeOutputs(sourceNode.type);
  const targetInputs = getNodeInputs(targetNode.type);
  
  const sourceIdx = sourceOutputs.indexOf(conn.sourceOutput);
  const targetIdx = targetInputs.findIndex(i => i.replace('?', '') === conn.targetInput);
  
  const nodeWidth = 200;
  const portOffset = 20;
  
  const x1 = (sourceNode.position.x + nodeWidth) * zoom.value + pan.x;
  const y1 = (sourceNode.position.y + 40 + sourceIdx * portOffset) * zoom.value + pan.y;
  const x2 = targetNode.position.x * zoom.value + pan.x;
  const y2 = (targetNode.position.y + 40 + targetIdx * portOffset) * zoom.value + pan.y;
  
  const cx = (x1 + x2) / 2;
  
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
};

const getTempConnectionPath = () => {
  if (!drawingConnection.value) return '';
  
  const sourceNode = localAgent.nodes.find(n => n.id === drawingConnection.value.sourceNode);
  if (!sourceNode) return '';
  
  const sourceOutputs = getNodeOutputs(sourceNode.type);
  const sourceIdx = sourceOutputs.indexOf(drawingConnection.value.sourceOutput);
  
  const nodeWidth = 200;
  const portOffset = 20;
  
  const x1 = (sourceNode.position.x + nodeWidth) * zoom.value + pan.x;
  const y1 = (sourceNode.position.y + 40 + sourceIdx * portOffset) * zoom.value + pan.y;
  
  const container = canvasContainer.value;
  const rect = container?.getBoundingClientRect() || { left: 0, top: 0 };
  const x2 = mousePos.x - rect.left;
  const y2 = mousePos.y - rect.top;
  
  const cx = (x1 + x2) / 2;
  
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
};

// Drag and drop from palette
const onNodeDragStart = (e, nodeType) => {
  e.dataTransfer.setData('nodeType', nodeType.id);
};

const onCanvasDrop = (e) => {
  e.preventDefault();
  const nodeType = e.dataTransfer.getData('nodeType');
  if (!nodeType) return;
  
  const container = canvasContainer.value;
  const rect = container.getBoundingClientRect();
  const x = (e.clientX - rect.left - pan.x) / zoom.value;
  const y = (e.clientY - rect.top - pan.y) / zoom.value;
  
  const node = agentMarketplace.addNode(
    localAgent.id,
    nodeType,
    { x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 }
  );
  
  localAgent.nodes.push(node);
  selectedNode.value = node.id;
  saveAgent();
};

// Save and execute
const saveAgent = async () => {
  await agentMarketplace.updateAgent(localAgent.id, {
    name: localAgent.name,
    description: localAgent.description,
    nodes: localAgent.nodes,
    connections: localAgent.connections
  });
  emit('save', localAgent);
};

const executeWorkflow = async () => {
  isExecuting.value = true;
  showExecutionLog.value = true;
  completedNodes.value = [];
  errorNodes.value = [];
  executionLog.value = [];
  
  try {
    const result = await agentMarketplace.executeAgent(localAgent.id, {}, {
      onProgress: (nodeId, progress) => {
        runningNodeId.value = nodeId;
      }
    });
    
    // Mark all nodes as completed
    completedNodes.value = localAgent.nodes.map(n => n.id);
    emit('execute', result);
    
  } catch (error) {
    executionLog.value.push({
      timestamp: Date.now(),
      level: 'error',
      message: error.message
    });
  } finally {
    isExecuting.value = false;
    runningNodeId.value = null;
  }
};

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString();
};

// Watch for external agent changes
watch(() => props.agent, (newAgent) => {
  Object.assign(localAgent, newAgent);
}, { deep: true });

// Initialize
onMounted(() => {
  fitToScreen();
});
</script>

<style scoped>
.workflow-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-primary, #0a0a0f);
  color: var(--color-text-primary, #e5e5e5);
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--color-bg-secondary, #14141a);
  border-bottom: 1px solid var(--color-border, #2a2a35);
}

.toolbar-left, .toolbar-center, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-name-input {
  background: transparent;
  border: 1px solid transparent;
  padding: 6px 10px;
  font-size: 16px;
  font-weight: 600;
  color: inherit;
  border-radius: 6px;
}

.agent-name-input:hover, .agent-name-input:focus {
  border-color: var(--color-border, #2a2a35);
  outline: none;
}

.btn-icon {
  background: transparent;
  border: none;
  padding: 6px;
  border-radius: 6px;
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  background: var(--color-bg-hover, #1f1f28);
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-accent, #8b5cf6);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 8px 16px;
  background: var(--color-bg-hover, #1f1f28);
  color: inherit;
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 6px;
  cursor: pointer;
}

.zoom-level {
  font-size: 12px;
  min-width: 40px;
  text-align: center;
}

.editor-main {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Node Palette */
.node-palette {
  width: 240px;
  background: var(--color-bg-secondary, #14141a);
  border-right: 1px solid var(--color-border, #2a2a35);
  overflow-y: auto;
  transition: width 0.2s;
}

.node-palette.collapsed {
  width: 32px;
}

.palette-toggle {
  position: absolute;
  top: 8px;
  left: 8px;
  background: var(--color-bg-hover, #1f1f28);
  border: none;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  color: inherit;
}

.palette-search {
  padding: 12px;
  padding-top: 40px;
}

.palette-search input {
  width: 100%;
  padding: 8px 12px;
  background: var(--color-bg-primary, #0a0a0f);
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 6px;
  color: inherit;
}

.node-category {
  border-bottom: 1px solid var(--color-border, #2a2a35);
}

.category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 500;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.category-header:hover {
  background: var(--color-bg-hover, #1f1f28);
}

.category-nodes {
  padding: 4px 8px 8px;
}

.palette-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: grab;
  font-size: 13px;
}

.palette-node:hover {
  background: var(--color-bg-hover, #1f1f28);
}

.palette-node.node-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.node-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

/* Canvas */
.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  cursor: grab;
}

.canvas-container:active {
  cursor: grabbing;
}

.connections-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.connection-line {
  fill: none;
  stroke: var(--color-accent, #8b5cf6);
  stroke-width: 2;
  pointer-events: stroke;
  cursor: pointer;
}

.connection-line.temp {
  stroke-dasharray: 5, 5;
  opacity: 0.6;
}

.connection-line.selected {
  stroke-width: 3;
}

.nodes-layer {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

/* Workflow Nodes */
.workflow-node {
  position: absolute;
  width: 200px;
  background: var(--color-bg-secondary, #14141a);
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  cursor: move;
  user-select: none;
}

.workflow-node.selected {
  border-color: var(--color-accent, #8b5cf6);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.3);
}

.workflow-node.running {
  border-color: #f59e0b;
  animation: pulse 1s infinite;
}

.workflow-node.completed {
  border-color: #10b981;
}

.workflow-node.error {
  border-color: #ef4444;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.3); }
  50% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.2); }
}

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 7px 7px 0 0;
  font-size: 13px;
  font-weight: 500;
}

.node-header .node-icon {
  background: rgba(255, 255, 255, 0.2);
  width: 20px;
  height: 20px;
  font-size: 12px;
}

.node-title {
  flex: 1;
}

.node-delete {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
}

.node-delete:hover {
  color: #ef4444;
}

.node-body {
  padding: 8px;
}

.node-inputs, .node-outputs {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-port {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 12px;
}

.node-port.input {
  justify-content: flex-start;
}

.node-port.output {
  justify-content: flex-end;
}

.port-dot {
  width: 10px;
  height: 10px;
  background: var(--color-border, #2a2a35);
  border-radius: 50%;
  border: 2px solid var(--color-bg-secondary, #14141a);
  cursor: crosshair;
}

.node-port.connected .port-dot {
  background: var(--color-accent, #8b5cf6);
}

.node-port.optional .port-label {
  opacity: 0.6;
}

.port-label {
  color: var(--color-text-secondary, #9ca3af);
}

.node-config {
  margin: 8px 0;
}

.node-config input, .node-config textarea, .node-config select {
  width: 100%;
  padding: 6px 8px;
  background: var(--color-bg-primary, #0a0a0f);
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 4px;
  color: inherit;
  font-size: 12px;
}

.node-config textarea {
  resize: vertical;
  min-height: 40px;
}

/* Properties Panel */
.properties-panel {
  width: 280px;
  background: var(--color-bg-secondary, #14141a);
  border-left: 1px solid var(--color-border, #2a2a35);
  overflow-y: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #2a2a35);
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.panel-content {
  padding: 16px;
}

.property-group {
  margin-bottom: 16px;
}

.property-group label {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary, #9ca3af);
  margin-bottom: 6px;
}

.property-value {
  font-size: 13px;
}

.property-value.code {
  font-family: monospace;
  font-size: 11px;
  opacity: 0.7;
}

.property-group input, .property-group textarea {
  width: 100%;
  padding: 8px 10px;
  background: var(--color-bg-primary, #0a0a0f);
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 6px;
  color: inherit;
}

/* Execution Log */
.execution-log {
  position: absolute;
  bottom: 0;
  left: 240px;
  right: 0;
  height: 200px;
  background: var(--color-bg-secondary, #14141a);
  border-top: 1px solid var(--color-border, #2a2a35);
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border, #2a2a35);
}

.log-header h4 {
  margin: 0;
  font-size: 13px;
}

.log-content {
  height: calc(100% - 40px);
  overflow-y: auto;
  padding: 8px 16px;
  font-family: monospace;
  font-size: 12px;
}

.log-entry {
  display: flex;
  gap: 12px;
  padding: 4px 0;
}

.log-time {
  color: var(--color-text-secondary, #9ca3af);
}

.log-entry.error .log-message {
  color: #ef4444;
}

.log-entry.success .log-message {
  color: #10b981;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

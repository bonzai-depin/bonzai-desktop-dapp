<template>
  <div class="agent-marketplace">
    <!-- Workflow Editor (full screen when editing) -->
    <WorkflowEditor 
      v-if="isEditing && currentAgent"
      :agent="currentAgent"
      @back="closeEditor"
      @save="onAgentSaved"
      @execute="onAgentExecuted"
    />
    
    <!-- Marketplace View -->
    <template v-else>
      <!-- Header -->
      <div class="marketplace-header">
        <div class="header-left">
          <h1>🤖 Smart Agent Marketplace</h1>
          <p class="subtitle">Create, share, and monetize AI workflows</p>
        </div>
        
        <div class="header-right">
          <div class="token-requirement" :class="{ unlocked: hasMarketplaceAccess }">
            <span class="token-icon">🪙</span>
            <span>{{ hasMarketplaceAccess ? 'Marketplace Unlocked' : '9,999 BONZAI Required' }}</span>
          </div>
          <button @click="createNewAgent" :disabled="!hasMarketplaceAccess" class="btn-create">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Create Agent
          </button>
        </div>
      </div>
      
      <!-- Tabs -->
      <div class="marketplace-tabs">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.icon }} {{ tab.name }}
          <span v-if="tab.count" class="tab-count">{{ tab.count }}</span>
        </button>
      </div>
      
      <!-- Content -->
      <div class="marketplace-content">
        <!-- My Agents Tab -->
        <template v-if="activeTab === 'my-agents'">
          <div class="agents-grid" v-if="myAgents.length > 0">
            <div 
              v-for="agent in myAgents" 
              :key="agent.id" 
              class="agent-card"
              @click="openEditor(agent)"
            >
              <div class="agent-thumbnail" :style="{ background: getAgentGradient(agent) }">
                <span class="agent-icon">{{ getCategoryIcon(agent.category) }}</span>
              </div>
              
              <div class="agent-info">
                <h3>{{ agent.name }}</h3>
                <p class="agent-description">{{ agent.description || 'No description' }}</p>
                
                <div class="agent-meta">
                  <span class="meta-item">
                    <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    {{ agent.nodes.length }} nodes
                  </span>
                  <span class="meta-item">
                    {{ formatDate(agent.updatedAt) }}
                  </span>
                </div>
              </div>
              
              <div class="agent-actions">
                <button v-if="agent.isListed" class="btn-status listed" @click.stop>
                  Listed: {{ agent.price }} BONZAI
                </button>
                <button v-else class="btn-status draft" @click.stop="openListingModal(agent)">
                  List for Sale
                </button>
                
                <div class="action-buttons">
                  <button @click.stop="duplicateAgent(agent)" title="Duplicate">
                    <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                  </button>
                  <button @click.stop="confirmDelete(agent)" title="Delete" class="btn-delete">
                    <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div v-else class="empty-state">
            <div class="empty-icon">🤖</div>
            <h3>No Agents Yet</h3>
            <p>Create your first smart agent to automate AI workflows</p>
            <button @click="createNewAgent" :disabled="!hasMarketplaceAccess" class="btn-create">
              Create Your First Agent
            </button>
          </div>
        </template>
        
        <!-- Purchased Tab -->
        <template v-if="activeTab === 'purchased'">
          <div class="agents-grid" v-if="purchasedAgents.length > 0">
            <div 
              v-for="agent in purchasedAgents" 
              :key="agent.id" 
              class="agent-card purchased"
              @click="openEditor(agent)"
            >
              <div class="agent-thumbnail" :style="{ background: getAgentGradient(agent) }">
                <span class="agent-icon">{{ getCategoryIcon(agent.category) }}</span>
                <span class="purchased-badge">Purchased</span>
              </div>
              
              <div class="agent-info">
                <h3>{{ agent.name }}</h3>
                <p class="agent-description">{{ agent.description || 'No description' }}</p>
                
                <div class="agent-meta">
                  <span class="meta-item">By {{ shortenAddress(agent.purchasedFrom) }}</span>
                  <span class="meta-item">{{ formatDate(agent.purchasedAt) }}</span>
                </div>
              </div>
              
              <div class="agent-actions">
                <button class="btn-run" @click.stop="runAgent(agent)">
                  <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
                  Run
                </button>
                <button @click.stop="duplicateAgent(agent)" title="Clone to My Agents">
                  <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                </button>
              </div>
            </div>
          </div>
          
          <div v-else class="empty-state">
            <div class="empty-icon">🛒</div>
            <h3>No Purchased Agents</h3>
            <p>Browse the marketplace to find useful agents</p>
            <button @click="activeTab = 'browse'" class="btn-browse">
              Browse Marketplace
            </button>
          </div>
        </template>
        
        <!-- Browse Marketplace Tab -->
        <template v-if="activeTab === 'browse'">
          <div class="marketplace-search">
            <div class="search-input">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <input v-model="searchQuery" placeholder="Search agents..." @input="searchMarketplace" />
            </div>
            
            <div class="filter-buttons">
              <button 
                v-for="cat in categories" 
                :key="cat.id"
                :class="{ active: selectedCategory === cat.id }"
                @click="selectedCategory = cat.id"
              >
                {{ cat.icon }} {{ cat.name }}
              </button>
            </div>
          </div>
          
          <div class="featured-section" v-if="featuredAgents.length > 0">
            <h2>⭐ Featured Agents</h2>
            <div class="featured-grid">
              <div 
                v-for="agent in featuredAgents" 
                :key="agent.id" 
                class="agent-card featured"
                @click="openAgentDetails(agent)"
              >
                <div class="agent-thumbnail" :style="{ background: getAgentGradient(agent) }">
                  <span class="agent-icon">{{ getCategoryIcon(agent.category) }}</span>
                </div>
                
                <div class="agent-info">
                  <h3>{{ agent.name }}</h3>
                  <p class="agent-description">{{ agent.description }}</p>
                  
                  <div class="agent-stats">
                    <span class="stat">
                      <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                      {{ agent.rating || '4.8' }}
                    </span>
                    <span class="stat">{{ agent.salesCount || 0 }} sales</span>
                  </div>
                </div>
                
                <div class="agent-price">
                  <span class="price">{{ agent.price }} BONZAI</span>
                  <button @click.stop="purchaseAgent(agent)" class="btn-buy">Buy</button>
                </div>
              </div>
            </div>
          </div>
          
          <div class="marketplace-notice" v-else>
            <div class="notice-icon">🚀</div>
            <h3>Marketplace Coming Soon</h3>
            <p>The agent marketplace is being built. Create your own agents now and be ready to sell when it launches!</p>
          </div>
        </template>
      </div>
    </template>
    
    <!-- Listing Modal -->
    <div v-if="showListingModal" class="modal-overlay" @click.self="showListingModal = false">
      <div class="modal-content">
        <h2>List Agent for Sale</h2>
        
        <div class="modal-body">
          <div class="form-group">
            <label>Agent Name</label>
            <div class="readonly-value">{{ listingAgent?.name }}</div>
          </div>
          
          <div class="form-group">
            <label>Price (BONZAI)</label>
            <input type="number" v-model.number="listingPrice" min="1" placeholder="Enter price" />
          </div>
          
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="listingAgent.description" rows="3" placeholder="Describe what this agent does..."></textarea>
          </div>
          
          <div class="listing-fees">
            <div class="fee-row">
              <span>Listing Fee</span>
              <span>Free</span>
            </div>
            <div class="fee-row">
              <span>Sale Commission</span>
              <span>5%</span>
            </div>
          </div>
        </div>
        
        <div class="modal-actions">
          <button @click="showListingModal = false" class="btn-cancel">Cancel</button>
          <button @click="confirmListing" :disabled="!listingPrice" class="btn-confirm">
            List for {{ listingPrice || 0 }} BONZAI
          </button>
        </div>
      </div>
    </div>
    
    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="modal-content modal-small">
        <h2>Delete Agent?</h2>
        <p>Are you sure you want to delete "{{ deleteAgent?.name }}"? This action cannot be undone.</p>
        
        <div class="modal-actions">
          <button @click="showDeleteModal = false" class="btn-cancel">Cancel</button>
          <button @click="performDelete" class="btn-delete">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import WorkflowEditor from './WorkflowEditor.vue';
import { agentMarketplace } from '../services/agentMarketplace.js';
import { tokenGating } from '../services/tokenGating.js';

// State
const activeTab = ref('my-agents');
const isEditing = ref(false);
const currentAgent = ref(null);
const searchQuery = ref('');
const selectedCategory = ref('all');

// Modal state
const showListingModal = ref(false);
const listingAgent = ref(null);
const listingPrice = ref(100);
const showDeleteModal = ref(false);
const deleteAgent = ref(null);

// From service
const myAgents = computed(() => agentMarketplace.state.myAgents);
const purchasedAgents = computed(() => agentMarketplace.state.purchasedAgents);
const featuredAgents = computed(() => agentMarketplace.state.featuredAgents);

// Token gating
const hasMarketplaceAccess = ref(false);

const tabs = computed(() => [
  { id: 'my-agents', name: 'My Agents', icon: '📁', count: myAgents.value.length },
  { id: 'purchased', name: 'Purchased', icon: '🛒', count: purchasedAgents.value.length },
  { id: 'browse', name: 'Browse', icon: '🌐' }
]);

const categories = [
  { id: 'all', name: 'All', icon: '📦' },
  { id: 'content', name: 'Content', icon: '✍️' },
  { id: 'image', name: 'Image', icon: '🎨' },
  { id: 'video', name: 'Video', icon: '🎬' },
  { id: 'automation', name: 'Automation', icon: '⚡' },
  { id: 'analysis', name: 'Analysis', icon: '📊' }
];

// Methods
const checkAccess = async () => {
  try {
    const access = await tokenGating.verifyAccess(9999);
    hasMarketplaceAccess.value = access.allowed;
  } catch (e) {
    hasMarketplaceAccess.value = false;
  }
};

const createNewAgent = async () => {
  if (!hasMarketplaceAccess.value) return;
  
  try {
    const agent = await agentMarketplace.createAgent('New Agent', '', 'general');
    currentAgent.value = agent;
    isEditing.value = true;
  } catch (error) {
    console.error('Failed to create agent:', error);
  }
};

const openEditor = (agent) => {
  currentAgent.value = { ...agent };
  isEditing.value = true;
};

const closeEditor = () => {
  isEditing.value = false;
  currentAgent.value = null;
};

const onAgentSaved = (agent) => {
  // Agent saved in service, update local reference
  const idx = myAgents.value.findIndex(a => a.id === agent.id);
  if (idx !== -1) {
    Object.assign(myAgents.value[idx], agent);
  }
};

const onAgentExecuted = (result) => {
  console.log('Agent executed:', result);
};

const duplicateAgent = async (agent) => {
  try {
    await agentMarketplace.cloneAgent(agent.id);
  } catch (error) {
    console.error('Failed to duplicate agent:', error);
  }
};

const confirmDelete = (agent) => {
  deleteAgent.value = agent;
  showDeleteModal.value = true;
};

const performDelete = async () => {
  if (!deleteAgent.value) return;
  
  try {
    await agentMarketplace.deleteAgent(deleteAgent.value.id);
    showDeleteModal.value = false;
    deleteAgent.value = null;
  } catch (error) {
    console.error('Failed to delete agent:', error);
  }
};

const openListingModal = (agent) => {
  listingAgent.value = { ...agent };
  listingPrice.value = 100;
  showListingModal.value = true;
};

const confirmListing = async () => {
  if (!listingAgent.value || !listingPrice.value) return;
  
  try {
    // Update description if changed
    if (listingAgent.value.description !== myAgents.value.find(a => a.id === listingAgent.value.id)?.description) {
      await agentMarketplace.updateAgent(listingAgent.value.id, { description: listingAgent.value.description });
    }
    
    await agentMarketplace.listAgent(listingAgent.value.id, listingPrice.value);
    showListingModal.value = false;
    listingAgent.value = null;
  } catch (error) {
    console.error('Failed to list agent:', error);
  }
};

const openAgentDetails = (agent) => {
  // TODO: Open agent details modal
  console.log('View agent:', agent);
};

const purchaseAgent = async (agent) => {
  try {
    await agentMarketplace.purchaseAgent(agent.id, agent.creator);
  } catch (error) {
    console.error('Failed to purchase agent:', error);
  }
};

const runAgent = async (agent) => {
  try {
    const result = await agentMarketplace.executeAgent(agent.id, {});
    console.log('Execution result:', result);
  } catch (error) {
    console.error('Failed to run agent:', error);
  }
};

const searchMarketplace = () => {
  agentMarketplace.searchMarketplace(searchQuery.value, { category: selectedCategory.value });
};

// Helpers
const getAgentGradient = (agent) => {
  const gradients = {
    content: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    image: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    video: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    automation: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    analysis: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    general: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)'
  };
  return gradients[agent.category] || gradients.general;
};

const getCategoryIcon = (category) => {
  const icons = {
    content: '✍️', image: '🎨', video: '🎬', automation: '⚡', analysis: '📊', general: '🤖'
  };
  return icons[category] || '🤖';
};

const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString();
};

const shortenAddress = (address) => {
  if (!address) return 'Unknown';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Initialize
onMounted(async () => {
  await agentMarketplace.loadAgents();
  await checkAccess();
});
</script>

<style scoped>
.agent-marketplace {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-primary, #0a0a0f);
  color: var(--color-text-primary, #e5e5e5);
}

.marketplace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  background: var(--color-bg-secondary, #14141a);
  border-bottom: 1px solid var(--color-border, #2a2a35);
}

.header-left h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}

.subtitle {
  margin: 4px 0 0;
  color: var(--color-text-secondary, #9ca3af);
  font-size: 14px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.token-requirement {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 20px;
  font-size: 13px;
  color: #ef4444;
}

.token-requirement.unlocked {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.btn-create {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--color-accent, #8b5cf6);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-create:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
}

.btn-create:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Tabs */
.marketplace-tabs {
  display: flex;
  gap: 4px;
  padding: 0 32px;
  background: var(--color-bg-secondary, #14141a);
  border-bottom: 1px solid var(--color-border, #2a2a35);
}

.marketplace-tabs button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary, #9ca3af);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.marketplace-tabs button:hover {
  color: var(--color-text-primary, #e5e5e5);
}

.marketplace-tabs button.active {
  color: var(--color-accent, #8b5cf6);
  border-bottom-color: var(--color-accent, #8b5cf6);
}

.tab-count {
  padding: 2px 8px;
  background: var(--color-bg-hover, #1f1f28);
  border-radius: 10px;
  font-size: 12px;
}

/* Content */
.marketplace-content {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}

/* Agents Grid */
.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.agent-card {
  background: var(--color-bg-secondary, #14141a);
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.agent-card:hover {
  border-color: var(--color-accent, #8b5cf6);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.agent-thumbnail {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.agent-icon {
  font-size: 48px;
}

.purchased-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 10px;
  background: rgba(16, 185, 129, 0.9);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.agent-info {
  padding: 16px;
}

.agent-info h3 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.agent-description {
  margin: 0 0 12px;
  color: var(--color-text-secondary, #9ca3af);
  font-size: 13px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.agent-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--color-text-secondary, #9ca3af);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.agent-stats {
  display: flex;
  gap: 12px;
  font-size: 13px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-secondary, #9ca3af);
}

.agent-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--color-bg-hover, #1f1f28);
  border-top: 1px solid var(--color-border, #2a2a35);
}

.btn-status {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.btn-status.listed {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.btn-status.draft {
  background: rgba(139, 92, 246, 0.2);
  color: #8b5cf6;
}

.btn-status.draft:hover {
  background: rgba(139, 92, 246, 0.3);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-buttons button {
  padding: 6px;
  background: transparent;
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 6px;
  color: var(--color-text-secondary, #9ca3af);
  cursor: pointer;
}

.action-buttons button:hover {
  background: var(--color-bg-secondary, #14141a);
  color: var(--color-text-primary, #e5e5e5);
}

.action-buttons button.btn-delete:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.btn-run {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-accent, #8b5cf6);
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-state h3 {
  margin: 0 0 8px;
  font-size: 20px;
}

.empty-state p {
  margin: 0 0 24px;
  color: var(--color-text-secondary, #9ca3af);
}

.btn-browse {
  padding: 12px 24px;
  background: var(--color-bg-hover, #1f1f28);
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
}

/* Marketplace Search */
.marketplace-search {
  margin-bottom: 24px;
}

.search-input {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg-secondary, #14141a);
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 10px;
  margin-bottom: 16px;
}

.search-input input {
  flex: 1;
  background: transparent;
  border: none;
  color: inherit;
  font-size: 15px;
  outline: none;
}

.filter-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-buttons button {
  padding: 8px 16px;
  background: var(--color-bg-secondary, #14141a);
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 20px;
  color: var(--color-text-secondary, #9ca3af);
  font-size: 13px;
  cursor: pointer;
}

.filter-buttons button:hover, .filter-buttons button.active {
  border-color: var(--color-accent, #8b5cf6);
  color: var(--color-accent, #8b5cf6);
}

/* Featured Section */
.featured-section h2 {
  margin: 0 0 16px;
  font-size: 18px;
}

.featured-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.agent-card.featured .agent-price {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--color-bg-hover, #1f1f28);
  border-top: 1px solid var(--color-border, #2a2a35);
}

.price {
  font-weight: 600;
  color: var(--color-accent, #8b5cf6);
}

.btn-buy {
  padding: 8px 20px;
  background: var(--color-accent, #8b5cf6);
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

/* Marketplace Notice */
.marketplace-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.notice-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.marketplace-notice h3 {
  margin: 0 0 8px;
  font-size: 24px;
}

.marketplace-notice p {
  margin: 0;
  color: var(--color-text-secondary, #9ca3af);
  max-width: 400px;
}

/* Modal */
.modal-overlay {
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

.modal-content {
  background: var(--color-bg-secondary, #14141a);
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  padding: 24px;
}

.modal-content.modal-small {
  max-width: 400px;
}

.modal-content h2 {
  margin: 0 0 20px;
  font-size: 20px;
}

.modal-body {
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  color: var(--color-text-secondary, #9ca3af);
  margin-bottom: 6px;
}

.readonly-value {
  padding: 10px 12px;
  background: var(--color-bg-primary, #0a0a0f);
  border-radius: 8px;
  font-size: 14px;
}

.form-group input, .form-group textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--color-bg-primary, #0a0a0f);
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 8px;
  color: inherit;
  font-size: 14px;
}

.form-group textarea {
  resize: vertical;
}

.listing-fees {
  padding: 16px;
  background: var(--color-bg-primary, #0a0a0f);
  border-radius: 8px;
}

.fee-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 14px;
}

.fee-row:first-child {
  border-bottom: 1px solid var(--color-border, #2a2a35);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  padding: 10px 20px;
  background: transparent;
  border: 1px solid var(--color-border, #2a2a35);
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
}

.btn-confirm {
  padding: 10px 20px;
  background: var(--color-accent, #8b5cf6);
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-actions .btn-delete {
  background: #ef4444;
  color: white;
  border: none;
}
</style>

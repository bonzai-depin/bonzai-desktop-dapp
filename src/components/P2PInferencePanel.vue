<template>
  <div class="p2p-panel" :class="{ expanded: isExpanded }">
    <!-- Header -->
    <div class="panel-header" @click="toggleExpanded">
      <div class="header-left">
        <span class="icon">🌐</span>
        <span class="title">P2P Inference</span>
        <span class="status-badge" :class="statusClass">
          {{ onlineFriendsCount }} online
        </span>
      </div>
      <div class="header-right">
        <label class="toggle-switch" @click.stop>
          <input type="checkbox" v-model="enabled" />
          <span class="slider"></span>
        </label>
        <button class="expand-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline :points="isExpanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Expanded Content -->
    <div v-if="isExpanded" class="panel-content">
      <!-- Bid Settings -->
      <div class="bid-section" v-if="enabled">
        <label class="section-label">Max Bid (USDC)</label>
        <div class="bid-input-group">
          <input 
            type="number" 
            v-model.number="maxBid" 
            min="0" 
            step="0.01" 
            placeholder="0.00"
            class="bid-input"
          />
          <span class="currency">USDC</span>
        </div>
        <p class="bid-hint">Set the maximum you're willing to pay for peer GPU time</p>
      </div>

      <!-- Friends List -->
      <div class="friends-section">
        <div class="section-header">
          <span class="section-label">Friends ({{ friends.length }}/{{ maxFriends }})</span>
          <button @click="showAddFriend = true" class="add-btn" :disabled="friends.length >= maxFriends">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add
          </button>
        </div>

        <!-- Friends Grid -->
        <div class="friends-grid" v-if="friends.length > 0">
          <div 
            v-for="friend in friends" 
            :key="friend.id" 
            class="friend-card"
            :class="{ online: friend.isOnline, selected: selectedPeers.includes(friend.id) }"
            @click="togglePeerSelection(friend.id)"
          >
            <div class="friend-status" :class="friend.isOnline ? 'online' : 'offline'"></div>
            <div class="friend-info">
              <span class="friend-name">{{ friend.nickname }}</span>
              <span class="friend-address">{{ truncateAddress(friend.walletAddress) }}</span>
            </div>
            <div class="friend-stats">
              <span class="stat">{{ friend.stats?.requestsReceived || 0 }} jobs</span>
            </div>
            <button @click.stop="removeFriend(friend.id)" class="remove-btn" title="Remove friend">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="empty-state">
          <span class="empty-icon">👥</span>
          <p>No friends added yet</p>
          <button @click="showAddFriend = true" class="add-friend-btn">
            Add Your First Friend
          </button>
        </div>
      </div>

      <!-- Pending Requests -->
      <div class="requests-section" v-if="outgoingRequests.length > 0">
        <span class="section-label">Outgoing Requests</span>
        <div class="requests-list">
          <div v-for="request in outgoingRequests" :key="request.id" class="request-item">
            <div class="request-info">
              <span class="request-type">{{ request.type }}</span>
              <span class="request-status" :class="request.status">{{ request.status }}</span>
            </div>
            <div class="request-bids" v-if="request.bids?.length > 0">
              <span class="bids-count">{{ request.bids.length }} bids</span>
              <button @click="showBidsModal(request)" class="view-bids-btn">View</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Incoming Requests -->
      <div class="requests-section" v-if="incomingRequests.length > 0">
        <span class="section-label">Incoming Requests</span>
        <div class="requests-list">
          <div v-for="request in incomingRequests" :key="request.id" class="request-item incoming">
            <div class="request-info">
              <span class="request-type">{{ request.type }}</span>
              <span class="request-from">from {{ truncateAddress(request.from) }}</span>
            </div>
            <div class="request-actions">
              <input 
                type="number" 
                v-model.number="bidAmounts[request.id]" 
                placeholder="Bid"
                class="bid-amount-input"
                min="0"
                step="0.01"
              />
              <button @click="submitBid(request.id)" class="submit-bid-btn" :disabled="!bidAmounts[request.id]">
                Bid
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- USDC Balance -->
      <div class="usdc-section">
        <div class="usdc-balance">
          <span class="usdc-label">USDC Balance:</span>
          <span class="usdc-amount">{{ usdcBalance.toFixed(2) }}</span>
        </div>
      </div>
    </div>

    <!-- Add Friend Modal -->
    <Teleport to="body">
      <div v-if="showAddFriend" class="modal-overlay" @click.self="showAddFriend = false">
        <div class="modal">
          <h3>Add Friend</h3>
          <div class="form-group">
            <label>Wallet Address</label>
            <input 
              type="text" 
              v-model="newFriend.walletAddress" 
              placeholder="0x..."
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label>IP Address</label>
            <input 
              type="text" 
              v-model="newFriend.ip" 
              placeholder="192.168.1.100"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label>Nickname (optional)</label>
            <input 
              type="text" 
              v-model="newFriend.nickname" 
              placeholder="My Friend"
              class="form-input"
            />
          </div>
          <div class="modal-actions">
            <button @click="showAddFriend = false" class="btn secondary">Cancel</button>
            <button @click="addFriend" class="btn primary" :disabled="!isValidFriend">Add Friend</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Bids Modal -->
    <Teleport to="body">
      <div v-if="bidsModal.show" class="modal-overlay" @click.self="closeBidsModal">
        <div class="modal bids-modal">
          <h3>Review Bids</h3>
          <div class="bids-list">
            <div 
              v-for="bid in bidsModal.bids" 
              :key="bid.bidId" 
              class="bid-item"
              :class="{ selected: bidsModal.selectedBid === bid.bidId }"
              @click="bidsModal.selectedBid = bid.bidId"
            >
              <div class="bid-info">
                <span class="bidder">{{ truncateAddress(bid.bidder) }}</span>
                <span class="bid-amount">${{ bid.amount.toFixed(2) }} USDC</span>
              </div>
              <div class="bid-time">{{ formatTime(bid.createdAt) }}</div>
            </div>
          </div>
          <div class="modal-actions">
            <button @click="closeBidsModal" class="btn secondary">Cancel</button>
            <button 
              @click="acceptSelectedBid" 
              class="btn primary" 
              :disabled="!bidsModal.selectedBid"
            >
              Accept Bid
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, watch } from 'vue';
import { peerNetwork } from '../services/peerNetwork.js';

const props = defineProps({
  generationType: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['enabledChange', 'bidChange', 'peersChange']);

// State
const isExpanded = ref(false);
const enabled = ref(false);
const maxBid = ref(0);
const selectedPeers = ref([]);
const showAddFriend = ref(false);
const usdcBalance = ref(0);
const bidAmounts = reactive({});

const newFriend = reactive({
  walletAddress: '',
  ip: '',
  nickname: '',
});

const bidsModal = reactive({
  show: false,
  requestId: null,
  bids: [],
  selectedBid: null,
});

// Constants
const maxFriends = peerNetwork.MAX_FRIENDS;

// Computed
const friends = computed(() => peerNetwork.state.friends);
const onlineFriends = computed(() => peerNetwork.onlineFriends.value);
const onlineFriendsCount = computed(() => onlineFriends.value?.length || 0);
const outgoingRequests = computed(() => peerNetwork.pendingOutgoing.value || []);
const incomingRequests = computed(() => peerNetwork.pendingIncoming.value || []);

const statusClass = computed(() => ({
  'has-online': onlineFriendsCount.value > 0,
  'all-offline': onlineFriendsCount.value === 0 && friends.value.length > 0,
}));

const isValidFriend = computed(() => {
  return newFriend.walletAddress.startsWith('0x') && 
         newFriend.walletAddress.length === 42 &&
         newFriend.ip.length > 0;
});

// Methods
const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
};

const truncateAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const togglePeerSelection = (peerId) => {
  const index = selectedPeers.value.indexOf(peerId);
  if (index === -1) {
    selectedPeers.value.push(peerId);
  } else {
    selectedPeers.value.splice(index, 1);
  }
  emit('peersChange', selectedPeers.value);
};

const addFriend = async () => {
  try {
    await peerNetwork.addFriend(
      newFriend.walletAddress,
      newFriend.ip,
      newFriend.nickname || null
    );
    showAddFriend.value = false;
    newFriend.walletAddress = '';
    newFriend.ip = '';
    newFriend.nickname = '';
  } catch (error) {
    console.error('Failed to add friend:', error);
    alert(error.message);
  }
};

const removeFriend = async (friendId) => {
  if (confirm('Remove this friend?')) {
    await peerNetwork.removeFriend(friendId);
  }
};

const submitBid = async (requestId) => {
  const amount = bidAmounts[requestId];
  if (!amount || amount <= 0) return;

  try {
    await peerNetwork.placeBid(requestId, amount);
    delete bidAmounts[requestId];
  } catch (error) {
    console.error('Failed to submit bid:', error);
    alert(error.message);
  }
};

const showBidsModal = (request) => {
  bidsModal.requestId = request.id;
  bidsModal.bids = request.bids || [];
  bidsModal.selectedBid = null;
  bidsModal.show = true;
};

const closeBidsModal = () => {
  bidsModal.show = false;
  bidsModal.requestId = null;
  bidsModal.bids = [];
  bidsModal.selectedBid = null;
};

const acceptSelectedBid = async () => {
  if (!bidsModal.selectedBid || !bidsModal.requestId) return;

  try {
    await peerNetwork.acceptBid(bidsModal.requestId, bidsModal.selectedBid);
    closeBidsModal();
  } catch (error) {
    console.error('Failed to accept bid:', error);
    alert(error.message);
  }
};

const loadUSDCBalance = async () => {
  // This would connect to wallet and check USDC balance
  // For now, mock it
  usdcBalance.value = 0;
};

// Watchers
watch(enabled, (newVal) => {
  emit('enabledChange', newVal);
});

watch(maxBid, (newVal) => {
  emit('bidChange', newVal);
});

// Lifecycle
onMounted(async () => {
  await peerNetwork.loadFriends();
  await peerNetwork.pingAllFriends();
  await loadUSDCBalance();
});

// Expose for parent components
defineExpose({
  enabled,
  maxBid,
  selectedPeers,
});
</script>

<style scoped>
.p2p-panel {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
}

/* Header */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.panel-header:hover {
  background: rgba(255, 255, 255, 0.02);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon {
  font-size: 18px;
}

.title {
  font-weight: 600;
  color: #fff;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}

.status-badge.has-online {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  transition: 0.3s;
}

.slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.3s;
}

input:checked + .slider {
  background: #4ade80;
}

input:checked + .slider::before {
  transform: translateX(20px);
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: color 0.2s;
}

.expand-btn:hover {
  color: #fff;
}

/* Panel Content */
.panel-content {
  padding: 0 16px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.section-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

/* Bid Section */
.bid-section {
  padding: 16px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.bid-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bid-input {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 16px;
}

.bid-input:focus {
  outline: none;
  border-color: #4ade80;
}

.currency {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
}

.bid-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

/* Friends Section */
.friends-section {
  padding: 16px 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.3);
  border-radius: 6px;
  color: #4ade80;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.add-btn:hover:not(:disabled) {
  background: rgba(74, 222, 128, 0.2);
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Friends Grid */
.friends-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.friend-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.friend-card:hover {
  background: rgba(255, 255, 255, 0.05);
}

.friend-card.selected {
  border-color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
}

.friend-card.online {
  border-color: rgba(74, 222, 128, 0.3);
}

.friend-status {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.friend-status.online {
  background: #4ade80;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
}

.friend-status.offline {
  background: rgba(255, 255, 255, 0.2);
}

.friend-name {
  font-weight: 600;
  color: #fff;
  font-size: 13px;
}

.friend-address {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-family: monospace;
}

.friend-stats {
  margin-top: 4px;
}

.stat {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
}

.remove-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
}

.friend-card:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  color: #ef4444;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 24px;
  color: rgba(255, 255, 255, 0.5);
}

.empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
  display: block;
}

.add-friend-btn {
  margin-top: 12px;
  padding: 8px 16px;
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.3);
  border-radius: 8px;
  color: #4ade80;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.add-friend-btn:hover {
  background: rgba(74, 222, 128, 0.2);
}

/* Requests Section */
.requests-section {
  padding: 16px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.requests-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.request-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.request-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.request-type {
  font-weight: 600;
  color: #fff;
  font-size: 13px;
  text-transform: capitalize;
}

.request-status {
  font-size: 11px;
  text-transform: uppercase;
}

.request-status.pending {
  color: #fbbf24;
}

.request-status.accepted {
  color: #4ade80;
}

.request-status.completed {
  color: #60a5fa;
}

.request-from {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-family: monospace;
}

.request-bids,
.request-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bids-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.view-bids-btn,
.submit-bid-btn {
  padding: 4px 10px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  color: #60a5fa;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.view-bids-btn:hover,
.submit-bid-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.2);
}

.submit-bid-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bid-amount-input {
  width: 60px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
}

/* USDC Section */
.usdc-section {
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.usdc-balance {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.usdc-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.usdc-amount {
  font-weight: 600;
  color: #fff;
}

/* Modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.modal {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 400px;
}

.modal h3 {
  margin: 0 0 20px;
  color: #fff;
  font-size: 18px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
}

.form-input:focus {
  outline: none;
  border-color: #4ade80;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.btn {
  flex: 1;
  padding: 10px 16px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, background 0.2s;
  border: none;
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  color: #000;
}

.btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* Bids Modal */
.bids-modal {
  max-width: 450px;
}

.bids-list {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.bid-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.bid-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.bid-item.selected {
  border-color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
}

.bid-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bidder {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-family: monospace;
}

.bid-amount {
  font-weight: 600;
  color: #4ade80;
}

.bid-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}
</style>

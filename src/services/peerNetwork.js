/**
 * BonzAI — Peer Network Service
 * P2P connections, friend list (max 50), generation offloading, USDC bidding
 */

import { reactive, readonly, computed } from 'vue';
import { ethers } from 'ethers';

const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_DECIMALS = 6;
const USDC_ABI = ['function transfer(address to, uint256 amount) returns (bool)', 'function balanceOf(address) view returns (uint256)'];
const MAX_FRIENDS = 50;

const state = reactive({
  peerId: null, walletAddress: null, friends: [], incomingRequests: [], outgoingRequests: [],
  receivedBids: [], isConnected: false, connectionError: null,
});

// ==================== Friend Management ====================

export const addFriend = async (walletAddress, ip, nickname = null) => {
  if (state.friends.length >= MAX_FRIENDS) throw new Error(`Maximum of ${MAX_FRIENDS} friends allowed`);
  if (!ethers.isAddress(walletAddress)) throw new Error('Invalid wallet address');
  
  const existing = state.friends.find(f => f.walletAddress.toLowerCase() === walletAddress.toLowerCase());
  if (existing) { existing.ip = ip; existing.nickname = nickname || existing.nickname; existing.updatedAt = Date.now(); await persistFriends(); return existing; }
  
  const friend = {
    id: `friend_${Date.now()}`, walletAddress: walletAddress.toLowerCase(), ip,
    nickname: nickname || `Peer ${walletAddress.slice(0, 8)}`,
    addedAt: Date.now(), updatedAt: Date.now(), isOnline: false, lastSeen: null,
    stats: { requestsSent: 0, requestsReceived: 0, totalEarned: 0, totalSpent: 0 },
  };
  state.friends.push(friend);
  await persistFriends();
  pingFriend(friend.id);
  return friend;
};

export const removeFriend = async (friendId) => {
  const idx = state.friends.findIndex(f => f.id === friendId);
  if (idx === -1) return false;
  state.friends.splice(idx, 1);
  await persistFriends();
  return true;
};

export const updateFriend = async (friendId, updates) => {
  const friend = state.friends.find(f => f.id === friendId);
  if (!friend) return null;
  Object.assign(friend, updates, { updatedAt: Date.now() });
  await persistFriends();
  return friend;
};

export const pingFriend = async (friendId) => {
  const friend = state.friends.find(f => f.id === friendId);
  if (!friend) return false;
  try {
    const response = await fetch(`http://${friend.ip}:65001/ping`, { method: 'GET', signal: AbortSignal.timeout(5000) });
    friend.isOnline = response.ok;
    if (response.ok) friend.lastSeen = Date.now();
    return response.ok;
  } catch { friend.isOnline = false; return false; }
};

export const pingAllFriends = () => Promise.all(state.friends.map(f => pingFriend(f.id)));

const persistFriends = async () => {
  try { await window.electronAPI?.store?.set?.('peerFriends', JSON.parse(JSON.stringify(state.friends))); } catch (e) { console.error('[PeerNetwork] Persist failed:', e); }
};

export const loadFriends = async () => {
  try { const saved = await window.electronAPI?.store?.get?.('peerFriends', []); if (Array.isArray(saved)) state.friends = saved.slice(0, MAX_FRIENDS); } catch {}
};

// ==================== Generation Offloading ====================

export const requestFromPeers = async (request, targetPeerIds = 'all') => {
  const targets = targetPeerIds === 'all' ? state.friends.filter(f => f.isOnline) : state.friends.filter(f => targetPeerIds.includes(f.id) && f.isOnline);
  if (targets.length === 0) throw new Error('No online peers available');
  
  const outgoing = { id: `req_${Date.now()}`, type: request.type, payload: request, status: 'pending', createdAt: Date.now(), targetPeers: targets.map(t => t.id), bids: [], acceptedBid: null };
  state.outgoingRequests.push(outgoing);
  
  for (const target of targets) {
    try {
      await fetch(`http://${target.ip}:65001/generation/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: outgoing.id, from: state.walletAddress, type: request.type, payload: request }),
      });
    } catch (e) { console.error(`[PeerNetwork] Failed to send to ${target.nickname}:`, e); }
  }
  return outgoing;
};

export const handleIncomingRequest = (request) => {
  const incoming = { id: request.requestId, from: request.from, type: request.type, payload: request.payload, status: 'pending', receivedAt: Date.now(), myBid: null };
  state.incomingRequests.push(incoming);
  return incoming;
};

export const placeBid = async (requestId, bidAmountUSDC) => {
  const request = state.incomingRequests.find(r => r.id === requestId);
  if (!request) throw new Error('Request not found');
  
  const bid = { bidId: `bid_${Date.now()}`, requestId, bidder: state.walletAddress, amount: bidAmountUSDC, createdAt: Date.now() };
  request.myBid = bid;
  
  const friend = state.friends.find(f => f.walletAddress.toLowerCase() === request.from.toLowerCase());
  if (friend) {
    await fetch(`http://${friend.ip}:65001/generation/bid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bid) });
  }
  return bid;
};

export const acceptBid = async (requestId, bidId) => {
  const request = state.outgoingRequests.find(r => r.id === requestId);
  if (!request) throw new Error('Request not found');
  const bid = request.bids.find(b => b.bidId === bidId);
  if (!bid) throw new Error('Bid not found');
  
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
  const tx = await usdc.transfer(bid.bidder, ethers.parseUnits(bid.amount.toString(), USDC_DECIMALS));
  await tx.wait();
  
  request.acceptedBid = bidId; request.status = 'accepted'; request.paymentTx = tx.hash;
  
  const friend = state.friends.find(f => f.walletAddress.toLowerCase() === bid.bidder.toLowerCase());
  if (friend) {
    await fetch(`http://${friend.ip}:65001/generation/accepted`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, bidId, paymentTx: tx.hash }) });
    friend.stats.totalSpent += bid.amount;
  }
  return { request, paymentTx: tx.hash };
};

export const submitResult = async (requestId, result) => {
  const request = state.incomingRequests.find(r => r.id === requestId);
  if (!request) throw new Error('Request not found');
  const friend = state.friends.find(f => f.walletAddress.toLowerCase() === request.from.toLowerCase());
  if (!friend) throw new Error('Requester not found');
  
  await fetch(`http://${friend.ip}:65001/generation/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, result }) });
  request.status = 'completed'; request.completedAt = Date.now();
  return true;
};

export const onlineFriends = computed(() => state.friends.filter(f => f.isOnline));
export const pendingIncoming = computed(() => state.incomingRequests.filter(r => r.status === 'pending'));
export const pendingOutgoing = computed(() => state.outgoingRequests.filter(r => r.status === 'pending'));

export const peerNetwork = {
  state: readonly(state), addFriend, removeFriend, updateFriend, pingFriend, pingAllFriends, loadFriends,
  requestFromPeers, handleIncomingRequest, placeBid, acceptBid, submitResult,
  onlineFriends, pendingIncoming, pendingOutgoing, MAX_FRIENDS, USDC_ADDRESS,
};
export default peerNetwork;

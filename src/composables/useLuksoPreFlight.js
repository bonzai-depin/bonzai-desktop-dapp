/**
 * LUKSO Pre-Flight Composable
 *
 * Reactive readiness checks for LUKSO minting:
 * wallet connection, chain, UP detection, LYX balance.
 */

import { ref, computed, watch } from 'vue';
import { useBonzaiWeb3 } from './useBonzaiWeb3.js';
import { switchNetwork } from '../services/web3.service.js';
import { CONFIG } from '../config/web3.config.js';
import { ethers } from 'ethers';

export function useLuksoPreFlight({ requiredLYX = 15 } = {}) {
  const {
    isConnected,
    walletAddress,
    isOnLukso,
    isUniversalProfile,
    universalProfileData,
  } = useBonzaiWeb3({ autoInitialize: false });

  // LYX balance state
  const lyxBalance = ref('0');
  const lyxBalanceLoading = ref(false);

  // Computed checks
  const isWalletConnected = computed(() => isConnected.value);
  const isOnLuksoChain = computed(() => isOnLukso.value);
  const isUP = computed(() => isUniversalProfile.value);
  const upName = computed(() => universalProfileData.value?.name || '');

  const hasEnoughLYX = computed(() => {
    return parseFloat(lyxBalance.value) >= requiredLYX;
  });

  const canMint = computed(() => {
    return isWalletConnected.value && isOnLuksoChain.value && hasEnoughLYX.value;
  });

  // Pre-flight messages — only unmet conditions shown
  const preFlightMessages = computed(() => {
    const msgs = [];

    if (!isWalletConnected.value) {
      msgs.push({
        variant: 'warning',
        icon: 'wallet',
        text: 'Connect your wallet to mint on LUKSO.',
      });
      return msgs; // Don't show further checks if not connected
    }

    if (!isOnLuksoChain.value) {
      msgs.push({
        variant: 'warning',
        icon: 'swap_horiz',
        text: 'Switch to LUKSO network to mint.',
        action: 'switch',
      });
      return msgs;
    }

    // On LUKSO — show UP status
    if (isUP.value) {
      msgs.push({
        variant: 'success',
        icon: 'person_pin',
        text: `Minting as @${upName.value || 'UP'}. Your collectible will be an LSP8 token.`,
      });
    } else {
      msgs.push({
        variant: 'info',
        icon: 'info',
        text: 'Minting as EOA on LUKSO. Consider a Universal Profile for richer metadata.',
      });
    }

    if (!hasEnoughLYX.value) {
      msgs.push({
        variant: 'error',
        icon: 'account_balance_wallet',
        text: `Insufficient LYX balance (${lyxBalance.value} LYX). Need ${requiredLYX} LYX.`,
        action: 'getLYX',
      });
    }

    return msgs;
  });

  // Actions
  const switchToLukso = async () => {
    try {
      await switchNetwork('lukso');
    } catch (err) {
      console.error('[LuksoPreFlight] Failed to switch network:', err);
    }
  };

  const refreshLYXBalance = async () => {
    if (!walletAddress.value) {
      lyxBalance.value = '0';
      return;
    }

    lyxBalanceLoading.value = true;
    try {
      const provider = new ethers.JsonRpcProvider(CONFIG.networks.lukso.rpc);
      const balance = await provider.getBalance(walletAddress.value);
      lyxBalance.value = ethers.formatEther(balance);
    } catch (err) {
      console.warn('[LuksoPreFlight] Balance fetch failed:', err.message);
      lyxBalance.value = '0';
    } finally {
      lyxBalanceLoading.value = false;
    }
  };

  // Auto-refresh when wallet or chain changes
  watch(
    [walletAddress, isOnLuksoChain],
    ([addr, onLukso]) => {
      if (addr && onLukso) {
        refreshLYXBalance();
      }
    },
    { immediate: true },
  );

  return {
    isWalletConnected,
    isOnLuksoChain,
    isUP,
    upName,
    lyxBalance,
    lyxBalanceLoading,
    hasEnoughLYX,
    canMint,
    preFlightMessages,
    switchToLukso,
    refreshLYXBalance,
  };
}

export default useLuksoPreFlight;

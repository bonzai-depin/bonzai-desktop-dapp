<template>
  <div class="bonzai-bottom-bar">
    <!-- Main Bar Content -->
    <div class="bar-content">
      <!-- Left: Wallet Section -->
      <div class="wallet-section">
        <!-- Show connect button when not connected OR still connecting (prevents flash) -->
        <Transition name="wallet-fade" mode="out-in">
          <div
            v-if="!isConnected || isConnecting"
            key="connect-btns"
            class="connect-buttons"
          >
            <!-- Mint Network Indicator -->
            <div class="mint-network-selector">
              <span class="network-icon base"></span>
              <span class="network-label">Base</span>
            </div>

            <button
              class="button is-success"
              @click="connect"
              :disabled="isConnecting"
            >
              <span class="material-symbols-outlined mr-2">wallet</span>
              <span class="btn-text">
                {{ isConnecting ? "Connecting..." : "Connect Wallet" }}
              </span>
            </button>

            <span class="connect-divider">or</span>

            <button
              class="button is-info"
              @click="showPrivyLogin = true"
              :disabled="isConnecting"
              title="Sign in with email — no crypto wallet needed"
            >
              <span class="material-symbols-outlined mr-2">login</span>
              <span class="btn-text">Sign In</span>
            </button>

            <!-- Cancel/Reset button when stuck connecting -->
            <button
              v-if="isConnecting"
              class="button is-danger ml-2"
              @click="cancelConnection"
              title="Cancel connection"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- Only show wallet info when fully connected with a valid address -->
          <div
            v-else-if="isConnected && walletAddress"
            key="wallet-info"
            class="wallet-info"
          >
            <div class="wallet-address" @click="copyAddress">
              <span
                v-if="authProvider === 'privy'"
                class="network-badge privy-badge"
                title="Signed in with Privy"
              >
                P
              </span>
              <a
                v-if="isUniversalProfile"
                class="network-badge up-badge"
                :href="upProfileLink"
                target="_blank"
                @click.stop
                title="View Universal Profile"
              >
                UP
              </a>
              <img
                v-if="upAvatarUrl"
                :src="upAvatarUrl"
                class="up-avatar"
                alt="UP avatar"
              />
              <span v-if="upDisplayName" class="address-text up-name">
                @{{ upDisplayName }}
              </span>
              <span v-else class="address-text">{{ truncatedAddress }}</span>
              <span
                class="fira-sans-condensed-black-italic current-level-label"
              >
                <span v-if="displayedHighestLevelKey">
                  {{ displayedHighestLevelKey }}
                </span>
                <span v-else class="no-level">LVL 0</span>
              </span>
              <!-- Auth Status Indicator -->
              <span
                class="auth-indicator"
                :class="authStatusClass"
                @click.stop="showAuthModal = true"
                :title="'Session: ' + authStatusText"
              >
                <span class="auth-dot"></span>
                <span v-if="pendingOps > 0" class="pending-count">
                  {{ pendingOps }}
                </span>
              </span>
            </div>

            <!-- Mint Network Indicator (connected) -->
            <div class="mint-network-selector">
              <span class="network-icon base"></span>
              <span class="network-label">Base</span>
            </div>

            <button
              class="button is-danger"
              @click="disconnect"
              title="Disconnect"
            >
              <span class="material-symbols-outlined">logout</span>
            </button>
          </div>
        </Transition>
      </div>

      <!-- Right: Balance & Actions -->
      <div class="balance-section fira-sans-condensed-black-italic">
        <div class="balance-display">
          <div class="bonzai-balance">
            <span class="balance-amount is-size-1" v-if="isConnected">
              {{ formatBalance(totalBalance) }}
            </span>
            <span class="balance-amount is-size-1" v-else>0</span>
            <span class="balance-token is-size-4">BONZAI</span>
          </div>
        </div>

        <div class="action-buttons">
          <a
            :href="buyLink"
            target="_blank"
            class="button is-info is-outlined"
            title="Buy BONZAI"
          >
            <span class="material-symbols-outlined">shopping_cart</span>
          </a>
          <button
            class="button is-warning ml-2"
            @click="refresh"
            title="Refresh"
          >
            <span
              class="material-symbols-outlined mr-2"
              :class="{ spinning: isRefreshing }"
            >
              sync
            </span>
            Refresh Balance
          </button>
          <button
            class="p2p button ml-2"
            :class="p2pButtonClass"
            @click="showNetworkModal = true"
            title="Peer-to-Peer Network"
          >
            <span
              class="material-symbols-outlined mr-2"
              :class="{ 'pulse-icon': p2pStatus.started }"
            >
              {{ p2pModeIcon }}
            </span>
            {{ p2pModeLabel }}
          </button>
        </div>
      </div>
    </div>

    <!-- Level Modal removed — all generation is free, levels only affect mint discount -->

    <!-- Network Settings Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showNetworkModal"
          class="network-modal-overlay"
          @click.self="showNetworkModal = false"
        >
          <div class="network-modal">
            <div class="network-modal-header">
              <h1
                class="fira-sans-condensed-black-italic is-size-1 has-text-white"
              >
                <span class="material-symbols-outlined mr-2 is-size-1">
                  p2p
                </span>
                Peer-to-Peer Network
              </h1>
              <button
                class="button is-danger"
                @click="showNetworkModal = false"
                title="Close"
              >
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            <div class="network-modal-body">
              <NetworkSettings />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Auth Status Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showAuthModal"
          class="auth-modal-overlay"
          @click.self="showAuthModal = false"
        >
          <div class="auth-modal">
            <div class="auth-modal-header">
              <h2
                class="fira-sans-condensed-black-italic is-size-3 has-text-white"
              >
                <span class="material-symbols-outlined mr-2">security</span>
                Session Status
              </h2>
              <button
                class="button is-danger is-small"
                @click="showAuthModal = false"
                title="Close"
              >
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>

            <div class="auth-modal-body">
              <!-- Status Indicator -->
              <div class="auth-status-banner" :class="authStatusClass">
                <span class="status-dot-large" :class="authStatusClass"></span>
                <span class="status-label fira-sans-condensed-black-italic">
                  {{ authStatusText }}
                </span>
              </div>

              <!-- Details -->
              <div class="auth-details">
                <div class="detail-row">
                  <span class="label">Wallet</span>
                  <span class="value monospace">{{ truncatedAddress }}</span>
                </div>
                <div class="detail-row" v-if="authState.level">
                  <span class="label">Level</span>
                  <span class="value">{{ authState.level }}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Session</span>
                  <span
                    class="value"
                    :class="{
                      'has-text-danger': needsReauth,
                      'has-text-warning': tokenExpiringSoon,
                    }"
                  >
                    {{
                      tokenExpiresIn > 0
                        ? formatExpiry(tokenExpiresIn)
                        : "Expired"
                    }}
                  </span>
                </div>
                <div class="detail-row" v-if="pendingOps > 0">
                  <span class="label">Queued Operations</span>
                  <span class="value has-text-warning">{{ pendingOps }}</span>
                </div>
                <div class="detail-row" v-if="vaultStatus.isUnlocked">
                  <span class="label">Vault</span>
                  <span class="value has-text-success">Unlocked</span>
                </div>
              </div>

              <!-- Actions -->
              <div class="auth-actions">
                <button
                  v-if="needsReauth"
                  class="button is-warning is-fullwidth"
                  @click="handleReauth"
                  :disabled="isReauthing"
                  :class="{ 'is-loading': isReauthing }"
                >
                  <span class="material-symbols-outlined mr-2">refresh</span>
                  Reconnect Session
                </button>
                <button
                  v-else-if="tokenExpiringSoon"
                  class="button is-info is-fullwidth"
                  @click="handleRefreshToken"
                  :disabled="isRefreshingToken"
                  :class="{ 'is-loading': isRefreshingToken }"
                >
                  <span class="material-symbols-outlined mr-2">sync</span>
                  Refresh Token
                </button>
                <p v-else class="has-text-centered has-text-grey-light">
                  Your session is active. No action needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══ Privy Login Modal ═══ -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="showPrivyLogin"
          class="modal is-active privy-modal-overlay"
          @click.self="closePrivyLogin"
        >
          <div class="modal-content privy-modal">
            <div class="privy-modal-header">
              <h3>Sign In</h3>
              <button class="delete" @click="closePrivyLogin"></button>
            </div>

            <div class="privy-modal-body">
              <p class="privy-subtitle">No crypto wallet needed</p>

              <!-- Email Step -->
              <div v-if="privyStep === 'email'" class="privy-email-step">
                <input
                  v-model="privyEmail"
                  type="email"
                  class="input privy-input"
                  placeholder="Enter your email"
                  @keyup.enter="startPrivyEmail"
                  autofocus
                />
                <button
                  class="button is-info is-fullwidth mt-3"
                  @click="startPrivyEmail"
                  :disabled="isConnecting"
                >
                  {{ isConnecting ? "Sending..." : "Continue with Email" }}
                </button>
              </div>

              <!-- OTP Step -->
              <div v-else-if="privyStep === 'otp'" class="privy-otp-step">
                <p class="privy-otp-hint">
                  Check <strong>{{ privyEmail }}</strong> for a verification code
                </p>
                <input
                  v-model="privyOtpCode"
                  type="text"
                  class="input privy-input"
                  placeholder="Enter code"
                  maxlength="6"
                  @keyup.enter="verifyPrivyOtp"
                  autofocus
                />
                <button
                  class="button is-info is-fullwidth mt-3"
                  @click="verifyPrivyOtp"
                  :disabled="isConnecting"
                >
                  {{ isConnecting ? "Verifying..." : "Verify" }}
                </button>
                <button
                  class="button is-ghost is-fullwidth mt-2"
                  @click="privyStep = 'email'"
                >
                  Back
                </button>
              </div>

              <!-- Divider -->
              <div class="privy-divider">
                <span>or</span>
              </div>

              <!-- Social Login -->
              <div class="privy-social-buttons">
                <button
                  class="button is-dark is-fullwidth mb-2"
                  @click="loginWithSocial('google')"
                  :disabled="isConnecting"
                >
                  <span class="btn-text">Continue with Google</span>
                </button>
                <button
                  class="button is-dark is-fullwidth"
                  @click="loginWithSocial('apple')"
                  :disabled="isConnecting"
                >
                  <span class="btn-text">Continue with Apple</span>
                </button>
              </div>

              <!-- Error -->
              <p v-if="privyError" class="privy-error mt-3">{{ privyError }}</p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useBonzaiWeb3 } from "../composables/useBonzaiWeb3.js";
import { CONFIG } from "../config/web3.config.js";
import {
  levelService,
  checkAllLevels,
  canUnlockWithEth,
  unlockAllWithEth,
  clearOpenLevelModalRequest,
  clearOpenNetworkModalRequest,
} from "../services/level.service.js";
import {
  authService,
  userInitiatedReAuth,
  refreshToken,
} from "../services/auth.service.js";
import { authVault } from "../services/authVault.service.js";
import NetworkSettings from "./NetworkSettings.vue";
import { mintStore } from "../stores/mintStore.js";
import { switchNetwork } from "../services/web3.service.js";

const {
  isConnected,
  isConnecting,
  walletAddress,
  truncatedAddress,
  isOnArbitrum,
  isOnLukso,
  isUniversalProfile,
  universalProfileData,
  totalBalance,
  balances,
  levels,
  highestLevel,
  connect: doConnect,
  connectWithPrivy: doConnectWithPrivy,
  disconnect: doDisconnect,
  cancelConnection: doCancelConnection,
  refresh: doRefresh,
  authProvider,
  store,
} = useBonzaiWeb3();

// Cancel connection and reset state
const cancelConnection = async () => {
  console.log("[BonzaiBottomBar] Cancelling connection...");
  await doCancelConnection();
};

const isRefreshing = ref(false);
const isUnlocking = ref(false);
const selectedLevel = ref(null);
const unlockStatus = ref("");
const unlockStatusType = ref("info"); // 'info', 'warning', 'success', 'danger'

// Network modal state
const showNetworkModal = ref(false);
const p2pStatus = ref({ started: false });
const p2pMode = ref("local"); // 'local', 'consumer', 'provider'
let p2pStatusInterval = null;

// Auth modal state
const showAuthModal = ref(false);
const isReauthing = ref(false);
const isRefreshingToken = ref(false);

// Privy login state
const showPrivyLogin = ref(false);
const privyEmail = ref("");
const privyOtpCode = ref("");
const privyStep = ref("email"); // 'email' | 'otp'
const privyError = ref("");

// Mint network (Base only)
const mintNetwork = computed(() => mintStore.state.network);

// Universal Profile display
const upDisplayName = computed(() => {
  if (!isUniversalProfile.value || !universalProfileData.value) return null;
  return universalProfileData.value.name || null;
});

const upProfileLink = computed(() => {
  if (!isUniversalProfile.value || !walletAddress.value) return null;
  return `https://universaleverything.io/${walletAddress.value}`;
});

const upAvatarUrl = computed(() => {
  if (!isUniversalProfile.value || !universalProfileData.value) return null;
  const images = universalProfileData.value.profileImage;
  if (!images || !images.length) return null;
  const url = images[0].url;
  if (!url) return null;
  if (url.startsWith("ipfs://"))
    return url.replace("ipfs://", "https://api.universalprofile.cloud/ipfs/");
  return url;
});

// Auth state from service
const authState = authService.state;
const vaultStatus = computed(() => authVault.getVaultStatus());

const isAuthenticated = computed(() => {
  return authState.isAuthenticated && authState.accessToken;
});

const tokenExpiresIn = computed(() => {
  if (!authState.tokenExpiry) return 0;
  return Math.max(0, Math.round((authState.tokenExpiry - Date.now()) / 1000));
});

const tokenExpiringSoon = computed(() => {
  return tokenExpiresIn.value > 0 && tokenExpiresIn.value < 300; // 5 min
});

const needsReauth = computed(() => {
  return !isAuthenticated.value || tokenExpiresIn.value <= 0;
});

const pendingOps = computed(() => vaultStatus.value.pendingOperations);

const authStatusClass = computed(() => {
  if (needsReauth.value) return "is-danger";
  if (tokenExpiringSoon.value) return "is-warning";
  return "is-success";
});

const authStatusText = computed(() => {
  if (needsReauth.value) return "Expired";
  if (tokenExpiringSoon.value) return "Expiring";
  return "Active";
});

const formatExpiry = (seconds) => {
  if (seconds <= 0) return "Expired";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
};

const handleReauth = async () => {
  isReauthing.value = true;
  try {
    // Ensure wallet is connected before attempting signature
    if (!isConnected.value) {
      console.log("[BottomBar] Wallet not connected, connecting first...");
      await doConnect();
      if (!isConnected.value) {
        console.error("[BottomBar] Wallet connection failed, cannot re-auth");
        return;
      }
    }
    await userInitiatedReAuth();
    showAuthModal.value = false;
  } catch (e) {
    console.error("[BottomBar] Re-auth failed:", e);
  } finally {
    isReauthing.value = false;
  }
};

const handleRefreshToken = async () => {
  isRefreshingToken.value = true;
  try {
    await refreshToken();
  } catch (e) {
    console.error("[BottomBar] Token refresh failed:", e);
  } finally {
    isRefreshingToken.value = false;
  }
};

// Poll P2P status and mode for the button indicator
const refreshP2PStatus = async () => {
  try {
    const status = await window.electronAPI.p2pStatus();
    if (status.ok) {
      p2pStatus.value = status;
    }
    // Also refresh mode
    const savedMode = await window.electronAPI.store.get(
      "p2p.networkMode",
      "local",
    );
    p2pMode.value = savedMode;
  } catch (err) {
    console.warn("[BonzaiBottomBar] Failed to get P2P status:", err);
  }
};

// P2P button computed properties
const p2pModeIcon = computed(() => {
  if (p2pMode.value === "consumer") return "cloud_download";
  if (p2pMode.value === "provider" && p2pStatus.value.started) return "sensors";
  if (p2pMode.value === "provider") return "cloud_upload";
  return "wifi_off";
});

const p2pModeLabel = computed(() => {
  if (p2pMode.value === "consumer") return "Consumer Mode";
  if (p2pMode.value === "provider" && p2pStatus.value.started)
    return "Now Serving";
  if (p2pMode.value === "provider") return "Provider Mode";
  return "Private Mode";
});

const p2pButtonClass = computed(() => {
  if (p2pMode.value === "consumer") return "is-info";
  if (p2pMode.value === "provider" && p2pStatus.value.started)
    return "is-warning";
  if (p2pMode.value === "provider") return "is-info";
  return "is-info";
});

// Unlock status styling
const unlockStatusClass = computed(() => `is-${unlockStatusType.value}`);
const unlockStatusIcon = computed(() => {
  const icons = {
    info: "hourglass_empty",
    warning: "warning",
    success: "check_circle",
    danger: "error",
  };
  return icons[unlockStatusType.value] || "info";
});

// ETH unlock state from levelService
const unlockPrice = computed(() => levelService.state.unlockPrice || 1.0);
const allLevelsUnlocked = computed(() => levelService.state.allLevelsUnlocked);

const buyLink = CONFIG.links.buyBonzai;

// Helpers
const getLevelConfig = (lvl) => CONFIG.levels[`LVL${lvl}`];

const hasEnoughBonzai = (required) => totalBalance.value >= required;

// Manual unlock flag (ETH unlock for all levels)
const isLevelManuallyUnlocked = (levelId) => {
  // Check if user paid 1 ETH to unlock all levels
  if (allLevelsUnlocked.value) return true;
  // Check from levels state (ethUnlocked flag)
  const levelKey = `LVL${levelId}`;
  if (levels.value[levelKey]?.ethUnlocked) return true;
  return false;
};

// New rule: unlocking is either holdings OR ETH unlock (1 ETH for all levels).
// Once unlocked => user can use the tier.
const isLevelUnlockedOrHolding = (levelId) => {
  // If all levels unlocked via ETH, this level is unlocked
  if (allLevelsUnlocked.value) return true;

  const cfg = getLevelConfig(levelId);
  const required = cfg?.holdingRequired || 0;
  // Check if level is active via the levels state
  const levelKey = `LVL${levelId}`;
  if (levels.value[levelKey]?.active) return true;
  return isLevelManuallyUnlocked(levelId) || hasEnoughBonzai(required);
};

// Displayed highest level: LVL1-5 only (LVL6 removed), used for discount display
const displayedHighestLevelKey = computed(() => {
  for (let i = 5; i >= 1; i--) {
    if (isLevelUnlockedOrHolding(i)) return `LVL${i}`;
  }
  return "";
});

// Mint discount based on BONZAI holdings level
const MINT_DISCOUNTS = { 1: 1, 2: 5, 3: 10, 4: 25, 5: 33 };
const mintDiscount = computed(() => {
  for (let i = 5; i >= 1; i--) {
    if (isLevelUnlockedOrHolding(i)) return MINT_DISCOUNTS[i];
  }
  return 0;
});

const getLevelClass = (lvl) => {
  const key = `LVL${lvl}`;
  const unlocked = isLevelUnlockedOrHolding(lvl);
  // If you want "active" driven by your levels service, keep it OR it with unlocked
  const serviceActive = levels.value[key]?.active ?? false;
  const active = unlocked || serviceActive;

  return {
    unlocked,
    active,
    locked: !unlocked,
  };
};

const getLevelIcon = (lvl) => {
  const icons = [
    "chat",
    "headphones",
    "image",
    "movie",
    "3d_rotation",
    "exercise",
  ];
  return icons[lvl - 1] || "⭐";
};

const formatBalance = (val) => {
  const n = Number(val || 0);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toFixed(0);
};

const formatFeature = (feature) =>
  feature
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

// Actions
const connect = async () => {
  await doConnect();
  // After connecting, switch wallet to the selected mint network chain
  if (isConnected.value) {
    try {
      await switchNetwork(mintNetwork.value);
    } catch (e) {
      console.warn("[BottomBar] Post-connect chain switch failed:", e.message);
    }
  }
};

const disconnect = async () => {
  await doDisconnect();
};

// ── Privy Login Flow ─────────────────────────────────────────────────────

const startPrivyEmail = async () => {
  privyError.value = "";
  if (!privyEmail.value?.trim()) {
    privyError.value = "Enter your email address";
    return;
  }
  const result = await doConnectWithPrivy({
    method: "email",
    email: privyEmail.value.trim(),
  });
  if (result.needsOtp) {
    privyStep.value = "otp";
  } else if (result.error) {
    privyError.value = result.error;
  }
};

const verifyPrivyOtp = async () => {
  privyError.value = "";
  if (!privyOtpCode.value?.trim()) {
    privyError.value = "Enter the verification code";
    return;
  }
  const result = await doConnectWithPrivy({
    method: "email",
    email: privyEmail.value.trim(),
    otpCode: privyOtpCode.value.trim(),
  });
  if (result.success) {
    showPrivyLogin.value = false;
    privyStep.value = "email";
    privyEmail.value = "";
    privyOtpCode.value = "";
    // Post-connect chain switch
    try {
      await switchNetwork(mintNetwork.value);
    } catch (e) {
      console.warn("[BottomBar] Post-Privy chain switch:", e.message);
    }
  } else if (result.error) {
    privyError.value = result.error;
  }
};

const loginWithSocial = async (provider) => {
  privyError.value = "";
  const result = await doConnectWithPrivy({ method: provider });
  if (result.success) {
    showPrivyLogin.value = false;
    try {
      await switchNetwork(mintNetwork.value);
    } catch (e) {
      console.warn("[BottomBar] Post-Privy chain switch:", e.message);
    }
  } else if (result.error) {
    privyError.value = result.error;
  }
};

const closePrivyLogin = () => {
  showPrivyLogin.value = false;
  privyStep.value = "email";
  privyEmail.value = "";
  privyOtpCode.value = "";
  privyError.value = "";
};

const refresh = async () => {
  isRefreshing.value = true;
  await doRefresh();
  await checkAllLevels();
  setTimeout(() => (isRefreshing.value = false), 500);
};

const copyAddress = () => {
  if (!walletAddress.value) return;
  navigator.clipboard.writeText(walletAddress.value);
};

const openLevelModal = (lvl) => {
  selectedLevel.value = lvl;
};

// Helper to set unlock status
const setUnlockStatus = (message, type = "info") => {
  unlockStatus.value = message;
  unlockStatusType.value = type;
};

const clearUnlockStatus = () => {
  unlockStatus.value = "";
  unlockStatusType.value = "info";
};

// Close modal and clear notification status
const closeModal = () => {
  selectedLevel.value = null;
  clearUnlockStatus();
};

// Unlock all levels with 1 ETH payment
const unlockAllLevels = async () => {
  if (isUnlocking.value) return;

  isUnlocking.value = true;
  clearUnlockStatus();

  try {
    // Step 1: Check if connected, if not connect first
    if (!isConnected.value) {
      setUnlockStatus("Connecting wallet...", "info");
      await doConnect();

      // Wait for connection to complete
      if (!isConnected.value) {
        setUnlockStatus("Wallet connection failed or cancelled", "danger");
        return;
      }
    }

    // Step 2: Show awaiting signature notification
    setUnlockStatus("Awaiting signature...", "warning");

    // Step 3: Call unlock - this will trigger the signature request
    // The unlockAllWithEth function handles the transaction
    const result = await unlockAllWithEth((status) => {
      // Callback for status updates from the service
      if (status === "awaiting_payment") {
        setUnlockStatus("Awaiting payment approval (1 ETH)...", "warning");
      }
    });

    if (result.success) {
      console.log("[BonzaiBottomBar] All levels unlocked!", result.txHash);
      setUnlockStatus("All levels unlocked successfully!", "success");
      await checkAllLevels();
      // Clear status after a delay and close modal
      setTimeout(() => {
        clearUnlockStatus();
        selectedLevel.value = null;
      }, 2000);
    } else {
      console.error("[BonzaiBottomBar] Unlock failed:", result.error);
      setUnlockStatus(`Unlock failed: ${result.error}`, "danger");
    }
  } catch (e) {
    console.error("[BonzaiBottomBar] Unlock error:", e);
    setUnlockStatus(`Unlock error: ${e.message || e}`, "danger");
  } finally {
    isUnlocking.value = false;
  }
};

// Auth event handler
const handleNeedsReauth = () => {
  console.log("[BottomBar] Auth needs re-authentication");
  showAuthModal.value = true;
};

// Check levels on mount and when wallet connects
onMounted(async () => {
  if (isConnected.value) {
    await checkAllLevels();
  }

  // Initial P2P status check and start polling
  await refreshP2PStatus();
  p2pStatusInterval = setInterval(refreshP2PStatus, 5000);

  // Listen for auth needs-reauth events
  window.addEventListener("auth:needs-reauth", handleNeedsReauth);
  window.addEventListener("auth:expired", handleNeedsReauth);
});

onUnmounted(() => {
  if (p2pStatusInterval) {
    clearInterval(p2pStatusInterval);
  }
  window.removeEventListener("auth:needs-reauth", handleNeedsReauth);
  window.removeEventListener("auth:expired", handleNeedsReauth);
});

watch(isConnected, async (connected) => {
  if (connected) {
    await checkAllLevels();
  }
});

// Watch for cross-component level modal requests (from SmartAgent, etc.)
watch(
  () => levelService.state.openLevelModalFor,
  (levelNum) => {
    if (levelNum !== null && levelNum >= 1 && levelNum <= 6) {
      openLevelModal(levelNum);
      clearOpenLevelModalRequest();
    }
  },
);

// Watch for cross-component network modal requests (from Generative* views)
watch(
  () => levelService.state.openNetworkModal,
  (shouldOpen) => {
    if (shouldOpen) {
      showNetworkModal.value = true;
      clearOpenNetworkModalRequest();
    }
  },
);
</script>

<style scoped>
/* BonzAI Design System */
:root {
  --bonzai-bg-dark: #0a0a0f;
  --bonzai-bg-card: rgba(20, 20, 30, 0.92);
  --bonzai-green: #10b981;
  --bonzai-green-glow: rgba(16, 185, 129, 0.3);
  --bonzai-purple: #8b5cf6;
  --bonzai-text: #f0f0f5;
  --bonzai-text-muted: rgba(240, 240, 245, 0.7);
  --bonzai-border: rgba(255, 255, 255, 0.1);
  --bonzai-radius: 12px;
}

.bonzai-bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  height: 7.66vh;
  color: #fff;
  background: #61378e;
  backdrop-filter: blur(20px);
  box-shadow: 10px 0 25px #000;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
}

/* Main Bar Content */
.bar-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  gap: 24px;
  width: 100%;
  height: 100%;
}

/* Wallet Section */
.wallet-section {
  flex: 0 0 auto;
  min-width: 180px;
}

.connect-buttons {
  display: flex;
  align-items: center;
}

.wallet-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.serve-label {
  font-weight: 600;
}

/* Mint Network Selector */
.mint-network-selector {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  margin-left: 8px;
  margin-right: 8px;
  transition: all 0.2s;
}

.mint-network-selector:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
}

.network-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}

.network-icon.base {
  background: linear-gradient(135deg, #0052ff 0%, #3380ff 100%);
}

.network-label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
}

.up-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.wallet-address {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  cursor: pointer;
}

.address-text {
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  color: #fff;
}

.network-badge {
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.9);
}

.network-badge.arbitrum {
  background: linear-gradient(135deg, #28a0f0 0%, #1a73e8 100%);
  color: white;
}

.network-badge.lukso {
  background: linear-gradient(135deg, #fe2d6e 0%, #fe7eb0 100%);
  color: white;
}

.network-badge.up-badge {
  background: linear-gradient(135deg, #fe2d6e 0%, #c41f9a 100%);
  color: white;
  text-decoration: none;
  cursor: pointer;
  font-weight: 900;
}

.network-badge.up-badge:hover {
  box-shadow: 0 0 8px rgba(254, 45, 110, 0.5);
}

.up-name {
  font-weight: 700;
  color: #fe7eb0;
}

.current-level-label {
  font-size: 14px;
  color: #fff;
}

.current-level-label .no-level {
  font-style: italic;
  opacity: 0.85;
}

.disconnect-btn {
  padding: 8px;
  background: transparent;
  border: 1px solid var(--bonzai-border);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
}

.disconnect-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.tag {
  position: absolute;
  top: -12px;
  right: -18px;
  text-shadow: none !important;
}

/* Levels Section */
.discount-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.discount-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.4);
  border-radius: 8px;
  padding: 6px 14px;
  color: #10b981;
  font-size: 0.9rem;
}

.discount-level {
  font-weight: 800;
  font-size: 1rem;
}

.discount-percent {
  color: rgba(16, 185, 129, 0.8);
  font-size: 0.85rem;
}

.levels-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.level-track {
  display: flex;
  align-items: center;
  gap: 0;
}

.level-node {
  position: relative;
  display: flex;
  align-items: center;
}

.node-inner {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid var(--bonzai-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.level-node.unlocked .node-inner {
  border-color: var(--bonzai-purple);
  background: rgba(139, 92, 246, 0.1);
}

.level-node.active .node-inner {
  border-color: var(--bonzai-green);
  background: rgba(16, 185, 129, 1);
  box-shadow: 0 0 20px var(--bonzai-green-glow);
  will-change: transform, box-shadow;
  animation: pulse 1.6s ease-in-out infinite;
}

.level-node:hover .node-inner {
  transform: scale(1.08);
  border-color: var(--bonzai-green);
}

.level-num {
  font-size: 10px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
}

.level-connector {
  width: 20px;
  height: 2px;
  background: rgba(255, 255, 255, 0.18);
}

.level-node.active .level-connector,
.level-node.unlocked .level-connector {
  background: linear-gradient(
    90deg,
    var(--bonzai-green) 0%,
    rgba(255, 255, 255, 0.18) 100%
  );
}

/* Balance Section */
.balance-section {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.balance-display {
  text-align: right;
}

.bonzai-balance {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.balance-amount {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
}

.balance-token {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
}

.chain-breakdown {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.chain-balance {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--bonzai-border);
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  text-decoration: none;
}

.action-btn:hover {
  border-color: var(--bonzai-green);
  color: var(--bonzai-green);
}

.action-btn.buy-btn:hover {
  background: var(--bonzai-green);
  color: white;
}

.spinning {
  animation: spin 1s linear infinite;
  will-change: transform;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulseRed {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(241, 70, 104, 0.1);
  }
  50% {
    transform: scale(1);
    box-shadow: 0 0 0 64px rgba(241, 70, 104, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(241, 70, 104, 0);
  }
}

@keyframes pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.1);
  }
  50% {
    transform: scale(1);
    box-shadow: 0 0 0 64px rgba(16, 185, 129, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

/* Modal */
.level-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.level-modal {
  width: 92%;
  max-width: 460px;
  background: var(--bonzai-bg-dark);
  border: 1px solid var(--bonzai-border);
  border-radius: 16px;
  padding: 24px;
  position: relative;
  color: #fff; /* ensure white text */
}

.close-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
}

.models__activity--payouts {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 2em;
}

.modal-header {
  text-align: center;
  margin-bottom: 18px;
}

.modal-level-badge {
  display: inline-block;
  padding: 6px 16px;
  background: var(--bonzai-green);
  border-radius: 20px;
  font-weight: 900;
  color: #fff;
  margin-bottom: 10px;
}

.modal-header h2 {
  margin: 0;
  color: #fff;
}

.modal-status {
  margin-top: 10px;
}

strong {
  color: rgba(16, 185, 129, 1);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 3px solid rgba(241, 70, 104, 0.9);
  color: rgba(241, 70, 104, 0.9);
  font-size: 12px;
  font-weight: 100;
  background: rgba(255, 255, 255, 0.06);
}

.status-pill.ok {
  color: rgba(16, 185, 129, 1);
  border-color: rgba(16, 185, 129, 0.55);
  background: rgba(16, 185, 129, 0.12);
}

.level-description {
  color: rgba(255, 255, 255, 0.92);
  text-align: center;
  margin-bottom: 16px;
  line-height: 1.35;
}

.features-list h3,
.requirements-title {
  color: rgba(255, 255, 255, 0.95);
  margin: 0 0 8px 0;
  font-weight: 900;
  letter-spacing: 0.2px;
}

.features-list ul {
  list-style: none;
  padding: 0 0 0 14px;
  margin: 0 0 16px 0;
}

.features-list li {
  padding: 8px 0;
  color: rgba(255, 255, 255, 0.92);
  list-style-type: circle;
}

.requirements-summary {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.req-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
}

hr {
  margin: 12px 0;
  width: 100%;
  background-color: rgba(255, 255, 255, 0.015);
}

.req-icon {
  width: 20px;
  text-align: center;
  opacity: 0.95;
}

.req-text {
  flex: 1;
}

.req-status {
  font-size: 14px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.75);
}

.req-status.met {
  color: var(--bonzai-green);
}

.req-note {
  margin-top: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
}

.modal-footer {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  padding-top: 16px;
  align-items: center;
}

.modal-footer .button {
  flex: 1;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
}

.primary-btn {
  background: linear-gradient(135deg, var(--bonzai-green) 0%, #059669 100%);
  border: none;
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.secondary-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #fff;
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: rgba(255, 255, 255, 0.95);
  animation: spin 0.9s linear infinite;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Wallet state transition - prevents jarring flash */
.wallet-fade-enter-active,
.wallet-fade-leave-active {
  transition: opacity 0.15s ease-out;
}
.wallet-fade-enter-from,
.wallet-fade-leave-to {
  opacity: 0;
}

/* Unlock Status Notification */
.unlock-status-notification {
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

/* P2P Button */

.serve-label {
  font-size: 12px;
  font-weight: 600;
}

.pulse-icon {
  animation: pulseGreen 2s ease-in-out infinite;
}

@keyframes pulseGreen {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Network Modal */
.network-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.network-modal {
  width: 95%;
  max-width: 900px;
  max-height: 90vh;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.network-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.network-modal-header h2 {
  display: flex;
  align-items: center;
  font-size: 1.5rem;
  color: #fff;
  margin: 0;
}

.network-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

/* Override NetworkSettings styles when inside modal */
.network-modal-body :deep(.network-settings) {
  height: auto;
  max-height: 70vh;
  padding: 24px;
}

.network-modal-body :deep(.panel) {
  max-width: none;
}

/* Auth Indicator */
.auth-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  margin-left: 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(0, 0, 0, 0.2);
}

.auth-indicator:hover {
  background: rgba(0, 0, 0, 0.4);
}

.auth-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.auth-indicator.is-success .auth-dot {
  background: #48c78e;
  box-shadow: 0 0 6px #48c78e;
  animation: status-blink 1.5s ease-in-out infinite;
}

.auth-indicator.is-warning .auth-dot {
  background: #ffe08a;
  box-shadow: 0 0 6px #ffe08a;
  animation: status-blink 1.5s ease-in-out infinite;
}

.auth-indicator.is-danger .auth-dot {
  background: #f14668;
  box-shadow: 0 0 6px #f14668;
  animation: status-blink 1s ease-in-out infinite;
}

@keyframes status-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.pending-count {
  font-size: 10px;
  font-weight: bold;
  color: #f14668;
}

/* Auth Modal */
.auth-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10002;
}

.auth-modal {
  width: 90%;
  max-width: 400px;
  background: var(--bonzai-bg-dark);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;
}

.auth-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.auth-modal-header h2 {
  display: flex;
  align-items: center;
  margin: 0;
}

.auth-modal-body {
  padding: 20px;
}

.auth-status-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.auth-status-banner.is-success {
  background: rgba(72, 199, 142, 0.15);
  border: 1px solid rgba(72, 199, 142, 0.3);
}

.auth-status-banner.is-warning {
  background: rgba(255, 224, 138, 0.15);
  border: 1px solid rgba(255, 224, 138, 0.3);
}

.auth-status-banner.is-danger {
  background: rgba(241, 70, 104, 0.15);
  border: 1px solid rgba(241, 70, 104, 0.3);
}

.status-dot-large {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}

.status-dot-large.is-success {
  background: #48c78e;
  box-shadow: 0 0 12px #48c78e;
}

.status-dot-large.is-warning {
  background: #ffe08a;
  box-shadow: 0 0 12px #ffe08a;
}

.status-dot-large.is-danger {
  background: #f14668;
  box-shadow: 0 0 12px #f14668;
}

.status-label {
  font-size: 18px;
  color: #fff;
}

.auth-details {
  margin-bottom: 20px;
}

.auth-details .detail-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.auth-details .detail-row:last-child {
  border-bottom: none;
}

.auth-details .label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

.auth-details .value {
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.auth-details .value.monospace {
  font-family: "JetBrains Mono", monospace;
}

.auth-actions {
  padding-top: 10px;
}

.auth-actions .button {
  margin-bottom: 10px;
}

/* Responsive */
@media (max-width: 768px) {
  .bar-content {
    flex-wrap: wrap;
    padding: 12px 16px;
  }
  .levels-section {
    order: -1;
    width: 100%;
    margin-bottom: 12px;
  }
  .node-inner {
    width: 40px;
    height: 40px;
  }
  .level-connector {
    width: 12px;
  }
  .serve-label {
    display: none;
  }
}

/* ═══ Privy Integration ═══ */

.connect-divider {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  margin: 0 8px;
  user-select: none;
}

.network-badge.privy-badge {
  background: linear-gradient(135deg, #6851ff 0%, #a855f7 100%);
  color: white;
  font-weight: 900;
}

.privy-modal-overlay {
  z-index: 10000;
}

.privy-modal {
  background: #1a1a2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 32px;
  max-width: 380px;
  width: 90vw;
  margin: auto;
}

.privy-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.privy-modal-header h3 {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.privy-subtitle {
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  margin-bottom: 20px;
}

.privy-input {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 15px;
}

.privy-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.privy-input:focus {
  border-color: #6851ff;
  box-shadow: 0 0 0 2px rgba(104, 81, 255, 0.2);
}

.privy-otp-hint {
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  margin-bottom: 12px;
}

.privy-divider {
  display: flex;
  align-items: center;
  margin: 20px 0;
  gap: 12px;
}

.privy-divider::before,
.privy-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}

.privy-divider span {
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
  text-transform: uppercase;
}

.privy-error {
  color: #ff6b6b;
  font-size: 13px;
  text-align: center;
}
</style>

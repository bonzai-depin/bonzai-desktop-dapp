<template>
  <div class="bz-tab-shell">
    <div class="faq-header">
      <h2 class="bz-h1">FAQ</h2>
      <p class="bz-body">Frequently asked questions about BonzAI.</p>
    </div>

    <div class="faq-body">
      <div v-for="q in faqItems" :key="q.id" class="faq-card">
        <div class="faq-q" @click="toggleFaq(q.id)">
          <span class="faq-q__icon material-symbols-outlined">{{ expanded[q.id] ? 'expand_less' : 'expand_more' }}</span>
          <span class="faq-q__text">{{ q.question }}</span>
        </div>
        <Transition name="faq-collapse">
          <div v-if="expanded[q.id]" class="faq-a">
            <p>{{ q.answer }}</p>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive } from "vue";

export default {
  name: "FAQ",
  setup() {
    const expanded = reactive({});

    const toggleFaq = (id) => {
      expanded[id] = !expanded[id];
    };

    const faqItems = [
      {
        id: 1,
        question: "What is BonzAI?",
        answer: "BonzAI is a decentralized, privacy-preserving desktop application that combines AI inference (LLM, image, video, audio, 3D generation) with Web3 blockchain integration. It runs AI models locally on your machine and supports peer-to-peer distributed inference.",
      },
      {
        id: 2,
        question: "Is AI generation free?",
        answer: "Yes, all AI generation (chat, image, video, audio, 3D, training) is completely free at LVL0. The BONZAI level system gates content NFT minting and revenue pool co-ownership, not generation.",
      },
      {
        id: 3,
        question: "What blockchains does BonzAI support?",
        answer: "BonzAI supports Ethereum, Arbitrum, Base, and LUKSO. The main protocol contracts are deployed on Base, content NFTs can be minted on both Base (ERC-721) and LUKSO (LSP8), and the BONZAI token exists on Ethereum, Arbitrum, and Base.",
      },
      {
        id: 4,
        question: "How do P2P modes work?",
        answer: "Private mode runs all inference locally on your machine. Consumer mode uses available peer GPUs at no charge. Provider mode lets you contribute GPU time and earn a share of protocol reward pools.",
      },
      {
        id: 5,
        question: "What are AI Companions?",
        answer: "AI Companions are autonomous AI agents with on-chain identity (ERC-8004 NFTs on Base) and social presence. They can chat, generate content, and operate independently. Each wallet can mint up to 4 companions.",
      },
      {
        id: 6,
        question: "What is the level system?",
        answer: "The level system gates content NFT minting:\nLVL1 (1,000 BONZAI) — Text NFTs\nLVL2 (5,000 BONZAI) — Audio NFTs\nLVL3 (10,000 BONZAI) — Image NFTs\nLVL4 (25,000 BONZAI) — Video NFTs\nLVL5 (33,000 BONZAI) — 3D NFTs\nLVL6 (50,000 BONZAI) — Training NFTs\nAlternatively, a 1 ETH one-time payment unlocks all levels permanently.",
      },
      {
        id: 7,
        question: "What are epoch rewards?",
        answer: "Epoch rewards are your share of the MintPool revenue. BONZAI holders register for weekly epochs, and rewards are distributed proportionally based on your BONZAI holdings. You need at least 1,000 BONZAI in the first pool to participate.",
      },
      {
        id: 8,
        question: "What hardware do I need?",
        answer: "BonzAI runs optimally with 16 GB+ RAM. For larger models (20B+ parameters), 24-32 GB RAM is recommended. A dedicated GPU with 8 GB+ VRAM improves image/video generation speed. Check your system specs in the 'System' modal for your inference budget.",
      },
      {
        id: 9,
        question: "Where are models stored?",
        answer: "Models are stored in ~/bonzai-models/ by default. To use another folder, such as an external drive, open the model picker from the sidebar model indicator and choose Change… next to Models folder. BonzAI can move the models you already downloaded.",
      },
      {
        id: 10,
        question: "How do I get BONZAI tokens?",
        answer: "You can buy BONZAI tokens on Uniswap. Click the 'Connect' button in the sidebar, connect your wallet, and use the buy link. BONZAI is available on Ethereum, Arbitrum, and Base.",
      },
    ];

    return { expanded, toggleFaq, faqItems };
  },
};
</script>

<style scoped>
.faq-header {
  padding: var(--bz-space-5) var(--bz-space-6);
  border-bottom: 1px solid var(--bz-border);
}

.faq-header .bz-h1 { margin: 0; color: var(--bz-fg); }
.faq-header .bz-body { margin: var(--bz-space-2) 0 0; color: var(--bz-fg-low); }

.faq-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--bz-space-4) var(--bz-space-6) var(--bz-space-6);
}

.faq-card {
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
  margin-bottom: var(--bz-space-2);
  overflow: hidden;
}

.faq-q {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-4);
  cursor: pointer;
  user-select: none;
  transition: background var(--bz-dur-fast);
}

.faq-q:hover { background: var(--bz-raised); }

.faq-q__icon {
  font-size: 18px !important;
  color: var(--bz-fg-low);
  flex-shrink: 0;
}

.faq-q__text {
  font-size: var(--bz-size-body);
  font-weight: 500;
  color: var(--bz-fg);
}

.faq-a {
  padding: 0 var(--bz-space-4) var(--bz-space-4);
  padding-left: calc(var(--bz-space-4) + 26px + var(--bz-space-3));
  font-size: var(--bz-size-body);
  color: var(--bz-fg-mid);
  line-height: 1.6;
  white-space: pre-line;
}

.faq-collapse-enter-active,
.faq-collapse-leave-active {
  transition: all 0.2s ease;
}
.faq-collapse-enter-from,
.faq-collapse-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

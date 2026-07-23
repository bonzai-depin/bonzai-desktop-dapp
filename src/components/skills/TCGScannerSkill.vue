<template>
  <div class="tcg-skill">
    <!-- Model Download / Loading Status -->
    <div v-if="modelLoading" class="bz-notice bz-notice--info p-5 mb-4">
      <p class="mb-2">
        <span class="fira-sans-condensed-black-italic is-size-4">
          <button disabled class="bz-iconbtn bz-btn--running"></button>
          {{ downloadStatus || 'Preparing models...' }}
        </span>
        <span class="fira-sans-condensed-black-italic skill-float-right is-size-3">
          {{ downloadProgress }}%
        </span>
      </p>
      <BonzaiPulse variant="bar" :progress="downloadProgress" label="Downloading card analysis models" />
    </div>

    <!-- Model Not Ready Warning -->
    <div v-if="!modelLoading && !modelReady" class="bz-notice bz-notice--warning p-4 mb-4">
      <span class="material-symbols-outlined" style="font-size: 20px">warning</span>
      Models not downloaded.
      <button class="bz-btn bz-btn--sm bz-btn--agent-cta ml-3" @click="ensureModelLoaded">
        <span class="material-symbols-outlined" style="font-size: 16px">download</span>
        Download Models
      </button>
    </div>

    <!-- Status Notification (matches SmartAgent notification style) -->
    <Transition name="notification-slide">
      <div
        v-if="notification.show"
        class="status-notification fira-sans-condensed-black-italic"
        :class="'is-' + notification.type"
      >
        <span class="material-symbols-outlined">
          {{
            notification.type === "success"
              ? "check_circle"
              : notification.type === "danger"
                ? "error"
                : "info"
          }}
        </span>
        {{ notification.message }}
      </div>
    </Transition>

    <div v-if="modelReady" class="tcg-bench-status">
      <div class="tcg-slab-preview" :class="{ 'has-card': !!frontPreview }">
        <img v-if="frontPreview" :src="frontPreview" alt="Card preview" />
        <span v-else class="material-symbols-outlined">style</span>
      </div>
      <div class="tcg-bench-cell">
        <span>Input</span>
        <strong>{{ selectedMode === 'camera' ? 'Camera' : 'File' }}</strong>
      </div>
      <div class="tcg-bench-cell">
        <span>Collection</span>
        <strong>{{ selectedCollectionLabel }}</strong>
      </div>
      <div class="tcg-bench-cell">
        <span>Grade</span>
        <strong>{{ scannedCard?.grading?.grade || 'Pending' }}</strong>
      </div>
      <div class="tcg-bench-cell">
        <span>Market</span>
        <strong>{{ scannedCard?.pricing?.variants?.length || 0 }}</strong>
      </div>
    </div>

    <!-- Image Source Selector (hidden after scan, gated on model ready) -->
    <div v-if="!scannedCard && modelReady" class="tcg-input-row mb-4">
      <span class="category-selector mb-4">
        <template v-for="mode in inputModes" :key="mode.id">
          <input
            type="radio"
            name="input_mode"
            :id="'input_' + mode.id"
            :value="mode.id"
            :checked="selectedMode === mode.id"
            @change="selectedMode = mode.id"
          />
          <label :for="'input_' + mode.id" class="radio category">
            <span
              class="material-symbols-outlined"
              style="font-size: 18px"
            >
              {{ mode.icon }}
            </span>
            {{ mode.label }}
          </label>
        </template>
      </span>
    </div>

    <!-- Collection Selector (gated on model ready) -->
    <div v-if="!scannedCard && modelReady" class="tcg-collection-row mb-4">
      <span class="category-selector collection-grid mb-4">
        <template v-for="col in collections" :key="col.id">
          <input
            type="radio"
            name="collection"
            :id="'col_' + col.id"
            :value="col.id"
            :checked="selectedCollection === col.id"
            @change="selectedCollection = col.id"
          />
          <label :for="'col_' + col.id" class="radio category">
            <span
              class="material-symbols-outlined"
              style="font-size: 18px"
            >
              {{ col.icon }}
            </span>
            {{ col.label }}
          </label>
        </template>
      </span>
    </div>

    <!-- File Selector (front only) -->
    <div v-if="!scannedCard && modelReady && selectedMode === 'file'" class="tcg-capture-bay mb-4">
      <button
        class="bz-btn bz-btn--agent-cta bz-btn--lg skill-fullwidth"
        @click="selectImageFile('front')"
      >
        <span
          class="material-symbols-outlined"
          style="font-size: 20px"
        >
          photo_library
        </span>
        Select Card Image
      </button>
      <div v-if="frontPreview" class="card-thumb-wrap mt-3">
        <img :src="frontPreview" alt="Card" class="card-thumb-img" />
        <button class="delete-thumb" @click.stop="clearImage('front')">
          <span class="material-symbols-outlined" style="font-size: 14px">
            close
          </span>
        </button>
      </div>
    </div>

    <!-- Camera -->
    <div v-if="!scannedCard && modelReady && selectedMode === 'camera'" class="tcg-capture-bay mb-4">
      <div v-if="!cameraActive" class="has-text-centered">
        <button class="bz-btn bz-btn--agent-cta bz-btn--lg" @click="startCamera">
          <span class="material-symbols-outlined" style="font-size: 20px">
            photo_camera
          </span>
          Open Camera
        </button>
        <p
          class="mt-2"
          style="color: rgba(255, 255, 255, 0.4); font-size: 0.8rem"
        >
          Capture card
        </p>
      </div>
      <div v-else class="camera-container">
        <video
          ref="cameraVideo"
          autoplay
          playsinline
          class="camera-preview"
        ></video>
        <div class="camera-controls mt-3 has-text-centered">
          <button
            class="bz-btn bz-btn--agent-cta bz-btn--lg mr-2"
            @click="captureFromCamera"
          >
            <span
              class="material-symbols-outlined"
              style="font-size: 18px"
            >
              camera
            </span>
            Capture
          </button>
          <button class="bz-btn bz-btn--ghost bz-btn--lg" @click="stopCamera">
            <span
              class="material-symbols-outlined"
              style="font-size: 18px"
            >
              close
            </span>
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ RESULTS ═══ -->
    <div v-if="scannedCard" class="tcg-grading-bench skill-panel">
      <!-- Top row: Card image + Identification -->
      <div class="columns is-variable is-4 mb-0">
        <div class="column is-5">
          <div class="card-preview-container">
            <img :src="frontPreview" alt="Card" class="card-preview-image" />
          </div>
        </div>
        <div class="column is-7 has-text-left">
          <!-- Card Title -->
          <h3 class="card-title fira-sans-condensed-black-italic mb-2">
            {{ scannedCard.name || "Unknown Card" }}
          </h3>
          <div v-if="scannedCard.game" class="card-game-badge mb-3">
            <span
              class="material-symbols-outlined"
              style="font-size: 14px"
            >
              playing_cards
            </span>
            {{ scannedCard.game }}
            <span v-if="scannedCard.set" class="ml-2" style="opacity: 0.6">
              &middot; {{ scannedCard.set }}
            </span>
            <span v-if="scannedCard.rarity" class="ml-2" style="opacity: 0.6">
              &middot; {{ scannedCard.rarity }}
            </span>
          </div>

          <!-- Card details (left-aligned, branded labels) -->
          <div v-if="scannedCard.details && scannedCard.details.length" class="card-details has-text-left">
            <div
              v-for="(detail, idx) in scannedCard.details"
              :key="detail.label + idx"
              class="detail-row"
              :class="{
                'detail-sub': detail.label.startsWith(' '),
                'detail-section': /^(Attack\s?\d*|Ability|Pokémon Power|GX Attack|VSTAR Power)$/.test(detail.label.trim()),
              }"
            >
              <span
                class="has-text-brand fira-sans-condensed-black-italic detail-label"
              >
                {{ detail.label.trim() }}
              </span>
              <span class="detail-value">{{ detail.value }}</span>
            </div>
          </div>

          <!-- PGT Grade (inline under card info) -->
          <div v-if="scannedCard.grading" class="grading-panel-inline mt-4">
            <div class="grading-header">
              <h4 class="is-size-5 has-text-brand fira-sans-condensed-black-italic">
                <span
                  class="material-symbols-outlined"
                  style="font-size: 20px"
                >
                  verified
                </span>
                PGT Condition Grade
              </h4>
              <div class="grade-overall">
                <div class="grade-circle" :class="gradeColorClass">
                  <span class="grade-number">{{ scannedCard.grading.grade }}</span>
                </div>
                <div class="grade-meta">
                  <span class="grade-label-text">
                    {{ scannedCard.grading.label }}
                  </span>
                  <span class="grade-score">
                    PGT {{ scannedCard.grading.score }} / 1000
                  </span>
                </div>
              </div>
            </div>

            <div class="sub-grades">
              <div
                v-for="sub in scannedCard.grading.subGrades"
                :key="sub.name"
                class="sub-grade-row"
              >
                <span class="sub-grade-name">{{ sub.name }}</span>
                <div class="sub-grade-bar-track">
                  <div
                    class="sub-grade-bar-fill"
                    :style="{ width: sub.score / 10 + '%' }"
                    :class="subGradeColorClass(sub.score)"
                  ></div>
                </div>
                <span
                  class="sub-grade-value"
                  :class="subGradeColorClass(sub.score)"
                >
                  {{ sub.score }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pricing Panel -->
      <div v-if="scannedCard.pricing" class="pricing-panel mt-4 has-text-left">
        <h4
          class="is-size-4 has-text-brand fira-sans-condensed-black-italic mb-3"
        >
          <span class="has-text-brand">
            <span
              class="material-symbols-outlined"
              style="font-size: 24px"
            >
              payments
            </span>
            Market Prices
          </span>
        </h4>
        <div v-if="scannedCard.pricing.loading" class="price-loading">
          <span
            class="material-symbols-outlined rotating"
            style="font-size: 16px"
          >
            progress_activity
          </span>
          Fetching prices...
        </div>
        <div v-else-if="scannedCard.pricing.error" class="price-error">
          {{ scannedCard.pricing.error }}
        </div>
        <div v-else class="price-grid">
          <div
            v-for="variant in scannedCard.pricing.variants"
            :key="variant.type"
            class="price-card"
          >
            <span class="price-variant">{{ variant.type }}</span>
            <div class="price-values">
              <div class="price-main">
                ${{ variant.market?.toFixed(2) || "—" }}
              </div>
              <div class="price-range">
                <span v-if="variant.low">
                  Low ${{ variant.low.toFixed(2) }}
                </span>
                <span v-if="variant.high">
                  &middot; High ${{ variant.high.toFixed(2) }}
                </span>
              </div>
            </div>
          </div>
          <div v-if="scannedCard.pricing.url" class="price-source mt-2">
            <span style="opacity: 0.5; font-size: 0.75rem">
              Source: pokemontcg.io / TCGPlayer
            </span>
          </div>
        </div>
      </div>

      <!-- OCR Raw Text (collapsible) -->
      <details class="ocr-details mt-4">
        <summary class="ocr-summary">
          <span class="material-symbols-outlined" style="font-size: 16px">
            description
          </span>
          Raw OCR Text
        </summary>
        <pre class="ocr-text">{{ scannedCard.rawText }}</pre>
      </details>

      <!-- Actions -->
      <div class="actions-bar mt-4">

        <button
          class="bz-btn bz-btn--ghost"
          @click="copyResults"
        >
          <span class="material-symbols-outlined">
            content_copy
          </span>
        </button>
        <button class="bz-btn bz-btn--agent-cta" @click="mintCard">
          <span class="material-symbols-outlined" style="font-size: 18px">
            token
          </span>
          Mint
        </button>
        <button class="bz-btn bz-btn--ghost" @click="rescan">
          <span class="material-symbols-outlined" style="font-size: 18px">
            refresh
          </span>
          Re-analyze
        </button>
        <button class="bz-btn bz-btn--destructive skill-float-right" @click="reset">
          <span class="material-symbols-outlined" style="font-size: 18px">
            restart_alt
          </span>
          New Card
        </button>
      </div>
    </div>

    <!-- History -->
    <div v-if="scanHistory.length > 0" class="tcg-history-strip mt-5">
      <hr class="gradient-hr" />
      <h3
        class="is-size-4 has-text-brand fira-sans-condensed-black-italic mb-3"
      >
        <span class="material-symbols-outlined" style="font-size: 22px">
          history
        </span>
        Analysis History
      </h3>
      <div class="history-grid">
        <div
          v-for="(entry, idx) in scanHistory"
          :key="idx"
          class="history-card"
          @click="loadFromHistory(entry)"
        >
          <img :src="entry.thumbnail" alt="Card" class="history-thumb" />
          <div class="history-info">
            <span class="history-name">{{ entry.name || "Unknown Card" }}</span>
            <span class="history-meta">
              {{ entry.date }}
              <span v-if="entry.grade" class="ml-2 history-grade">
                {{ entry.grade }}
              </span>
            </span>
          </div>
          <button class="delete-entry" @click.stop="removeHistory(idx)">
            <span class="material-symbols-outlined" style="font-size: 16px">
              close
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Mint Modal -->
    <MintModal
      v-if="showMintModal"
      :visible="showMintModal"
      inference-type="image"
      :inference-id="mintInferenceId"
      :content="frontPreview"
      content-type="image"
      :prompt="mintPrompt"
      :generation="mintGeneration"
      @close="showMintModal = false"
      @minted="onMinted"
    />

    <canvas ref="processingCanvas" style="display: none"></canvas>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { v4 as uuid } from "uuid";
import { getAuthHeaders } from "../../services/auth.service.js";
import { hasSkillTokenAccess, isDevMode } from "../../services/agent.service.js";
import BonzaiPulse from "../BonzaiPulse.vue";
import MintModal from "../MintModal.vue";

const SKILL_ID = "tcg-analysis-v1.0.0";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const POKEMON_TCG_API = "https://api.pokemontcg.io/v2";

// ─── BonzAI Grading Scale (1000-point, 8 sub-grades) ───────────────
const GRADE_SCALE = [
  { min: 990, grade: "10", label: "Pristine" },
  { min: 950, grade: "10", label: "Gem Mint" },
  { min: 900, grade: "9", label: "Mint" },
  { min: 850, grade: "8.5", label: "NM MT+" },
  { min: 800, grade: "8", label: "NM MT" },
  { min: 750, grade: "7.5", label: "NM+" },
  { min: 700, grade: "7", label: "NM" },
  { min: 650, grade: "6.5", label: "EX MT+" },
  { min: 600, grade: "6", label: "EX MT" },
  { min: 550, grade: "5.5", label: "EX+" },
  { min: 500, grade: "5", label: "EX" },
  { min: 450, grade: "4.5", label: "VG EX+" },
  { min: 400, grade: "4", label: "VG EX" },
  { min: 350, grade: "3.5", label: "VG+" },
  { min: 300, grade: "3", label: "VG" },
  { min: 250, grade: "2.5", label: "Good+" },
  { min: 200, grade: "2", label: "Good" },
  { min: 150, grade: "1.5", label: "Fair" },
  { min: 100, grade: "1", label: "Poor" },
];

function scoreToGrade(score) {
  for (const entry of GRADE_SCALE) {
    if (score >= entry.min) return { grade: entry.grade, label: entry.label };
  }
  return { grade: "1", label: "Poor" };
}

// ─── TCG Card Game Reference Data ───────────────────────────────────
// Provides structural metadata for 7 major TCG systems so the AI knows
// how to parse each card's layout and avoid confusing attack names for card names.
const TCG_REFERENCE = {
  pokemon: {
    game: "Pokémon TCG",
    nameLocation:
      "Top-center of the card in bold. NOT an attack or ability name.",
    structure:
      "Top-left: stage (Basic/Stage 1/Stage 2/ex/VSTAR). Top-center: Pokémon name in bold. Top-right: HP value + energy type icon. Center: illustration. Below art: attacks (energy cost left, name center, damage right) and abilities (red Ability label). Below text box: weakness (type ×2), resistance (type −30), retreat cost (colorless energy icons). Bottom strip: collector number (e.g. 025/198), set symbol, rarity symbol (●◆★), regulation mark letter, illustrator credit.",
    exampleCards: [
      {
        name: "Charizard ex",
        stage: "Stage 2",
        hp: "330",
        type: "Fire",
        attacks: ["Brave Wing 60", "Burning Dark 180+"],
        weakness: "Water ×2",
        resistance: "none",
        retreatCost: "2",
        set: "Obsidian Flames",
        number: "125/197",
        rarity: "Double Rare",
        illustrator: "PLANETA Igarashi",
        regulationMark: "G",
      },
      {
        name: "Pikachu",
        stage: "Basic",
        hp: "60",
        type: "Lightning",
        attacks: ["Thunderbolt 100"],
        weakness: "Fighting ×2",
        resistance: "none",
        retreatCost: "1",
        set: "Base Set",
        number: "025/102",
        rarity: "Rare",
        illustrator: "Mitsuhiro Arita",
        regulationMark: "N/A",
      },
      {
        name: "Kabuto",
        stage: "Stage 1",
        hp: "80",
        type: "Fighting",
        attacks: ["Scratch 10"],
        pokemonPower: "Kabuto Armor — Whenever an attack damages Kabuto, if the attack did Fighting-type damage, reduce it by 10.",
        weakness: "Grass ×2",
        resistance: "none",
        retreatCost: "1",
        set: "Fossil",
        number: "9/62",
        rarity: "Rare",
        regulationMark: "N/A",
        era: "base_wotc",
      },
    ],
  },
  yugioh: {
    game: "Yu-Gi-Oh!",
    nameLocation:
      "Top-left corner in bold. The CARD NAME is the monster/spell/trap name, NOT an effect description.",
    structure:
      "Top-left: card name bold. Top-right: attribute icon (DARK/LIGHT/FIRE/WATER/WIND/EARTH). Below name right-aligned: level stars (orange) or rank stars (yellow). Center: illustration (frame color = card type: orange=Effect, yellow=Normal, purple=Fusion, white=Synchro, black=Xyz, blue=Link, green=Spell, pink=Trap). Below art: type line in brackets [Type/Ability]. Text box: effect text. Bottom-left: ATK/DEF. Bottom-left corner: 8-digit passcode. Bottom-right: set ID code + edition + rarity.",
    exampleCards: [
      {
        name: "Dark Magician",
        attribute: "DARK",
        level: "7",
        monsterType: "[Spellcaster/Normal]",
        atk: "2500",
        def: "2100",
        passcode: "46986414",
        setId: "SDY-006",
        rarity: "Ultra Rare",
        edition: "1st Edition",
        cardCategory: "Normal Monster",
      },
      {
        name: "Blue-Eyes White Dragon",
        attribute: "LIGHT",
        level: "8",
        monsterType: "[Dragon/Normal]",
        atk: "3000",
        def: "2500",
        passcode: "89631139",
        setId: "LOB-001",
        rarity: "Ultra Rare",
        edition: "1st Edition",
        cardCategory: "Normal Monster",
      },
    ],
  },
  mtg: {
    game: "Magic: The Gathering",
    nameLocation:
      "Top-left corner in bold. Separate from mana cost symbols on the right.",
    structure:
      "Top-left: card name bold. Top-right: mana cost symbols (colored circles + generic number). Below name: illustration. Below art thin bar: type line left (e.g. 'Legendary Creature — Human Wizard'), set symbol right (color = rarity: black=Common, silver=Uncommon, gold=Rare, orange=Mythic). Text box: rules text, keywords, flavor text in italics. Bottom-right of text box: power/toughness X/Y for creatures, loyalty for planeswalkers. Bottom border left: collector number + rarity letter. Bottom center: artist credit. Bottom right: set code + copyright.",
    exampleCards: [
      {
        name: "Lightning Bolt",
        manaCost: "{R}",
        cardType: "Instant",
        set: "Alpha",
        rarity: "Common",
        number: "161/295",
        artist: "Christopher Moeller",
        powerToughness: "N/A",
      },
      {
        name: "Sheoldred, the Apocalypse",
        manaCost: "{2}{B}{B}",
        cardType: "Legendary Creature — Phyrexian Praetor",
        set: "Dominaria United",
        rarity: "Mythic Rare",
        number: "107/281",
        artist: "Chris Rahn",
        powerToughness: "4/5",
      },
    ],
  },
  onepiece: {
    game: "One Piece TCG",
    nameLocation:
      "Top-center to top-right in bold. Character name, NOT an effect.",
    structure:
      "Top-left: play cost (large number in colored circle). Top-center/right: card name bold, attribute tags below (e.g. 'Straw Hat Crew'). Top-right: attack attribute icons (Slash/Strike/Ranged/Wisdom/Special). Center: illustration. Left overlay: card type banner (CHARACTER/EVENT/STAGE/LEADER). Text box: effect text with bold keywords [Blocker] [Rush] etc. Bottom-left: power value (large number, Character/Leader only). Bottom-left corner: counter value (+1000/+2000 in shield icon). Bottom strip: collector number (e.g. OP01-001), rarity (C/UC/R/SR/SEC/L), illustrator. Frame color = card color (Red/Green/Blue/Purple/Black/Yellow).",
    exampleCards: [
      {
        name: "Monkey D. Luffy",
        cost: "5",
        cardType: "Leader",
        power: "6000",
        color: "Red",
        attributes: "Straw Hat Crew",
        attackType: "Strike",
        counter: "N/A",
        number: "OP01-003",
        rarity: "L",
        illustrator: "Eiichiro Oda",
      },
      {
        name: "Roronoa Zoro",
        cost: "3",
        cardType: "Character",
        power: "5000",
        color: "Green",
        attributes: "Straw Hat Crew / Supernovas",
        attackType: "Slash",
        counter: "+1000",
        number: "OP01-025",
        rarity: "SR",
        illustrator: "Bandai",
      },
    ],
  },
  lorcana: {
    game: "Disney Lorcana",
    nameLocation:
      "Top-center in bold with subtitle below (e.g. 'Mickey Mouse — True Friend').",
    structure:
      "Top-left: ink cost (large number in hexagonal icon, filled ring = inkable, empty ring = not inkable). Top-center: card name bold + subtitle. Ink type reflected in border color (Amber/Amethyst/Emerald/Ruby/Sapphire/Steel). Center: illustration. Right edge: Strength (sun icon) and Willpower (shield icon) stacked vertically. Below art: type line (Character/Action/Item/Song) + classification tags (e.g. 'Storyborn · Hero · Princess'). Text box: abilities with keywords (Evasive, Bodyguard, Rush, Ward, Shift), flavor text in italics. Bottom-left of text box: Lore value (diamond icon, Character cards). Bottom strip: collector number, rarity gem (none=Common, bronze=Uncommon, silver=Rare, gold=Super Rare, teal=Legendary, special=Enchanted), illustrator, ©Disney.",
    exampleCards: [
      {
        name: "Elsa — Spirit of Winter",
        inkCost: "5",
        inkable: "Yes",
        inkType: "Amethyst",
        cardType: "Character",
        classification: "Storyborn · Hero · Queen",
        strength: "4",
        willpower: "5",
        lore: "2",
        abilities: "Freeze — Exert chosen opposing character",
        number: "42/204",
        rarity: "Legendary",
        illustrator: "Matthew Robert Davies",
        set: "The First Chapter",
      },
      {
        name: "Mickey Mouse — Brave Little Tailor",
        inkCost: "3",
        inkable: "Yes",
        inkType: "Amber",
        cardType: "Character",
        classification: "Storyborn · Hero",
        strength: "3",
        willpower: "3",
        lore: "2",
        abilities: "none",
        number: "1/204",
        rarity: "Uncommon",
        illustrator: "Disney",
        set: "The First Chapter",
      },
    ],
  },
};

export default {
  name: "TCGScannerSkill",
  components: { BonzaiPulse, MintModal },

  props: {
    skill: { type: Object, default: null },
    modelAvailable: { type: [Function, Boolean], default: true },
  },

  emits: ["card-scanned", "status-update"],

  setup(props, { emit }) {
    const processingCanvas = ref(null);
    const cameraVideo = ref(null);

    const selectedMode = ref("file");
    const selectedCollection = ref("pokemon");
    const frontPreview = ref(null);
    const frontBase64 = ref(null);
    const isScanning = ref(false);
    const scanStatus = ref("");
    const modelLoading = ref(false);
    const modelReady = ref(false);
    const cameraActive = ref(false);
    const scannedCard = ref(null);
    const scanHistory = ref([]);

    // Notification state (matches SmartAgent pattern)
    const notification = ref({ show: false, message: "", type: "info" });
    let notifTimer = null;
    function showNotification(message, type = "info", duration = 3000) {
      if (notifTimer) clearTimeout(notifTimer);
      notification.value = { show: true, message, type };
      if (duration > 0) {
        notifTimer = setTimeout(() => {
          notification.value.show = false;
        }, duration);
      }
    }

    // Mint modal state
    const showMintModal = ref(false);
    const mintInferenceId = ref("");
    const mintPrompt = ref("");
    const mintGeneration = ref({});

    let cameraStream = null;

    const inputModes = [
      { id: "file", label: "File", icon: "photo_library" },
      { id: "camera", label: "Camera", icon: "photo_camera" },
    ];

    const collections = [
      { id: "pokemon", label: "Pokémon", icon: "" },
      { id: "yugioh", label: "Yu-Gi-Oh!", icon: "" },
      { id: "mtg", label: "Magic: The Gathering", icon: "" },
      { id: "onepiece", label: "One Piece", icon: "" },
      { id: "lorcana", label: "Lorcana", icon: "" },
    ];

    const selectedCollectionLabel = computed(() => collections.find((c) => c.id === selectedCollection.value)?.label || selectedCollection.value);

    const formattedAnalysis = computed(() => {
      if (!scannedCard.value?.analysis) return "";
      return scannedCard.value.analysis
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br/>");
    });

    const gradeColorClass = computed(() => {
      const g = parseFloat(scannedCard.value?.grading?.grade || "0");
      if (g >= 9) return "grade-pristine";
      if (g >= 7) return "grade-nm";
      if (g >= 5) return "grade-ex";
      return "grade-low";
    });

    function subGradeColorClass(score) {
      if (score >= 900) return "sg-pristine";
      if (score >= 700) return "sg-nm";
      if (score >= 500) return "sg-ex";
      return "sg-low";
    }

    // ─── Model Download & Readiness ─────────────────────────────────
    // TCG Scanner needs two pipelines: "ocr" (GLM-OCR-4bit) and "vision"
    // (Qwen3.5-0.8B VLM). Both must be fully downloaded before scanning.
    // We prefetch both, poll for completion, then set modelReady.
    const downloadProgress = ref(0);
    const downloadStatus = ref("");

    async function prefetchPipeline(pipeline) {
      const res = await fetch(`${API_BASE}/pipelines/prefetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ pipeline, deep_validate: true }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }

    async function pollPipelineComplete(pipelineId) {
      // Poll /downloads/status/:id until completed or failed
      for (let i = 0; i < 300; i++) { // max 5 minutes (300 × 1s)
        await new Promise(r => setTimeout(r, 1000));
        try {
          const res = await fetch(`${API_BASE}/downloads/status/${pipelineId}`, {
            headers: getAuthHeaders(),
          });
          if (!res.ok) continue;
          const data = await res.json();
          // Compute progress from tasks
          const tasks = Object.values(data.tasks || {});
          if (tasks.length) {
            const completed = tasks.filter(t => t.status === "completed").length;
            downloadProgress.value = Math.round((completed / tasks.length) * 100);
          }
          if (data.status === "completed") return true;
          if (data.status === "failed") return false;
        } catch (e) { /* retry */ }
      }
      return false;
    }

    async function ensureModelLoaded() {
      if (modelReady.value || modelLoading.value) return;
      modelLoading.value = true;
      downloadProgress.value = 0;

      try {
        // Prefetch Vision pipeline (Qwen3.5-0.8B — used for both OCR and visual analysis)
        downloadStatus.value = "Downloading Vision model...";
        const visionResult = await prefetchPipeline("vision");
        if (visionResult.status === 202 && visionResult.data?.pipeline_id) {
          const ok = await pollPipelineComplete(visionResult.data.pipeline_id);
          if (!ok) { downloadStatus.value = "Vision download failed"; return; }
        }

        downloadProgress.value = 100;
        downloadStatus.value = "";
        modelReady.value = true;
        console.log("[TCGAnalysis] Vision model ready");
      } catch (e) {
        console.warn("[TCGAnalysis] Model prefetch failed:", e);
        downloadStatus.value = "Download error: " + e.message;
      } finally {
        modelLoading.value = false;
      }
    }

    // ─── File Selection ───────────────────────────────────────────────
    function selectImageFile() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          frontPreview.value = dataUrl;
          frontBase64.value = dataUrl;
          scannedCard.value = null;
          analyzeCard();
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }

    function clearImage() {
      frontPreview.value = null;
      frontBase64.value = null;
      scannedCard.value = null;
    }

    // ─── Camera ───────────────────────────────────────────────────────
    async function startCamera() {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        cameraActive.value = true;
        await new Promise((r) => setTimeout(r, 50));
        if (cameraVideo.value) cameraVideo.value.srcObject = cameraStream;
      } catch (e) {
        console.error("[TCGAnalysis] Camera error:", e);
        showNotification("Camera access denied", "danger");
      }
    }

    function stopCamera() {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
        cameraStream = null;
      }
      cameraActive.value = false;
    }

    function captureFromCamera() {
      if (!cameraVideo.value || !processingCanvas.value) return;
      const video = cameraVideo.value;
      const canvas = processingCanvas.value;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

      frontPreview.value = dataUrl;
      frontBase64.value = dataUrl;
      scannedCard.value = null;
      stopCamera();
      analyzeCard();
    }

    // ─── pokemontcg.io Pricing ────────────────────────────────────────
    async function fetchPricing(cardName, cardGame, cardRarity, collectorNum) {
      if (!cardName || !cardGame?.toLowerCase()?.includes("pok")) {
        return null;
      }
      try {
        // Build query: name is required, add rarity and number if available for precise matching
        let qParts = [`name:"${cardName}"`];
        if (cardRarity) {
          // Normalize rarity names to pokemontcg.io format
          const rarityMap = {
            "common": "Common", "uncommon": "Uncommon", "rare": "Rare",
            "double rare": "Double Rare", "ultra rare": "Ultra Rare",
            "illustration rare": "Illustration Rare", "special art rare": "Special Art Rare",
            "hyper rare": "Hyper Rare", "crown rare": "Crown Rare",
          };
          const normalized = rarityMap[cardRarity.toLowerCase()] || cardRarity;
          qParts.push(`rarity:"${normalized}"`);
        }
        if (collectorNum) {
          qParts.push(`number:"${collectorNum.split("/")[0]}"`);
        }
        const q = encodeURIComponent(qParts.join(" "));
        let url = `${POKEMON_TCG_API}/cards?q=${q}&select=id,name,rarity,tcgplayer,cardmarket,set&pageSize=5`;
        let res = await fetch(url);
        if (!res.ok) return null;
        let data = await res.json();
        let card = data.data?.[0];

        // Fallback: if no match with rarity/number, try name only
        if (!card?.tcgplayer?.prices && qParts.length > 1) {
          const qFallback = encodeURIComponent(`name:"${cardName}"`);
          url = `${POKEMON_TCG_API}/cards?q=${qFallback}&select=id,name,rarity,tcgplayer,cardmarket,set&pageSize=5`;
          res = await fetch(url);
          if (res.ok) {
            data = await res.json();
            card = data.data?.[0];
          }
        }

        if (!card?.tcgplayer?.prices) return null;

        const variants = Object.entries(card.tcgplayer.prices).map(
          ([type, p]) => ({
            type: type
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (s) => s.toUpperCase()),
            low: p.low,
            mid: p.mid,
            high: p.high,
            market: p.market,
          }),
        );

        return {
          variants,
          url: card.tcgplayer?.url || "",
          set: card.set?.name || "",
          rarity: card.rarity || "",
        };
      } catch (e) {
        console.warn("[TCGAnalysis] Pricing fetch failed:", e);
        return null;
      }
    }

    // ─── Grading (PGT — Peer-to-Peer Grading Technology) ──────────────
    function extractScores(text) {
      // Extract all 3-digit numbers (100-999) and 4-digit (1000) from the text
      // Match patterns like "Centering: 850" or "850/1000" or just "850"
      const scores = {};
      const cats = ["centering", "corners", "surface", "edges"];
      for (const cat of cats) {
        // Try "Category: 850" or "Category 850" or "Category - 850"
        const re = new RegExp(cat + "[:\\s\\-]*?(\\d{3,4})\\b", "i");
        const m = text.match(re);
        if (m) {
          const val = parseInt(m[1]);
          if (val >= 100 && val <= 1000) scores[cat] = val;
        }
      }
      // Fallback: if no named scores found, try to grab any 3-digit numbers in order
      if (Object.keys(scores).length === 0) {
        const allNums = [...text.matchAll(/\b(\d{3,4})\b/g)]
          .map(m => parseInt(m[1]))
          .filter(n => n >= 100 && n <= 1000);
        if (allNums.length >= 4) {
          scores.centering = allNums[0];
          scores.corners = allNums[1];
          scores.surface = allNums[2];
          scores.edges = allNums[3];
        } else if (allNums.length > 0) {
          // Use whatever we got
          cats.forEach((cat, i) => {
            if (allNums[i] !== undefined) scores[cat] = allNums[i];
          });
        }
      }
      return scores;
    }

    function parseGrading(frontText) {
      console.log("[PGT] Front grade response:", frontText);

      const frontScores = extractScores(frontText);

      const subGrades = [];
      const cats = [
        { key: "centering", label: "Centering" },
        { key: "corners", label: "Corners" },
        { key: "surface", label: "Surface" },
        { key: "edges", label: "Edges" },
      ];

      for (const cat of cats) {
        if (frontScores[cat.key] !== undefined) {
          subGrades.push({ name: cat.label, score: frontScores[cat.key] });
        }
      }

      if (subGrades.length === 0) return null;

      const avgScore = Math.round(
        subGrades.reduce((s, g) => s + g.score, 0) / subGrades.length,
      );
      const { grade, label } = scoreToGrade(avgScore);

      return { grade, label, score: avgScore, subGrades };
    }

    // ─── Structured Extraction Prompts (per TCG) ──────────────────────
    const EXTRACTION_PROMPTS = {
      pokemon: `You are analyzing a Pokémon TCG card. Extract ALL visible information and reply in KEY: VALUE format, one per line. Use these exact keys:

NAME: (the Pokémon name, including suffixes like ex, V, VSTAR, VMAX, GX)
STAGE: (Basic, Stage 1, Stage 2)
HP: (just the number)
TYPE: (Fire, Water, Grass, Lightning, Psychic, Fighting, Darkness, Metal, Dragon, Fairy, or Colorless)
ABILITY_NAME: (name of the Ability or Pokémon Power, if any)
ABILITY_TEXT: (full effect text of the ability)
ATTACK1_NAME: (first attack name)
ATTACK1_ENERGY: (e.g. "1 Fire, 2 Colorless")
ATTACK1_DAMAGE: (number, or "none")
ATTACK1_EFFECT: (effect text, or "none")
ATTACK2_NAME: (second attack name, if any)
ATTACK2_ENERGY: (energy cost)
ATTACK2_DAMAGE: (number, or "none")
ATTACK2_EFFECT: (effect text, or "none")
WEAKNESS: (e.g. "Water ×2")
RESISTANCE: (e.g. "Fighting −30", or "none")
RETREAT: (number of colorless energy)
COLLECTOR: (format XXX/YYY)
RARITY: (Common, Uncommon, Rare, Double Rare, Ultra Rare, etc.)
REGULATION: (single letter A-I, if present)
ERA: (base_wotc, e_card, ex_ruby_sapphire, diamond_pearl, hgss, bw, xy, sun_moon, sword_shield, or scarlet_violet)
EDITION: (1st Edition or Unlimited, if visible)
FLAVOR: (flavor/Pokédex text, if any)

Only include keys where you can see the value. Skip keys with no visible data.`,

      yugioh: `You are analyzing a Yu-Gi-Oh! TCG card. Extract ALL visible information and reply in KEY: VALUE format, one per line. Use these exact keys:

NAME: (the card name in bold at the top)
ATTRIBUTE: (DARK, LIGHT, FIRE, WATER, WIND, EARTH, DIVINE, SPELL, or TRAP)
LEVEL: (count of star icons, 1-12)
MONSTER_TYPE: (bracketed text like "[Dragon/Effect]")
ATK: (attack value number)
DEF: (defense value number)
LINK_RATING: (Link rating number, if Link monster)
LINK_ARROWS: (active arrow positions, if Link monster)
PEND_SCALE: (Pendulum scale numbers, if Pendulum monster)
PEND_EFFECT: (Pendulum effect text, if Pendulum monster)
EFFECT_TEXT: (card effect or flavor text)
PASSCODE: (8-digit number at bottom-left)
SET_ID: (set code like "ROTD-EN025")
EDITION: (1st Edition or Unlimited)
ERA: (series1_bandai, series2_early, series3_4_psct, series9_pendulum, or series10_plus)

Only include keys where you can see the value. Skip keys with no visible data.`,

      mtg: `You are analyzing a Magic: The Gathering card. Extract ALL visible information and reply in KEY: VALUE format, one per line. Use these exact keys:

NAME: (the card name at top-left)
MANA_COST: (using MTG notation like "{2}{R}{R}")
TYPE_LINE: (e.g. "Legendary Creature — Human Wizard")
RULES_TEXT: (full rules text)
POWER_TOUGHNESS: (format X/Y for creatures)
LOYALTY: (starting loyalty for planeswalkers)
RARITY: (Common, Uncommon, Rare, or Mythic Rare — based on set symbol color)
COLLECTOR: (collector number like "107/281")
SET_CODE: (3-letter set code like "MKM")
HOLOFOIL: (yes or no — silver oval stamp at bottom center)
ERA: (alpha_beta, revised_4th, modern_8th, or m15_current)

Only include keys where you can see the value. Skip keys with no visible data.`,

      onepiece: `You are analyzing a One Piece TCG card. Extract ALL visible information and reply in KEY: VALUE format, one per line. Use these exact keys:

NAME: (character/card name)
COST: (play cost number in circle)
CARD_TYPE: (CHARACTER, EVENT, STAGE, or LEADER)
POWER: (power value in thousands like 5000)
COLOR: (Red, Green, Blue, Purple, Black, or Yellow — from border color)
TRAITS: (slash-separated trait tags like "Straw Hat Crew / Supernovas")
COUNTER: (+1000 or +2000, from shield icon)
EFFECT: (card effect text)
COLLECTOR: (format like OP01-001)
RARITY: (C, UC, R, SR, SEC, L, SP, P, or TR)

Only include keys where you can see the value. Skip keys with no visible data.`,

      lorcana: `You are analyzing a Disney Lorcana card. Extract ALL visible information and reply in KEY: VALUE format, one per line. Use these exact keys:

NAME: (character name at top)
SUBTITLE: (subtitle after em-dash, e.g. "Spirit of Winter")
INK_COST: (number in hexagonal icon)
INKABLE: (yes if ring is filled gold, no if empty outline)
INK_TYPE: (Amber, Amethyst, Emerald, Ruby, Sapphire, or Steel — from border color)
CARD_TYPE: (Character, Action, Item, or Song)
CLASSIFICATION: (dot-separated traits like "Storyborn · Hero · Princess")
STRENGTH: (number in sun/starburst icon)
WILLPOWER: (number in shield icon)
LORE: (number in diamond icon)
COLLECTOR: (format XX/YYY)
RARITY: (Common, Uncommon, Rare, Super Rare, Legendary, or Enchanted)

Only include keys where you can see the value. Skip keys with no visible data.`,
    };

    // ─── Unified Structured Response Parser ─────────────────────────────
    function parseStructured(vlmText) {
      const fields = {};
      for (const line of vlmText.split('\n')) {
        const m = line.match(/^([A-Z][A-Z0-9_]+):\s*(.+)$/);
        if (m) {
          const val = m[2].trim();
          if (val && val.toLowerCase() !== 'n/a' && val !== '-') {
            fields[m[1]] = val;
          }
        }
      }
      return fields;
    }

    // ─── Per-TCG Detail Builders ─────────────────────────────────────────
    function buildPokemonDetails(fields) {
      const details = [];
      if (fields.STAGE) details.push({ label: "Stage", value: fields.STAGE });
      if (fields.HP) details.push({ label: "HP", value: fields.HP.replace(/\D/g, '') });
      if (fields.TYPE) details.push({ label: "Energy Type", value: fields.TYPE.split(/[\s,.]/)[0] });
      if (fields.ERA && fields.ERA !== "scarlet_violet") details.push({ label: "Era", value: fields.ERA.replace(/_/g, " ") });

      // Ability / Pokémon Power
      if (fields.ABILITY_NAME) {
        const isWotc = fields.ERA && ["base_wotc", "e_card"].includes(fields.ERA);
        details.push({ label: isWotc ? "Pokémon Power" : "Ability", value: fields.ABILITY_NAME });
        if (fields.ABILITY_TEXT && fields.ABILITY_TEXT.toLowerCase() !== "none") {
          details.push({ label: " Effect", value: fields.ABILITY_TEXT });
        }
      }

      // Attacks
      for (const i of [1, 2]) {
        const name = fields[`ATTACK${i}_NAME`];
        if (!name) continue;
        const label = fields.ATTACK2_NAME ? `Attack ${i}` : "Attack";
        details.push({ label, value: name });
        if (fields[`ATTACK${i}_ENERGY`]) details.push({ label: " Energy Cost", value: fields[`ATTACK${i}_ENERGY`] });
        const dmg = fields[`ATTACK${i}_DAMAGE`];
        if (dmg && dmg.toLowerCase() !== "none") details.push({ label: " Damage", value: dmg });
        const eff = fields[`ATTACK${i}_EFFECT`];
        if (eff && eff.toLowerCase() !== "none") details.push({ label: " Effect", value: eff });
      }

      if (fields.FLAVOR) details.push({ label: "Description", value: fields.FLAVOR });
      if (fields.WEAKNESS && fields.WEAKNESS.toLowerCase() !== "none") details.push({ label: "Weakness", value: fields.WEAKNESS });
      if (fields.RESISTANCE && fields.RESISTANCE.toLowerCase() !== "none") details.push({ label: "Resistance", value: fields.RESISTANCE });
      details.push({ label: "Retreat Cost", value: fields.RETREAT ? `${fields.RETREAT} Colorless` : "0" });
      if (fields.RARITY) details.push({ label: "Rarity", value: fields.RARITY });
      if (fields.COLLECTOR) details.push({ label: "Collector #", value: fields.COLLECTOR });
      if (fields.REGULATION) details.push({ label: "Regulation Mark", value: fields.REGULATION });
      if (fields.EDITION) details.push({ label: "Edition", value: fields.EDITION });
      return details;
    }

    function buildYugiohDetails(fields) {
      const details = [];
      if (fields.ATTRIBUTE) details.push({ label: "Attribute", value: fields.ATTRIBUTE.split(/[\s,.]/)[0] });
      if (fields.LEVEL) details.push({ label: "Level / Rank", value: fields.LEVEL });
      if (fields.MONSTER_TYPE) details.push({ label: "Monster Type", value: fields.MONSTER_TYPE });
      if (fields.ATK) details.push({ label: "ATK", value: fields.ATK.replace(/\D/g, '') });
      if (fields.DEF) details.push({ label: "DEF", value: fields.DEF.replace(/\D/g, '') });
      if (fields.LINK_RATING) details.push({ label: "LINK", value: fields.LINK_RATING });
      if (fields.LINK_ARROWS) details.push({ label: "Link Arrows", value: fields.LINK_ARROWS });
      if (fields.PEND_SCALE) details.push({ label: "Pendulum Scale", value: fields.PEND_SCALE });
      if (fields.PEND_EFFECT) details.push({ label: "Pendulum Effect", value: fields.PEND_EFFECT });
      if (fields.SET_ID) details.push({ label: "Set ID", value: fields.SET_ID });
      if (fields.EDITION) details.push({ label: "Edition", value: fields.EDITION });
      if (fields.PASSCODE) details.push({ label: "Passcode", value: fields.PASSCODE });
      if (fields.ERA && fields.ERA !== "series10_plus") details.push({ label: "Era", value: fields.ERA.replace(/_/g, " ") });
      return details;
    }

    function buildMtgDetails(fields) {
      const details = [];
      if (fields.TYPE_LINE) details.push({ label: "Card Type", value: fields.TYPE_LINE });
      if (fields.MANA_COST && fields.MANA_COST.toLowerCase() !== "none") details.push({ label: "Mana Cost", value: fields.MANA_COST });
      if (fields.POWER_TOUGHNESS) details.push({ label: "Power / Toughness", value: fields.POWER_TOUGHNESS });
      if (fields.LOYALTY) details.push({ label: "Loyalty", value: fields.LOYALTY });
      if (fields.RARITY) details.push({ label: "Rarity", value: fields.RARITY.split(/[\s,.]/)[0] });
      if (fields.HOLOFOIL) details.push({ label: "Holofoil Stamp", value: /yes/i.test(fields.HOLOFOIL) ? "Present" : "Absent" });
      if (fields.COLLECTOR) details.push({ label: "Collector #", value: fields.COLLECTOR });
      if (fields.SET_CODE) details.push({ label: "Set Code", value: fields.SET_CODE.match(/[A-Z]{3}/)?.[0] || fields.SET_CODE.trim() });
      if (fields.ERA && fields.ERA !== "m15_current") details.push({ label: "Era", value: fields.ERA.replace(/_/g, " ") });
      return details;
    }

    function buildOnepieceDetails(fields) {
      const details = [];
      if (fields.CARD_TYPE) details.push({ label: "Card Type", value: fields.CARD_TYPE.split(/[\s,.]/)[0] });
      if (fields.COST) details.push({ label: "Cost", value: fields.COST });
      if (fields.POWER) details.push({ label: "Power", value: fields.POWER });
      if (fields.COLOR) details.push({ label: "Color", value: fields.COLOR.split(/[\s,.]/)[0] });
      if (fields.TRAITS && fields.TRAITS.toLowerCase() !== "none") details.push({ label: "Traits", value: fields.TRAITS });
      if (fields.COUNTER) details.push({ label: "Counter", value: fields.COUNTER });
      if (fields.RARITY) details.push({ label: "Rarity", value: fields.RARITY });
      if (fields.COLLECTOR) details.push({ label: "Collector #", value: fields.COLLECTOR });
      return details;
    }

    function buildLorcanaDetails(fields) {
      const details = [];
      if (fields.CARD_TYPE) details.push({ label: "Card Type", value: fields.CARD_TYPE.split(/[\s,.]/)[0] });
      if (fields.INK_COST) details.push({ label: "Ink Cost", value: fields.INK_COST });
      details.push({ label: "Inkable", value: fields.INKABLE && /yes/i.test(fields.INKABLE) ? "Yes" : "No" });
      if (fields.INK_TYPE) details.push({ label: "Ink Type", value: fields.INK_TYPE.split(/[\s,.]/)[0] });
      if (fields.CLASSIFICATION && fields.CLASSIFICATION.toLowerCase() !== "none") details.push({ label: "Classification", value: fields.CLASSIFICATION });
      if (fields.STRENGTH) details.push({ label: "Strength", value: fields.STRENGTH });
      if (fields.WILLPOWER) details.push({ label: "Willpower", value: fields.WILLPOWER });
      if (fields.LORE) details.push({ label: "Lore", value: fields.LORE });
      if (fields.RARITY) details.push({ label: "Rarity", value: fields.RARITY.split(/[\s,.]/)[0] });
      if (fields.COLLECTOR) details.push({ label: "Collector #", value: fields.COLLECTOR });
      return details;
    }

    // Fallback zones for zone verification (collector#, rarity — bottom strip)
    const FALLBACK_ZONES = {
      pokemon: { collectorNum: [0.06, 0.88, 0.20, 0.04], rarity: [0.38, 0.88, 0.06, 0.04] },
      yugioh: { passcode: [0.04, 0.88, 0.30, 0.04], setId: [0.55, 0.88, 0.40, 0.04] },
      mtg: { collectorNum: [0.06, 0.88, 0.25, 0.04], setCode: [0.72, 0.88, 0.22, 0.04] },
      onepiece: { collectorNum: [0.04, 0.88, 0.30, 0.04], rarity: [0.38, 0.88, 0.15, 0.04] },
      lorcana: { collectorNum: [0.06, 0.90, 0.25, 0.04], rarity: [0.35, 0.90, 0.15, 0.04] },
    };

    // ─── Main Analysis Pipeline ───────────────────────────────────────
    async function analyzeCard() {
      if (!frontBase64.value || isScanning.value || !modelReady.value) return;
      if (!isDevMode() && !(await hasSkillTokenAccess(SKILL_ID))) {
        console.warn("[TCGScanner] Skill not purchased — execution blocked.");
        return;
      }

      isScanning.value = true;
      showNotification("Analyzing card...", "info", 0);
      emit("status-update", "Analyzing card...");

      try {
        // ─── Phase 1: Structured Full-Card Extraction (1 VLM call) ─────
        const col = selectedCollection.value;
        const extractionPrompt = EXTRACTION_PROMPTS[col];
        if (!extractionPrompt) throw new Error(`Unknown collection: ${col}`);

        showNotification(`Analyzing ${TCG_REFERENCE[col]?.game || col} card...`, "info", 0);
        const structuredRes = await fetch(`${API_BASE}/vision/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            image_base64: frontBase64.value,
            prompt: extractionPrompt,
            max_tokens: 1000,
            auto_download: false,
          }),
        });
        if (!structuredRes.ok) {
          const errBody = await structuredRes.json().catch(() => ({}));
          throw new Error(errBody.error || `Structured extraction failed (HTTP ${structuredRes.status})`);
        }
        const structuredText = (await structuredRes.json()).response || "";
        const rawText = structuredText;
        console.log("[TCGAnalysis] Structured extraction response:", structuredText.substring(0, 800));

        const fields = parseStructured(structuredText);
        console.log("[TCGAnalysis] Parsed fields:", Object.keys(fields).join(", "));

        // ── Canvas ROI cropper (for zone verification) ────────────
        async function cropZone(base64Src, bbox) {
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const sx = Math.round(bbox[0] * img.naturalWidth);
              const sy = Math.round(bbox[1] * img.naturalHeight);
              const sw = Math.max(Math.round(bbox[2] * img.naturalWidth), 1);
              const sh = Math.max(Math.round(bbox[3] * img.naturalHeight), 1);
              const scale = sw < 200 ? Math.ceil(200 / sw) : 1;
              canvas.width = sw * scale;
              canvas.height = sh * scale;
              const ctx = canvas.getContext("2d");
              if (scale > 1) ctx.imageSmoothingQuality = "high";
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL("image/jpeg", 0.95));
            };
            img.onerror = () => resolve(null);
            img.src = base64Src;
          });
        }

        // ── VLM a single cropped zone ──────────
        async function vlmZone(base64Src, bbox, prompt, maxTok = 60) {
          const cropped = await cropZone(base64Src, bbox);
          if (!cropped) return "";
          try {
            const res = await fetch(`${API_BASE}/vision/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...getAuthHeaders() },
              body: JSON.stringify({ image_base64: cropped, prompt, max_tokens: maxTok, auto_download: false }),
            });
            if (res.ok) return ((await res.json()).response || "").trim();
          } catch (e) { console.warn("[TCGAnalysis] Zone VLM failed:", e); }
          return "";
        }

        // ─── Phase 2: Zone Verification (collector# + rarity) ────────
        // Only runs for fields the full-card pass typically misses (tiny bottom-strip text).
        const zones = FALLBACK_ZONES[col] || {};
        const src = frontBase64.value;

        // Verify collector number if Phase 1 missed it
        const collectorKey = col === "yugioh" ? "PASSCODE" : "COLLECTOR";
        if (!fields[collectorKey] && zones.collectorNum) {
          showNotification("Verifying collector number...", "info", 0);
          const collPrompt = col === "yugioh"
            ? "What 8-digit number is printed here? Reply with ONLY the 8 digits, nothing else."
            : col === "onepiece"
              ? "What is the collector number? Format: OPXX-XXX (e.g. OP01-001). Reply with ONLY the code, nothing else."
              : "What is the collector number shown? Format: XXX/YYY. Reply with ONLY the number, nothing else.";
          const collText = await vlmZone(src, zones.collectorNum, collPrompt, 15);
          if (collText) {
            if (col === "yugioh") {
              const m = collText.match(/(\d{8})/);
              if (m) fields.PASSCODE = m[1];
            } else if (col === "onepiece") {
              const m = collText.match(/(OP\d{2}-\d{3})/i);
              if (m) fields.COLLECTOR = m[1];
            } else {
              const m = collText.match(/(\d{1,3}\s*\/\s*\d{1,3})/);
              if (m) fields.COLLECTOR = m[0].replace(/\s/g, "");
            }
          }
        }
        // Verify set ID for Yu-Gi-Oh! if missed
        if (col === "yugioh" && !fields.SET_ID && zones.setId) {
          const setIdText = await vlmZone(src, zones.setId, "What is the set ID code printed here? Format like 'ROTD-EN025'. Reply with ONLY the code, nothing else.", 20);
          const m = setIdText?.match(/([A-Z0-9]{2,5}-[A-Z]{2}\d{2,4})/i);
          if (m) fields.SET_ID = m[0];
        }

        // Verify rarity if Phase 1 missed it
        if (!fields.RARITY && zones.rarity) {
          showNotification("Verifying rarity...", "info", 0);
          const rarityPrompt = col === "pokemon"
            ? "What rarity symbol is shown? Reply with ONE of: Common, Uncommon, Rare, Double Rare, Ultra Rare, Illustration Rare, Special Art Rare, Hyper Rare, Crown Rare. Reply with ONLY the rarity name."
            : col === "onepiece"
              ? "What rarity letter code is shown? Reply with ONLY one of: C, UC, R, SR, SEC, L, SP, P, TR."
              : col === "lorcana"
                ? "What color is the small gem icon? Reply: Common, Uncommon, Rare, Super Rare, Legendary, or Enchanted."
                : "What is the rarity? Reply with ONLY the rarity name.";
          const rarityText = await vlmZone(src, zones.rarity, rarityPrompt, 20);
          if (rarityText && !/^none$/i.test(rarityText.trim())) {
            fields.RARITY = rarityText.replace(/[()●◆★]/g, "").trim();
          }
        }

        console.log("[TCGAnalysis] After zone verification:", Object.keys(fields).join(", "));

        // ─── Build details from parsed fields ─────────────────────────
        let cardName = "";
        let cardGame = TCG_REFERENCE[col]?.game || "";
        let cardSet = "";
        let cardRarity = fields.RARITY || "";
        let cardEra = fields.ERA || "";
        let details = [];

        if (col === "pokemon") {
          cardName = fields.NAME || "";
          details = buildPokemonDetails(fields);
        } else if (col === "yugioh") {
          cardName = fields.NAME || "";
          details = buildYugiohDetails(fields);
        } else if (col === "mtg") {
          cardName = fields.NAME || "";
          details = buildMtgDetails(fields);
        } else if (col === "onepiece") {
          cardName = fields.NAME || "";
          details = buildOnepieceDetails(fields);
        } else if (col === "lorcana") {
          cardName = fields.SUBTITLE
            ? `${(fields.NAME || "").trim()} — ${fields.SUBTITLE.trim()}`
            : (fields.NAME || "").trim();
          details = buildLorcanaDetails(fields);
        }

        // Final card name fallback
        if (!cardName) {
          cardName = "Unknown Card";
        }

        console.log("[TCGAnalysis] Extracted — Name:", cardName, "| Details:", details.length, "fields");

        // Step 3: PGT Condition grading
        showNotification("Grading condition...", "info", 0);
        const sideGradePrompt = `Grade this trading card's physical condition. Use a scale from 100 (poor) to 1000 (pristine). A new card from a sealed pack is typically 850 to 950.

Reply ONLY with these 4 lines, nothing else:
Centering: 850
Corners: 900
Surface: 875
Edges: 860

Replace the example numbers with your actual scores based on what you see. Check: border alignment (centering), corner sharpness vs wear (corners), scratches or print defects (surface), edge whitening or chips (edges).`;

        let frontGradeText = "";
        const frontGradeRes = await fetch(`${API_BASE}/vision/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            image_base64: frontBase64.value,
            prompt: sideGradePrompt,
            max_tokens: 200,
            auto_download: false,
          }),
        });
        if (frontGradeRes.ok) {
          frontGradeText = (await frontGradeRes.json()).response || "";
        }

        const grading = parseGrading(frontGradeText);

        // Build result
        scannedCard.value = {
          name: cardName,
          game: cardGame,
          set: cardSet,
          rarity: cardRarity,
          era: cardEra,
          rawText,
          analysis: details.map(d => `${d.label}: ${d.value}`).join("\n"),
          details,
          grading,
          pricing: { loading: true },
        };

        // Step 4: Fetch pricing (async) — use rarity + collector# for precise matching
        showNotification("Fetching market prices...", "info", 0);
        const collNum = details.find(d => d.label === "Collector #")?.value || "";
        const pricingData = await fetchPricing(cardName, cardGame, cardRarity, collNum);
        if (pricingData) {
          scannedCard.value = {
            ...scannedCard.value,
            set: scannedCard.value.set || pricingData.set,
            rarity: scannedCard.value.rarity || pricingData.rarity,
            pricing: pricingData,
          };
        } else {
          scannedCard.value = {
            ...scannedCard.value,
            pricing: cardGame?.toLowerCase()?.includes("pok")
              ? { error: "Card not found on pokemontcg.io" }
              : { error: "Pricing available for Pokémon TCG only" },
          };
        }

        // Save to history
        const thumbnail = createThumbnail();
        scanHistory.value.unshift({
          name: cardName,
          grade: grading ? `${grading.grade} ${grading.label}` : null,
          rawText,
          analysis: scannedCard.value.analysis,
          details,
          grading,
          pricing: scannedCard.value.pricing,
          game: cardGame,
          set: cardSet,
          rarity: cardRarity,
          era: cardEra,
          thumbnail,
          fullImage: frontPreview.value,
          frontBase64: frontBase64.value,
          date: new Date().toLocaleDateString(),
        });
        if (scanHistory.value.length > 20) scanHistory.value.pop();
        saveHistory();

        showNotification("Analysis complete!", "success");
        emit("card-scanned", scannedCard.value);
      } catch (e) {
        console.error("[TCGAnalysis] Analysis failed:", e);
        showNotification("Analysis failed: " + e.message, "danger");
        scannedCard.value = {
          name: "Analysis Error",
          rawText: e.message,
          analysis: null,
          details: [],
          grading: null,
          pricing: null,
        };
      } finally {
        isScanning.value = false;
        emit("status-update", "");
      }
    }

    function createThumbnail() {
      if (!processingCanvas.value || !frontPreview.value)
        return frontPreview.value;
      const canvas = processingCanvas.value;
      const img = new Image();
      img.src = frontPreview.value;
      const maxSize = 120;
      const w = img.naturalWidth || 120;
      const h = img.naturalHeight || 160;
      const ratio = Math.min(maxSize / w, maxSize / h);
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.6);
    }

    // ─── Mint ───────────────────────────────────────────────────────────
    function mintCard() {
      if (!scannedCard.value) return;
      const c = scannedCard.value;
      const g = c.grading;
      mintInferenceId.value = uuid();
      mintPrompt.value = `TCG Analysis: ${c.name || "Unknown Card"} (${c.game || "Unknown Game"})`;

      // Build comprehensive metadata for the NFT
      const metadata = {
        cardName: c.name,
        cardGame: c.game,
        set: c.set,
        rarity: c.rarity,
        analysis: c.analysis,
        rawOcrText: c.rawText,
        details: c.details,
      };
      if (g) {
        metadata.grading = {
          grade: g.grade,
          label: g.label,
          score: g.score,
          subGrades: g.subGrades,
        };
      }
      if (c.pricing?.variants) {
        metadata.pricing = {
          variants: c.pricing.variants,
          source: "pokemontcg.io",
        };
      }

      mintGeneration.value = {
        type: "tcg-analysis",
        metadata,
      };

      showMintModal.value = true;
    }

    function onMinted(result) {
      showMintModal.value = false;
      showNotification("Card analysis minted as NFT!", "success");
    }

    // ─── Actions ──────────────────────────────────────────────────────
    function rescan() {
      scannedCard.value = null;
      analyzeCard();
    }
    function reset() {
      frontPreview.value = null;
      frontBase64.value = null;
      scannedCard.value = null;
      stopCamera();
    }

    function loadFromHistory(entry) {
      frontPreview.value = entry.fullImage || entry.thumbnail;
      frontBase64.value =
        entry.frontBase64 || entry.fullImage || entry.thumbnail;
      scannedCard.value = {
        name: entry.name,
        game: entry.game,
        set: entry.set,
        rarity: entry.rarity,
        rawText: entry.rawText,
        analysis: entry.analysis,
        details: entry.details || [],
        grading: entry.grading,
        pricing: entry.pricing,
      };
    }

    function removeHistory(idx) {
      scanHistory.value.splice(idx, 1);
      saveHistory();
    }

    async function copyResults() {
      if (!scannedCard.value) return;
      const c = scannedCard.value;
      const g = c.grading;
      const lines = [
        `Card: ${c.name}`,
        c.game ? `Game: ${c.game}` : "",
        c.set ? `Set: ${c.set}` : "",
        c.rarity ? `Rarity: ${c.rarity}` : "",
      ];
      if (g) {
        lines.push(
          "",
          `PGT Grade: ${g.grade} ${g.label} (PGT ${g.score}/1000)`,
          "Sub-Grades:",
        );
        g.subGrades.forEach((s) => lines.push(` ${s.name}: ${s.score}`));
      }
      if (c.pricing?.variants) {
        lines.push("", "Market Prices:");
        c.pricing.variants.forEach((v) =>
          lines.push(` ${v.type}: $${v.market?.toFixed(2) || "—"}`),
        );
      }
      if (c.analysis) lines.push("", "Analysis:", c.analysis);
      lines.push("", "OCR Text:", c.rawText);
      try {
        await navigator.clipboard.writeText(
          lines.filter((l) => l !== undefined).join("\n"),
        );
        showNotification("Report copied to clipboard", "success");
      } catch (e) {
        /* */
      }
    }

    // ─── Persistence ──────────────────────────────────────────────────
    const STORE_KEY = "tcg-analysis-history";
    async function loadHistory() {
      try {
        const stored = await window.electronAPI?.storeGet(STORE_KEY);
        if (Array.isArray(stored)) scanHistory.value = stored;
      } catch (e) {
        /* */
      }
    }
    async function saveHistory() {
      try {
        await window.electronAPI?.storeSet(STORE_KEY, scanHistory.value);
      } catch (e) {
        /* */
      }
    }

    onMounted(() => {
      ensureModelLoaded();
      loadHistory();
    });
    onUnmounted(() => {
      stopCamera();
      if (notifTimer) clearTimeout(notifTimer);
    });

    return {
      processingCanvas,
      cameraVideo,
      selectedMode,
      selectedCollection,
      selectedCollectionLabel,
      inputModes,
      collections,
      frontPreview,
      frontBase64,
      isScanning,
      scanStatus,
      modelLoading,
      modelReady,
      cameraActive,
      scannedCard,
      scanHistory,
      notification,
      formattedAnalysis,
      gradeColorClass,
      subGradeColorClass,
      selectImageFile,
      clearImage,
      startCamera,
      stopCamera,
      captureFromCamera,
      analyzeCard,
      rescan,
      reset,
      mintCard,
      onMinted,
      showMintModal,
      mintInferenceId,
      mintPrompt,
      mintGeneration,
      loadFromHistory,
      removeHistory,
      copyResults,
      showNotification,
      downloadProgress,
      downloadStatus,
      ensureModelLoaded,
    };
  },
};
</script>

<style scoped>
/* Design-system compatibility layer for migrated skill workflow surfaces. */
.skill-panel {
  padding: var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r) !important;
  color: var(--bz-fg);
}
.skill-panel + .skill-panel,
.analysis-history .skill-panel + .skill-panel {
  margin-top: var(--bz-space-5);
}
.skill-card {
  padding: var(--bz-space-4);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
}
.skill-title-row {
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-4);
}
.skill-title-icon,
.skill-name .material-symbols-outlined {
  color: var(--bz-purple-300) !important;
  font-size: 42px !important;
  line-height: 1;
}
.skill-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  min-height: 24px;
  padding: 2px var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: 1.2;
}
.skill-chip--brand { background: var(--bz-purple-soft); border-color: var(--bz-border-brand); color: var(--bz-fg); }
.skill-chip--success { background: var(--bz-emerald-soft); border-color: var(--bz-emerald-500); color: var(--bz-emerald-300); }
.skill-chip--warning { background: var(--bz-warning-soft); border-color: var(--bz-warning); color: var(--bz-warning); }
.skill-chip--info { background: var(--bz-info-soft); border-color: var(--bz-info); color: var(--bz-info); }
.skill-chip--danger { background: var(--bz-danger-soft); border-color: var(--bz-danger); color: var(--bz-danger); }
.skill-input,
.config-input {
  width: 100%;
  height: 40px;
  padding: 0 var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  font: inherit;
}
.skill-input--sm { height: 32px; }
.skill-input:focus,
.config-input:focus {
  outline: none;
  border-color: var(--bz-border-brand);
}
.skill-textarea {
  width: 100%;
  min-height: 120px;
  padding: var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  font: inherit;
}
.skill-unit {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
  color: var(--bz-fg-low);
  pointer-events: none;
}
.skill-fullwidth { width: 100%; }
.skill-progress {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border: 0;
  border-radius: var(--bz-r-pill);
  background: var(--bz-canvas);
}
.skill-progress::-webkit-progress-value { background: var(--bz-gradient-brand); }
.bz-btn--running { opacity: 0.72; }

/* ─── Shared Skill Styles ─────────────────────────────────────────── */
.skill-panel {
  padding: 2em;
  border: 1px solid var(--bz-border);
  border-radius: 12px;
}
.skill-name {
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
  -webkit-text-fill-color: transparent;
}
.has-text-brand {
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
  -webkit-text-fill-color: transparent;
}
.skill-description {
  color: var(--bz-fg-mid);
  text-align: left;
}
.rotating {
  animation: bz-spin 1s linear infinite;
}
@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.gradient-hr {
  border: none;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(155, 109, 200, 0.4),
    rgba(255, 153, 51, 0.3),
    transparent
  );
  margin: 1.5rem 0;
}

/* ─── Category Selector (same as VideoCaptioning) ────────────────── */
.category-selector {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5em;
}
.category-selector input[type="radio"] {
  display: none;
}
.category-selector input[type="radio"] + label.radio.category {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 14px;
  background: transparent;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  color: var(--bz-fg-faint);
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}
.category-selector input[type="radio"] + label.radio.category:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg-mid);
}
.category-selector input[type="radio"]:checked + label.radio.category {
  color: var(--bz-control-selected-fg);
  border: 1px solid var(--bz-control-selected-border);
  background: var(--bz-control-selected-bg);
}

/* ─── Collection Selector (5-col grid) ───────────────────────────── */
.collection-grid {
  grid-template-columns: repeat(5, 1fr);
}
@media (max-width: 768px) {
  .collection-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* ─── Inline Grading Panel (inside card info column) ─────────────── */
.grading-panel-inline {
  background: rgba(10, 5, 20, 0.4);
  border: 1px solid rgba(155, 109, 200, 0.15);
  border-radius: 12px;
  padding: 1rem 1.25rem;
}
.grading-panel-inline .grading-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.grading-panel-inline .grade-overall {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.grading-panel-inline .grade-circle {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 1.2rem;
}
.grading-panel-inline .sub-grades {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.grading-panel-inline .sub-grade-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.grading-panel-inline .sub-grade-name {
  width: 110px;
  font-size: 0.72rem;
  color: var(--bz-fg-mid);
  flex-shrink: 0;
}

/* ─── Model Status ────────────────────────────────────────────────── */
.model-status-bar {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(155, 109, 200, 0.08);
  border: 1px solid rgba(155, 109, 200, 0.2);
  border-radius: 8px;
  color: var(--bz-fg-mid);
  font-size: 0.85rem;
}

/* ─── Status Notification (matches SmartAgent notification style) ── */
.status-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  padding: 1em 1.5em;
  border-radius: 8px;
  display: flex;
  align-items: center;
  color: var(--bz-fg);
  box-shadow: 0 4px 20px var(--bz-scrim);
}
.status-notification.is-info {
  background: rgba(62, 142, 208, 0.95);
}
.status-notification.is-success {
  background: rgba(57, 213, 130, 0.95);
}
.status-notification.is-danger {
  background: rgba(255, 56, 96, 0.95);
}

.notification-slide-enter-active {
  animation: notification-fade-slide-in 0.4s ease-out;
}
.notification-slide-leave-active {
  animation: notification-fade-slide-out 0.4s ease-in;
}
@keyframes notification-fade-slide-in {
  0% {
    opacity: 0;
    transform: translateX(100px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}
@keyframes notification-fade-slide-out {
  0% {
    opacity: 1;
    transform: translateX(0);
  }
  100% {
    opacity: 0;
    transform: translateX(100px);
  }
}

/* ─── Card Thumb Previews ────────────────────────────────────────── */
.card-thumb-wrap {
  position: relative;
  display: inline-block;
}
.card-thumb-img {
  margin-top: 1em;
  min-width: 100%;
  border-radius: 8px;
  border: 1px solid rgba(155, 109, 200, 0.2);
}

.delete-thumb {
  position: absolute;
  top: 1em;
  right: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 56, 96, 0.9);
  border: none;
  color: var(--bz-fg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ─── Card Preview ───────────────────────────────────────────────── */
.card-preview-container {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(155, 109, 200, 0.2);
  background: rgba(10, 5, 20, 0.4);
}
.card-preview-image {
  width: 100%;
  display: block;
  border-radius: 12px;
}

/* ─── Card Title & Badge ──────────────────────────────────────────── */
.card-title {
  font-size: 2rem;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
  -webkit-text-fill-color: transparent;
}
.card-game-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.8rem;
  background: rgba(155, 109, 200, 0.1);
  border: 1px solid rgba(155, 109, 200, 0.25);
  border-radius: 20px;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.75);
}

/* ─── Card Details (left-aligned, branded labels) ────────────────── */
.card-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.detail-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.detail-row.detail-sub {
  padding-left: 1.2rem;
  opacity: 0.85;
}
.detail-row.detail-section {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--bz-card);
}
.detail-label {
  font-size: 0.8rem;
  min-width: 100px;
  flex-shrink: 0;
}
.detail-value {
  font-size: 0.85rem;
  color: var(--bz-fg);
}

/* ─── Analysis Panel ──────────────────────────────────────────────── */
.analysis-panel {
  background: rgba(10, 5, 20, 0.35);
  border: 1px solid rgba(155, 109, 200, 0.12);
  border-radius: 10px;
  padding: 1rem 1.25rem;
}
.analysis-content {
  color: var(--bz-fg);
  font-size: 0.85rem;
  line-height: 1.7;
  max-height: 320px;
  overflow-y: auto;
}
.analysis-content :deep(strong) {
  color: rgba(155, 109, 200, 0.9);
  font-weight: 600;
}

/* ─── Grading Panel ───────────────────────────────────────────────── */
.grading-panel {
  background: rgba(10, 5, 20, 0.4);
  border: 1px solid rgba(155, 109, 200, 0.15);
  border-radius: 12px;
  padding: 1.5rem;
}
.grading-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.grade-overall {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.grade-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 1.4rem;
}
.grade-circle.grade-pristine {
  background: linear-gradient(
    135deg,
    rgba(34, 197, 94, 0.2),
    rgba(34, 197, 94, 0.05)
  );
  border: 2px solid rgba(34, 197, 94, 0.6);
  color: rgb(34, 197, 94);
}
.grade-circle.grade-nm {
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.2),
    rgba(59, 130, 246, 0.05)
  );
  border: 2px solid rgba(59, 130, 246, 0.6);
  color: rgb(59, 130, 246);
}
.grade-circle.grade-ex {
  background: linear-gradient(
    135deg,
    rgba(234, 179, 8, 0.2),
    rgba(234, 179, 8, 0.05)
  );
  border: 2px solid rgba(234, 179, 8, 0.6);
  color: rgb(234, 179, 8);
}
.grade-circle.grade-low {
  background: linear-gradient(
    135deg,
    rgba(239, 68, 68, 0.2),
    rgba(239, 68, 68, 0.05)
  );
  border: 2px solid rgba(239, 68, 68, 0.6);
  color: rgb(239, 68, 68);
}
.grade-meta {
  display: flex;
  flex-direction: column;
}
.grade-label-text {
  font-size: 1rem;
  font-weight: 700;
  color: var(--bz-fg);
}
.grade-score {
  font-size: 0.78rem;
  color: var(--bz-fg-low);
  margin-top: 2px;
}
.grade-number {
  font-family: inherit;
}

/* Sub-grades */
.sub-grades {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sub-grade-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.sub-grade-name {
  width: 120px;
  font-size: 0.78rem;
  color: var(--bz-fg-mid);
  flex-shrink: 0;
}
.sub-grade-bar-track {
  flex: 1;
  height: 6px;
  background: var(--bz-canvas);
  border-radius: 3px;
  overflow: hidden;
}
.sub-grade-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s ease;
}
.sub-grade-bar-fill.sg-pristine {
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.6), rgb(34, 197, 94));
}
.sub-grade-bar-fill.sg-nm {
  background: linear-gradient(
    90deg,
    rgba(59, 130, 246, 0.6),
    rgb(59, 130, 246)
  );
}
.sub-grade-bar-fill.sg-ex {
  background: linear-gradient(90deg, rgba(234, 179, 8, 0.6), rgb(234, 179, 8));
}
.sub-grade-bar-fill.sg-low {
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.6), rgb(239, 68, 68));
}
.sub-grade-value {
  width: 36px;
  text-align: right;
  font-size: 0.78rem;
  font-weight: 600;
  flex-shrink: 0;
}
.sub-grade-value.sg-pristine {
  color: rgb(34, 197, 94);
}
.sub-grade-value.sg-nm {
  color: rgb(59, 130, 246);
}
.sub-grade-value.sg-ex {
  color: rgb(234, 179, 8);
}
.sub-grade-value.sg-low {
  color: rgb(239, 68, 68);
}

/* ─── Pricing Panel ───────────────────────────────────────────────── */
.pricing-panel {
  background: rgba(10, 5, 20, 0.4);
  border: 1px solid rgba(155, 109, 200, 0.15);
  border-radius: 12px;
  padding: 1.5rem;
}
.price-loading,
.price-error {
  font-size: 0.85rem;
  color: var(--bz-fg-low);
  display: flex;
  align-items: center;
}
.price-error {
  color: rgba(255, 200, 150, 0.6);
}
.price-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.price-card {
  flex: 1;
  min-width: 160px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--bz-canvas);
  border-radius: 10px;
  padding: 0.75rem 1rem;
}
.price-variant {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(155, 109, 200, 0.7);
}
.price-main {
  font-size: 1.4rem;
  font-weight: 800;
  color: rgba(34, 197, 94, 0.9);
  margin: 0.25rem 0;
}
.price-range {
  font-size: 0.72rem;
  color: var(--bz-fg-low);
}

/* ─── OCR Details ─────────────────────────────────────────────────── */
.ocr-details {
  background: rgba(10, 5, 20, 0.3);
  border: 1px solid var(--bz-canvas);
  border-radius: 10px;
}
.ocr-summary {
  padding: 0.75rem 1rem;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--bz-fg-low);
  display: flex;
  align-items: center;
  list-style: none;
}
.ocr-summary::-webkit-details-marker {
  display: none;
}
.ocr-summary::before {
  content: "\25B6";
  margin-right: 0.5rem;
  font-size: 0.6rem;
  transition: transform 0.2s;
}
details[open] .ocr-summary::before {
  transform: rotate(90deg);
}
.ocr-text {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.65);
  background: var(--bz-scrim-soft);
  padding: 0.75rem 1rem;
  margin: 0;
  border-top: 1px solid var(--bz-canvas);
  max-height: 200px;
  overflow-y: auto;
}

/* ─── Actions ─────────────────────────────────────────────────────── */
.actions-bar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* ─── Camera ──────────────────────────────────────────────────────── */
.camera-container {
  max-width: 640px;
}
.camera-preview {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(155, 109, 200, 0.2);
  background: #000;
}

/* ─── History ─────────────────────────────────────────────────────── */
.history-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.history-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--bz-canvas);
  cursor: pointer;
  transition: all 0.2s ease;
}
.history-card:hover {
  background: rgba(155, 109, 200, 0.1);
  border-color: rgba(155, 109, 200, 0.3);
}
.history-card:hover .delete-entry {
  opacity: 1;
}
.history-thumb {
  width: 48px;
  height: 64px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}
.history-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.history-name {
  font-size: 0.85rem;
  color: var(--bz-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-meta {
  font-size: 0.75rem;
  color: var(--bz-fg-low);
  margin-top: 2px;
}
.history-grade {
  color: rgba(155, 109, 200, 0.8);
  font-weight: 600;
}
.delete-entry {
  opacity: 0;
  background: none;
  border: none;
  color: rgba(255, 80, 80, 0.7);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.delete-entry:hover {
  color: rgba(255, 80, 80, 1);
  background: rgba(255, 80, 80, 0.1);
}

/* Agentic redesign: Grading Bench */
.tcg-input-row,
.tcg-collection-row,
.tcg-capture-bay {
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
}
.tcg-input-row .category-selector,
.tcg-collection-row .category-selector {
  margin-bottom: 0 !important;
}
.tcg-collection-row .collection-grid {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}
.tcg-capture-bay {
  display: grid;
  place-items: center;
  min-height: 300px;
  background:
    radial-gradient(circle at 50% 20%, rgba(250, 173, 20, 0.12), transparent 34%),
    var(--bz-canvas);
}
.tcg-capture-bay .skill-fullwidth {
  max-width: 420px;
}
.tcg-grading-bench {
  background: var(--bz-panel);
}
.tcg-grading-bench > .columns {
  display: grid;
  grid-template-columns: minmax(280px, 0.75fr) minmax(0, 1.25fr);
  gap: var(--bz-space-5);
  margin: 0;
}
.tcg-grading-bench > .columns > .column {
  width: auto;
  padding: 0;
}
.card-preview-container {
  min-height: 520px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.06), transparent),
    var(--bz-canvas);
}
.grading-panel-inline,
.pricing-panel,
.ocr-details {
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-canvas);
  padding: var(--bz-space-4);
}
.actions-bar {
  display: flex;
  justify-content: flex-end;
  gap: var(--bz-space-2);
  flex-wrap: wrap;
}
.tcg-history-strip {
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
}
.tcg-history-strip .history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}
@media (max-width: 980px) {
  .tcg-grading-bench > .columns {
    grid-template-columns: 1fr;
  }
}


/* Signature upgrade: card grading intake instrument */
.tcg-bench-status {
  display: grid;
  grid-template-columns: 92px repeat(4, minmax(120px, 1fr));
  gap: var(--bz-space-3);
  align-items: stretch;
  margin-bottom: var(--bz-space-4);
}
.tcg-slab-preview,
.tcg-bench-cell {
  min-height: 92px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
}
.tcg-slab-preview {
  display: grid;
  place-items: center;
  overflow: hidden;
}
.tcg-slab-preview img { width: 100%; height: 100%; object-fit: cover; }
.tcg-slab-preview .material-symbols-outlined { color: var(--bz-warning); font-size: 34px; }
.tcg-bench-cell {
  padding: var(--bz-space-4);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.tcg-bench-cell span {
  color: var(--bz-fg-low);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.tcg-bench-cell strong {
  color: var(--bz-fg);
  font-size: 20px;
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.tcg-input-row,
.tcg-collection-row {
  display: grid;
  align-items: center;
}
@media (max-width: 980px) {
  .tcg-bench-status { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

</style>

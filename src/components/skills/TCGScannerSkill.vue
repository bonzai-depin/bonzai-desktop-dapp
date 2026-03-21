<template>
  <div class="tcg-skill">
    <!-- Header -->
    <div class="models__activity--payouts mb-4 has-text-left">
      <h2 class="skill-name is-size-1 fira-sans-condensed-black-italic mb-2">
        <span class="material-symbols-outlined" style="font-size: 48px">
          style
        </span>
        Trading Card Game Analysis
      </h2>
      <p class="skill-description is-size-5">
        {{
          skill?.description ||
          "AI-powered card identification, PGT condition grading, and live market pricing."
        }}
      </p>
    </div>

    <!-- Model Download / Loading Status -->
    <div v-if="modelLoading" class="notification is-info p-5 mb-4">
      <p class="mb-2">
        <span class="fira-sans-condensed-black-italic is-size-4">
          <button disabled class="button is-loading is-info is-small mr-2 p-4"></button>
          {{ downloadStatus || 'Preparing models...' }}
        </span>
        <span class="fira-sans-condensed-black-italic is-pulled-right is-size-3">
          {{ downloadProgress }}%
        </span>
      </p>
      <progress class="progress is-success is-large" :value="downloadProgress" max="100">
        {{ downloadProgress }}%
      </progress>
    </div>

    <!-- Model Not Ready Warning -->
    <div v-if="!modelLoading && !modelReady" class="notification is-warning p-4 mb-4">
      <span class="material-symbols-outlined mr-2" style="font-size: 20px">warning</span>
      Models not downloaded.
      <button class="button is-small is-warning ml-3" @click="ensureModelLoaded">
        <span class="material-symbols-outlined mr-1" style="font-size: 16px">download</span>
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
        <span class="material-symbols-outlined mr-2">
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

    <!-- Image Source Selector (hidden after scan, gated on model ready) -->
    <div v-if="!scannedCard && modelReady" class="mb-4">
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
          <label :for="'input_' + mode.id" class="radio category pt-3 pb-3">
            <span
              class="material-symbols-outlined mr-1"
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
    <div v-if="!scannedCard && modelReady" class="mb-4">
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
          <label :for="'col_' + col.id" class="radio category pt-3 pb-3">
            <span
              class="material-symbols-outlined mr-1"
              style="font-size: 18px"
            >
              {{ col.icon }}
            </span>
            {{ col.label }}
          </label>
        </template>
      </span>
    </div>

    <!-- File Selectors (front + back) -->
    <div v-if="!scannedCard && modelReady && selectedMode === 'file'" class="mb-4">
      <div class="columns is-variable is-4">
        <div class="column is-6">
          <button
            class="button is-success is-large is-fullwidth"
            @click="selectImageFile('front')"
          >
            <span
              class="material-symbols-outlined mr-2"
              style="font-size: 20px"
            >
              photo_library
            </span>
            Select Front
          </button>
          <div v-if="frontPreview" class="card-thumb-wrap mt-3">
            <img :src="frontPreview" alt="Front" class="card-thumb-img" />
            <button class="delete-thumb" @click.stop="clearImage('front')">
              <span class="material-symbols-outlined" style="font-size: 14px">
                close
              </span>
            </button>
          </div>
        </div>
        <div class="column is-6">
          <button
            class="button is-info is-large is-fullwidth"
            @click="selectImageFile('back')"
          >
            <span
              class="material-symbols-outlined mr-2"
              style="font-size: 20px"
            >
              flip_to_back
            </span>
            Select Back
            <span class="ml-1" style="opacity: 0.5; font-size: 0.8rem">
              (optional)
            </span>
          </button>
          <div v-if="backPreview" class="card-thumb-wrap mt-3">
            <img :src="backPreview" alt="Back" class="card-thumb-img" />
            <button class="delete-thumb" @click.stop="clearImage('back')">
              <span class="material-symbols-outlined" style="font-size: 14px">
                close
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Camera -->
    <div v-if="!scannedCard && modelReady && selectedMode === 'camera'" class="mb-4">
      <div v-if="!cameraActive" class="has-text-centered">
        <button class="button is-success is-large" @click="startCamera">
          <span class="material-symbols-outlined mr-2" style="font-size: 20px">
            photo_camera
          </span>
          Open Camera
        </button>
        <p
          class="mt-2"
          style="color: rgba(255, 255, 255, 0.4); font-size: 0.8rem"
        >
          Capture {{ !frontBase64 ? "front" : "back" }} of card
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
            class="button is-success is-large mr-2"
            @click="captureFromCamera"
          >
            <span
              class="material-symbols-outlined mr-1"
              style="font-size: 18px"
            >
              camera
            </span>
            Capture {{ !frontBase64 ? "Front" : "Back" }}
          </button>
          <button class="button is-dark is-large" @click="stopCamera">
            <span
              class="material-symbols-outlined mr-1"
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
    <div v-if="scannedCard" class="models__activity--payouts">
      <!-- Top row: Card image + Identification -->
      <div class="columns is-variable is-4 mb-0">
        <div class="column is-5">
          <div class="card-flip-container" @mouseenter="showBack = true" @mouseleave="showBack = false">
            <div class="card-preview-container">
              <img :src="frontPreview" alt="Front" class="card-preview-image" />
              <span class="card-side-label">Front</span>
            </div>
            <Transition name="card-flip">
              <div v-if="backPreview && showBack" class="card-preview-container card-back-overlay">
                <img :src="backPreview" alt="Back" class="card-preview-image" />
                <span class="card-side-label">Back</span>
              </div>
            </Transition>
            <span v-if="backPreview" class="flip-hint">Hover to see back</span>
          </div>
        </div>
        <div class="column is-7 has-text-left">
          <!-- Card Title -->
          <h3 class="card-title fira-sans-condensed-black-italic mb-2">
            {{ scannedCard.name || "Unknown Card" }}
          </h3>
          <div v-if="scannedCard.game" class="card-game-badge mb-3">
            <span
              class="material-symbols-outlined mr-1"
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
                'detail-sub': detail.label.startsWith('  '),
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
                  class="material-symbols-outlined mr-2"
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
              class="material-symbols-outlined mr-2"
              style="font-size: 24px"
            >
              payments
            </span>
            Market Prices
          </span>
        </h4>
        <div v-if="scannedCard.pricing.loading" class="price-loading">
          <span
            class="material-symbols-outlined rotating mr-2"
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
          <span class="material-symbols-outlined mr-1" style="font-size: 16px">
            description
          </span>
          Raw OCR Text
        </summary>
        <pre class="ocr-text">{{ scannedCard.rawText }}</pre>
      </details>

      <!-- Actions -->
      <div class="actions-bar mt-4">

        <button
          class="button is-success is-medium is-outlined"
          @click="copyResults"
        >
          <span class="material-symbols-outlined mr-1">
            content_copy
          </span>
        </button>
        <button class="button is-warning is-medium" @click="mintCard">
          <span class="material-symbols-outlined mr-1" style="font-size: 18px">
            token
          </span>
          Mint
        </button>
        <button class="button is-warning is-medium is-outlined" @click="rescan">
          <span class="material-symbols-outlined mr-1" style="font-size: 18px">
            refresh
          </span>
          Re-analyze
        </button>
        <button class="button is-danger is-medium is-pulled-right" @click="reset">
          <span class="material-symbols-outlined mr-1" style="font-size: 18px">
            restart_alt
          </span>
          New Card
        </button>
      </div>
    </div>

    <!-- History -->
    <div v-if="scanHistory.length > 0" class="mt-5">
      <hr class="gradient-hr" />
      <h3
        class="is-size-4 has-text-brand fira-sans-condensed-black-italic mb-3"
      >
        <span class="material-symbols-outlined mr-2" style="font-size: 22px">
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
import MintModal from "../MintModal.vue";
import tcgZoneSchema from "../../config/tcg-card-zones.json";

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
  components: { MintModal },

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
    const backPreview = ref(null);
    const backBase64 = ref(null);
    const isScanning = ref(false);
    const scanStatus = ref("");
    const modelLoading = ref(false);
    const modelReady = ref(false);
    const cameraActive = ref(false);
    const scannedCard = ref(null);
    const scanHistory = ref([]);
    const showBack = ref(false);

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
      { id: "pokemon", label: "Pokémon", icon: "catching_pokemon" },
      { id: "yugioh", label: "Yu-Gi-Oh!", icon: "auto_awesome" },
      { id: "mtg", label: "Magic: The Gathering", icon: "bolt" },
      { id: "onepiece", label: "One Piece", icon: "sailing" },
      { id: "lorcana", label: "Lorcana", icon: "castle" },
    ];

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
    function selectImageFile(side) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          if (side === "front") {
            frontPreview.value = dataUrl;
            frontBase64.value = dataUrl;
            scannedCard.value = null;
          } else {
            backPreview.value = dataUrl;
            backBase64.value = dataUrl;
          }
          // Auto-analyze once both front + back are provided
          if (frontBase64.value && backBase64.value && !isScanning.value) {
            analyzeCard();
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }

    function clearImage(side) {
      if (side === "front") {
        frontPreview.value = null;
        frontBase64.value = null;
        scannedCard.value = null;
      } else {
        backPreview.value = null;
        backBase64.value = null;
      }
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

      if (!frontBase64.value) {
        frontPreview.value = dataUrl;
        frontBase64.value = dataUrl;
        scannedCard.value = null;
        showNotification(
          "Front captured. Now capture the back of the card.",
          "info",
          3000,
        );
      } else {
        backPreview.value = dataUrl;
        backBase64.value = dataUrl;
        stopCamera();
        // Both sides captured — auto-analyze
        analyzeCard();
      }
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

    function parseGrading(frontText, backText) {
      console.log("[PGT] Front grade response:", frontText);
      console.log("[PGT] Back grade response:", backText);

      const frontScores = extractScores(frontText);
      const backScores = backText ? extractScores(backText) : {};

      const subGrades = [];
      const cats = [
        { key: "centering", label: "Centering" },
        { key: "corners", label: "Corners" },
        { key: "surface", label: "Surface" },
        { key: "edges", label: "Edges" },
      ];

      for (const cat of cats) {
        if (frontScores[cat.key] !== undefined) {
          subGrades.push({ name: "Front " + cat.label, score: frontScores[cat.key] });
        }
      }
      for (const cat of cats) {
        if (backScores[cat.key] !== undefined) {
          subGrades.push({ name: "Back " + cat.label, score: backScores[cat.key] });
        }
      }

      if (subGrades.length === 0) return null;

      const avgScore = Math.round(
        subGrades.reduce((s, g) => s + g.score, 0) / subGrades.length,
      );
      const { grade, label } = scoreToGrade(avgScore);

      return { grade, label, score: avgScore, subGrades };
    }

    // ─── Era Detection & Dynamic Zone Loading ─────────────────────────
    // Maps JSON schema zone keys (snake_case) to code keys (camelCase)
    const ZONE_KEY_MAP = {
      // Pokemon
      stage_badge: "stage", evolves_from: "evolves", type_icon: "typeIcon",
      collector_number: "collectorNum", rarity_symbol: "rarity", regulation_mark: "regMark",
      retreat_cost: "retreat", resistance: "resist", first_edition_stamp: "firstEdition",
      gx_attack: "gxAttack", vstar_power: "vstarPower", expansion_code: "expansionCode",
      // Yugioh
      attribute_icon: "attrIcon", level_stars: "levelStars", type_ability_line: "typeLine",
      effect_text: "effectText", set_id: "setId",
      pendulum_scale_left: "pendScaleL", pendulum_scale_right: "pendScaleR",
      pendulum_effect: "pendEffect", link_arrows: "linkArrows",
      // MTG
      mana_cost: "manaCost", type_line: "typeLine", set_symbol: "setSymbol",
      rules_text: "rulesText", power_toughness: "pt", set_code: "setCode",
      holofoil_stamp: "holofoilStamp",
      // One Piece
      type_tags: "typeTags", card_type_banner: "typeBanner",
      // Lorcana
      ink_cost: "inkCost", card_type: "cardType", classifications: "classif",
      lore_value: "lore", ink_type: "inkType",
    };

    // TCG collection ID → JSON schema key
    const TCG_SCHEMA_KEY = {
      pokemon: "pokemon_tcg",
      yugioh: "yugioh_tcg",
      mtg: "magic_the_gathering",
      onepiece: "one_piece_tcg",
      lorcana: "disney_lorcana",
    };

    // Default eras (modern/current) per TCG when detection fails
    const DEFAULT_ERA = {
      pokemon: "scarlet_violet",
      yugioh: "series10_plus",
      mtg: "m15_current",
      onepiece: "standard",
      lorcana: "standard",
    };

    function getZonesForEra(col, era) {
      const schemaKey = TCG_SCHEMA_KEY[col];
      if (!schemaKey || !tcgZoneSchema.tcgs[schemaKey]) return null;
      const tcgData = tcgZoneSchema.tcgs[schemaKey];
      let eraData = tcgData.eras[era];
      if (!eraData) eraData = tcgData.eras[DEFAULT_ERA[col]];
      if (!eraData) return null;
      // Handle "SAME AS" references (e.g., mega_evolution → scarlet_violet)
      if (typeof eraData.zones === "string" && eraData.zones.startsWith("SAME AS")) {
        const refEra = eraData.zones.replace("SAME AS ", "");
        eraData = tcgData.eras[refEra] || tcgData.eras[DEFAULT_ERA[col]];
        if (!eraData || typeof eraData.zones === "string") return null;
      }
      // Convert JSON zones to code format: { camelKey: [x,y,w,h], ... }
      const zones = {};
      for (const [jsonKey, zoneInfo] of Object.entries(eraData.zones)) {
        const codeKey = ZONE_KEY_MAP[jsonKey] || jsonKey;
        if (zoneInfo.bbox) zones[codeKey] = zoneInfo.bbox;
      }
      return zones;
    }

    async function detectCardEra(col, base64Src, vlmZoneFn) {
      const schemaKey = TCG_SCHEMA_KEY[col];
      if (!schemaKey) return DEFAULT_ERA[col];
      const eraConfig = tcgZoneSchema.era_detection[col];
      if (!eraConfig) return DEFAULT_ERA[col];
      // One Piece and Lorcana have stable layouts — skip VLM call
      if (col === "onepiece" || col === "lorcana") return DEFAULT_ERA[col];
      try {
        const eraResponse = await vlmZoneFn(
          base64Src,
          [0.0, 0.0, 1.0, 1.0], // full card
          eraConfig.prompt,
          40,
        );
        const detected = eraResponse?.trim().toLowerCase().replace(/[\s-]+/g, "_") || "";
        console.log("[TCG] Era detection raw:", eraResponse, "→ normalized:", detected);
        // Validate against known eras
        const tcgData = tcgZoneSchema.tcgs[schemaKey];
        if (tcgData.eras[detected]) return detected;
        // Fuzzy match: check if response contains an era name
        for (const eraName of Object.keys(tcgData.eras)) {
          if (detected.includes(eraName) || eraName.includes(detected)) return eraName;
        }
        console.log("[TCG] Era not recognized, using default:", DEFAULT_ERA[col]);
        return DEFAULT_ERA[col];
      } catch (e) {
        console.warn("[TCG] Era detection failed:", e);
        return DEFAULT_ERA[col];
      }
    }

    // ─── Main Analysis Pipeline ───────────────────────────────────────
    async function analyzeCard() {
      if (!frontBase64.value || isScanning.value || !modelReady.value) return;

      isScanning.value = true;
      showNotification("Analyzing card...", "info", 0);
      emit("status-update", "Analyzing card...");

      try {
        // Step 1: Full-card text extraction via VLM (Qwen3.5-0.8B)
        showNotification("Extracting text from front...", "info", 0);
        const ocrRes = await fetch(`${API_BASE}/vision/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            image_base64: frontBase64.value,
            prompt: "Read ALL text visible on this trading card. Transcribe every word exactly as printed, preserving line breaks. Include: card name, HP, stage, attacks, abilities, flavor text, set number, illustrator, and any symbols or numbers.",
            max_tokens: 2048,
            auto_download: false,
          }),
        });
        if (!ocrRes.ok) {
          const errBody = await ocrRes.json().catch(() => ({}));
          throw new Error(errBody.error || `Text extraction failed (HTTP ${ocrRes.status})`);
        }
        let frontRawText = (await ocrRes.json()).response || "";
        let rawText = frontRawText;
        console.log("[TCGAnalysis] Front VLM text:", frontRawText.substring(0, 500));

        // Step 1b: Text extraction on back if available
        let backRawText = "";
        if (backBase64.value) {
          showNotification("Extracting text from back...", "info", 0);
          try {
            const backOcrRes = await fetch(`${API_BASE}/vision/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...getAuthHeaders() },
              body: JSON.stringify({
                image_base64: backBase64.value,
                prompt: "Read ALL text visible on the back of this trading card. Transcribe every word exactly as printed.",
                max_tokens: 1024,
                auto_download: false,
              }),
            });
            if (backOcrRes.ok) {
              backRawText = (await backOcrRes.json()).response || "";
              rawText += "\n\n--- BACK OF CARD ---\n" + backRawText;
            }
          } catch (e) { console.warn("[TCGAnalysis] Back text extraction failed:", e); }
        }

        // ─── Step 2: Hybrid zone + full-card extraction ─────────────
        // Use the full-card OCR as primary text, plus targeted zone OCR
        // for critical fields (name, bottom strip). All calls are SEQUENTIAL
        // to avoid overloading the single-threaded Flask server.
        showNotification("Identifying card...", "info", 0);
        const col = selectedCollection.value;

        // Full-card OCR parsed into lines and flat text
        const ocrLines = frontRawText.split("\n").map(l => l.trim()).filter(Boolean);
        const ocrFlat = frontRawText.replace(/\n+/g, " ").trim();

        // ── Canvas ROI cropper ────────────────────────────────────
        async function cropZone(base64Src, bbox) {
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const sx = Math.round(bbox[0] * img.naturalWidth);
              const sy = Math.round(bbox[1] * img.naturalHeight);
              const sw = Math.max(Math.round(bbox[2] * img.naturalWidth), 1);
              const sh = Math.max(Math.round(bbox[3] * img.naturalHeight), 1);
              // Upscale small zones for better OCR (min 200px wide)
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

        // ── OCR a single cropped zone via VLM ──────────
        async function ocrZone(base64Src, bbox) {
          const cropped = await cropZone(base64Src, bbox);
          if (!cropped) return "";
          try {
            const res = await fetch(`${API_BASE}/vision/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...getAuthHeaders() },
              body: JSON.stringify({ image_base64: cropped, prompt: "Read ALL text in this image. Transcribe exactly as printed, nothing else.", max_tokens: 256, auto_download: false }),
            });
            if (res.ok) return ((await res.json()).response || "").trim();
          } catch (e) { console.warn("[TCGAnalysis] Zone OCR failed:", e); }
          return "";
        }

        // ── VLM a single cropped zone (with 202 retry) ──────────
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

        // Helper: extract a field from VLM response
        function extractField(text, field) {
          const patterns = [
            new RegExp(`(?:[\\*\\-\\s]*)?(?:${field})(?:\\**)\\s*[:=\\-–]\\s*(.+?)(?:\\n|$)`, "i"),
            new RegExp(`(?:${field})\\s+(.+?)(?:\\n|$)`, "i"),
          ];
          for (const re of patterns) {
            const m = text.match(re);
            if (m && m[1]) {
              const val = m[1].trim().replace(/\*+/g, "").replace(/^[-–:]\s*/, "").trim();
              if (val && val !== "-" && val.toLowerCase() !== "n/a") return val;
            }
          }
          return "";
        }

        // Helper: clean OCR text — strip noise, normalize
        function cleanOcr(t) { return t.replace(/[^\x20-\x7E\u00C0-\u024F''·—–×+◆◇♦★☆●\n]/g, "").trim(); }

        // ─── Phase 1.5: Era Detection ────────────────────────────
        // Detect the card's era BEFORE zone extraction so we use correct coordinates.
        showNotification("Detecting card era...", "info", 0);
        const detectedEra = await detectCardEra(col, frontBase64.value, vlmZone);
        console.log("[TCG] Detected era:", detectedEra);

        // Load era-specific zones from JSON schema, with hardcoded fallback
        const FALLBACK_ZONES = {
          pokemon: { stage: [0.03, 0.02, 0.18, 0.06], name: [0.15, 0.02, 0.50, 0.06], hp: [0.60, 0.02, 0.20, 0.06], typeIcon: [0.82, 0.02, 0.10, 0.06], evolves: [0.03, 0.08, 0.30, 0.04], attacks: [0.06, 0.54, 0.88, 0.22], weakness: [0.06, 0.78, 0.28, 0.04], resist: [0.34, 0.78, 0.28, 0.04], retreat: [0.66, 0.78, 0.28, 0.04], collectorNum: [0.06, 0.88, 0.20, 0.04], rarity: [0.38, 0.88, 0.06, 0.04], regMark: [0.44, 0.88, 0.06, 0.04] },
          yugioh: { name: [0.06, 0.02, 0.72, 0.07], attrIcon: [0.82, 0.02, 0.14, 0.07], levelStars: [0.30, 0.09, 0.66, 0.05], typeLine: [0.06, 0.52, 0.88, 0.05], effectText: [0.06, 0.57, 0.88, 0.22], atk: [0.06, 0.80, 0.40, 0.05], def: [0.50, 0.80, 0.40, 0.05], passcode: [0.04, 0.88, 0.30, 0.04], setId: [0.55, 0.88, 0.40, 0.04], edition: [0.04, 0.92, 0.30, 0.03] },
          mtg: { name: [0.06, 0.02, 0.60, 0.07], manaCost: [0.60, 0.02, 0.36, 0.07], typeLine: [0.06, 0.48, 0.76, 0.05], setSymbol: [0.84, 0.48, 0.10, 0.05], rulesText: [0.06, 0.54, 0.88, 0.28], pt: [0.78, 0.80, 0.16, 0.06], collectorNum: [0.06, 0.88, 0.25, 0.04], setCode: [0.72, 0.88, 0.22, 0.04] },
          onepiece: { cost: [0.03, 0.02, 0.10, 0.08], name: [0.16, 0.02, 0.55, 0.06], typeTags: [0.16, 0.08, 0.70, 0.04], typeBanner: [0.04, 0.58, 0.30, 0.05], effectText: [0.06, 0.63, 0.88, 0.16], power: [0.04, 0.80, 0.20, 0.06], counter: [0.26, 0.80, 0.16, 0.06], collectorNum: [0.04, 0.88, 0.30, 0.04], rarity: [0.38, 0.88, 0.15, 0.04] },
          lorcana: { inkCost: [0.03, 0.02, 0.10, 0.09], inkable: [0.01, 0.01, 0.14, 0.11], name: [0.16, 0.02, 0.55, 0.06], subtitle: [0.16, 0.07, 0.55, 0.04], strength: [0.86, 0.20, 0.10, 0.08], willpower: [0.86, 0.30, 0.10, 0.08], cardType: [0.06, 0.55, 0.30, 0.05], classif: [0.06, 0.59, 0.88, 0.04], lore: [0.06, 0.82, 0.10, 0.06], collectorNum: [0.06, 0.90, 0.25, 0.04], rarity: [0.35, 0.90, 0.15, 0.04] },
        };
        const eraZones = getZonesForEra(col, detectedEra);
        const ZONES = {};
        ZONES[col] = eraZones || FALLBACK_ZONES[col];
        console.log("[TCG] Using zones for era:", detectedEra, "| keys:", Object.keys(ZONES[col] || {}).join(", "));

        // ─── Targeted VLM extraction per zone ─────────────────────
        // Each zone is cropped and the VLM is asked a SPECIFIC question.
        // All calls are sequential (Flask single-threaded).
        let cardName = "";
        let cardGame = TCG_REFERENCE[col]?.game || "";
        let cardSet = "";
        let cardRarity = "";
        let cardEra = detectedEra;
        const details = [];
        const src = frontBase64.value;

        if (col === "pokemon") {
          // ── Pokémon: Targeted VLM zone extraction ─────────────────
          const z = ZONES[col];
          showNotification("Reading card data (Pokémon)...", "info", 0);

          // WotC-era (base_wotc) detection flag — affects prompts, fallbacks, and zone reads
          const isWotcEra = ["base_wotc", "e_card"].includes(detectedEra);

          // 1. Name (CRITICAL) — bold text top-center, supplement with full-card OCR
          const namePrompt = isWotcEra
            ? "What is the Pokémon name printed here? Reply with ONLY the name, nothing else."
            : "What is the Pokémon name printed here? Include suffixes like ex, V, VSTAR, VMAX, GX if present. Reply with ONLY the name, nothing else.";
          const zoneNameRaw = await vlmZone(src, z.name, namePrompt, 30);
          // Full-card OCR often captures WotC names better — extract from raw text as fallback
          const ocrNameMatch = ocrFlat.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s/)?.[1];
          cardName = zoneNameRaw?.trim() || ocrNameMatch || "";
          // If zone name looks like noise but OCR has a clean name, prefer OCR
          if (cardName.length < 2 || /^\d|error|sorry/i.test(cardName)) cardName = ocrNameMatch || cardName;
          console.log("[TCG] Pokemon name (zone:", zoneNameRaw, "| ocr:", ocrNameMatch, "| final:", cardName, ")");

          // 2. HP (CRITICAL) — era-aware; WotC uses "XX HP", modern uses "HP XXX"
          // Try zone first, then fall back to full-card OCR extraction
          const hpPrompt = isWotcEra
            ? "What is the HP number shown? It may be formatted as '50 HP' or 'HP 50'. Reply with ONLY the number, nothing else."
            : "What is the HP number shown? Reply with ONLY the number (e.g. 360), nothing else.";
          const hpZone = await vlmZone(src, z.hp, hpPrompt, 10);
          let hp = hpZone?.match(/(\d{2,4})/)?.[1] || "";
          // Full-card OCR fallback for HP — especially important for WotC era
          if (!hp) {
            const ocrHpMatch = ocrFlat.match(/(\d{2,3})\s*HP|HP\s*(\d{2,4})/i);
            hp = ocrHpMatch?.[1] || ocrHpMatch?.[2] || "";
          }
          console.log("[TCG] Pokemon HP (zone:", hpZone, "| final:", hp, ")");

          // 3. Type icon (CRITICAL) — color classification
          const energyType = await vlmZone(src, z.typeIcon, "What Pokémon energy type is this icon? Reply ONE word: Fire, Water, Grass, Lightning, Psychic, Fighting, Darkness, Metal, Dragon, Fairy, or Colorless.", 15);
          console.log("[TCG] Pokemon type:", energyType);

          // 4. Stage badge
          const stageZone = z.stage ? await vlmZone(src, z.stage, "What stage is shown on this badge? Reply with ONLY one of: Basic, Stage 1, Stage 2, ex, V, VSTAR, VMAX, GX. Nothing else.", 15) : "";
          let stage = stageZone?.replace(/[^A-Za-z0-9\s]/g, "").trim() || "";
          // OCR fallback for stage
          if (!stage) {
            const ocrStage = ocrFlat.match(/\b(Basic|Stage\s*[12]|BASIC|STAGE\s*[12])\b/i)?.[1];
            if (ocrStage) stage = ocrStage;
          }

          // 5+6. Ability/Power + Attacks — SINGLE combined VLM call (all eras)
          // Merging these into one call reduces VLM overhead and avoids confusing
          // the 0.8B model with too many sequential requests.
          // Expand attacks bbox upward by 6% to capture ability text above attacks.
          const atkBox = z.attacks || [0.06, 0.54, 0.88, 0.22];
          const combinedBbox = [atkBox[0], Math.max(0, atkBox[1] - 0.06), atkBox[2], Math.min(1 - (atkBox[1] - 0.06), atkBox[3] + 0.06)];
          const abilityLabel = isWotcEra ? "Pokémon Power" : "Ability";
          const combinedPrompt = `Read the text area of this Pokémon card and list what you see.

1. If there is an ${abilityLabel} section (labeled "${abilityLabel}" in red), reply:
ABILITY_NAME: [name]
ABILITY_TEXT: [effect text]

2. For EACH attack (has energy cost circles on the left), reply:
ATTACK_NAME: [name]
ENERGY_COST: [e.g. "1 Fire, 2 Colorless"]
DAMAGE: [number, or "none"]
EFFECT: [text below attack name, or "none"]

Separate sections with a blank line. If no ${abilityLabel}, skip it entirely.`;
          const combinedText = await vlmZone(src, combinedBbox, combinedPrompt, 600);
          console.log("[TCG] Pokemon combined ability+attacks raw:", combinedText);

          // Parse combined output — ability section + attack sections
          let pokemonPower = null;
          const attackEntries = [];
          if (combinedText && !/^none$/i.test(combinedText.trim())) {
            const blocks = combinedText.split(/\n\s*\n/).filter(Boolean);
            for (const block of blocks) {
              const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
              // Check if this block is an ability
              const aName = lines.find(l => /^ABILITY_NAME:/i.test(l))?.replace(/^ABILITY_NAME:\s*/i, "").trim();
              if (aName) {
                const aText = lines.find(l => /^ABILITY_TEXT:/i.test(l))?.replace(/^ABILITY_TEXT:\s*/i, "").trim();
                pokemonPower = { name: aName, text: aText || "" };
                continue;
              }
              // Otherwise parse as attack
              const atkName = lines.find(l => /^ATTACK_NAME:/i.test(l))?.replace(/^ATTACK_NAME:\s*/i, "").trim();
              const atkEnergy = lines.find(l => /^ENERGY_COST:/i.test(l))?.replace(/^ENERGY_COST:\s*/i, "").trim();
              const atkDamage = lines.find(l => /^DAMAGE:/i.test(l))?.replace(/^DAMAGE:\s*/i, "").trim();
              const atkEffect = lines.find(l => /^EFFECT:/i.test(l))?.replace(/^EFFECT:\s*/i, "").trim();
              if (atkName) {
                attackEntries.push({ name: atkName, energy: atkEnergy || "", damage: atkDamage || "", effect: atkEffect || "" });
              }
            }
          }
          // OCR fallbacks for ability
          if (!pokemonPower) {
            const ocrPower = ocrFlat.match(/Pok[eé]mon\s*Power[:\s]+(\w[\w\s]+?)(?:\s{2,}|\.)/i);
            const ocrAbility = ocrFlat.match(/Ability[:\s]+(\w[\w\s]+?)(?:\s{2,}|\.)/i);
            if (ocrPower) pokemonPower = { name: ocrPower[1].trim(), text: "" };
            else if (ocrAbility) pokemonPower = { name: ocrAbility[1].trim(), text: "" };
          }
          // OCR fallback for attacks if VLM found nothing
          if (attackEntries.length === 0) {
            const ocrAtkMatches = ocrFlat.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(\d{1,3}[+×]?)/g);
            if (ocrAtkMatches) {
              for (const m of ocrAtkMatches) {
                const parts = m.match(/(.+?)\s+(\d{1,3}[+×]?)$/);
                if (parts) attackEntries.push({ name: parts[1].trim(), energy: "", damage: parts[2], effect: "" });
              }
            }
          }

          // 7. Flavor text — OCR-only extraction (no dedicated VLM call)
          let flavorText = "";
          const ocrFlavor = ocrFlat.match(/(?:Pokédex|Pokémon|fossil|ancient|creature)[^.]*\./i)?.[0]
            || ocrFlat.match(/[""]([^""]+)[""]/)?.[ 1];
          if (ocrFlavor && ocrFlavor.length > 15) flavorText = ocrFlavor.trim();

          // 8. Weakness — type icon + ×2
          const weaknessText = await vlmZone(src, z.weakness, `What weakness is shown? It is a small energy type icon followed by ×2. Examples: "Grass ×2", "Water ×2", "Fighting ×2". Reply with ONLY the energy type and modifier. If there is NO weakness shown, reply 'none'. Do NOT confuse this with attack names or other text nearby.`, 20);
          let weakness = "";
          if (weaknessText && !/^none$/i.test(weaknessText.trim()) && !/scratch|attack/i.test(weaknessText)) {
            weakness = weaknessText.trim();
          }
          // OCR fallback for weakness
          if (!weakness) {
            const ocrWeak = ocrFlat.match(/[Ww]eakness[:\s]*([\w]+\s*×?\s*\d*)/);
            if (ocrWeak) weakness = ocrWeak[1].trim();
          }

          // 9. Resistance — type icon + −30 (may be blank/none)
          const resistText = await vlmZone(src, z.resist, `What resistance is shown? It is a small energy type icon followed by −30 or -30. Examples: "Fighting −30", "Lightning −30". Reply with ONLY the energy type and modifier. If the resistance area is BLANK or says "none", reply 'none'. Do NOT confuse this with attack names.`, 20);
          let resistance = "";
          if (resistText && !/^none$/i.test(resistText.trim()) && !/scratch|attack/i.test(resistText)) {
            resistance = resistText.trim();
          }

          // 10. Retreat cost — expressed as energy cards
          const retreatText = await vlmZone(src, z.retreat, "How many Colorless energy circles are shown for the retreat cost? Reply like '2 Colorless' or '0' if none. ONLY the count and type, nothing else.", 15);
          const retreatCount = retreatText?.match(/(\d)/)?.[1] || "0";
          const retreatCost = retreatCount === "0" ? "0" : `${retreatCount} Colorless`;

          // 11. Collector number — format XXX/YYY
          const collNumText = await vlmZone(src, z.collectorNum, "What is the collector number shown? Format: XXX/YYY. Reply with ONLY the number, nothing else.", 15);
          const collectorNum = collNumText?.match(/(\d{1,3}\s*\/\s*\d{1,3})/)?.[0]?.replace(/\s/g, "") || "";

          // 12. Regulation mark — single letter (sun_moon+ eras only)
          let regMark = "";
          const hasRegMark = ["sun_moon", "sword_shield", "scarlet_violet", "mega_evolution"].includes(detectedEra);
          if (hasRegMark && z.regMark) {
            const regMarkText = await vlmZone(src, z.regMark, "What single letter regulation mark is shown? Reply with ONLY the letter (A-I), nothing else.", 5);
            regMark = regMarkText?.match(/([A-I])/)?.[1] || "";
          }

          // 13. Rarity — symbol classification (● = Common, ◆ = Uncommon, ★ = Rare, etc.)
          if (z.rarity) {
            const rarityText = await vlmZone(src, z.rarity, "What rarity symbol is shown? Reply with ONE of: Common (circle ●), Uncommon (diamond ◆), Rare (star ★), Double Rare, Ultra Rare, Illustration Rare, Special Art Rare, Hyper Rare, Crown Rare. Reply with ONLY the rarity name, nothing else.", 20);
            cardRarity = rarityText?.replace(/[()●◆★]/g, "").trim() || "";
          }
          console.log("[TCG] Pokemon rarity:", cardRarity);

          // 14. Era-specific fields
          let firstEdition = "";
          if (detectedEra === "base_wotc" && z.firstEdition) {
            const edText = await vlmZone(src, z.firstEdition, "Is there a '1st Edition' stamp (circled number 1) at the bottom-left of the art window? Reply 'yes' or 'no'.", 5);
            firstEdition = /yes/i.test(edText) ? "1st Edition" : "Unlimited";
          }

          // GX attack zone for sun_moon era
          if (detectedEra === "sun_moon" && z.gxAttack) {
            const gxText = await vlmZone(src, z.gxAttack, "What is the GX attack name and text shown here? Reply with the attack name, then a colon, then the effect text. If no GX attack, reply 'none'.", 120);
            if (gxText && !/^none$/i.test(gxText.trim())) {
              attackEntries.push({ name: gxText.split(":")[0]?.trim() || "GX Attack", energy: "", damage: "", effect: gxText.split(":").slice(1).join(":").trim() || "", isGX: true });
            }
          }

          // VSTAR power zone for sword_shield era
          if (detectedEra === "sword_shield" && z.vstarPower) {
            const vstarText = await vlmZone(src, z.vstarPower, "What is the VSTAR Power name and text shown here? Reply with the name, then a colon, then the effect text. If no VSTAR Power, reply 'none'.", 120);
            if (vstarText && !/^none$/i.test(vstarText.trim())) {
              pokemonPower = pokemonPower || { name: "", text: "" };
              // Add as a separate VSTAR Power entry
              details.push({ label: "VSTAR Power", value: vstarText });
            }
          }

          // ── Build details — ordered: info → power → attacks → bottom bar ──
          const topFields = [];
          if (stage) topFields.push({ label: "Stage", value: stage });
          if (hp) topFields.push({ label: "HP", value: hp });
          if (energyType) topFields.push({ label: "Energy Type", value: energyType?.split(/[\s,.]/)[0] || "" });
          if (detectedEra !== DEFAULT_ERA.pokemon) topFields.push({ label: "Era", value: detectedEra.replace(/_/g, " ") });
          details.unshift(...topFields);

          // Pokémon Power / Ability
          if (pokemonPower) {
            const powerLabel = isWotcEra ? "Pokémon Power" : "Ability";
            details.push({ label: powerLabel, value: pokemonPower.name });
            if (pokemonPower.text && pokemonPower.text.toLowerCase() !== "none") {
              details.push({ label: "  Effect", value: pokemonPower.text });
            }
          }

          // Attacks — each attack as a numbered section with sub-fields
          for (let i = 0; i < attackEntries.length; i++) {
            const atk = attackEntries[i];
            const atkLabel = atk.isGX ? "GX Attack" : (attackEntries.length > 1 ? `Attack ${i + 1}` : "Attack");
            details.push({ label: atkLabel, value: atk.name });
            if (atk.energy) details.push({ label: "  Energy Cost", value: atk.energy });
            if (atk.damage && atk.damage.toLowerCase() !== "none") details.push({ label: "  Damage", value: atk.damage });
            if (atk.effect && atk.effect.toLowerCase() !== "none") details.push({ label: "  Effect", value: atk.effect });
          }
          // Fallback if no attacks parsed at all
          if (attackEntries.length === 0 && attacksText) {
            details.push({ label: "Attacks", value: attacksText });
          }

          // Flavor text / description
          if (flavorText) details.push({ label: "Description", value: flavorText });

          // Bottom bar fields
          if (weakness) details.push({ label: "Weakness", value: weakness });
          if (resistance) details.push({ label: "Resistance", value: resistance });
          details.push({ label: "Retreat Cost", value: retreatCost });
          if (cardRarity) details.push({ label: "Rarity", value: cardRarity });
          if (collectorNum) details.push({ label: "Collector #", value: collectorNum });
          if (regMark) details.push({ label: "Regulation Mark", value: regMark });
          if (firstEdition) details.push({ label: "Edition", value: firstEdition });

        } else if (col === "yugioh") {
          // ── Yu-Gi-Oh!: Targeted VLM zone extraction ──────────────
          const z = ZONES[col];
          const ref = TCG_REFERENCE.yugioh;
          const exCards = ref.exampleCards.map(c => `${c.name} (${c.attribute}, Lv${c.level}, ATK ${c.atk})`).join("; ");
          showNotification("Reading card data (Yu-Gi-Oh!)...", "info", 0);

          // 1. Name (CRITICAL)
          cardName = await vlmZone(src, z.name, `What is the card name printed here? Examples: ${exCards}. Reply with ONLY the name, nothing else.`, 40);

          // 2. Attribute icon (CRITICAL) — color classification
          const attribute = await vlmZone(src, z.attrIcon, "What Yu-Gi-Oh! attribute is this icon? Reply ONE word: DARK, LIGHT, FIRE, WATER, WIND, EARTH, DIVINE, SPELL, or TRAP.", 15);

          // 3. Level/Rank stars — count
          const levelText = z.levelStars ? await vlmZone(src, z.levelStars, "How many stars are shown? Reply with ONLY the number (1-12), nothing else. If no stars, reply '0'.", 5) : "";
          const level = levelText?.match(/(\d{1,2})/)?.[1] || "";

          // 4. Type/ability line — bracketed text
          const typeLine = z.typeLine ? await vlmZone(src, z.typeLine, "Read the bracketed text on this line exactly as printed. E.g. '[Dragon / Effect]'. Reply with ONLY the bracketed text.", 60) : "";

          // 5. ATK
          const atkText = z.atk ? await vlmZone(src, z.atk, "What is the ATK value shown? Format: ATK/XXXX. Reply with ONLY the number, nothing else.", 15) : "";
          const atk = atkText?.match(/(\d{1,5})/)?.[1] || "";

          // 6. DEF or LINK
          const defText = z.def ? await vlmZone(src, z.def, "What is shown here — DEF/XXXX or LINK-X? Reply with ONLY 'DEF XXXX' or 'LINK X', nothing else.", 15) : "";
          const defM = defText?.match(/DEF\s*(\d{1,5})/i);
          const linkM = defText?.match(/LINK\s*(\d)/i);

          // 7. Passcode (CRITICAL) — 8-digit
          const passcodeText = z.passcode ? await vlmZone(src, z.passcode, "What 8-digit number is printed here? Reply with ONLY the 8 digits, nothing else.", 15) : "";
          const passcode = passcodeText?.match(/(\d{8})/)?.[1] || "";

          // 8. Set ID (CRITICAL) — SETCODE-LANGXXX
          const setIdText = z.setId ? await vlmZone(src, z.setId, "What is the set ID code printed here? Format like 'ROTD-EN025'. Reply with ONLY the code, nothing else.", 20) : "";
          const setId = setIdText?.match(/([A-Z0-9]{2,5}-[A-Z]{2}\d{2,4})/i)?.[0] || setIdText?.trim() || "";

          // 9. Edition
          const editionText = z.edition ? await vlmZone(src, z.edition, "Is '1st Edition' printed here? Reply '1st Edition' or 'Unlimited' or 'none'.", 15) : "";
          const edition = editionText?.match(/(1st\s*Edition)/i)?.[1] || "";

          // 10. Pendulum-specific zones (series9_pendulum era)
          let pendScaleL = "", pendScaleR = "", pendEffect = "";
          if (detectedEra === "series9_pendulum") {
            if (z.pendScaleL) {
              const psl = await vlmZone(src, z.pendScaleL, "What number is shown in this Pendulum Scale indicator? Reply with ONLY the number (0-13), nothing else.", 5);
              pendScaleL = psl?.match(/(\d{1,2})/)?.[1] || "";
            }
            if (z.pendScaleR) {
              const psr = await vlmZone(src, z.pendScaleR, "What number is shown in this Pendulum Scale indicator? Reply with ONLY the number (0-13), nothing else.", 5);
              pendScaleR = psr?.match(/(\d{1,2})/)?.[1] || "";
            }
            if (z.pendEffect) {
              pendEffect = await vlmZone(src, z.pendEffect, "Read the Pendulum Effect text in this teal zone. Transcribe exactly as printed.", 200) || "";
            }
          }

          // 11. Link Arrows (series10_plus era, Link monsters only)
          let linkArrows = "";
          if (detectedEra === "series10_plus" && z.linkArrows && linkM) {
            linkArrows = await vlmZone(src, z.linkArrows, "What Link Arrow positions are active (red triangles)? Reply with compass positions separated by commas, from: Top, Top-Right, Right, Bottom-Right, Bottom, Bottom-Left, Left, Top-Left. ONLY list the active arrows.", 40) || "";
          }

          // Build details
          if (attribute) details.push({ label: "Attribute", value: attribute?.split(/[\s,.]/)[0] || "" });
          if (level && level !== "0") details.push({ label: "Level / Rank", value: level });
          if (typeLine) details.push({ label: "Monster Type", value: typeLine });
          if (atk) details.push({ label: "ATK", value: atk });
          if (defM) details.push({ label: "DEF", value: defM[1] });
          else if (linkM) details.push({ label: "LINK", value: linkM[1] });
          if (linkArrows) details.push({ label: "Link Arrows", value: linkArrows });
          if (pendScaleL || pendScaleR) details.push({ label: "Pendulum Scale", value: `${pendScaleL} / ${pendScaleR}` });
          if (pendEffect) details.push({ label: "Pendulum Effect", value: pendEffect });
          if (setId) details.push({ label: "Set ID", value: setId });
          if (edition) details.push({ label: "Edition", value: edition });
          if (passcode) details.push({ label: "Passcode", value: passcode });
          if (detectedEra !== DEFAULT_ERA.yugioh) details.push({ label: "Era", value: detectedEra.replace(/_/g, " ") });

        } else if (col === "mtg") {
          // ── MTG: Targeted VLM zone extraction ────────────────────
          const z = ZONES[col];
          const ref = TCG_REFERENCE.mtg;
          const exCards = ref.exampleCards.map(c => `${c.name} (${c.manaCost}, ${c.cardType})`).join("; ");
          showNotification("Reading card data (MTG)...", "info", 0);

          // 1. Name (CRITICAL)
          cardName = await vlmZone(src, z.name, `What is the card name printed here? Examples: ${exCards}. Reply with ONLY the name, nothing else.`, 40);

          // 2. Mana cost (CRITICAL) — colored circles
          const manaCost = await vlmZone(src, z.manaCost, "List the mana symbols shown using MTG notation: {W}=white, {U}=blue, {B}=black, {R}=red, {G}=green, {1}{2}{3}=generic. Reply with ONLY the mana cost string like '{2}{R}{R}', nothing else. If no mana cost, reply 'none'.", 30);

          // 3. Type line (CRITICAL)
          const typeLine = await vlmZone(src, z.typeLine, "Read the type line exactly as printed. E.g. 'Legendary Creature — Human Wizard'. Reply with ONLY the type line, nothing else.", 60);

          // 4. Set symbol — rarity by color
          const setSymbolRarity = await vlmZone(src, z.setSymbol, "What color is this set symbol? Reply ONE word: Black (Common), Silver (Uncommon), Gold (Rare), or Orange (Mythic Rare).", 15);

          // 5. Power/Toughness or Loyalty
          const ptText = await vlmZone(src, z.pt, "What number or fraction is shown in this box? For creatures reply 'X/Y' (power/toughness). For planeswalkers reply just the number (loyalty). If empty, reply 'none'.", 15);
          const ptM = ptText?.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
          const pt = ptM ? `${ptM[1]}/${ptM[2]}` : "";
          const loyalty = (!pt && ptText?.match(/^\d{1,2}$/)) ? ptText.trim() : "";

          // 6. Collector number
          const collNumText = await vlmZone(src, z.collectorNum, "What is the collector number and rarity letter shown? Format: XXX/YYY C or R or U or M. Reply with ONLY that, nothing else.", 20);
          const collectorNum = collNumText?.match(/(\d{1,3}\s*\/\s*\d{1,3})/)?.[0]?.replace(/\s/g, "") || "";

          // 7. Set code (m15_current and modern_8th only — older eras may not have it)
          const setCode = z.setCode ? await vlmZone(src, z.setCode, "What 3-letter set code is shown? Reply with ONLY the code like 'MKM' or 'ONE', nothing else.", 10) : "";

          // 8. Holofoil stamp (m15_current only, Rare+ cards)
          let holofoilStamp = "";
          if (detectedEra === "m15_current" && z.holofoilStamp) {
            const holoText = await vlmZone(src, z.holofoilStamp, "Is there a silver oval holofoil stamp at the bottom center of the card? Reply 'yes' or 'no'.", 5);
            holofoilStamp = /yes/i.test(holoText) ? "Present" : "Absent";
          }

          // Build details
          if (typeLine && typeLine.toLowerCase() !== "none") details.push({ label: "Card Type", value: typeLine });
          if (manaCost && manaCost.toLowerCase() !== "none") details.push({ label: "Mana Cost", value: manaCost });
          if (pt) details.push({ label: "Power / Toughness", value: pt });
          else if (loyalty) details.push({ label: "Loyalty", value: loyalty });
          if (setSymbolRarity) details.push({ label: "Rarity", value: setSymbolRarity?.split(/[\s,.]/)[0] || "" });
          if (holofoilStamp) details.push({ label: "Holofoil Stamp", value: holofoilStamp });
          if (collectorNum) details.push({ label: "Collector #", value: collectorNum });
          if (setCode && setCode.toLowerCase() !== "none") details.push({ label: "Set Code", value: setCode?.match(/[A-Z]{3}/)?.[0] || setCode.trim() });
          if (detectedEra !== DEFAULT_ERA.mtg) details.push({ label: "Era", value: detectedEra.replace(/_/g, " ") });

        } else if (col === "onepiece") {
          // ── One Piece: Targeted VLM zone extraction ──────────────
          const z = ZONES[col];
          const ref = TCG_REFERENCE.onepiece;
          const exCards = ref.exampleCards.map(c => `${c.name} (${c.cardType}, ${c.color})`).join("; ");
          showNotification("Reading card data (One Piece)...", "info", 0);

          // 1. Name (CRITICAL)
          cardName = await vlmZone(src, z.name, `What is the character/card name printed here? Examples: ${exCards}. Reply with ONLY the name, nothing else.`, 40);

          // 2. Cost — large number in circle
          const costText = await vlmZone(src, z.cost, "What number is inside this circle? Reply with ONLY the number (0-10), nothing else.", 5);
          const cost = costText?.match(/(\d{1,2})/)?.[1] || "";

          // 3. Type tags — slash-separated
          const typeTags = await vlmZone(src, z.typeTags, "Read the trait tags printed here. They are slash-separated like 'Straw Hat Crew / Supernovas'. Reply with the full text, nothing else.", 60);

          // 4. Card type banner — CHARACTER/EVENT/STAGE/LEADER
          const cardType = await vlmZone(src, z.typeBanner, "What card type label is shown? Reply ONE word: CHARACTER, EVENT, STAGE, or LEADER.", 15);

          // 5. Power — large number, thousands
          const powerText = await vlmZone(src, z.power, "What power number is shown? Values are in thousands like 5000 or 8000. Reply with ONLY the number, nothing else. If none, reply 'none'.", 15);
          const power = powerText?.match(/(\d{4,5})/)?.[1] || "";

          // 6. Counter — shield with +1000/+2000
          const counterText = await vlmZone(src, z.counter, "What counter value is shown on the shield? Reply '+1000' or '+2000' or 'none'.", 10);
          const counter = counterText?.match(/\+\d{4}/)?.[0] || "";

          // 7. Collector number — OPXX-XXX format
          const collNumText = await vlmZone(src, z.collectorNum, "What is the collector number? Format: OPXX-XXX (e.g. OP01-001). Reply with ONLY the code, nothing else.", 15);
          const collectorNum = collNumText?.match(/(OP\d{2}-\d{3})/i)?.[1] || collNumText?.trim() || "";

          // 8. Rarity
          const rarityText = await vlmZone(src, z.rarity, "What rarity letter code is shown? Reply with ONLY one of: C, UC, R, SR, SEC, L, SP, P, TR. Nothing else.", 5);
          cardRarity = rarityText?.match(/\b(C|UC|R|SR|SEC|L|SP|P|TR)\b/)?.[1] || "";

          // 9. Color identity — border color
          const color = await vlmZone(src, [0.0, 0.0, 0.06, 1.0], "What color is this card border? Reply ONE word: Red, Green, Blue, Purple, Black, or Yellow.", 10);

          // Build details
          if (cardType) details.push({ label: "Card Type", value: cardType?.split(/[\s,.]/)[0] || "" });
          if (cost) details.push({ label: "Cost", value: cost });
          if (power) details.push({ label: "Power", value: power });
          if (color) details.push({ label: "Color", value: color?.split(/[\s,.]/)[0] || "" });
          if (typeTags && typeTags.toLowerCase() !== "none") details.push({ label: "Traits", value: typeTags });
          if (counter) details.push({ label: "Counter", value: counter });
          if (cardRarity) details.push({ label: "Rarity", value: cardRarity });
          if (collectorNum) details.push({ label: "Collector #", value: collectorNum });

        } else if (col === "lorcana") {
          // ── Lorcana: Targeted VLM zone extraction ────────────────
          const z = ZONES[col];
          const ref = TCG_REFERENCE.lorcana;
          const exCards = ref.exampleCards.map(c => `${c.name} (${c.inkType}, ${c.cardType})`).join("; ");
          showNotification("Reading card data (Lorcana)...", "info", 0);

          // 1. Name (CRITICAL)
          const nameText = await vlmZone(src, z.name, `What is the character/card name printed here? Examples: ${exCards}. Reply with ONLY the name, nothing else.`, 30);

          // 2. Subtitle (CRITICAL for unique ID)
          const subtitleText = await vlmZone(src, z.subtitle, "What subtitle is printed below the name? It starts with an em-dash. Reply with ONLY the subtitle text (without the dash), or 'none' if blank.", 30);
          cardName = subtitleText && subtitleText.toLowerCase() !== "none"
            ? `${(nameText || "").trim()} — ${subtitleText.trim()}`
            : (nameText || "").trim();

          // 3. Ink cost — number in hex
          const inkCostText = await vlmZone(src, z.inkCost, "What number is inside this hexagonal icon? Reply with ONLY the number (1-10), nothing else.", 5);
          const inkCost = inkCostText?.match(/(\d{1,2})/)?.[1] || "";

          // 4. Inkable boolean — ring fill detection
          const inkableText = await vlmZone(src, z.inkable, "Is the ring around the ink cost hexagon FILLED with gold color, or is it an EMPTY outline? Reply 'inkable' if filled gold, or 'not inkable' if empty/outline.", 10);
          const inkable = /inkable/i.test(inkableText) && !/not inkable/i.test(inkableText);

          // 5. Ink type — border color
          const inkType = await vlmZone(src, [0.0, 0.0, 0.06, 1.0], "What color is this card border? Reply ONE word: Amber, Amethyst, Emerald, Ruby, Sapphire, or Steel.", 10);

          // 6. Strength (CHARACTER only)
          const strText = await vlmZone(src, z.strength, "What number is shown inside this sun/starburst icon? Reply with ONLY the number, or 'none' if no icon is present.", 5);
          const strength = strText?.match(/(\d{1,2})/)?.[1] || "";

          // 7. Willpower (CHARACTER only)
          const wilText = await vlmZone(src, z.willpower, "What number is shown inside this shield icon? Reply with ONLY the number, or 'none' if no icon is present.", 5);
          const willpower = wilText?.match(/(\d{1,2})/)?.[1] || "";

          // 8. Card type
          const cardType = await vlmZone(src, z.cardType, "What card type is shown? Reply ONE word: Character, Action, Item, or Song.", 10);

          // 9. Classifications — dot-separated traits
          const classif = await vlmZone(src, z.classif, "Read the classification traits printed here, separated by dots. E.g. 'Storyborn · Hero · Princess'. Reply with the full text, nothing else.", 60);

          // 10. Lore value (CHARACTER only) — diamond icon
          const loreText = await vlmZone(src, z.lore, "What number is inside the diamond/lozenge icon? Reply with ONLY the number (1-4), or 'none' if not present.", 5);
          const lore = loreText?.match(/(\d)/)?.[1] || "";

          // 11. Collector number
          const collNumText = await vlmZone(src, z.collectorNum, "What is the collector number shown? Format: XX/YYY. Reply with ONLY the number, nothing else.", 15);
          const collectorNum = collNumText?.match(/(\d{1,3}\s*\/\s*\d{1,3})/)?.[0]?.replace(/\s/g, "") || "";

          // 12. Rarity — gem color
          const rarityText = await vlmZone(src, z.rarity, "What color is the small gem icon? Reply: None (Common), Bronze (Uncommon), Silver (Rare), Gold (Super Rare), or Teal (Legendary). If no gem, reply 'None'.", 15);

          // Build details
          if (cardType) details.push({ label: "Card Type", value: cardType?.split(/[\s,.]/)[0] || "" });
          if (inkCost) details.push({ label: "Ink Cost", value: inkCost });
          details.push({ label: "Inkable", value: inkable ? "Yes" : "No" });
          if (inkType) details.push({ label: "Ink Type", value: inkType?.split(/[\s,.]/)[0] || "" });
          if (classif && classif.toLowerCase() !== "none") details.push({ label: "Classification", value: classif });
          if (strength) details.push({ label: "Strength", value: strength });
          if (willpower) details.push({ label: "Willpower", value: willpower });
          if (lore) details.push({ label: "Lore", value: lore });
          if (rarityText) details.push({ label: "Rarity", value: rarityText?.split(/[\s,.]/)[0] || "" });
          if (collectorNum) details.push({ label: "Collector #", value: collectorNum });

        } else {
          // Generic fallback — use VLM with short prompt on full card
          try {
            const vlmRes = await fetch(`${API_BASE}/vision/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...getAuthHeaders() },
              body: JSON.stringify({ image_base64: frontBase64.value, prompt: "What is this card's NAME, TYPE, and RARITY? Reply only:\nCard Name: [name]\nCard Type: [type]\nRarity: [rarity]", max_tokens: 80, auto_download: false }),
            });
            if (vlmRes.ok) {
              const vlmText = (await vlmRes.json()).response || "";
              if (!cardName) cardName = extractField(vlmText, "Card Name");
              const ct = extractField(vlmText, "Card Type");
              cardRarity = extractField(vlmText, "Rarity") || cardRarity;
              if (ct) details.push({ label: "Card Type", value: ct });
            }
          } catch (e) { /* */ }
          if (cardRarity) details.push({ label: "Rarity", value: cardRarity });
        }

        // Final card name fallback — use first non-trivial OCR line from full-card OCR
        if (!cardName) {
          cardName = ocrLines.find(l => l.length > 2 && l.length < 60 &&
            !/^(STAGE|Basic|Evolves|HP|\d{1,2}$|©|weakness|resistance|retreat|Illus|CHARACTER|EVENT|LEADER)/i.test(l)) || "Unknown Card";
        }

        console.log("[TCGAnalysis] Extracted — Name:", cardName, "| Details:", details.length, "fields");

        // Step 3: PGT Condition grading — grade front and back separately
        showNotification("Grading front condition...", "info", 0);
        const sideGradePrompt = `Grade this trading card's physical condition. Use a scale from 100 (poor) to 1000 (pristine). A new card from a sealed pack is typically 850 to 950.

Reply ONLY with these 4 lines, nothing else:
Centering: 850
Corners: 900
Surface: 875
Edges: 860

Replace the example numbers with your actual scores based on what you see. Check: border alignment (centering), corner sharpness vs wear (corners), scratches or print defects (surface), edge whitening or chips (edges).`;

        let frontGradeText = "";
        let backGradeText = "";

        // Grade front
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

        // Grade back (if available)
        if (backBase64.value) {
          showNotification("Grading back condition...", "info", 0);
          const backGradeRes = await fetch(`${API_BASE}/vision/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({
              image_base64: backBase64.value,
              prompt: sideGradePrompt,
              max_tokens: 200,
              auto_download: false,
            }),
          });
          if (backGradeRes.ok) {
            backGradeText = (await backGradeRes.json()).response || "";
          }
        }

        const grading = parseGrading(frontGradeText, backGradeText);

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
          backImage: backPreview.value,
          backBase64: backBase64.value,
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
      backPreview.value = null;
      backBase64.value = null;
      scannedCard.value = null;
      stopCamera();
    }

    function loadFromHistory(entry) {
      frontPreview.value = entry.fullImage || entry.thumbnail;
      frontBase64.value =
        entry.frontBase64 || entry.fullImage || entry.thumbnail;
      backPreview.value = entry.backImage || null;
      backBase64.value = entry.backBase64 || null;
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
        g.subGrades.forEach((s) => lines.push(`  ${s.name}: ${s.score}`));
      }
      if (c.pricing?.variants) {
        lines.push("", "Market Prices:");
        c.pricing.variants.forEach((v) =>
          lines.push(`  ${v.type}: $${v.market?.toFixed(2) || "—"}`),
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
      inputModes,
      collections,
      frontPreview,
      frontBase64,
      backPreview,
      backBase64,
      isScanning,
      scanStatus,
      modelLoading,
      modelReady,
      cameraActive,
      scannedCard,
      scanHistory,
      showBack,
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
/* ─── Shared Skill Styles ─────────────────────────────────────────── */
.models__activity--payouts {
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  backdrop-filter: blur(32px);
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
  color: rgba(255, 255, 255, 0.8);
  text-align: left;
}
.rotating {
  animation: rotate 1s linear infinite;
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
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  backdrop-filter: blur(32px);
}
.category-selector input[type="radio"] + label.radio.category:hover {
  background: rgba(97, 55, 142, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
  color: rgba(255, 255, 255, 0.8);
}
.category-selector input[type="radio"]:checked + label.radio.category {
  color: rgba(255, 255, 255, 1);
  border: 1px solid rgba(255, 255, 255, 1);
  background: rgba(97, 55, 142, 0.33);
  backdrop-filter: blur(64px);
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
  color: rgba(255, 255, 255, 0.6);
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
  color: rgba(255, 255, 255, 0.8);
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
  color: #fff;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
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
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ─── Card Flip (hover back over front) ──────────────────────────── */
.card-flip-container {
  position: relative;
  cursor: pointer;
}
.card-preview-container {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(155, 109, 200, 0.2);
  background: rgba(10, 5, 20, 0.4);
}
.card-back-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
}
.card-preview-image {
  width: 100%;
  display: block;
  border-radius: 12px;
}
.card-side-label {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: rgba(255, 255, 255, 0.7);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.flip-hint {
  display: block;
  text-align: center;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 6px;
}
.card-flip-enter-active { transition: opacity 0.25s ease; }
.card-flip-leave-active { transition: opacity 0.2s ease; }
.card-flip-enter-from, .card-flip-leave-to { opacity: 0; }

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
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.detail-label {
  font-size: 0.8rem;
  min-width: 100px;
  flex-shrink: 0;
}
.detail-value {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.85);
}

/* ─── Analysis Panel ──────────────────────────────────────────────── */
.analysis-panel {
  background: rgba(10, 5, 20, 0.35);
  border: 1px solid rgba(155, 109, 200, 0.12);
  border-radius: 10px;
  padding: 1rem 1.25rem;
}
.analysis-content {
  color: rgba(255, 255, 255, 0.85);
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
  color: rgba(255, 255, 255, 0.9);
}
.grade-score {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.5);
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
  color: rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}
.sub-grade-bar-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
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
  color: rgba(255, 255, 255, 0.5);
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
  border: 1px solid rgba(255, 255, 255, 0.06);
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
  color: rgba(255, 255, 255, 0.4);
}

/* ─── OCR Details ─────────────────────────────────────────────────── */
.ocr-details {
  background: rgba(10, 5, 20, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
}
.ocr-summary {
  padding: 0.75rem 1rem;
  cursor: pointer;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
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
  background: rgba(0, 0, 0, 0.15);
  padding: 0.75rem 1rem;
  margin: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
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
  border: 1px solid rgba(255, 255, 255, 0.06);
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
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-meta {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
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
</style>

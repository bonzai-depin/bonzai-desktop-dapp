<template>
  <section class="memory-graph" :class="{ 'memory-graph--empty': !graph.nodes.length }">
    <header class="memory-hero">
      <div>
        <p class="bz-eyebrow">{{ $t('views.memory.eyebrow') }}</p>
        <h1 class="bz-h1 fira-sans-condensed-black-italic">{{ $t('views.memory.title') }}</h1>
        <p class="memory-subtitle">
          {{ $t('views.memory.subtitle') }}
        </p>
      </div>
      <button class="bz-btn bz-btn--ghost memory-refresh fira-sans-condensed-black-italic" @click="refreshMemory">
        <span class="material-symbols-outlined">sync</span>
        {{ $t('common.refresh') }}
      </button>
    </header>

    <div class="memory-layout" :class="{ 'memory-layout--empty': !graph.nodes.length }">
      <aside v-if="graph.nodes.length" class="memory-rail" aria-label="Memory summary and filters">
        <div class="memory-identity">
          <span class="material-symbols-outlined memory-identity__icon">account_tree</span>
          <div>
            <span class="memory-identity__label">{{ memory?.label || "Local User Memory" }}</span>
            <span class="memory-identity__meta">{{ identityLabel }}</span>
          </div>
        </div>

        <div class="memory-stats">
          <div v-for="stat in stats" :key="stat.label" class="memory-stat">
            <span class="memory-stat__value fira-sans-condensed-black-italic">{{ stat.value }}</span>
            <span class="memory-stat__label">{{ stat.label }}</span>
          </div>
        </div>

        <label class="memory-search">
          <span class="material-symbols-outlined">search</span>
          <input v-model="query" type="search" placeholder="Search memory" aria-label="Search memory" />
        </label>

        <div class="memory-filters" aria-label="Filter memory graph">
          <button
            v-for="filter in filters"
            :key="filter.id"
            class="memory-filter"
            :class="{ 'is-active': activeFilter === filter.id }"
            :aria-pressed="activeFilter === filter.id"
            @click="activeFilter = filter.id"
          >
            <span class="memory-filter__dot" :style="{ background: filter.color }"></span>
            <span>{{ filter.label }}</span>
            <strong>{{ filter.count }}</strong>
          </button>
        </div>

      </aside>

      <div class="memory-stage">
        <div class="memory-canvas-wrap" :class="{ 'is-empty': !visibleGraph.nodes.length }">
          <canvas v-if="visibleGraph.nodes.length" ref="canvasRef" class="memory-canvas" aria-label="Neuronal memory graph"></canvas>
          <div v-if="visibleGraph.nodes.length" class="memory-stage__glow" aria-hidden="true"></div>
          <div v-if="visibleGraph.nodes.length" class="memory-stage__topline">
            <span class="memory-stage__badge fira-sans-condensed-black-italic">
              {{ visibleGraph.nodes.length }} nodes
            </span>
            <span class="memory-stage__badge fira-sans-condensed-black-italic">
              {{ visibleGraph.links.length }} links
            </span>
            <span class="memory-stage__hint">Drag to orbit. Scroll to zoom. Click a neuron.</span>
          </div>
          <div v-if="visibleGraph.nodes.length" class="memory-stage__legend" aria-label="Relationship legend">
            <span v-for="item in relationLegend" :key="item.id">
              <i :style="{ background: item.color }"></i>{{ item.label }}
            </span>
          </div>
          <div v-if="visibleGraph.nodes.length" class="memory-stage__actions">
            <button class="memory-stage__action" title="Focus selected node" aria-label="Focus selected node" @click="focusSelectedNode">
              <span class="material-symbols-outlined">filter_center_focus</span>
            </button>
            <button class="memory-stage__action" title="Reset camera" aria-label="Reset camera" @click="resetCamera">
              <span class="material-symbols-outlined">home</span>
            </button>
          </div>
          <div v-if="isLoading" class="memory-empty">
            <span class="material-symbols-outlined">hourglass_empty</span>
            <strong class="fira-sans-condensed-black-italic">Reading local memory</strong>
          </div>
          <div v-else-if="loadError" class="memory-empty" role="alert"><p>{{ loadError }}</p><button type="button" class="bz-btn bz-btn--primary" @click="refreshMemory">{{ $t('common.refresh') }}</button></div>
          <div v-else-if="!visibleGraph.nodes.length && graph.nodes.length" class="memory-empty"><strong>{{ $t('rcWorkflows.noMemoryMatches') }}</strong><button type="button" class="bz-btn bz-btn--primary" @click="query = ''; activeFilter = 'all'">{{ $t('rcWorkflows.clearFilters') }}</button></div>
          <div v-else-if="!graph.nodes.length" class="memory-empty">
            <span class="material-symbols-outlined">neurology</span>
            <strong class="fira-sans-condensed-black-italic">No memory nodes yet</strong>
            <p>Generate, train, curate datasets, or chat with companions to feed the local wiki.</p>
            <div class="memory-empty__actions">
              <button type="button" class="bz-btn bz-btn--primary" @click="navigateTo('chat')">{{ $t('rcWorkflows.startChat') }}</button>
              <button type="button" class="bz-btn bz-btn--ghost" @click="navigateTo('image')">{{ $t('rcWorkflows.generate') }}</button>
              <button type="button" class="bz-btn bz-btn--ghost" @click="navigateTo('tune')">{{ $t('rcWorkflows.importDataset') }}</button>
            </div>
          </div>
        </div>
      </div>

      <aside v-if="visibleGraph.nodes.length" class="memory-detail" aria-label="Selected memory node">
        <template v-if="selectedNode">
          <div class="memory-detail__head">
            <span class="memory-detail__kind">{{ selectedNode.kindLabel }}</span>
            <h2 class="fira-sans-condensed-black-italic">{{ selectedNode.title }}</h2>
            <div class="memory-detail__actions">
              <button class="memory-link-action" :disabled="!selectedNeighbors.length" @click="selectPreviousNeighbor">
                <span class="material-symbols-outlined">arrow_back</span>
                Previous
              </button>
              <button class="memory-link-action" @click="focusSelectedNode">
                <span class="material-symbols-outlined">filter_center_focus</span>
                Focus
              </button>
              <button class="memory-link-action" :disabled="!selectedNeighbors.length" @click="selectNextNeighbor">
                Next
                <span class="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </div>
          <p class="memory-detail__text">{{ selectedNode.text || selectedNode.summary || "No detail recorded yet." }}</p>

          <div class="memory-detail__meta">
            <div v-if="selectedNode.createdAt">
              <span>Created</span>
              <strong>{{ formatDate(selectedNode.createdAt) }}</strong>
            </div>
            <div v-if="selectedNode.sourceId">
              <span>Source</span>
              <strong>{{ selectedNode.sourceId }}</strong>
            </div>
            <div v-if="selectedNode.confidence">
              <span>Confidence</span>
              <strong>{{ selectedNode.confidence }}</strong>
            </div>
          </div>

          <div v-if="selectedNeighbors.length" class="memory-neighbors">
            <h3 class="fira-sans-condensed-black-italic">Linked Memory</h3>
            <button
              v-for="item in selectedNeighborRows"
              :key="item.node.id"
              class="memory-neighbor"
              @click="selectNode(item.node.id, true)"
            >
              <span class="memory-neighbor__type" :style="{ color: item.relation.color }">{{ item.relation.label }}</span>
              <span>{{ item.node.title }}</span>
            </button>
          </div>
        </template>
        <template v-else>
          <div class="memory-detail__empty">
            <span class="material-symbols-outlined">hub</span>
            <strong class="fira-sans-condensed-black-italic">Select a neuron</strong>
            <p>Click a node to inspect the note, page, source, or contribution behind it.</p>
          </div>
        </template>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import memoryService from "../services/memory.service.js";
import { useI18n } from "../i18n/index.js";
import { withTimeout } from "../utils/withTimeout.js";

const i18n = useI18n();

const TYPE_META = {
  person: { label: "People", color: "#9b5cff" },
  project: { label: "Projects", color: "#39d0ff" },
  skill: { label: "Skills", color: "#38d996" },
  company: { label: "Companies", color: "#ffd166" },
  dataset: { label: "Datasets", color: "#ff7a90" },
  generation: { label: "Generations", color: "#f59e0b" },
  contribution: { label: "Contributions", color: "#ff4fd8" },
  note: { label: "Notes", color: "#f4f0ff" },
  source: { label: "Sources", color: "#8da2c8" },
};

const RELATION_META = {
  provenance: { label: "Provenance", color: "#ff4fd8", opacity: 0.42 },
  source: { label: "Source", color: "#8da2c8", opacity: 0.35 },
  page: { label: "Page link", color: "#9b5cff", opacity: 0.44 },
  backlink: { label: "Backlink", color: "#39d0ff", opacity: 0.3 },
};

const relationLegend = Object.entries(RELATION_META).map(([id, meta]) => ({ id, ...meta }));

const filters = computed(() => {
  const counts = visibleTypeCounts.value;
  return [
    { id: "all", label: "All", color: "var(--bz-accent)", count: graph.value.nodes.length },
    ...Object.entries(TYPE_META).map(([id, meta]) => ({
      id,
      label: meta.label,
      color: meta.color,
      count: counts[id] || 0,
    })).filter((filter) => filter.count > 0),
  ];
});

const canvasRef = ref(null);
const memory = ref(null);
const isLoading = ref(false);
const loadError = ref("");
const navigateTo = (tab) => window.dispatchEvent(new CustomEvent("navigate-to-tab", { detail: { tab } }));
const query = ref("");
const activeFilter = ref("all");
const selectedNodeId = ref("");
const neighborCursor = ref(0);

let renderer;
let scene;
let camera;
let controls;
let graphGroup;
let raycaster;
let pointer;
let nodePositions = new Map();
let graphBounds = new THREE.Box3();
let pointerStart = null;
let animationFrame = 0;
let resizeObserver;

const stats = computed(() => {
  const m = memory.value || {};
  return [
    { label: "Sources", value: (m.rawSources || []).length },
    { label: "Notes", value: (m.atomicNotes || []).length },
    { label: "Pages", value: Object.keys(m.pages || {}).length },
    { label: "Backlinks", value: Object.values(m.backlinks || {}).reduce((sum, links) => sum + links.length, 0) },
  ];
});

const identityLabel = computed(() => {
  const metadata = memory.value?.metadata || {};
  if (metadata.wallet) return `${metadata.identityType || "wallet"} ${metadata.wallet.slice(0, 6)}...${metadata.wallet.slice(-4)}`;
  return metadata.identityType === "local" ? "Local device identity" : "Private local vault";
});

const graph = computed(() => buildMemoryGraph(memory.value));

const visibleTypeCounts = computed(() => {
  return graph.value.nodes.reduce((acc, node) => {
    acc[node.type] = (acc[node.type] || 0) + 1;
    return acc;
  }, {});
});

const visibleGraph = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase();
  const directMatches = new Set();
  for (const node of graph.value.nodes) {
    const matchesFilter = activeFilter.value === "all" || node.type === activeFilter.value;
    const haystack = `${node.title} ${node.text || ""} ${node.summary || ""} ${node.kindLabel}`.toLowerCase();
    if (matchesFilter && (!normalizedQuery || haystack.includes(normalizedQuery))) directMatches.add(node.id);
  }

  if (!normalizedQuery) {
    const nodes = graph.value.nodes.filter(node => directMatches.has(node.id));
    const ids = new Set(nodes.map(node => node.id));
    return {
      nodes,
      links: graph.value.links.filter(link => ids.has(link.source) && ids.has(link.target)),
    };
  }

  const expanded = new Set(directMatches);
  for (const link of graph.value.links) {
    if (directMatches.has(link.source)) expanded.add(link.target);
    if (directMatches.has(link.target)) expanded.add(link.source);
  }
  const nodes = graph.value.nodes.filter(node => expanded.has(node.id));
  const ids = new Set(nodes.map(node => node.id));
  return {
    nodes,
    links: graph.value.links.filter(link => ids.has(link.source) && ids.has(link.target)),
  };
});

const selectedNode = computed(() => {
  return graph.value.nodes.find(node => node.id === selectedNodeId.value) || visibleGraph.value.nodes[0] || null;
});

const selectedNeighbors = computed(() => {
  if (!selectedNode.value) return [];
  const neighborIds = new Set();
  for (const link of graph.value.links) {
    if (link.source === selectedNode.value.id) neighborIds.add(link.target);
    if (link.target === selectedNode.value.id) neighborIds.add(link.source);
  }
  return graph.value.nodes.filter(node => neighborIds.has(node.id)).slice(0, 12);
});

const selectedNeighborRows = computed(() => {
  if (!selectedNode.value) return [];
  return selectedNeighbors.value.map((node) => ({
    node,
    relation: relationForNodes(selectedNode.value.id, node.id),
  }));
});

const connectedNodeIds = computed(() => {
  if (!selectedNode.value) return new Set();
  const ids = new Set([selectedNode.value.id]);
  for (const link of visibleGraph.value.links) {
    if (link.source === selectedNode.value.id) ids.add(link.target);
    if (link.target === selectedNode.value.id) ids.add(link.source);
  }
  return ids;
});

const selectedLinkKeys = computed(() => {
  if (!selectedNode.value) return new Set();
  const keys = new Set();
  for (const link of visibleGraph.value.links) {
    if (link.source === selectedNode.value.id || link.target === selectedNode.value.id) {
      keys.add(linkKey(link.source, link.target));
    }
  }
  return keys;
});

async function refreshMemory() {
  if (isLoading.value) return;
  isLoading.value = true;
  loadError.value = "";
  try {
    memory.value = await withTimeout(memoryService.getUserMemory(), 10000, i18n.t("rcWorkflows.timeout"));
    if (!selectedNodeId.value && graph.value.nodes[0]) selectedNodeId.value = graph.value.nodes[0].id;
  } catch (error) {
    loadError.value = error?.message || String(error);
  } finally {
    isLoading.value = false;
  }
}

function selectNode(id, focus = false) {
  selectedNodeId.value = id;
  neighborCursor.value = 0;
  if (focus) requestAnimationFrame(() => focusSelectedNode());
}

function selectNextNeighbor() {
  if (!selectedNeighbors.value.length) return;
  const next = selectedNeighbors.value[neighborCursor.value % selectedNeighbors.value.length];
  neighborCursor.value += 1;
  selectNode(next.id, true);
}

function selectPreviousNeighbor() {
  if (!selectedNeighbors.value.length) return;
  neighborCursor.value = (neighborCursor.value - 1 + selectedNeighbors.value.length) % selectedNeighbors.value.length;
  selectNode(selectedNeighbors.value[neighborCursor.value].id, true);
}

function relationForNodes(a, b) {
  const link = graph.value.links.find(item => linkKey(item.source, item.target) === linkKey(a, b));
  return RELATION_META[link?.relation] || RELATION_META.backlink;
}

function buildMemoryGraph(m) {
  if (!m) return { nodes: [], links: [] };
  const nodes = new Map();
  const links = [];

  const addNode = (node) => {
    if (!node?.id || nodes.has(node.id)) return;
    nodes.set(node.id, {
      text: "",
      summary: "",
      createdAt: "",
      sourceId: "",
      confidence: "",
      ...node,
      kindLabel: node.kindLabel || TYPE_META[node.type]?.label?.replace(/s$/, "") || node.type,
    });
  };
  const addLink = (source, target, weight = 1, relation = "backlink") => {
    if (!source || !target || source === target) return;
    links.push({ source, target, weight, relation });
  };

  const pages = Object.values(m.pages || {}).slice(0, 220);
  for (const page of pages) {
    addNode({
      id: page.id,
      type: TYPE_META[page.type] ? page.type : "note",
      kind: "page",
      kindLabel: page.type,
      title: page.title || page.id,
      summary: page.summary,
      text: page.summary,
      createdAt: page.createdAt,
    });
  }

  for (const parent of (m.contributionParents || []).slice(0, 80)) {
    addNode({
      id: `contribution:${parent}`,
      type: "contribution",
      kind: "contribution",
      kindLabel: "contribution",
      title: shortHash(parent),
      text: parent,
    });
  }

  const sourcesById = new Map();
  for (const source of (m.rawSources || []).slice(0, 120)) {
    sourcesById.set(source.sourceId, source);
    addNode({
      id: `source:${source.sourceId}`,
      type: "source",
      kind: "source",
      kindLabel: source.type || "source",
      title: sourceTitle(source),
      text: source.text || source.summary,
      sourceId: source.sourceId,
      createdAt: source.createdAt,
    });
    const parent = source.contributionId || source.contribution_id || source.contributionHash || source.contentHash;
    if (parent) addLink(`contribution:${parent}`, `source:${source.sourceId}`, 1.2, "provenance");
  }

  for (const note of (m.atomicNotes || []).slice(0, 320)) {
    addNode({
      id: note.id,
      type: "note",
      kind: note.kind || "note",
      kindLabel: note.kind || "note",
      title: noteTitle(note),
      text: note.text,
      sourceId: note.sourceId,
      confidence: note.confidence,
      createdAt: note.createdAt,
    });
    if (note.sourceId && sourcesById.has(note.sourceId)) addLink(`source:${note.sourceId}`, note.id, 1.1, "source");
    for (const link of note.links || []) addLink(note.id, link, 1.4, "page");
  }

  for (const [from, targets] of Object.entries(m.backlinks || {})) {
    for (const target of (targets || []).slice(0, 20)) addLink(from, target, 0.8, "backlink");
  }

  return {
    nodes: Array.from(nodes.values()),
    links: dedupeLinks(links).filter(link => nodes.has(link.source) && nodes.has(link.target)).slice(0, 900),
  };
}

function dedupeLinks(links) {
  const seen = new Set();
  return links.filter((link) => {
    const key = linkKey(link.source, link.target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function linkKey(source, target) {
  return [source, target].sort().join("::");
}

function sourceTitle(source) {
  if (source.generationType) return `${source.generationType} generation`;
  if (source.companionName) return `${source.companionName} memory`;
  if (source.project) return source.project;
  return source.type || "Memory source";
}

function noteTitle(note) {
  const text = note.text || note.id;
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

function shortHash(value) {
  const text = String(value || "");
  if (text.length <= 18) return text || "Contribution";
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

function hashValue(value) {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function nodePosition(node, index) {
  const order = Object.keys(TYPE_META);
  const typeIndex = Math.max(0, order.indexOf(node.type));
  const typeAngle = (typeIndex / Math.max(1, order.length)) * Math.PI * 2;
  const seed = hashValue(node.id);
  const local = (seed % 6283) / 1000;
  const layer = node.kind === "page" ? 0.95 : node.type === "note" ? 0.55 : 1.35;
  const radius = 4.8 + (typeIndex % 3) * 1.5 + (seed % 100) / 180;
  const wobble = node.type === "note" ? 1.8 : 0.9;
  return new THREE.Vector3(
    Math.cos(typeAngle) * radius * layer + Math.cos(local) * wobble,
    Math.sin((index + seed % 17) * 0.45) * 2.4 + (node.type === "contribution" ? -2.2 : 0),
    Math.sin(typeAngle) * radius * layer + Math.sin(local) * wobble,
  );
}

function centeredPositions(nodes) {
  const positions = new Map();
  nodes.forEach((node, index) => positions.set(node.id, nodePosition(node, index)));
  if (!positions.size) return positions;
  const box = new THREE.Box3();
  for (const position of positions.values()) box.expandByPoint(position);
  const center = new THREE.Vector3();
  box.getCenter(center);
  for (const position of positions.values()) position.sub(center);
  return positions;
}

function colorForType(type) {
  return TYPE_META[type]?.color || "#9b5cff";
}

function setupScene() {
  if (!canvasRef.value || renderer) return;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  camera.position.set(0, 3.6, 17);
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 38;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const light = new THREE.PointLight(0xa76cff, 4, 50);
  light.position.set(0, 8, 10);
  scene.add(light);

  canvasRef.value.addEventListener("pointerdown", onPointerDown);
  canvasRef.value.addEventListener("pointerup", onPointerUp);
  resizeObserver = new ResizeObserver(resizeScene);
  resizeObserver.observe(canvasRef.value.parentElement);
  resizeScene();
  animate();
}

function resizeScene() {
  if (!renderer || !camera || !canvasRef.value?.parentElement) return;
  const rect = canvasRef.value.parentElement.getBoundingClientRect();
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  camera.aspect = rect.width / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
}

function renderGraph() {
  if (!scene || !renderer) return;
  if (graphGroup) {
    scene.remove(graphGroup);
    graphGroup.traverse((object) => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
  }

  graphGroup = new THREE.Group();
  nodePositions = centeredPositions(visibleGraph.value.nodes);
  graphBounds = boundsForPositions(nodePositions);

  for (const [relation, meta] of Object.entries(RELATION_META)) {
    const linkPositions = [];
    const highlightPositions = [];
    for (const link of visibleGraph.value.links.filter(item => item.relation === relation)) {
      const a = nodePositions.get(link.source);
      const b = nodePositions.get(link.target);
      if (!a || !b) continue;
      const target = selectedLinkKeys.value.has(linkKey(link.source, link.target)) ? highlightPositions : linkPositions;
      target.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    addLineSegments(linkPositions, meta.color, meta.opacity, 1);
    addLineSegments(highlightPositions, meta.color, 0.88, 2);
  }

  function addLineSegments(linkPositions, color, opacity, width) {
    if (!linkPositions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(linkPositions, 3));
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      linewidth: width,
      blending: THREE.AdditiveBlending,
    });
    graphGroup.add(new THREE.LineSegments(geometry, material));
  }

  const sphere = new THREE.SphereGeometry(1, 24, 16);
  for (const node of visibleGraph.value.nodes) {
    const selected = node.id === selectedNode.value?.id;
    const connected = connectedNodeIds.value.has(node.id);
    const size = selected ? 0.42 : node.kind === "page" ? 0.24 : node.type === "note" ? 0.12 : 0.17;
    const material = new THREE.MeshStandardMaterial({
      color: colorForType(node.type),
      emissive: colorForType(node.type),
      emissiveIntensity: selected ? 1.1 : connected ? 0.62 : 0.24,
      roughness: 0.55,
      metalness: 0.08,
      transparent: true,
      opacity: selected || connected ? 0.98 : node.type === "source" ? 0.44 : 0.58,
    });
    const mesh = new THREE.Mesh(sphere, material);
    mesh.position.copy(nodePositions.get(node.id));
    mesh.scale.setScalar(size);
    mesh.userData.nodeId = node.id;
    graphGroup.add(mesh);

    if (shouldLabelNode(node, selected, connected)) {
      const label = createLabelSprite(node.title, selected ? colorForType(node.type) : "#f4f0ff");
      label.position.copy(mesh.position).add(new THREE.Vector3(0, selected ? 0.62 : 0.36, 0));
      label.userData.nodeId = node.id;
      graphGroup.add(label);
    }
  }

  scene.add(graphGroup);
}

function animate() {
  animationFrame = requestAnimationFrame(animate);
  controls?.update();
  renderer?.render(scene, camera);
}

function onPointerDown(event) {
  pointerStart = { x: event.clientX, y: event.clientY };
}

function onPointerUp(event) {
  if (!pointerStart) return;
  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (moved > 7) return;
  if (!renderer || !camera || !canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(graphGroup?.children || [], true);
  const hit = hits.find(item => item.object.userData.nodeId);
  if (hit?.object?.userData?.nodeId) selectNode(hit.object.userData.nodeId, true);
}

function focusSelectedNode() {
  if (!selectedNode.value) return;
  const position = nodePositions.get(selectedNode.value.id);
  if (!position || !controls || !camera) return;
  const size = new THREE.Vector3();
  graphBounds.getSize(size);
  const radius = Math.max(size.x, size.y, size.z, 6);
  const offset = new THREE.Vector3(0, Math.max(2.4, radius * 0.16), Math.min(14, Math.max(7, radius * 0.42)));
  controls.target.copy(position);
  camera.position.copy(position).add(offset);
  controls.update();
}

function resetCamera() {
  if (!camera || !controls) return;
  controls.target.set(0, 0, 0);
  const size = new THREE.Vector3();
  graphBounds.getSize(size);
  const radius = Math.max(size.x, size.y, size.z, 10);
  camera.position.set(0, Math.max(3.6, radius * 0.12), Math.min(34, radius * 1.08));
  controls.update();
}

function shouldLabelNode(node, selected, connected) {
  if (selected || connected) return true;
  if (node.kind === "page" || node.type === "contribution") return true;
  if (node.type === "source" && visibleGraph.value.nodes.length <= 160) return true;
  if (node.type === "note" && visibleGraph.value.nodes.length <= 60) return true;
  return false;
}

function boundsForPositions(positions) {
  const box = new THREE.Box3();
  for (const position of positions.values()) box.expandByPoint(position);
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(10, 10, 10));
  return box;
}

function createLabelSprite(text, color) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const label = String(text || "Memory").slice(0, 44);
  const scale = 2;
  canvas.width = 360 * scale;
  canvas.height = 72 * scale;
  context.scale(scale, scale);
  context.font = "800 18px Fira Sans, sans-serif";
  const textWidth = Math.min(316, context.measureText(label).width);
  context.fillStyle = "rgba(8, 10, 18, 0.84)";
  roundRect(context, 18, 13, textWidth + 26, 38, 19);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = color;
  context.fillText(label, 31, 38);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.8, 0.56, 1);
  return sprite;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function disposeScene() {
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  renderer?.domElement?.removeEventListener("pointerdown", onPointerDown);
  renderer?.domElement?.removeEventListener("pointerup", onPointerUp);
  if (graphGroup) {
    graphGroup.traverse((object) => {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    });
  }
  renderer?.dispose?.();
  controls?.dispose?.();
  renderer = null;
  scene = null;
  camera = null;
  controls = null;
  graphGroup = null;
}

function formatDate(value) {
  if (!value) return "";
  return i18n.date(value, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

watch(visibleGraph, async () => {
  await nextTick();
  if (!visibleGraph.value.nodes.length) { disposeScene(); return; }
  setupScene();
  renderGraph();
}, { deep: true });

watch(selectedNodeId, () => {
  renderGraph();
});

onMounted(async () => {
  await refreshMemory();
  await nextTick();
  setupScene();
  renderGraph();
});

onUnmounted(disposeScene);
</script>

<style scoped>
.memory-graph {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  padding: var(--bz-space-6);
  color: var(--bz-fg);
  background:
    radial-gradient(circle at 58% 22%, color-mix(in srgb, var(--bz-accent) 18%, transparent) 0 18%, transparent 42%),
    var(--bz-canvas);
}

.memory-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--bz-space-4);
}

.memory-subtitle {
  max-width: 780px;
  margin: var(--bz-space-3) 0 0;
  color: var(--bz-fg-muted);
  font-size: var(--bz-size-body);
}

.memory-refresh {
  flex: 0 0 auto;
}

.memory-layout.memory-layout--empty { grid-template-columns: minmax(0, 1fr); }
.memory-graph.memory-graph--empty { background: var(--bz-canvas); }
.memory-layout--empty .memory-canvas-wrap {
  min-height: 280px;
  height: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.memory-layout--empty .memory-empty { position: relative; min-height: 280px; }
.memory-empty__actions { display: flex; flex-wrap: wrap; gap: var(--bz-space-2); justify-content: center; }
.memory-layout {
  display: grid;
  grid-template-columns: 280px minmax(460px, 1fr) 330px;
  gap: var(--bz-space-4);
  min-height: 0;
  flex: 1;
}

.memory-rail,
.memory-detail {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-lg);
  background: color-mix(in srgb, var(--bz-panel) 86%, transparent);
  box-shadow: var(--bz-shadow-sm);
}

.memory-rail {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-4);
  padding: var(--bz-space-4);
}

.memory-identity {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  padding-bottom: var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
}

.memory-identity__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  color: var(--bz-accent);
  background: color-mix(in srgb, var(--bz-accent) 15%, transparent);
}

.memory-identity__label,
.memory-identity__meta {
  display: block;
}

.memory-identity__label {
  font-weight: 700;
}

.memory-identity__meta {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-caption);
}

.memory-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-2);
}

.memory-stat {
  min-height: 76px;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-md);
  background: var(--bz-card);
}

.memory-stat__value,
.memory-stat__label {
  display: block;
}

.memory-stat__value {
  font-size: 28px;
  color: var(--bz-accent);
}

.memory-stat__label {
  color: var(--bz-fg-muted);
  font-size: var(--bz-size-caption);
}

.memory-search {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  height: 42px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-md);
  background: var(--bz-card);
}

.memory-search .material-symbols-outlined {
  color: var(--bz-fg-low);
  font-size: 18px;
}

.memory-search input {
  width: 100%;
  border: 0;
  outline: 0;
  color: var(--bz-fg);
  background: transparent;
  font: inherit;
}

.memory-filters {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}

.memory-filter {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  align-items: center;
  gap: var(--bz-space-2);
  width: 100%;
  min-height: 36px;
  padding: 0 var(--bz-space-3);
  border: 1px solid transparent;
  border-radius: var(--bz-radius-md);
  color: var(--bz-fg-muted);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.memory-filter:hover,
.memory-filter.is-active {
  border-color: color-mix(in srgb, var(--bz-accent) 42%, var(--bz-border));
  color: var(--bz-fg);
  background: color-mix(in srgb, var(--bz-accent) 12%, transparent);
}

.memory-filter__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.memory-filter strong {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
}

.memory-stage {
  min-width: 0;
  min-height: 0;
}

.memory-canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 640px;
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-lg);
  background:
    radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--bz-accent) 10%, transparent), transparent 55%),
    color-mix(in srgb, var(--bz-panel) 82%, #000 18%);
  box-shadow: var(--bz-shadow-lg);
}

.memory-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.memory-canvas:active {
  cursor: grabbing;
}

.memory-stage__glow {
  position: absolute;
  inset: 12%;
  pointer-events: none;
  border: 1px solid color-mix(in srgb, var(--bz-accent) 20%, transparent);
  border-radius: 50%;
  filter: blur(18px);
  opacity: 0.45;
}

.memory-stage__topline {
  position: absolute;
  top: var(--bz-space-4);
  left: var(--bz-space-4);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  max-width: calc(100% - 112px);
}

.memory-stage__badge {
  padding: 6px 10px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-pill);
  color: var(--bz-fg);
  background: color-mix(in srgb, var(--bz-panel) 88%, transparent);
  font-size: var(--bz-size-caption);
}

.memory-stage__hint {
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--bz-border) 70%, transparent);
  border-radius: var(--bz-radius-pill);
  color: var(--bz-fg-low);
  background: color-mix(in srgb, var(--bz-panel) 76%, transparent);
  font-size: var(--bz-size-caption);
}

.memory-stage__legend {
  position: absolute;
  left: var(--bz-space-4);
  bottom: var(--bz-space-4);
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  max-width: calc(100% - var(--bz-space-8));
  pointer-events: none;
}

.memory-stage__legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-pill);
  color: var(--bz-fg-muted);
  background: color-mix(in srgb, var(--bz-panel) 84%, transparent);
  font-size: var(--bz-size-micro);
  font-weight: 800;
  text-transform: uppercase;
}

.memory-stage__legend i {
  width: 18px;
  height: 2px;
  border-radius: 2px;
  box-shadow: 0 0 10px currentColor;
}

.memory-stage__actions {
  position: absolute;
  top: var(--bz-space-4);
  right: var(--bz-space-4);
  display: flex;
  gap: var(--bz-space-2);
}

.memory-stage__action {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--bz-border);
  border-radius: 50%;
  color: var(--bz-fg-muted);
  background: color-mix(in srgb, var(--bz-panel) 88%, transparent);
  cursor: pointer;
}

.memory-stage__action:hover {
  border-color: var(--bz-accent);
  color: var(--bz-fg);
  background: color-mix(in srgb, var(--bz-accent) 14%, var(--bz-panel));
}

.memory-stage__action .material-symbols-outlined {
  font-size: 18px;
}

.memory-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-8);
  color: var(--bz-fg-muted);
  text-align: center;
}

.memory-empty .material-symbols-outlined {
  color: var(--bz-accent);
  font-size: 36px;
}

.memory-empty strong {
  color: var(--bz-fg);
  font-size: 26px;
}

.memory-detail {
  padding: var(--bz-space-4);
}

.memory-detail__head {
  padding-bottom: var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
}

.memory-detail__kind {
  display: inline-flex;
  margin-bottom: var(--bz-space-2);
  padding: 4px 9px;
  border-radius: var(--bz-radius-pill);
  color: var(--bz-accent);
  background: color-mix(in srgb, var(--bz-accent) 14%, transparent);
  font-size: var(--bz-size-micro);
  font-weight: 800;
  text-transform: uppercase;
}

.memory-detail h2 {
  margin: 0;
  font-size: 30px;
  line-height: 0.95;
  overflow-wrap: anywhere;
}

.memory-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-3);
}

.memory-link-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-pill);
  color: var(--bz-fg-muted);
  background: transparent;
  font-size: var(--bz-size-caption);
  font-weight: 800;
  cursor: pointer;
}

.memory-link-action:hover:not(:disabled) {
  border-color: var(--bz-accent);
  color: var(--bz-fg);
  background: color-mix(in srgb, var(--bz-accent) 12%, transparent);
}

.memory-link-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.memory-link-action .material-symbols-outlined {
  font-size: 15px;
}

.memory-detail__text {
  margin: var(--bz-space-4) 0;
  color: var(--bz-fg-muted);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.memory-detail__meta {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-md);
  background: var(--bz-card);
}

.memory-detail__meta div {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: var(--bz-space-3);
}

.memory-detail__meta span {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-caption);
}

.memory-detail__meta strong {
  min-width: 0;
  color: var(--bz-fg);
  font-size: var(--bz-size-caption);
  overflow-wrap: anywhere;
}

.memory-neighbors {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-5);
}

.memory-neighbors h3 {
  margin: 0 0 var(--bz-space-2);
  font-size: 22px;
}

.memory-neighbor {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-md);
  color: var(--bz-fg-muted);
  background: var(--bz-card);
  text-align: left;
  cursor: pointer;
}

.memory-neighbor:hover {
  border-color: var(--bz-accent);
  color: var(--bz-fg);
  transform: translateY(-1px);
}

.memory-neighbor__type {
  color: var(--bz-accent);
  font-size: var(--bz-size-micro);
  font-weight: 800;
  text-transform: uppercase;
}

.memory-detail__empty {
  display: grid;
  min-height: 420px;
  place-content: center;
  justify-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg-muted);
  text-align: center;
}

.memory-detail__empty .material-symbols-outlined {
  color: var(--bz-accent);
  font-size: 40px;
}

.memory-detail__empty strong {
  color: var(--bz-fg);
  font-size: 24px;
}

@media (max-width: 1280px) {
  .memory-layout {
    grid-template-columns: 240px minmax(360px, 1fr);
  }

  .memory-detail {
    grid-column: 1 / -1;
    min-height: 260px;
  }
}

@media (max-width: 900px) {
  .memory-graph {
    overflow: auto;
    padding: var(--bz-space-4);
  }

  .memory-hero,
  .memory-layout {
    display: flex;
    flex-direction: column;
  }

  .memory-canvas-wrap {
    min-height: 520px;
  }
}
</style>

// dataset-studio.js
// Simple CRUD engine for the Dataset Studio.
// Collect training data (game or text) with descriptions for LoRA finetuning.

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Game Tiers — structured skill progression for Three.js game dev LoRA
// ─────────────────────────────────────────────────────────────────────────────
export const GAME_TIERS = [
  { id: 1,  name: "Primitives",           desc: "Scene setup, camera, renderer, basic meshes, lighting" },
  { id: 2,  name: "Materials & Shaders",  desc: "PBR materials, custom ShaderMaterial, GLSL, post-processing" },
  { id: 3,  name: "Geometry & Terrain",   desc: "Procedural geometry, heightmaps, infinite terrain, LOD" },
  { id: 4,  name: "Models & Assets",      desc: "GLTF/GLB loading, Blender workflow, animations, textures" },
  { id: 5,  name: "Physics",              desc: "Cannon-es/Rapier integration, collision, rigid bodies, vehicles" },
  { id: 6,  name: "Controls & Input",     desc: "FPS/orbit/pointer-lock, keyboard, gamepad, mobile touch" },
  { id: 7,  name: "Animation & Particles",desc: "Skeletal animation, tweens (GSAP), particle systems, trails" },
  { id: 8,  name: "Game Systems",         desc: "State machines, entity component, inventory, health, scoring" },
  { id: 9,  name: "UI & Audio",           desc: "HUD overlays, menus, spatial audio, CSS3D" },
  { id: 10, name: "Full Games",           desc: "Complete mini-games combining 3+ tiers above" },
];

// Follows the user's models folder (see setDatasetModelDir).
let DATASET_DIR = path.join(os.homedir(), "bonzai-models", "datasets");
let STUDIO_DIR = path.join(DATASET_DIR, "dataset-studio");
let EXAMPLES_FILE = path.join(STUDIO_DIR, "examples.json");

export function setDatasetModelDir(modelDir) {
  DATASET_DIR = path.join(modelDir, "datasets");
  STUDIO_DIR = path.join(DATASET_DIR, "dataset-studio");
  EXAMPLES_FILE = path.join(STUDIO_DIR, "examples.json");
}

function ensureDirs() {
  fs.mkdirSync(STUDIO_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

function loadExamples() {
  ensureDirs();
  if (fs.existsSync(EXAMPLES_FILE)) {
    const raw = JSON.parse(fs.readFileSync(EXAMPLES_FILE, "utf-8"));
    return raw.map(migrateExample);
  }
  return [];
}

function saveExamplesFile(examples) {
  ensureDirs();
  fs.writeFileSync(EXAMPLES_FILE, JSON.stringify(examples, null, 2), "utf-8");
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

export function listExamples() {
  return loadExamples();
}

export function saveExample(example) {
  const examples = loadExamples();
  const idx = examples.findIndex((e) => e.id === example.id);
  if (idx >= 0) {
    examples[idx] = { ...examples[idx], ...example };
  } else {
    if (!example.id) example.id = crypto.randomBytes(8).toString("hex");
    if (!example.createdAt) example.createdAt = new Date().toISOString();
    examples.push(example);
  }
  saveExamplesFile(examples);
  return example;
}

export function deleteExample(id) {
  const all = loadExamples();
  saveExamplesFile(all.filter((e) => e.id !== id));
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export to JSONL
// ─────────────────────────────────────────────────────────────────────────────

function getEntryContent(ex) {
  if (ex.mode === "text") {
    return (ex.text || "").trim();
  }
  // game/code mode — concatenate with delimiters
  const parts = [];
  if (ex.html && ex.html.trim()) parts.push(`--- HTML ---\n${ex.html.trim()}`);
  if (ex.css && ex.css.trim()) parts.push(`--- CSS ---\n${ex.css.trim()}`);
  if (ex.js && ex.js.trim()) parts.push(`--- JS ---\n${ex.js.trim()}`);
  return parts.join("\n\n");
}

export function exportDataset(name) {
  const examples = loadExamples();
  const valid = examples.filter((e) => getEntryContent(e).length > 0);
  if (valid.length === 0) {
    throw new Error("No examples with content found.");
  }

  const datasetId = crypto.randomBytes(8).toString("hex");
  const datasetDir = path.join(DATASET_DIR, datasetId);
  fs.mkdirSync(datasetDir, { recursive: true });

  const jsonlPath = path.join(datasetDir, "training.jsonl");
  const lines = valid.map((ex) => {
    let instruction = ex.description || "";
    // Prepend tier + library context for game entries
    if (ex.mode !== "text") {
      const tier = GAME_TIERS.find((t) => t.id === (ex.tier || 1)) || GAME_TIERS[0];
      const tierPrefix = `Tier ${tier.id} (${tier.name}). ${tier.desc}.`;
      const libPart = ex.libraries && ex.libraries.length > 0 ? ` Using ${ex.libraries.join(", ")}.` : "";
      instruction = instruction
        ? `${tierPrefix}${libPart} ${instruction}`
        : `${tierPrefix}${libPart}`;
    }
    return JSON.stringify({ instruction, output: getEntryContent(ex) });
  });
  fs.writeFileSync(jsonlPath, lines.join("\n"), "utf-8");

  const metadata = {
    id: datasetId,
    name: name || "Dataset Studio Export",
    type: "text",
    files: ["training.jsonl"],
    num_files: 1,
    num_examples: valid.length,
    created_at: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(datasetDir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    "utf-8"
  );

  return { ok: true, datasetId, path: datasetDir, metadata };
}

// ─────────────────────────────────────────────────────────────────────────────
// Migration — convert any old format to new { id, mode, tier, html, css, js, text, description, libraries, createdAt }
// ─────────────────────────────────────────────────────────────────────────────

function migrateExample(ex) {
  // Already in new format (has mode field and no legacy title/code)
  if (ex.mode && !ex.title && typeof ex.code !== "string") {
    // Migrate old "code" mode → "game"
    if (ex.mode === "code") ex.mode = "game";
    // Ensure tier exists for game entries
    if (ex.mode === "game" && !ex.tier) ex.tier = 1;
    return ex;
  }

  const migrated = {
    id: ex.id || crypto.randomBytes(8).toString("hex"),
    mode: ex.mode === "text" ? "text" : "game",
    tier: ex.tier || 1,
    html: ex.html || "",
    css: ex.css || "",
    js: ex.js || "",
    text: ex.text || "",
    description: ex.description || ex.prompt || "",
    libraries: ex.libraries || [],
    createdAt: ex.createdAt || new Date().toISOString(),
  };

  // Pull code from old formats into js field
  let legacyCode = "";
  if (ex.adaptedParts && ex.adaptedParts.length > 0) {
    legacyCode = ex.adaptedParts.map((p) => p.code || "").join("\n\n");
  } else if (ex.parts && ex.parts.length > 0) {
    legacyCode = ex.parts.map((p) => p.code || "").join("\n\n");
  } else if (ex.adaptedCode) {
    legacyCode = ex.adaptedCode;
  } else if (typeof ex.code === "string") {
    legacyCode = ex.code;
  }

  if (legacyCode) {
    migrated.js = legacyCode;
  }

  return migrated;
}

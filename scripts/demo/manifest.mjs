import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ACTIONS = new Set(["clickRole", "clickText", "waitForText", "scrollToText", "loadDemoState", "screenshot", "wait"]);

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid demo manifest: ${message}`);
}

export function validateManifest(manifest) {
  assert(manifest && typeof manifest === "object", "root must be an object");
  assert(manifest.schemaVersion === 1, "schemaVersion must be 1");
  assert(/^[a-z0-9-]+$/.test(manifest.id || ""), "id must use lowercase letters, numbers, and hyphens");
  assert(manifest.surface === "desktop", "the current pilot supports the desktop surface only");
  assert(Number.isInteger(manifest.viewport?.width) && manifest.viewport.width >= 1280, "viewport.width must be at least 1280");
  assert(Number.isInteger(manifest.viewport?.height) && manifest.viewport.height >= 720, "viewport.height must be at least 720");
  assert(Array.isArray(manifest.capture?.steps) && manifest.capture.steps.length > 0, "capture.steps is required");

  const screenshots = new Set();
  for (const [index, step] of manifest.capture.steps.entries()) {
    assert(ACTIONS.has(step.action), `capture.steps[${index}].action is unsupported`);
    if (step.action === "clickRole") {
      assert(typeof step.role === "string" && typeof step.name === "string", `capture.steps[${index}] needs role and name`);
    }
    if (["clickText", "waitForText", "scrollToText"].includes(step.action)) {
      assert(typeof step.text === "string", `capture.steps[${index}] needs text`);
    }
    if (step.action === "loadDemoState") assert(typeof step.state === "string", `capture.steps[${index}] needs state`);
    if (step.action === "screenshot") {
      assert(/^[a-z0-9-]+$/.test(step.name || ""), `capture.steps[${index}].name is invalid`);
      assert(!screenshots.has(step.name), `duplicate screenshot name ${step.name}`);
      screenshots.add(step.name);
    }
    if (step.action === "wait") assert(Number.isInteger(step.ms) && step.ms >= 0, `capture.steps[${index}].ms is invalid`);
  }

  assert(Array.isArray(manifest.film?.segments) && manifest.film.segments.length >= 3, "film.segments needs at least three segments");
  for (const [index, segment] of manifest.film.segments.entries()) {
    assert(["capture", "cinematic"].includes(segment.type), `film.segments[${index}].type is unsupported`);
    assert(typeof segment.duration === "number" && segment.duration >= 1, `film.segments[${index}].duration must be at least one second`);
    if (segment.type === "capture") {
      assert(screenshots.has(segment.capture), `film.segments[${index}] references an unknown capture`);
    } else {
      assert(typeof segment.start === "number" && segment.start >= 0, `film.segments[${index}].start is invalid`);
    }
  }
  assert(manifest.film.segments.some((segment) => segment.type === "capture"), "film needs at least one exact product capture");
  return manifest;
}

export async function loadManifest(file) {
  const source = await readFile(file, "utf8");
  const manifest = validateManifest(JSON.parse(source));
  return {
    manifest,
    source,
    hash: createHash("sha256").update(source).digest("hex"),
    file: path.resolve(file),
  };
}

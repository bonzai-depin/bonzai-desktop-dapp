import assert from "node:assert/strict";
import test from "node:test";
import { validateManifest } from "../scripts/demo/manifest.mjs";

function validManifest() {
  return {
    schemaVersion: 1,
    id: "company-agentic-team",
    surface: "desktop",
    viewport: { width: 1920, height: 1080 },
    capture: { steps: [
      { action: "screenshot", name: "start" },
      { action: "screenshot", name: "finish" },
    ] },
    film: { segments: [
      { type: "cinematic", start: 0, duration: 3 },
      { type: "capture", capture: "start", duration: 4 },
      { type: "capture", capture: "finish", duration: 4 },
    ] },
  };
}

test("accepts exact product states wrapped in cinematic segments", () => {
  assert.equal(validateManifest(validManifest()).id, "company-agentic-team");
});

test("rejects product film states that were not captured", () => {
  const manifest = validManifest();
  manifest.film.segments[1].capture = "invented-state";
  assert.throws(() => validateManifest(manifest), /unknown capture/);
});

test("rejects unsupported capture actions", () => {
  const manifest = validManifest();
  manifest.capture.steps[0].action = "runProductionPayment";
  assert.throws(() => validateManifest(manifest), /unsupported/);
});

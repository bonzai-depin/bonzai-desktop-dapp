import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  isNestedPath,
  resolveStartupModelDir,
  inspectModelDir,
  migrateModelDir,
} from "../src/main/model-storage.js";

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bz-storage-"));
}

describe("isNestedPath", () => {
  test("same path is nested", () => {
    assert.ok(isNestedPath("/x/models", "/x/models"));
  });

  test("child path is nested in both argument orders", () => {
    assert.ok(isNestedPath("/x/models", "/x/models/sub"));
    assert.ok(isNestedPath("/x/models/sub", "/x/models"));
  });

  test("sibling paths with shared prefix are not nested", () => {
    assert.equal(isNestedPath("/x/models", "/x/models-2"), false);
  });
});

describe("resolveStartupModelDir", () => {
  test("stored undefined returns fallback with persist true", async (t) => {
    const result = await resolveStartupModelDir(undefined, "/fallback", (p) => p === "/present");
    assert.deepEqual(result, {
      dir: "/fallback",
      unavailableDir: null,
      persist: true,
    });
  });

  test("stored exists returns stored with persist false", async (t) => {
    const result = await resolveStartupModelDir("/present", "/fallback", (p) => p === "/present");
    assert.deepEqual(result, {
      dir: "/present",
      unavailableDir: null,
      persist: false,
    });
  });

  test("a saved folder on a disconnected drive is kept, not replaced by the fallback", async (t) => {
    const result = await resolveStartupModelDir("/missing", "/fallback", (p) => p === "/present");
    assert.deepEqual(result, {
      dir: "/fallback",
      unavailableDir: "/missing",
      persist: false,
    });
  });
});

describe("inspectModelDir", () => {
  test("current dir with models and candidate dir", async (t) => {
    const root = makeRoot();
    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    const current = path.join(root, "current");
    const candidate = path.join(root, "candidate");

    fs.mkdirSync(current, { recursive: true });
    fs.mkdirSync(path.join(current, "files"), { recursive: true });
    fs.writeFileSync(path.join(current, "a.gguf"), "hello");
    fs.writeFileSync(path.join(current, "files/out.png"), "png");

    const result = await inspectModelDir(candidate, current);

    assert.equal(result.path, candidate);
    assert.equal(result.same, false);
    assert.equal(result.nested, false);
    assert.equal(result.writable, true);
    assert.equal(result.modelCount, 0);
    assert.equal(result.source.path, current);
    assert.equal(result.source.bytes, 8);
    assert.equal(result.source.modelCount, 1);
    assert.equal(typeof result.freeBytes, "number");
  });
});

describe("migrateModelDir copy", () => {
  test("copies files preserving permissions and symlinks", async (t) => {
    const root = makeRoot();
    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    const src = path.join(root, "src");
    const dest = path.join(root, "dest");

    fs.mkdirSync(path.join(src, "bin"), { recursive: true });
    fs.mkdirSync(path.join(src, "hf", "snap"), { recursive: true });

    fs.writeFileSync(path.join(src, "a.gguf"), "hello");
    fs.writeFileSync(path.join(src, "bin/tool"), "#!/bin/sh\n");
    fs.chmodSync(path.join(src, "bin/tool"), 0o755);
    fs.writeFileSync(path.join(src, "hf", "blob"), "data");
    fs.symlinkSync("../blob", path.join(src, "hf", "snap", "link"));

    const result = await migrateModelDir(src, dest, { mode: "copy" });

    assert.equal(fs.readFileSync(path.join(dest, "a.gguf"), "utf8"), "hello");
    assert.ok(fs.existsSync(path.join(src, "a.gguf")));
    assert.notEqual(fs.statSync(path.join(dest, "bin", "tool")).mode & 0o111, 0);
    assert.equal(fs.readFileSync(path.join(dest, "hf", "snap", "link"), "utf8"), "data");
    assert.equal(result.files, 4);
  });
});

describe("migrateModelDir move", () => {
  test("moves files and removes source files", async (t) => {
    const root = makeRoot();
    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    const src = path.join(root, "src");
    const dest = path.join(root, "dest");

    fs.mkdirSync(path.join(src, "bin"), { recursive: true });

    fs.writeFileSync(path.join(src, "a.gguf"), "hello");
    fs.writeFileSync(path.join(src, "bin", "tool"), "#!/bin/sh\n");

    await migrateModelDir(src, dest, { mode: "move" });

    assert.equal(fs.readFileSync(path.join(dest, "a.gguf"), "utf8"), "hello");
    assert.equal(fs.existsSync(path.join(src, "a.gguf")), false);
    assert.ok(fs.existsSync(src));
  });
});

describe("migrateModelDir rejects nested", () => {
  test("throws when dest is inside src", async (t) => {
    const root = makeRoot();
    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    const src = path.join(root, "src");
    fs.mkdirSync(src, { recursive: true });

    await assert.rejects(
      migrateModelDir(src, path.join(src, "inner"), { mode: "move" })
    );
  });
});

describe("migrateModelDir on empty src", () => {
  test("returns zero files and bytes", async (t) => {
    const root = makeRoot();
    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    const src = path.join(root, "src");
    const dest = path.join(root, "dest");
    fs.mkdirSync(src, { recursive: true });

    const result = await migrateModelDir(src, dest, { mode: "move" });

    assert.deepEqual(result, { files: 0, bytes: 0 });
  });
});

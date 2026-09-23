// Model storage location: validation and migration of the models folder.
//
// Kept free of Electron imports so it can be exercised with `node --test`.
// Every destructive step happens only after the whole copy succeeded, so an
// interrupted move (unplugged disk, full volume) leaves the source intact.

import fs from "node:fs";
import path from "node:path";

const PARTIAL_SUFFIX = ".bzpartial";
const MODEL_EXTENSIONS = new Set([".gguf", ".safetensors"]);

/** True when `a` and `b` are the same folder or one contains the other. */
export function isNestedPath(a, b) {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  if (ra === rb) return true;
  const rel = (from, to) => path.relative(from, to);
  const inside = (r) => r && !r.startsWith("..") && !path.isAbsolute(r);
  return inside(rel(ra, rb)) || inside(rel(rb, ra));
}

/**
 * Pick the models folder at startup without losing the user's preference.
 * A stored folder on a disconnected drive is reported as unavailable; it is
 * never replaced by the fallback in persistent settings.
 */
export function resolveStartupModelDir(storedDir, fallbackDir, exists = fs.existsSync) {
  if (!storedDir) return { dir: fallbackDir, unavailableDir: null, persist: true };
  if (exists(storedDir)) return { dir: storedDir, unavailableDir: null, persist: false };
  return { dir: fallbackDir, unavailableDir: storedDir, persist: false };
}

/** Free bytes on the volume holding `dir` (or its nearest existing parent). */
export async function freeBytes(dir) {
  let probe = path.resolve(dir);
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) return null;
    probe = parent;
  }
  try {
    const s = await fs.promises.statfs(probe);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

async function isWritable(dir) {
  const probe = path.join(dir, `.bonzai-write-test-${process.pid}-${Date.now()}`);
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(probe, "");
    await fs.promises.unlink(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively list regular files and symlinks under `root`.
 * Directories are walked, not followed through symlinks.
 */
export async function collectEntries(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isSymbolicLink()) {
        out.push({ abs, rel, kind: "symlink", size: 0 });
      } else if (entry.isFile()) {
        if (entry.name.endsWith(PARTIAL_SUFFIX)) continue;
        try {
          const st = await fs.promises.stat(abs);
          out.push({ abs, rel, kind: "file", size: st.size, mode: st.mode });
        } catch {
          // Vanished while scanning.
        }
      }
    }
  }
  await walk(root);
  return out;
}

function countModels(entries) {
  return entries.filter(
    (e) => e.kind === "file" && !e.rel.includes(path.sep) && MODEL_EXTENSIONS.has(path.extname(e.rel).toLowerCase()),
  ).length;
}

/**
 * Describe a candidate folder relative to the current one so the UI can
 * offer the right action (move, or just use the folder as it is).
 */
export async function inspectModelDir(candidateDir, currentDir) {
  const target = path.resolve(candidateDir);
  const current = path.resolve(currentDir);
  const same = target === current;
  const nested = !same && isNestedPath(target, current);

  const [sourceEntries, targetEntries] = await Promise.all([
    same ? [] : collectEntries(current),
    fs.existsSync(target) ? collectEntries(target) : [],
  ]);

  return {
    path: target,
    same,
    nested,
    writable: same || nested ? true : await isWritable(target),
    freeBytes: await freeBytes(target),
    modelCount: countModels(targetEntries),
    source: {
      path: current,
      bytes: sourceEntries.reduce((n, e) => n + e.size, 0),
      modelCount: countModels(sourceEntries),
    },
  };
}

async function sameDevice(a, b) {
  try {
    const [sa, sb] = await Promise.all([fs.promises.stat(a), fs.promises.stat(b)]);
    return sa.dev === sb.dev;
  } catch {
    return false;
  }
}

async function copyFileStreamed(src, dest, mode, onBytes) {
  const tmp = dest + PARTIAL_SUFFIX;
  await new Promise((resolve, reject) => {
    const rs = fs.createReadStream(src);
    const ws = fs.createWriteStream(tmp);
    rs.on("data", (chunk) => onBytes(chunk.length));
    rs.on("error", reject);
    ws.on("error", reject);
    ws.on("finish", resolve);
    rs.pipe(ws);
  }).catch(async (err) => {
    await fs.promises.rm(tmp, { force: true });
    throw err;
  });
  // Executables in bin/ must stay executable.
  if (mode != null) await fs.promises.chmod(tmp, mode & 0o7777);
  const [s, d] = await Promise.all([fs.promises.stat(src), fs.promises.stat(tmp)]);
  if (s.size !== d.size) {
    await fs.promises.rm(tmp, { force: true });
    throw new Error(`Size mismatch after copying ${path.basename(src)}`);
  }
  // Only a complete file ever appears under the real name.
  await fs.promises.rename(tmp, dest);
}

async function recreateSymlink(entry, srcRoot, destRoot, destPath) {
  const raw = await fs.promises.readlink(entry.abs);
  // Absolute links into the old folder must follow the move.
  const target =
    path.isAbsolute(raw) && isNestedPath(raw, srcRoot) && !path.relative(srcRoot, raw).startsWith("..")
      ? path.join(destRoot, path.relative(srcRoot, raw))
      : raw;
  await fs.promises.rm(destPath, { force: true });
  try {
    await fs.promises.symlink(target, destPath);
  } catch {
    // Volumes without symlink support (exFAT, FAT32): store the content.
    const resolved = path.resolve(path.dirname(entry.abs), raw);
    const st = await fs.promises.stat(resolved);
    await copyFileStreamed(resolved, destPath, st.mode, () => {});
  }
}

async function removeEmptyDirs(dir, keepRoot) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) await removeEmptyDirs(path.join(dir, e.name), false);
  }
  if (keepRoot) return;
  try {
    await fs.promises.rmdir(dir);
  } catch {
    // Not empty (e.g. .DS_Store written meanwhile): leave it.
  }
}

/**
 * Copy or move everything in `srcDir` into `destDir`.
 *
 * mode "copy": source untouched.
 * mode "move": same volume → rename (instant, rolled back on failure);
 *              other volume → copy all, verify, then delete the originals.
 *
 * onProgress({ phase, pct, detail }) mirrors the existing migration events.
 */
export async function migrateModelDir(srcDir, destDir, { mode = "move", onProgress = () => {} } = {}) {
  const src = path.resolve(srcDir);
  const dest = path.resolve(destDir);
  if (src === dest) return { files: 0, bytes: 0 };
  if (isNestedPath(src, dest)) {
    throw new Error("The new folder cannot be inside the current one, or contain it.");
  }

  await fs.promises.mkdir(dest, { recursive: true });
  onProgress({ phase: "scanning", pct: 0, detail: "Scanning files…" });
  const entries = await collectEntries(src);
  const total = entries.reduce((n, e) => n + e.size, 0);

  if (entries.length === 0) {
    return { files: 0, bytes: 0 };
  }

  const available = await freeBytes(dest);
  const rename = mode === "move" && (await sameDevice(src, dest));
  if (!rename && available != null && available < total) {
    throw new Error(
      `Not enough free space: ${(total / 1e9).toFixed(1)} GB needed, ${(available / 1e9).toFixed(1)} GB available.`,
    );
  }

  const report = (done, rel) =>
    onProgress({
      phase: "copying",
      pct: total ? Math.min(90, Math.round((done / total) * 90)) : 90,
      detail: `${(done / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB — ${rel}`,
    });

  if (rename) {
    const moved = [];
    try {
      for (const entry of entries) {
        const to = path.join(dest, entry.rel);
        await fs.promises.mkdir(path.dirname(to), { recursive: true });
        await fs.promises.rename(entry.abs, to);
        moved.push([entry.abs, to]);
      }
    } catch (err) {
      for (const [from, to] of moved.reverse()) {
        try {
          await fs.promises.rename(to, from);
        } catch {
          // Best effort; the file still exists in one of the two folders.
        }
      }
      throw err;
    }
    await removeEmptyDirs(src, true);
    return { files: entries.length, bytes: total };
  }

  let done = 0;
  for (const entry of entries) {
    const to = path.join(dest, entry.rel);
    await fs.promises.mkdir(path.dirname(to), { recursive: true });
    if (entry.kind === "symlink") {
      await recreateSymlink(entry, src, dest, to);
      continue;
    }
    try {
      const existing = await fs.promises.lstat(to);
      if (existing.isFile() && existing.size === entry.size) {
        done += entry.size;
        report(done, entry.rel);
        continue;
      }
    } catch {
      // Not there yet.
    }
    await copyFileStreamed(entry.abs, to, entry.mode, (n) => {
      done += n;
      report(done, entry.rel);
    });
  }

  if (mode === "move") {
    onProgress({ phase: "cleaning", pct: 94, detail: "Removing originals…" });
    for (const entry of entries) {
      await fs.promises.rm(entry.abs, { force: true });
    }
    await removeEmptyDirs(src, true);
  }

  return { files: entries.length, bytes: total };
}

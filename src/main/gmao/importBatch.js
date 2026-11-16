import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import { inflateRawSync, crc32 } from "node:zlib";
import { get } from "../db/connection.js";
import * as blobs from "../db/blobs.js";
import { ingest } from "../db/repos/companyIntake.js";
const extensions = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "txt",
  "md",
  "csv",
  "tsv",
  "docx",
  "xls",
  "xlsx",
  "xlsm",
]);
const MAX_FILE = 30 * 1024 * 1024,
  MAX_TOTAL = 1024 * 1024 * 1024;
function readEntry(entry) {
  if (entry.header.flags & 1)
    throw new Error("Archive protégée : décompressez-la avant l’import.");
  const compressed = entry.getCompressedData();
  const bytes =
    entry.header.method === 0
      ? compressed
      : entry.header.method === 8
      ? inflateRawSync(compressed, { maxOutputLength: MAX_FILE })
      : null;
  if (
    !bytes ||
    bytes.length > MAX_FILE ||
    bytes.length !== entry.header.size ||
    crc32(bytes) !== entry.header.crc
  )
    throw new Error("Fichier d’archive endommagé ou trop volumineux.");
  return bytes;
}
/** Only paths returned by the native picker enter this function. Never follows links. */
export async function importBatch(
  companyId,
  paths,
  { mode = "current", onProgress = () => {} } = {}
) {
  if (!get().db.prepare("SELECT id FROM companies WHERE id=?").get(companyId))
    throw new Error("Entreprise introuvable.");
  const id = randomUUID(),
    state = { id, mode, items: [], status: "scanning", totalBytes: 0 };
  const save = () => {
    const now = Date.now();
    get()
      .db.prepare(
        "INSERT INTO company_intake_batches VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at"
      )
      .run(id, companyId, JSON.stringify(state), now, now);
    onProgress(state);
  };
  save();
  const add = async (file, relative, read, size) => {
    if (state.items.length >= 3000)
      throw new Error("Lot limité à 3 000 fichiers. Séparez les dossiers.");
    const ext = path.extname(file).slice(1).toLowerCase();
    const item = { name: relative, status: "pending" };
    state.items.push(item);
    save();
    try {
      if (!extensions.has(ext)) {
        item.status = "skipped";
        item.error = "Format non pris en charge.";
        return;
      }
      if (size > MAX_FILE || state.totalBytes + size > MAX_TOTAL)
        throw new Error(
          "Limite de 30 Mo par fichier ou 1 Go par lot atteinte."
        );
      const bytes = await read();
      if (bytes.length !== size || bytes.length > MAX_FILE)
        throw new Error("Taille de fichier incohérente.");
      state.totalBytes += bytes.length;
      const blob = blobs.write(bytes, ext, {
        source: "company-intake",
        sourceId: companyId,
      });
      const result = ingest(companyId, {
        name: path.basename(file),
        blobId: blob.id,
        ext,
        chunks: [""],
        needsExtraction: true,
        mode,
        batchId: id,
        relativePath: relative,
      });
      item.status = result.duplicate ? "duplicate" : "saved";
      item.sourceId = result.id;
    } catch (e) {
      item.status = "failed";
      item.error = e.message;
    } finally {
      save();
    }
  };
  const visit = async (file, relative, depth = 0) => {
    if (depth > 20) throw new Error("Arborescence trop profonde.");
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) {
      state.items.push({
        name: relative,
        status: "skipped",
        error: "Lien symbolique ignoré.",
      });
      save();
      return;
    }
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(file)).sort())
        if (!name.startsWith("."))
          await visitSafely(
            path.join(file, name),
            path.join(relative, name),
            depth + 1
          );
      return;
    }
    if (!stat.isFile()) return;
    if (/\.zip$/i.test(file)) {
      if (stat.size > 100 * 1024 * 1024) {
        state.items.push({
          name: relative,
          status: "failed",
          error: "Archive limitée à 100 Mo compressés.",
        });
        save();
        return;
      }
      try {
        const zip = new AdmZip(await fs.readFile(file)),
          entries = zip.getEntries().filter((e) => !e.isDirectory);
        if (
          entries.length + state.items.length > 3000 ||
          entries.reduce((n, e) => n + e.header.size, 0) >
            MAX_TOTAL - state.totalBytes
        )
          throw new Error("Archive trop volumineuse.");
        for (const entry of entries) {
          const name = entry.entryName.replace(/\\/g, "/");
          if (
            name.split("/").some((p) => p === "..") ||
            name.startsWith("/") ||
            /^[A-Za-z]:/.test(name)
          )
            throw new Error("Chemin d’archive invalide.");
          await add(
            name,
            relative + "/" + name,
            () => readEntry(entry),
            entry.header.size
          );
        }
      } catch (e) {
        state.items.push({
          name: relative,
          status: "failed",
          error: e.message,
        });
        save();
      }
    } else await add(file, relative, () => fs.readFile(file), stat.size);
  };
  const visitSafely = async (file, relative, depth = 0) => {
    if (state.items.length >= 3000)
      throw new Error("Lot limité à 3 000 fichiers. Séparez les dossiers.");
    try {
      await visit(file, relative, depth);
    } catch (e) {
      // An unreadable or removed source must not prevent the other originals
      // in the selected folder from being retained.
      if (state.items.length >= 3000) throw e;
      state.items.push({ name: relative, status: "failed", error: e.message });
      save();
    }
  };
  try {
    for (const file of paths) await visitSafely(file, path.basename(file));
    state.status = state.items.some((i) => i.status === "failed")
      ? "review"
      : "completed";
  } catch (e) {
    state.status = "review";
    state.error = e.message;
  }
  save();
  return state;
}

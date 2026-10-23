import { extractLocalText } from "./gmao.js";
export function chunkText(text, limit = 12000) {
  if (typeof text !== "string" || !text.trim())
    throw new Error(
      "No readable text. Enable local OCR or provide a text version.",
    );
  const chunks = [];
  let pending = "";
  for (const line of text.split("\n")) {
    if (pending.length + line.length + 1 > limit && pending) {
      chunks.push(pending);
      pending = "";
    }
    if (line.length > limit) {
      if (pending) chunks.push(pending);
      for (let i = 0; i < line.length; i += limit)
        chunks.push(line.slice(i, i + limit));
      pending = "";
    } else pending += (pending ? "\n" : "") + line;
  }
  if (pending.trim()) chunks.push(pending);
  return chunks;
}
export async function extractIntakeFile(file, options = {}) {
  if (file.size > 30 * 1024 * 1024)
    throw new Error("Import files up to 30 MB. Split larger documents.");
  if (/\.docx$/i.test(file.name)) {
    // Reuse the ZIP reader already shipped with spreadsheets; no remote conversion.
    const { CFB } = await import("xlsx");
    const archive = CFB.read(new Uint8Array(await file.arrayBuffer()), {
      type: "array",
    });
    const entry = CFB.find(archive, "/word/document.xml");
    if (!entry?.content || entry.content.length > 8000000)
      throw new Error(
        "The Word document is unreadable or too large. Export a text copy.",
      );
    const xml = new DOMParser().parseFromString(
      new TextDecoder().decode(entry.content),
      "application/xml",
    );
    if (xml.querySelector("parsererror"))
      throw new Error("The Word document could not be read.");
    return chunkText(
      [...xml.getElementsByTagNameNS("*", "p")]
        .map((p) =>
          [...p.getElementsByTagNameNS("*", "t")]
            .map((n) => n.textContent)
            .join(""),
        )
        .join("\n"),
    );
  }
  if (/\.(xlsx?|xlsm|csv|tsv)$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const book = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellFormula: false,
      cellHTML: false,
    });
    if (book.SheetNames.length > 40)
      throw new Error("Split workbooks with more than 40 sheets.");
    const chunks = [];
    for (const name of book.SheetNames) {
      const sheet = book.Sheets[name];
      if (!sheet["!ref"]) continue;
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      if (range.e.r > 20000 || range.e.c > 100)
        throw new Error(
          "Split sheets with more than 20,000 rows or 100 columns.",
        );
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false,
        blankrows: true,
      });
      const header = rows.findIndex((r) => r.some((v) => String(v).trim()));
      if (header < 0) continue;
      let batch = [];
      const wrap = (values) =>
        JSON.stringify({
          table: name,
          headers: rows[header],
          rows: values,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      for (let i = header + 1; i < rows.length; i++) {
        if (!rows[i].some((v) => String(v).trim())) continue;
        const row = { row: i + 1, cells: rows[i] };
        if (batch.length >= 10 || wrap([...batch, row]).length > 12000) {
          if (batch.length) chunks.push(wrap(batch));
          batch = [];
        }
        if (wrap([row]).length > 16000)
          throw new Error(
            `Row ${i + 1} in ${name} is too large. Split this row.`,
          );
        batch.push(row);
      }
      if (batch.length) chunks.push(wrap(batch));
    }
    if (!chunks.length)
      throw new Error("The spreadsheet contains no data rows.");
    return chunks;
  }
  return chunkText(await extractLocalText(file, { requireComplete: true, ...options }));
}
export async function importIntakeFile(companyId, file, metadata = {}) {
  const api = window.electronAPI?.db;
  if (!api?.companyIntake)
    throw new Error("Restart BonzAI to enable file intake.");
  if (file.size > 30 * 1024 * 1024)
    throw new Error("Import files up to 30 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw = "";
  for (let i = 0; i < bytes.length; i += 8192)
    raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const ext =
    file.name
      .split(".")
      .pop()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin";
  const blob = await api.blobs.write(btoa(raw), ext, {
    kind: "company_intake",
    companyId,
    originalName: file.name,
  });
  return api.companyIntake.ingest(companyId, {
    name: file.name,
    blobId: blob.id,
    ext,
    chunks: [""],
    needsExtraction: true,
    ...metadata,
  });
}

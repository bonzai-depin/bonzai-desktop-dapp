import { normalized, readWorkbookSheets } from "./inventoryImport.js";
const FREQUENCIES = {
  jour: { days: 1 },
  hebd: { days: 7 },
  mens: { months: 1 },
  "2mens": { months: 2 },
  trim: { months: 3 },
  sem: { months: 6 },
  ann: { months: 12 },
  "2ann": { months: 24 },
  "1foissur4ans": { months: 48 },
  selonbesoin: { conditionBased: true },
};
/** Preserve the operation-by-frequency matrix; require explicit equipment assignment. */
export function mapMaintenanceSheets(sheets, filename = "") {
  const plans = [];
  for (const sheet of sheets) {
    const at = sheet.rows.findIndex(
      (row) => row.filter((v) => FREQUENCIES[normalized(v)]).length >= 3,
    );
    if (at < 0) continue;
    const frequencies = sheet.rows[at].map((v) => FREQUENCIES[normalized(v)]);
    let group = sheet.name;
    const groups = new Map();
    for (let i = at + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      const marked = row.flatMap((v, col) =>
        /^(x|✓|1)$/i.test(String(v || "").trim()) && frequencies[col]
          ? [{ ...frequencies[col], col }]
          : [],
      );
      const label = String(
        row[2] ||
          row.find(
            (v) => typeof v === "string" && v.trim() && !/^x$/i.test(v),
          ) ||
          "",
      ).trim();
      if (!label) continue;
      if (!marked.length) {
        if (!/suivi (de|du)/i.test(label))
          group = label
            .replace(/^type (?:de l['’])?[ée]quipement\s*:\s*/i, "")
            .trim();
        continue;
      }
      for (const freq of marked) {
        const key =
          group +
          ":" +
          (freq.conditionBased
            ? "condition"
            : freq.months
              ? "m" + freq.months
              : "d" + freq.days);
        if (!groups.has(key))
          groups.set(key, {
            name: group,
            technicalSection: /st2|ventilation|hotte/i.test(
              filename + " " + sheet.name,
            )
              ? "ST2"
              : "ST1",
            equipmentType: group,
            periodicityMonths: freq.months || null,
            periodicityDays: freq.days || null,
            conditionBased: !!freq.conditionBased,
            checklist: [],
            operations: [],
            assetIds: [],
            active: false,
            source: { filename, sheet: sheet.name, headerRow: at + 1 },
          });
        const plan = groups.get(key);
        plan.checklist.push(label);
        plan.operations.push({
          label,
          notes: String(
            row[frequencies.length - 2] || row[row.length - 1] || "",
          ).trim(),
          sourceRow: i + 1,
          frequencyColumn: freq.col + 1,
        });
      }
    }
    plans.push(...groups.values());
  }
  if (!plans.length)
    throw new Error(
      "Aucune gamme reconnue. Vérifiez la matrice des opérations et fréquences.",
    );
  return plans;
}
export async function readMaintenanceFile(file) {
  return mapMaintenanceSheets(await readWorkbookSheets(file), file.name);
}

export const normalized = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const text = (value) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? "").trim();
const number = (value) => {
  const s = text(value)
    .replace(",", ".")
    .replace(/\s*(kw|l|m|ml|m3)$/i, "");
  return s && Number.isFinite(Number(s)) ? Number(s) : null;
};
const sourceDate = (value) =>
  typeof value === "number" && value > 10000
    ? new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000)
        .toISOString()
        .slice(0, 10)
    : text(value);
const hash = (value) => {
  let n = 2166136261;
  for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return (n >>> 0).toString(16);
};
const referenceHeaders = [
  "Numéro de l’équipement",
  "N° équipement",
  "numero equipement",
  "referenceequipement",
];
const typeHeaders = [
  "Appareil",
  "Equipements",
  "type",
  "type equipement",
  "Type d’équipement",
  "Description",
];
const headerRow = (row) =>
  row.some((c) =>
    [...referenceHeaders, ...typeHeaders]
      .map(normalized)
      .includes(normalized(c)),
  );

/** Import only inventory sheets, keeping source locations and aggregate quantities intact. */
export function mapInventorySheets(sheets, sites, filename = "") {
  const assets = [];
  for (const sheet of sheets) {
    if (/^(?:OI[-_ ]|tableau de bord|traitement|historique)/i.test(sheet.name))
      continue;
    let index = sheet.rows.findIndex(headerRow);
    if (index < 0) continue;
    let headers = sheet.rows[index].map(normalized);
    // Contract costing/summary sheets repeat the equipment totals; never import twice.
    if (headers.includes("coutmpht") || headers.includes("statutoi")) continue;
    const context = normalized(
      filename +
        " " +
        sheet.name +
        " " +
        sheet.rows.slice(0, index).flat().join(" "),
    );
    const section = /st2|inventaireven|ventilation|hotte/.test(context)
      ? "ST2"
      : /st3|inventaireesp|inventairegaz|pression/.test(context)
        ? "ST3"
        : "ST1";
    const pressure = /esp|pression|horsgazcombustibles/.test(context);
    let building = {},
      parent = null;
    for (let i = index + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      if (
        headerRow(row) &&
        row.filter((c) =>
          /^(?:trigramme|site|appareil|description|fabricant|identificationbatiment|numerodelequipement)$/.test(
            normalized(c),
          ),
        ).length >= 2
      ) {
        headers = row.map(normalized);
        building = {};
        parent = null;
        continue;
      }
      const read = (...names) => {
        for (const name of names) {
          const col = headers.indexOf(normalized(name));
          if (col >= 0 && text(row[col])) return row[col];
        }
        return "";
      };
      const description = text(read(...typeHeaders));
      const reference = text(read(...referenceHeaders, "équipement"));
      const brand = text(read("Marque", "Fabricant", "Marque de l’équipement"));
      const model = text(
        read("Modèle", "Référence de l’équipement", "Référence"),
      );
      const serial = text(read("N° série", "numero serie"));
      const locatedEquipment =
        section === "ST2" &&
        text(read("Désignation local", "Local")) &&
        text(read("Site"));
      const fluid = text(read("Nature du fluide"));
      // Formatted blank rows and site-only separators do not create equipment.
      if (
        !locatedEquipment &&
        !description &&
        !reference &&
        !brand &&
        !model &&
        !serial &&
        !fluid &&
        !read("Longueur du réseau (ml)", "Contenance")
      )
        continue;
      if (
        read("N° immeuble", "Identification géographique") &&
        text(read("N° immeuble", "Identification géographique")) !==
          building.property
      ) {
        building = {};
        parent = null;
      }
      for (const [key, names] of Object.entries({
        property: ["N° immeuble", "Identification géographique"],
        name: ["Immeuble en clair"],
        code: ["N° batiment", "Bât"],
        building: [
          "Batiment",
          "Identification Bâtiment",
          "Désignation du Batiment",
        ],
        site: ["Site", "Nom du site"],
        trigram: ["Trigramme", "Trigram"],
        occupant: ["Occupant", "Affecté à"],
        fluid: ["Nature du fluide"],
      })) {
        const v = read(...names);
        if (text(v)) building[key] = text(v);
      }
      const siteCode =
        building.trigram ||
        (sites.some((s) => normalized(s.trigram) === normalized(sheet.name))
          ? sheet.name
          : "");
      const matches = sites.filter(
        (s) =>
          (siteCode && normalized(s.trigram) === normalized(siteCode)) ||
          (building.site &&
            [s.name, s.g2dNumber, s.trigram].some(
              (v) => normalized(v) === normalized(building.site),
            )) ||
          (building.property && text(s.g2dNumber) === building.property),
      );
      if (matches.length !== 1)
        throw new Error(
          `Feuille ${sheet.name}, ligne ${i + 1} : site introuvable ou ambigu (${siteCode || building.site || building.property || "non renseigné"}). Rattachez le site avant import.`,
        );
      const conditionSource = text(
        read(
          "Etat de fonctionnement de l’équipement *",
          "Etat de fonctionnement de l’équipement",
          "état",
        ),
      );
      const state = normalized(conditionSource);
      const condition = ["1", "2", "3"].includes(state)
        ? state
        : /horsservice|arrete/.test(state)
          ? "out_of_service"
          : /operationnel|bon/.test(state)
            ? "1"
            : /degrade|remplacement/.test(state)
              ? "3"
              : "unknown";
      const quantitySource = read("Quantité", "Nbre Installation");
      const qty = number(quantitySource);
      if (
        (text(quantitySource) && qty == null) ||
        (qty != null && (!Number.isInteger(qty) || qty < 1))
      )
        throw new Error(
          `Feuille ${sheet.name}, ligne ${i + 1} : quantité invalide.`,
        );
      const assetCode =
        reference || `INV-${hash(filename)}-${sheet.name}-${i + 1}`;
      const technicalSection =
        text(read("section", "section technique", "ST")) || section;
      assets.push({
        siteId: matches[0].id,
        assetCode,
        equipmentType:
          description ||
          (technicalSection === "ST2"
            ? sheet.name
            : fluid
              ? `Réseau ${fluid}`
              : "Équipement à préciser"),
        technicalSection,
        domainCode:
          text(read("domaine")) ||
          (technicalSection === "ST3"
            ? pressure
              ? "ESP"
              : "REG"
            : technicalSection === "ST2"
              ? /hotte|cuisine/.test(context)
                ? "HOT"
                : "AER"
              : "IFC"),
        buildingCode: building.code || null,
        buildingName: building.building || null,
        occupant: building.occupant || "",
        brand,
        modelReference: model,
        serialNumber: serial,
        quantity: qty || 1,
        powerKw: number(
          read("Puissance kW", "Puissance en KW de l’équipement"),
        ),
        capacityLiters: number(
          read("Contenance", "Capacité litres", "Capacité en litre"),
        ),
        operational:
          condition !== "out_of_service" &&
          !["non", "no", "false"].includes(normalized(read("Opérationnel"))),
        condition,
        photoRef: text(read("photo")),
        comments: text(read("commentaires", "Observation(s)")),
        criticality:
          text(read("criticité", "Niveau de criticité", "IS")) || "P2",
        location: text(read("Désignation local", "Local")),
        metadata: {
          inventorySource: {
            filename,
            sheet: sheet.name,
            row: i + 1,
            referenceProvided: !!reference,
            columns: headers,
            values: row.map(text),
          },
          propertyNumber: building.property || null,
          fluid: fluid || building.fluid || "",
          networkLengthMeters: number(read("Longueur du réseau (ml)")),
          capacitySource: text(read("Contenance", "Capacité en M3")),
          commissionedAtSource: sourceDate(read("Année de mise en service")),
          acquisitionDateSource: sourceDate(read("Date d’acquisition")),
          nextRequalificationSource: text(read("prochaine requalification")),
          conditionSource,
          conditionVerified: condition !== "unknown",
          aggregateQuantity: qty || 1,
          ...(!reference && parent ? { parentAssetCode: parent } : {}),
        },
      });
      if (reference || !parent) parent = assetCode;
    }
  }
  if (!assets.length)
    throw new Error(
      "Aucune ligne d’équipement reconnue. Vérifiez les en-têtes et le type de fichier.",
    );
  return assets;
}

/** Values only: macros/formulas never execute; styled empty cells do not inflate ranges. */
export async function readWorkbookSheets(file) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Fichier trop volumineux (20 Mo maximum).");
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: false,
    cellFormula: false,
  });
  if (book.SheetNames.length > 40)
    throw new Error("Import limité à 40 feuilles.");
  return book.SheetNames.map((name) => {
    const ws = book.Sheets[name];
    let maxRow = 0,
      maxCol = 0;
    for (const [key, cell] of Object.entries(ws)) {
      if (key.startsWith("!") || cell.v == null || cell.v === "") continue;
      const at = XLSX.utils.decode_cell(key);
      maxRow = Math.max(maxRow, at.r);
      maxCol = Math.max(maxCol, at.c);
    }
    if (maxRow > 10000)
      throw new Error("Import limité à 10 000 lignes renseignées par feuille.");
    return {
      name,
      rows: XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: "",
        raw: true,
        range: { s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } },
      }),
    };
  });
}
export async function readInventoryFile(file, sites) {
  return mapInventorySheets(await readWorkbookSheets(file), sites, file.name);
}

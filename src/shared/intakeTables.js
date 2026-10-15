/** Conservative header mapping for recurring imports. Unknown layouts use the model. */
const key = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const aliases = {
  client: [
    "client",
    "customer",
    "client name",
    "nom du client",
    "nom client",
    "raison sociale",
  ],
  email: ["email", "e mail", "courriel"],
  phone: ["phone", "telephone", "tel"],
  address: ["address", "adresse"],
  contactName: ["contact", "contact principal"],
  site: ["site", "nom du site", "site name"],
  title: ["title", "titre", "objet", "intervention", "work order"],
  reference: [
    "reference",
    "reference oi",
    "oi",
    "numero oi",
    "work order reference",
    "wo number",
  ],
  scheduledAt: [
    "scheduled at",
    "scheduled for",
    "date",
    "date intervention",
    "date prevue",
    "debut",
  ],
  technician: ["technician", "technicien", "intervenant"],
  status: ["status", "statut", "etat"],
  durationMinutes: [
    "duration minutes",
    "duration min",
    "duree minutes",
    "duree min",
  ],
  description: ["description", "details"],
  priority: ["priority", "priorite"],
  equipmentType: ["equipment type", "type equipement", "type d equipement"],
  brand: ["brand", "marque"],
  modelReference: ["model", "modele"],
  serialNumber: ["serial number", "numero de serie"],
  assetCode: ["asset code", "code equipement"],
};
const statuses = {
  reported: "reported",
  signale: "reported",
  nouveau: "reported",
  new: "reported",
  triaged: "triaged",
  qualifie: "triaged",
  assigned: "assigned",
  affecte: "assigned",
  planned: "assigned",
  scheduled: "assigned",
  planifie: "assigned",
  completed: "completed",
  termine: "completed",
  done: "completed",
  cancelled: "cancelled",
  annule: "cancelled",
};

/** Parse local spreadsheet times without silently choosing an ambiguous DST hour. */
export function spreadsheetDate(value, timezone) {
  const text = String(value).trim();
  if (
    /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/.test(text) &&
    Number.isFinite(Date.parse(text))
  )
    return text;
  const m = text.match(
    /^(?:(\d{4})-(\d\d)-(\d\d)|(\d{1,2})\/(\d{1,2})\/(\d{4}))[ T](\d{1,2}):(\d\d)(?::(\d\d))?$/,
  );
  if (!m || !timezone) return text; // Domain validation will ask for an explicit time zone.
  const [y, mo, d, h, mi, s] = [
    m[1] || m[6],
    m[2] || m[5],
    m[3] || m[4],
    m[7],
    m[8],
    m[9] || 0,
  ].map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi, s);
  const calendar = new Date(target);
  if (
    calendar.getUTCFullYear() !== y ||
    calendar.getUTCMonth() !== mo - 1 ||
    calendar.getUTCDate() !== d ||
    h > 23 ||
    mi > 59 ||
    s > 59
  )
    return text;
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const local = (n) => {
    const p = Object.fromEntries(
      f.formatToParts(n).map((p) => [p.type, p.value]),
    );
    return Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
  };
  const candidates = [
    ...new Set(
      [-86400000, 0, 86400000].map(
        (delta) => target - (local(target + delta) - (target + delta)),
      ),
    ),
  ].filter((n) => local(n) === target);
  return candidates.length === 1 ? new Date(candidates[0]).toISOString() : text;
}

export function tableIntakeActions(chunk) {
  let table;
  try {
    table = JSON.parse(chunk);
  } catch {
    return null;
  }
  if (
    !Array.isArray(table.headers) ||
    !Array.isArray(table.rows) ||
    !table.rows.length ||
    table.rows.length > 80
  )
    return null;
  const columns = {};
  for (let i = 0; i < table.headers.length; i++) {
    const name = key(table.headers[i]);
    const field = Object.keys(aliases).find((k) => aliases[k].includes(name));
    if (field) {
      if (columns[field] != null) return null;
      columns[field] = i;
    } else if (name) return null; // Do not silently discard unknown business columns.
  }
  const has = (f) => columns[f] != null;
  const type =
    has("title") && has("site")
      ? "work_order"
      : has("site") && (has("serialNumber") || has("assetCode"))
        ? "equipment"
        : has("site") && has("client")
          ? "site"
          : has("client") && (has("email") || has("address"))
            ? "client"
            : null;
  if (!type) return null;
  const allowed = {
    client: ["client", "email", "phone", "address", "contactName"],
    site: ["site", "client", "address"],
    equipment: [
      "site",
      "equipmentType",
      "brand",
      "modelReference",
      "serialNumber",
      "assetCode",
    ],
    work_order: [
      "title",
      "site",
      "reference",
      "scheduledAt",
      "technician",
      "status",
      "durationMinutes",
      "description",
      "priority",
    ],
  }[type];
  if (Object.keys(columns).some((f) => !allowed.includes(f))) return null;
  return table.rows.map((row) => {
    const data = {};
    for (const field of allowed) {
      if (!has(field)) continue;
      const v = String(row.cells?.[columns[field]] ?? "").trim();
      if (v) data[field] = v;
    }
    if (type === "client") {
      data.name = data.client;
      delete data.client;
    }
    if (type === "site") {
      data.name = data.site;
      delete data.site;
    }
    if (type === "work_order") {
      if (data.scheduledAt)
        data.scheduledAt = spreadsheetDate(data.scheduledAt, table.timezone);
      data.status = statuses[key(data.status)] || data.status || "reported";
      if (data.durationMinutes)
        data.durationMinutes = Number(data.durationMinutes.replace(",", "."));
    }
    return { type, data, confidence: 1, evidence: JSON.stringify(row) };
  });
}

/** Maintenance facts are evidence, never instructions to execute a past operation. */
export const REFERENCE_TYPES = [
  "DI",
  "OI",
  "OT",
  "SILLAGE",
  "GTP",
  "GMAO",
  "BON",
];
export const BLOCKER_TYPES = [
  "parts",
  "quote",
  "customer",
  "access",
  "expert",
  "diagnosis",
  "return_visit",
  "other",
];
export const SIGNATURE_ROLES = [
  "technician",
  "site_representative",
  "contract_manager",
  "service_acceptance",
];
export const identity = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
const fail = (message) => {
  throw new Error(message);
};
const text = (value, label, required = false) => {
  const result = String(value ?? "").trim();
  if ((required && !result) || result.length > 4000)
    fail(`${label} : valeur absente ou trop longue.`);
  return result;
};
const list = (value, label) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 100)
    fail(`${label} : 100 lignes maximum.`);
  return value;
};
const number = (value, label, min = 0) => {
  if (
    value === "" ||
    value == null ||
    !Number.isFinite(Number(value)) ||
    Number(value) < min
  )
    fail(`${label} : valeur numérique requise.`);
  return Number(value);
};
export function evidenceDate(value, { optional = true } = {}) {
  if (!value && optional) return null;
  const v = text(value, "Date", true);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(`${v}T00:00:00Z`)) ||
    new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v
  )
    fail("Date civile invalide (AAAA-MM-JJ).");
  return v;
}
export function durationMinutes(value) {
  const s = String(value ?? "")
    .trim()
    .replace(",", ".");
  const hm = s.match(/^(\d+)\s*h\s*(\d{1,2})$/i);
  if (hm && Number(hm[2]) < 60) return Number(hm[1]) * 60 + Number(hm[2]);
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(h(?:eures?)?|mn|min(?:utes?)?)?$/i);
  if (!m) fail("Durée invalide : utilisez 1,5 h, 1 h 30 ou 90 min.");
  return Number(m[1]) * (/^h/i.test(m[2] || "") ? 60 : 1);
}
export function normalizeReferences(values) {
  return list(values, "Références").map((r) => {
    const type = identity(r.type);
    if (!REFERENCE_TYPES.includes(type)) fail("Type de référence inconnu.");
    const value = text(r.value, "Numéro", true);
    if (
      !/\d/.test(value) ||
      value.length > 100 ||
      REFERENCE_TYPES.includes(identity(value))
    )
      fail("Renseignez le numéro, pas le nom du champ.");
    const issuer = text(r.issuer, "Émetteur", true);
    const year = Number(r.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2200)
      fail("Année de référence requise.");
    return { type, value, issuer, year };
  });
}
function minuteOfDay(value) {
  if (!/^\d\d:\d\d$/.test(value || "")) fail("Horaire attendu : HH:MM.");
  const [h, m] = value.split(":").map(Number);
  if (h > 23 || m > 59) fail("Horaire invalide.");
  return h * 60 + m;
}
// Civil dates stay civil. Resolve instants only when an explicit zone is supplied.
function visitMinute(date, time, timezone) {
  const wall = Date.parse(date) / 60000 + minuteOfDay(time);
  if (!timezone) return wall;
  let format;
  try {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    fail("Fuseau horaire invalide.");
  }
  const asWall = (minute) => {
    const p = Object.fromEntries(
      format
        .formatToParts(new Date(minute * 60000))
        .map((x) => [x.type, x.value])
    );
    return (
      Date.parse(`${p.year}-${p.month}-${p.day}`) / 60000 +
      Number(p.hour) * 60 +
      Number(p.minute)
    );
  };
  const offsets = new Set(
    [-1440, 0, 1440].map((delta) => asWall(wall + delta) - (wall + delta))
  );
  const candidates = [...offsets]
    .map((offset) => wall - offset)
    .filter((candidate) => asWall(candidate) === wall);
  if (candidates.length !== 1)
    fail(
      "Horaire ambigu ou inexistant lors du changement d’heure. Utilisez la durée attestée de ce passage."
    );
  return candidates[0];
}
export function normalizeVisit(input, { historical = false } = {}) {
  const segments = list(input.segments, "Créneaux").map((s) => {
    const date = evidenceDate(s.date, { optional: false });
    const endDate = evidenceDate(s.endDate || date, { optional: false });
    const timezone = text(s.timezone, "Fuseau");
    const elapsed =
      visitMinute(endDate, s.end, timezone) -
      visitMinute(date, s.start, timezone);
    const breakMinutes = number(s.breakMinutes ?? 0, "Pause");
    if (elapsed <= 0 || elapsed > 1440 || breakMinutes >= elapsed)
      fail(
        "Créneau invalide : 24 heures maximum, pause inférieure à la présence."
      );
    const technicians = [
      ...new Map(
        list(s.technicians, "Techniciens").map((n) => {
          const name = text(n, "Technicien", true);
          return [identity(name), name];
        })
      ).values(),
    ];
    if (!technicians.length && !historical)
      fail("Indiquez les techniciens du créneau.");
    if (timezone) {
      try {
        new Intl.DateTimeFormat("fr", { timeZone: timezone });
      } catch {
        fail("Fuseau horaire invalide.");
      }
    }
    return {
      date,
      endDate,
      start: s.start,
      end: s.end,
      breakMinutes,
      technicians,
      qualifications: text(s.qualifications, "Qualifications"),
      timezone: timezone || null,
      presenceMinutes: elapsed,
      laborMinutes: technicians.length
        ? (elapsed - breakMinutes) * technicians.length
        : null,
    };
  });
  if (segments.some((s) => s.timezone) && segments.some((s) => !s.timezone))
    fail(
      "Précisez le fuseau de tous les créneaux ou conservez-les tous en heures locales."
    );
  const intervals = segments.map((s) => ({
    from: visitMinute(s.date, s.start, s.timezone),
    to: visitMinute(s.endDate, s.end, s.timezone),
    technicians: s.technicians,
  }));
  for (let i = 0; i < intervals.length; i++)
    for (let j = 0; j < i; j++)
      if (
        intervals[i].from < intervals[j].to &&
        intervals[j].from < intervals[i].to &&
        intervals[i].technicians.some((n) =>
          intervals[j].technicians.map(identity).includes(identity(n))
        )
      )
        fail(
          "Un technicien ne peut pas être compté deux fois sur le même créneau."
        );
  let presenceMinutes = 0,
    until = -Infinity;
  for (const s of intervals.sort((a, b) => a.from - b.from)) {
    presenceMinutes += Math.max(0, s.to - Math.max(until, s.from));
    until = Math.max(until, s.to);
  }
  const duration =
    input.duration == null || input.duration === ""
      ? null
      : durationMinutes(input.duration);
  if (!segments.length && !(duration > 0))
    fail("Ajoutez un créneau ou une durée attestée.");
  if (segments.length && duration != null)
    fail("Choisissez les créneaux ou une durée seule, sans les additionner.");
  if (duration != null && duration > 1440 * 100) fail("Durée hors limites.");
  const durationBasis = input.durationBasis || "unspecified";
  if (!["presence", "labor", "unspecified"].includes(durationBasis))
    fail("Nature de la durée invalide.");
  return {
    assetId: input.assetId || null,
    travelMinutes:
      input.travelMinutes == null || input.travelMinutes === ""
        ? null
        : number(input.travelMinutes, "Déplacement"),
    date: evidenceDate(input.date),
    technician: text(input.technician, "Technicien"),
    diagnosis: text(input.diagnosis, "Diagnostic"),
    workPerformed: text(input.workPerformed, "Travaux", true),
    segments,
    duration,
    durationBasis,
    precision: segments.length ? "local_time" : "duration_only",
    presenceMinutes: segments.length
      ? presenceMinutes
      : durationBasis === "presence"
      ? duration
      : null,
    laborMinutes: segments.length
      ? segments.some((s) => s.laborMinutes == null)
        ? null
        : segments.reduce((n, s) => n + s.laborMinutes, 0)
      : durationBasis === "labor"
      ? duration
      : null,
  };
}
export function normalizeEquipment(input) {
  const outcome = input.outcome || "unknown";
  if (
    !["unknown", "operational", "degraded", "out_of_service"].includes(outcome)
  )
    fail("État équipement invalide.");
  if (
    input.initialOutcome &&
    !["unknown", "operational", "degraded", "out_of_service"].includes(
      input.initialOutcome
    )
  )
    fail("État initial invalide.");
  if (
    input.finding &&
    !["unknown", "fault", "no_fault", "monitoring"].includes(input.finding)
  )
    fail("Constat invalide.");
  return {
    initialOutcome: input.initialOutcome || "unknown",
    finding: input.finding || "unknown",
    building: text(input.building, "Bâtiment"),
    room: text(input.room, "Local"),
    measurements: text(input.measurements, "Mesures"),
    nextAction: text(input.nextAction, "Suite à donner"),
    assetId: input.assetId || null,
    label: text(input.label, "Équipement", true),
    serialNumber: text(input.serialNumber, "Numéro de série"),
    task: text(input.task, "Travaux"),
    outcome,
    downtimeFrom: evidenceDate(input.downtimeFrom),
    downtimeUntil: evidenceDate(input.downtimeUntil),
  };
}
export function normalizePart(p, { historical = false } = {}) {
  if (!["purchased", "stock", "reused", "customer_supplied"].includes(p.origin))
    fail("Origine de la pièce requise.");
  const unitCostCents =
    p.unitCostCents === "" || p.unitCostCents == null
      ? null
      : number(p.unitCostCents, "Coût");
  if (unitCostCents != null && !Number.isSafeInteger(unitCostCents))
    fail("Le coût doit être exprimé en centimes entiers.");
  if (!historical && p.origin === "reused" && !p.donorAssetId && !p.donorLabel)
    fail("Indiquez l’équipement donneur.");
  if (!historical && !p.recipientAssetId && !p.recipientLabel)
    fail("Indiquez l’équipement receveur.");
  if (p.donorAssetId && p.donorAssetId === p.recipientAssetId)
    fail("Donneur et receveur doivent être différents.");
  return {
    reference: text(p.reference, "Référence"),
    unit: text(p.unit, "Unité"),
    serialNumber: text(p.serialNumber, "Numéro de série"),
    name: text(p.name, "Pièce", true),
    origin: p.origin,
    quantity: number(p.quantity, "Quantité", 0.000001),
    owner: text(p.owner, "Propriétaire", !historical),
    condition: text(p.condition, "État", !historical),
    donorAssetId: p.donorAssetId || null,
    recipientAssetId: p.recipientAssetId || null,
    donorLabel: text(p.donorLabel, "Donneur"),
    recipientLabel: text(p.recipientLabel, "Receveur"),
    unitCostCents,
    stockMovementId: p.stockMovementId || null,
  };
}
export function normalizeBlocker(b, { historical = false } = {}) {
  if (!BLOCKER_TYPES.includes(b.type)) fail("Type de blocage invalide.");
  return {
    type: b.type,
    reason: text(b.reason, "Motif", true),
    owner: text(b.owner, "Responsable", !historical),
    nextAction: text(b.nextAction, "Prochaine action", !historical),
    dueDate: evidenceDate(b.dueDate, { optional: historical }),
    status: historical
      ? ["open", "resolved"].includes(b.status)
        ? b.status
        : "unknown"
      : "open",
  };
}
export function normalizeFluid(f, { historical = false } = {}) {
  if (!["added", "recovered", "leak_test"].includes(f.operation))
    fail("Opération fluide invalide.");
  const leakResult = f.leakResult || "unknown";
  if (!["unknown", "found", "not_found", "repaired"].includes(leakResult))
    fail("Résultat du contrôle invalide.");
  if (
    !historical &&
    ["unknown", "not_found", "found"].includes(leakResult) &&
    !String(f.followup || "").trim()
  )
    fail("Indiquez le suivi de fuite non résolue.");
  const unresolved = ["unknown", "not_found", "found"].includes(leakResult);
  return {
    technician: text(f.technician, "Intervenant", !historical),
    followupDate: evidenceDate(f.followupDate, {
      optional: historical || !unresolved,
    }),
    assetId: f.assetId || null,
    circuit: text(f.circuit, "Circuit", true),
    refrigerant: text(f.refrigerant, "Fluide", true),
    operation: f.operation,
    quantityKg:
      f.operation === "leak_test"
        ? null
        : number(f.quantityKg, "Masse en kg", 0.000001),
    date: evidenceDate(f.date, { optional: historical }),
    leakResult,
    followup: text(f.followup, "Suivi"),
  };
}
export function normalizeSignature(s) {
  const role = s.role === "contract_responsible" ? "contract_manager" : s.role;
  if (
    !SIGNATURE_ROLES.includes(role) ||
    !["present", "absent", "illegible"].includes(s.status)
  )
    fail("Rôle ou statut de signature invalide.");
  return {
    role,
    status: s.status,
    name: text(s.name, "Signataire"),
    date: evidenceDate(s.date),
    note: text(s.note, "Observation"),
  };
}
export function normalizeMaintenanceDocument(d) {
  return {
    title: text(d.title, "Titre", true),
    site: text(d.site, "Site", true),
    siteId: d.siteId || null,
    workOrderId: d.workOrderId || null,
    occurredOn: evidenceDate(d.occurredOn),
    datePrecision: d.occurredOn ? "day" : "unknown",
    description: text(d.description, "Description"),
    sourceLocations: normalizeSourceLocations(d.sourceLocations),
    references: normalizeReferences(d.references),
    equipment: list(d.equipment, "Équipements").map(normalizeEquipment),
    visits: list(d.visits, "Visites").map((v) =>
      normalizeVisit(v, { historical: true })
    ),
    parts: list(d.parts, "Pièces").map((v) =>
      normalizePart(v, { historical: true })
    ),
    fluids: list(d.fluids, "Fluides").map((v) =>
      normalizeFluid(v, { historical: true })
    ),
    blockers: list(d.blockers, "Blocages").map((v) =>
      normalizeBlocker(v, { historical: true })
    ),
    signatures: list(d.signatures, "Signatures").map(normalizeSignature),
  };
}

export function normalizeSourceLocations(values) {
  return list(values, "Zones sources").map((v) => {
    const page = number(v.page, "Page", 1);
    if (!Number.isInteger(page) || page > 10000) fail("Page invalide.");
    const state = v.state || "value";
    if (
      !["value", "checked", "unchecked", "blank", "illegible"].includes(state)
    )
      fail("État du champ source invalide.");
    let region = null;
    if (v.region != null) {
      region = v.region.map((n) => number(n, "Zone"));
      if (
        region.length !== 4 ||
        region.some((n) => n > 1) ||
        region[2] <= 0 ||
        region[3] <= 0 ||
        region[0] + region[2] > 1.00001 ||
        region[1] + region[3] > 1.00001
      )
        fail("Zone source hors page.");
    }
    return {
      field: text(v.field, "Champ vérifié", true),
      page,
      quote: text(v.quote, "Lecture"),
      state,
      region,
    };
  });
}

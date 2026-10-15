const HOUR = 3600000,
  DAY = 24 * HOUR;
export const CONTRACT_AMBIGUITIES = Object.freeze([
  {
    id: "report_frequency",
    label: "Rapport > 12 kW : trimestriel ou chaque jeudi (prescription p10)",
  },
  {
    id: "st3_reporting_scope",
    label: "Bilan ST3 : la prescription p23 cite ventilation et hottes",
  },
  {
    id: "esp_frequency",
    label:
      "Inspection ESP : 48 mois ; certificat historique 40 ou 48 mois (p22)",
  },
]);
export function localParts(at, timezone = "UTC") {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(at))
      .map((x) => [x.type, x.value]),
  );
  return {
    ...p,
    iso: `${p.year}-${p.month}-${p.day}`,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      p.weekday,
    ),
  };
}
export function localTimestamp(date, hour, timezone = "UTC") {
  const target = Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  let at = target;
  for (let i = 0; i < 4; i++) {
    const p = localParts(at, timezone);
    const rendered = Date.parse(`${p.iso}T${p.hour}:${p.minute}:00Z`);
    at += target - rendered;
  }
  return at;
}
export function addWorkingHours(at, hours, policy) {
  if (!policy?.calendarValidated)
    throw new Error("Validez le calendrier des jours ouvrés.");
  const days = policy.workingDays || [1, 2, 3, 4, 5],
    holidays = new Set(policy.holidays || []);
  let remaining = hours * HOUR,
    cursor = at,
    iterations = 0;
  if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
    throw new Error("Jours ouvrés invalides.");
  while (remaining > 0 && iterations++ < 10000) {
    const part = localParts(cursor, policy.timezone);
    const nextDate = new Date(Date.parse(part.iso + "T12:00Z") + DAY)
      .toISOString()
      .slice(0, 10);
    const midnight = localTimestamp(nextDate, 0, policy.timezone);
    const available = midnight - cursor;
    if (available <= 0) throw new Error("Calendrier ouvré invalide.");
    if (days.includes(part.weekday) && !holidays.has(part.iso)) {
      const slice = Math.min(remaining, available);
      remaining -= slice;
      cursor += slice;
    } else cursor = midnight;
  }
  if (remaining > 0)
    throw new Error("Calendrier ouvré sans échéance calculable.");
  return cursor;
}
export function reportDeadline(workOrder, section, policy) {
  if (!workOrder.restoredAt) return null;
  if (workOrder.onCall) {
    if (!Number.isInteger(policy?.onCallReportHour))
      return {
        dueAt: null,
        reason: "Heure de remise du rapport d’astreinte à valider",
        basis: "next_morning",
      };
    const today = localParts(workOrder.restoredAt, policy.timezone).iso;
    const next = new Date(Date.parse(today + "T12:00Z") + DAY)
      .toISOString()
      .slice(0, 10);
    return {
      dueAt: localTimestamp(next, policy.onCallReportHour, policy.timezone),
      basis: "next_morning",
    };
  }
  if (section === "ST1") {
    if (!policy?.calendarValidated)
      return {
        dueAt: null,
        reason: "Calendrier des 48 h ouvrées à valider",
        basis: "working_48h",
      };
    return {
      dueAt: addWorkingHours(workOrder.restoredAt, 48, policy),
      basis: "working_48h",
    };
  }
  return { dueAt: workOrder.restoredAt + 48 * HOUR, basis: "calendar_48h" };
}
export function addMonths(at, months) {
  const date = new Date(at),
    day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  date.setUTCDate(
    Math.min(
      day,
      new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return date.getTime();
}
export function regulatoryDates(record) {
  return {
    inspectionDueAt: record.lastInspectionAt
      ? addMonths(record.lastInspectionAt, 48)
      : null,
    requalificationDueAt: record.lastRequalificationAt
      ? addMonths(record.lastRequalificationAt, 120)
      : null,
    gasServiceDueAt: record.lastGasServiceAt
      ? addMonths(record.lastGasServiceAt, 12)
      : null,
  };
}
export function accessFailures(person, vehicle, site, at = Date.now()) {
  const failures = [];
  if (!person) failures.push("Dossier intervenant manquant");
  else {
    for (const [key, label] of [
      ["name", "Identité"],
      ["birthDate", "Date de naissance"],
      ["birthPlace", "Lieu de naissance"],
      ["nationality", "Nationalité"],
      ["employer", "Entreprise"],
      ["visitPurpose", "Motif de visite"],
      ["visitedService", "Service visité"],
      ["identityDocumentId", "Pièce d’identité"],
      ["cprDocumentId", "CPR actif"],
    ])
      if (!person[key]) failures.push(label + " manquant");
    if (
      !["passport", "national_id", "residence_permit", "military_id"].includes(
        person.identityType,
      )
    )
      failures.push("Type de pièce d’identité non accepté");
    if (!(person.identityValidUntil >= at))
      failures.push("Pièce d’identité expirée ou sans validité");
    if (!(person.accessValidUntil >= at) || !person.approvedBy)
      failures.push("Autorisation d’accès non validée ou expirée");
    const today = localParts(at, site.timezone),
      renewalYear = person.renewalSubmittedAt
        ? Number(localParts(person.renewalSubmittedAt, site.timezone).year)
        : 0;
    if (renewalYear < Number(today.year) - (today.month === "01" ? 1 : 0))
      failures.push("Renouvellement annuel non transmis");
    if (!person.qualifications?.length)
      failures.push("Habilitations non renseignées");
    if (
      !(person.qualificationsValidUntil >= at) ||
      !person.qualificationsDocumentId
    )
      failures.push("Habilitations non documentées ou expirées");
  }
  if (site.vehicleRequired) {
    if (!vehicle) failures.push("Véhicule à affecter");
    else {
      for (const [key, label] of [
        ["registration", "Immatriculation"],
        ["registrationDocumentId", "Carte grise"],
        ["inspectionDocumentId", "Contrôle technique"],
        ["insuranceDocumentId", "Assurance"],
        ["pollutionDocumentId", "Contrôle pollution"],
      ])
        if (!vehicle[key]) failures.push(label + " manquant");
      for (const key of [
        "inspectionValidUntil",
        "insuranceValidUntil",
        "pollutionValidUntil",
      ])
        if (!(vehicle[key] >= at)) failures.push("Validité véhicule : " + key);
    }
  }
  return failures;
}
/** Deadlines are generated from approved calendars, never from an assumed contract cadence. */
export function scheduledReportDeadlines(now, policy, siteId) {
  if (!policy?.enabled) return [];
  const timezone = policy.timezone || "UTC",
    since = policy.activatedAt || policy.validatedAt || now;
  const p = localParts(now, timezone),
    start = localParts(since, timezone),
    reports = [];
  const append = (key, label, date, hour) => {
    const dueAt = localTimestamp(date, hour, timezone);
    if (dueAt >= since)
      reports.push({
        key,
        label,
        dueAt,
        siteId,
        kind: "periodic_report",
        period: date,
      });
  };
  let monday =
    Date.parse(start.iso + "T12:00Z") - ((start.weekday + 6) % 7) * DAY;
  const end = Date.parse(p.iso + "T12:00Z") + 7 * DAY;
  for (; monday <= end; monday += 7 * DAY) {
    const thursday = new Date(monday + 3 * DAY).toISOString().slice(0, 10);
    append("p0_weekly", "Bilan P0 hebdomadaire", thursday, 17);
    if (policy.equipmentReportCadence === "weekly")
      append("equipment_weekly", "Rapport installations > 12 kW", thursday, 17);
  }
  // Other report cut-offs are explicit contract settings, not inferred from ambiguous text.
  if (Number.isInteger(policy.periodicReportHour)) {
    for (
      let month = Number(start.year) * 12 + Number(start.month) - 1;
      month <= Number(p.year) * 12 + Number(p.month) - 1;
      month++
    ) {
      const year = Math.floor(month / 12),
        m = month % 12,
        endOfMonth = Date.UTC(year, m + 1, 0);
      if (policy.st1MonthlyReport)
        append(
          "st1_monthly",
          "Bilan mensuel ST1",
          new Date(endOfMonth - 7 * DAY).toISOString().slice(0, 10),
          policy.periodicReportHour,
        );
      if (policy.equipmentReportCadence === "quarterly" && m % 3 === 2)
        append(
          "equipment_quarterly",
          "Rapport trimestriel installations > 12 kW",
          new Date(endOfMonth).toISOString().slice(0, 10),
          policy.periodicReportHour,
        );
      if (policy.st2SemesterReport && (m === 5 || m === 11))
        append(
          "st2_semester",
          "Bilan semestriel ST2",
          new Date(endOfMonth - 7 * DAY).toISOString().slice(0, 10),
          policy.periodicReportHour,
        );
    }
  }
  return reports;
}
export function openingIntervals(from, to, policy) {
  if (
    !policy?.calendarValidated ||
    !Number.isInteger(policy.openingStartHour) ||
    !Number.isInteger(policy.openingEndHour) ||
    policy.openingStartHour < 0 ||
    policy.openingEndHour > 24 ||
    policy.openingEndHour <= policy.openingStartHour
  )
    return null;
  const intervals = [],
    holidays = new Set(policy.holidays || []);
  let date = localParts(from, policy.timezone).iso;
  for (let i = 0; i < 5000; i++) {
    const start = localTimestamp(
      date,
      policy.openingStartHour,
      policy.timezone,
    );
    if (start >= to) break;
    const parts = localParts(start, policy.timezone),
      end = localTimestamp(date, policy.openingEndHour, policy.timezone);
    if (
      (policy.workingDays || []).includes(parts.weekday) &&
      !holidays.has(date) &&
      end > from
    )
      intervals.push([Math.max(from, start), Math.min(to, end)]);
    date = new Date(Date.parse(date + "T12:00Z") + DAY)
      .toISOString()
      .slice(0, 10);
  }
  return intervals;
}
/** Union of unavailable periods prevents double-counting overlapping incidents. */
export function equipmentMetrics(
  workOrders,
  from,
  to,
  openingHours = null,
  operatingWindows = null,
) {
  const intervals = workOrders
    .filter((w) => w.unavailableFrom)
    .map((w) => [
      Math.max(from, w.unavailableFrom),
      Math.min(to, w.unavailableUntil || w.restoredAt || to),
    ])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let downtimeMs = 0,
    end = from;
  for (const [a, b] of intervals) {
    downtimeMs += Math.max(0, b - Math.max(a, end));
    end = Math.max(end, b);
  }
  let operatingDowntimeMs = downtimeMs;
  if (operatingWindows) {
    openingHours = operatingWindows.reduce((n, [a, b]) => n + b - a, 0) / HOUR;
    const clipped = intervals
      .flatMap(([a, b]) =>
        operatingWindows
          .map(([c, d]) => [Math.max(a, c), Math.min(b, d)])
          .filter(([c, d]) => d > c),
      )
      .sort((a, b) => a[0] - b[0]);
    operatingDowntimeMs = 0;
    let until = from;
    for (const [a, b] of clipped) {
      operatingDowntimeMs += Math.max(0, b - Math.max(a, until));
      until = Math.max(until, b);
    }
  }
  const failures = workOrders.filter(
    (w) =>
      w.type === "corrective" && w.reportedAt >= from && w.reportedAt <= to,
  );
  const repairs = failures.filter(
    (w) => w.interventionStartedAt && w.restoredAt >= w.interventionStartedAt,
  );
  return {
    failureCount: failures.length,
    downtimeHours: downtimeMs / HOUR,
    mttrHours: repairs.length
      ? repairs.reduce(
          (n, w) => n + w.restoredAt - w.interventionStartedAt,
          0,
        ) /
        repairs.length /
        HOUR
      : null,
    mtbfHours:
      openingHours != null && failures.length
        ? Math.max(0, openingHours - operatingDowntimeMs / HOUR) /
          failures.length
        : null,
    availabilityPct:
      openingHours > 0
        ? Math.max(
            0,
            (100 * (openingHours - operatingDowntimeMs / HOUR)) / openingHours,
          )
        : null,
  };
}

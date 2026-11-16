// Pin the zone before any Date is created so the DST cases are deterministic on every machine.
process.env.TZ = "Europe/Paris";
import test from "node:test";
import assert from "node:assert/strict";
const { parseDeadline, nextRun, validateCadence } = await import("../src/shared/companySchedule.js");

const local = (y, m, d, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm).getTime();
const HOUR = 3_600_000;

test("a deadline the planner writes as relative text becomes an enforceable instant", () => {
  const now = local(2026, 6, 1, 10, 0);
  assert.equal(parseDeadline("+24h", now), now + 24 * HOUR);
  assert.equal(parseDeadline("+3d", now), local(2026, 6, 4, 10, 0));
  assert.equal(parseDeadline("+2w", now), local(2026, 6, 15, 10, 0));
  assert.equal(parseDeadline(now), now);
  assert.equal(parseDeadline(String(now)), now);
});

test("a date-only deadline is due at the end of that day, and a timed one at that minute", () => {
  assert.equal(parseDeadline("2026-06-30"), new Date(2026, 5, 30, 23, 59, 59, 999).getTime());
  assert.equal(parseDeadline("2026-06-30T17:30"), local(2026, 6, 30, 17, 30));
  assert.equal(parseDeadline("2026-06-30T17:30:00Z"), Date.UTC(2026, 5, 30, 17, 30));
});

test("unusable deadline text is recorded as no deadline instead of failing the goal or inventing a date", () => {
  for (const value of ["soon", "next week", "2026-02-31", "2026-13-01", "+0d", "+h", "", null, undefined, {}, NaN, -5, "24h"]) {
    assert.equal(parseDeadline(value, 1_000), null, String(value));
  }
});

test("a daily job keeps its wall-clock time when the clocks change", () => {
  const daily = { every: "day", at: "09:00" };
  // Paris springs forward on 29 March 2026: that day is 23 hours long.
  const before = local(2026, 3, 28, 9, 0);
  const spring = nextRun(daily, before);
  assert.equal(spring, local(2026, 3, 29, 9, 0));
  assert.equal(spring - before, 23 * HOUR);
  // And falls back on 25 October 2026: that day is 25 hours long.
  const autumn = nextRun(daily, local(2026, 10, 24, 9, 0));
  assert.equal(autumn - local(2026, 10, 24, 9, 0), 25 * HOUR);
  assert.equal(new Date(autumn).getHours(), 9);
  // Earlier the same day still runs today; at or after the time it moves to tomorrow.
  assert.equal(nextRun(daily, local(2026, 6, 1, 8, 59)), local(2026, 6, 1, 9, 0));
  assert.equal(nextRun(daily, local(2026, 6, 1, 9, 0)), local(2026, 6, 2, 9, 0));
});

test("a weekly job lands on its weekday and never on the same instant twice", () => {
  const monday = { every: "week", weekday: 1, at: "08:30" };
  const first = nextRun(monday, local(2026, 6, 3, 12, 0)); // a Wednesday
  assert.equal(first, local(2026, 6, 8, 8, 30));
  assert.equal(new Date(first).getDay(), 1);
  assert.equal(nextRun(monday, first), local(2026, 6, 15, 8, 30));
});

test("a monthly job runs every month, including across month-end and year-end", () => {
  const closing = { every: "month", day: 28, at: "18:00" };
  assert.equal(nextRun(closing, local(2026, 1, 31, 12, 0)), local(2026, 2, 28, 18, 0));
  assert.equal(nextRun(closing, local(2026, 2, 28, 18, 0)), local(2026, 3, 28, 18, 0));
  assert.equal(nextRun({ every: "month", day: 1, at: "07:00" }, local(2026, 12, 15, 0, 0)), local(2027, 1, 1, 7, 0));
});

test("an interval job cannot be set so tight that it floods the team", () => {
  assert.equal(nextRun({ everyMinutes: 15 }, 1_000_000), 1_000_000 + 15 * 60_000);
  assert.throws(() => validateCadence({ everyMinutes: 5 }), /at least 15 minutes/);
});

test("a schedule that could silently skip a month or run at no real time is rejected", () => {
  assert.throws(() => validateCadence({ every: "month", day: 31, at: "09:00" }), /between 1 and 28/);
  assert.throws(() => validateCadence({ every: "week", weekday: 7, at: "09:00" }), /day of the week/);
  assert.throws(() => validateCadence({ every: "day", at: "25:00" }), /HH:MM/);
  assert.throws(() => validateCadence({ every: "year", at: "09:00" }), /how often/);
  assert.throws(() => validateCadence(null), /how often/);
  assert.deepEqual(validateCadence({ every: "week", weekday: "2", at: "09:00", extra: 1 }), { every: "week", weekday: 2, at: "09:00" });
});

test("schedules need no workspace license to read, create or record outcomes", async () => {
  // Local workflows are free since 4.1.0; no channel is gated by a workspace license.
  const { needsWorkspaceLicense } = await import("../src/main/workspace/license.js");
  for (const channel of ["db:schedules:create", "db:schedules:update", "db:schedules:remove", "db:schedules:runDue", "db:goals:recordOutcome"]) assert.equal(needsWorkspaceLicense(channel), false, channel);
  assert.equal(needsWorkspaceLicense("db:schedules:list"), false);
});

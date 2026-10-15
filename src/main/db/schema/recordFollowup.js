import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.js";
import { gmaoProcurements } from "./gmao.js";
export const recordActivity = sqliteTable(
  "gmao_record_activity",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    recordKind: text("record_kind").notNull(),
    recordId: text("record_id").notNull(),
    kind: text("kind").notNull(),
    data: text("data", { mode: "json" }).notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    scope: index("gmao_record_activity_scope").on(
      t.companyId,
      t.recordKind,
      t.recordId,
      t.kind,
    ),
    reminder: uniqueIndex("gmao_record_reminder")
      .on(t.companyId, t.recordKind, t.recordId)
      .where(sql`${t.kind}='reminder'`),
  }),
);
export const partDispositions = sqliteTable(
  "gmao_part_dispositions",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    procurementId: text("procurement_id")
      .notNull()
      .references(() => gmaoProcurements.id, { onDelete: "cascade" }),
    partKey: text("part_key").notNull(),
    data: text("data", { mode: "json" }).notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    part: uniqueIndex("gmao_part_disposition_scope").on(
      t.companyId,
      t.procurementId,
      t.partKey,
    ),
  }),
);

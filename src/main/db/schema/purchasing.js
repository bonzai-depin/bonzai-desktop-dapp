import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.js";
export const purchasingSettings = sqliteTable("purchasing_settings", {
  companyId: text("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const purchasingRecords = sqliteTable(
  "purchasing_records",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    data: text("data", { mode: "json" }).notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    sharedRequest: uniqueIndex("purchasing_shared_request")
      .on(table.companyId, sql`json_extract(${table.data}, '$.conversationId')`)
      .where(
        sql`${table.kind} = 'request' AND json_extract(${table.data}, '$.conversationId') IS NOT NULL`,
      ),
    scope: index("purchasing_records_scope").on(
      table.companyId,
      table.kind,
      table.updatedAt,
    ),
  }),
);
export const purchasingEvents = sqliteTable(
  "purchasing_events",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    recordId: text("record_id").references(() => purchasingRecords.id, {
      onDelete: "cascade",
    }),
    action: text("action").notNull(),
    data: text("data", { mode: "json" }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    scope: index("purchasing_events_scope").on(
      table.companyId,
      table.createdAt,
    ),
  }),
);
export const purchasingSequences = sqliteTable(
  "purchasing_sequences",
  {
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    value: integer("value").notNull(),
  },
  (table) => ({ pk: primaryKey({ columns: [table.companyId, table.kind] }) }),
);

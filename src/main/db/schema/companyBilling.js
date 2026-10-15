/** Local customer billing, independent of supplier purchases and email delivery. */
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { companies } from "./companies.js";
import {
  gmaoClients,
  gmaoServiceContracts,
  gmaoInvoices,
  gmaoSubcontractors,
} from "./gmao.js";
const timestamps = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
};
export const companyBillingProfiles = sqliteTable("company_billing_profiles", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  serviceContractId: text("service_contract_id").references(
    () => gmaoServiceContracts.id,
  ),
  name: text("name").notNull(),
  data: text("data", { mode: "json" }).notNull(),
  ...timestamps,
});
export const companyBillingInvoices = sqliteTable(
  "company_billing_invoices",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => gmaoClients.id),
    profileId: text("profile_id").references(() => companyBillingProfiles.id),
    legacyInvoiceId: text("legacy_invoice_id").references(
      () => gmaoInvoices.id,
    ),
    number: text("number"),
    status: text("status").notNull().default("draft"),
    direction: text("direction").notNull().default("receivable"),
    currency: text("currency").notNull().default("EUR"),
    totalCents: integer("total_cents").notNull().default(0),
    data: text("data", { mode: "json" }).notNull(),
    revision: integer("revision").notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    number: uniqueIndex("company_billing_number").on(t.companyId, t.number),
    legacy: uniqueIndex("company_billing_legacy").on(
      t.companyId,
      t.legacyInvoiceId,
    ),
    status: index("idx_company_billing_status").on(
      t.companyId,
      t.status,
      t.updatedAt,
    ),
  }),
);
export const companyBillingEvents = sqliteTable(
  "company_billing_events",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => companyBillingInvoices.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    evidence: text("evidence", { mode: "json" }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    invoice: index("idx_company_billing_events").on(
      t.companyId,
      t.invoiceId,
      t.createdAt,
    ),
  }),
);
export const companyBillingSequences = sqliteTable(
  "company_billing_sequences",
  {
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    lastNumber: integer("last_number").notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.companyId, t.year] }) }),
);
export const companyBillingSubcontractors = sqliteTable(
  "company_billing_subcontractors",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    subcontractorId: text("subcontractor_id")
      .notNull()
      .references(() => gmaoSubcontractors.id),
    profileId: text("profile_id").references(() => companyBillingProfiles.id),
    status: text("status").notNull().default("draft"),
    data: text("data", { mode: "json" }).notNull(),
    revision: integer("revision").notNull().default(1),
    ...timestamps,
  },
);

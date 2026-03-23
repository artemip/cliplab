import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const clips = sqliteTable("clips", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  duration: real("duration").notNull(),
  filename: text("filename").notNull(),
  /** Raw (unfiltered) audio file — allows re-editing filters after save */
  rawFilename: text("raw_filename"),
  peaks: text("peaks", { mode: "json" }).$type<number[]>(),
  filterConfig: text("filter_config", { mode: "json" }).$type<
    Array<{ id: string; params: Record<string, number> }>
  >(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;

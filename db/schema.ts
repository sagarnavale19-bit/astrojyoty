import { pgTable, text, jsonb, integer, uniqueIndex } from 'drizzle-orm/pg-core';
export const profiles = pgTable('profiles', {
 id: text().primaryKey(), phone: text().notNull(), data: jsonb().$type<Record<string, any>>().notNull(), version: integer().notNull().default(1),
}, t => [uniqueIndex('profiles_phone_unique').on(t.phone)]);
export const bookings = pgTable('bookings', {
 id: text().primaryKey(), userId: text('user_id').notNull().references(() => profiles.id),
 appointment: text().notNull(), slot: text().notNull(), data: jsonb().$type<Record<string, any>>().notNull(), version: integer().notNull().default(1),
}, t => [uniqueIndex('bookings_appointment_slot_unique').on(t.appointment, t.slot)]);
export const settings = pgTable('settings', {
 id: text().primaryKey(), data: jsonb().$type<any>().notNull(), version: integer().notNull().default(1),
});

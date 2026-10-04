import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizePhone,
  parseInternationalPhone,
  phonesMatch,
} from "@/lib/whatsapp/phone-utils";

/**
 * Contact de-duplication helpers, shared by the WhatsApp webhook, the
 * manual contact form, and CSV import so all paths agree on what
 * "same number" means (issue #212).
 *
 * The canonical key is `normalizePhone` (digits-only) — the same form
 * the DB stores in the generated `contacts.phone_normalized` column
 * and enforces unique per account. `phonesMatch` adds trunk-prefix
 * tolerance (last-8-digit match) for the softer "possible duplicate"
 * surfaces.
 */

/** Canonical de-dup key for a phone string (digits only). */
export function normalizeKey(phone: string): string {
  return normalizePhone(phone);
}

/** Minimal shape we need back from a contacts lookup. */
export interface ExistingContact {
  id: string;
  phone: string;
  name?: string | null;
  [key: string]: unknown;
}

/**
 * Find an existing contact in `accountId` whose phone matches `phone`,
 * or null. Pre-filters in SQL by the last-8-digit suffix (so we don't
 * pull every contact), then applies the strict `phonesMatch` in JS on
 * the small candidate set — the exact approach the webhook has used.
 */
export async function findExistingContact(
  db: SupabaseClient,
  accountId: string,
  phone: string,
): Promise<ExistingContact | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const suffix = normalized.length >= 8 ? normalized.slice(-8) : normalized;

  const { data, error } = await db
    .from("contacts")
    .select("*")
    .eq("account_id", accountId)
    .like("phone", `%${suffix}`);

  if (error || !data) return null;

  return (
    (data as ExistingContact[]).find((c) => phonesMatch(c.phone, phone)) ?? null
  );
}

/**
 * True when an existing contact is an *exact* normalized match for
 * `phone` (vs only a fuzzy trunk-variant match). The form hard-blocks
 * exact matches but only warns on fuzzy ones.
 */
export function isExactMatch(existing: ExistingContact, phone: string): boolean {
  return normalizeKey(existing.phone) === normalizeKey(phone);
}

/**
 * True for a Postgres unique-constraint violation (SQLSTATE 23505).
 * Used as the backstop when the DB unique index rejects a racing or
 * format-equal insert that slipped past the in-app check.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: string }).code === "23505";
}

import { normalizeProfileKey } from "./profile-utils";

/**
 * De-duplicate parsed CSV rows by normalized phone and/or profile URL/Messenger ID,
 * keeping the first occurrence of each.
 *
 * For WhatsApp contacts, "usable" means parseInternationalPhone accepts it (+ and country code).
 * For Messenger contacts, a valid Facebook profile URL or Messenger ID is accepted.
 */
export function dedupeImportContacts<
  T extends {
    phone: string;
    profile_url?: string;
    messenger_id?: string;
  }
>(
  rows: T[],
): {
  unique: T[];
  duplicates: number;
  invalid: number;
} {
  const seenPhones = new Set<string>();
  const seenProfiles = new Set<string>();
  const unique: T[] = [];
  let duplicates = 0;
  let invalid = 0;

  for (const row of rows) {
    const rawPhone = row.phone?.trim();
    const phoneKey = rawPhone ? parseInternationalPhone(rawPhone) : null;
    const profileKey = normalizeProfileKey(row.profile_url || row.messenger_id);

    // If phone was provided but is invalid (e.g. "4155551212" without +) and no profile_url, count as invalid
    if (rawPhone && !phoneKey && !profileKey) {
      invalid++;
      continue;
    }

    // A row is invalid if neither a valid phone nor a valid profile key exists
    if (!phoneKey && !profileKey) {
      invalid++;
      continue;
    }

    let isDupe = false;
    if (phoneKey && seenPhones.has(phoneKey)) {
      isDupe = true;
    }
    if (profileKey && seenProfiles.has(profileKey)) {
      isDupe = true;
    }

    if (isDupe) {
      duplicates++;
      continue;
    }

    if (phoneKey) seenPhones.add(phoneKey);
    if (profileKey) seenProfiles.add(profileKey);
    unique.push(row);
  }

  return { unique, duplicates, invalid };
}

export function dedupeByPhone<
  T extends { phone: string; profile_url?: string; messenger_id?: string }
>(
  rows: T[],
): { unique: T[]; duplicates: number; invalid: number } {
  return dedupeImportContacts(rows);
}


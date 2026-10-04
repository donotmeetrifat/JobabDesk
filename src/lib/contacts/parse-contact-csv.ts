import { extractMessengerDetails } from './profile-utils';

/**
 * CSV parsing for the contacts import modal. Shared + unit-tested so
 * tag-column handling stays aligned with phone/profile_url/name/email/company.
 */

export interface ParsedContactRow {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  address?: string;
  profile_url?: string;
  messenger_id?: string;
  /** Tag names from the optional `tags` column (comma/semicolon separated). */
  tagNames: string[];
}

/** Split a CSV cell into unique tag names (case-insensitive de-dupe). */
export function parseTagCell(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  const seen = new Set<string>();
  const names: string[] = [];

  for (const part of value.split(/[,;]/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export interface ParseContactCsvResult {
  rows: ParsedContactRow[];
  /** True when the CSV header includes a phone column. */
  hasPhoneColumn: boolean;
  /** True when the CSV header includes a profile_url / Messenger column. */
  hasProfileUrlColumn: boolean;
  /** True when the CSV header includes a `tags` column. */
  hasTagsColumn: boolean;
  /** True when the CSV header includes a `company` column. */
  hasCompanyColumn: boolean;
  /** True when the CSV header includes an `address` column. */
  hasAddressColumn: boolean;
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => {
    const clean = h.trim().toLowerCase().replace(/[\s_\-]+/g, '');
    return aliases.some((a) => a.replace(/[\s_\-]+/g, '').toLowerCase() === clean);
  });
}

export function parseContactCsv(text: string): ParseContactCsvResult {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return {
      rows: [],
      hasPhoneColumn: false,
      hasProfileUrlColumn: false,
      hasTagsColumn: false,
      hasCompanyColumn: false,
      hasAddressColumn: false,
    };
  }

  const headers = lines[0]
    .split(',')
    .map((h) => h.trim().toLowerCase().replace(/["']/g, ''));

  const phoneIdx = findHeaderIndex(headers, [
    'phone',
    'phone_number',
    'phonenumber',
    'mobile',
    'cell',
    'contact',
    'whatsapp',
  ]);

  const profileUrlIdx = findHeaderIndex(headers, [
    'profile_url',
    'profileurl',
    'profile_link',
    'profilelink',
    'profile',
    'fb_url',
    'fburl',
    'facebook_url',
    'facebookurl',
    'fb_profile',
    'fbprofile',
    'messenger_url',
    'messengerurl',
    'messenger_id',
    'messengerid',
    'facebook',
    'messenger',
    'fb',
  ]);

  // A CSV is valid if it contains AT LEAST one identity column: phone OR profile_url
  if (phoneIdx === -1 && profileUrlIdx === -1) {
    return {
      rows: [],
      hasPhoneColumn: false,
      hasProfileUrlColumn: false,
      hasTagsColumn: false,
      hasCompanyColumn: false,
      hasAddressColumn: false,
    };
  }

  const nameIdx = findHeaderIndex(headers, [
    'name',
    'full_name',
    'fullname',
    'customer_name',
    'customername',
  ]);
  const emailIdx = findHeaderIndex(headers, [
    'email',
    'email_address',
    'emailaddress',
    'mail',
  ]);
  const companyIdx = findHeaderIndex(headers, [
    'company',
    'company_name',
    'companyname',
    'organization',
    'org',
  ]);
  const addressIdx = findHeaderIndex(headers, [
    'address',
    'location',
    'shipping_address',
  ]);
  const tagsIdx = findHeaderIndex(headers, ['tags', 'tag']);

  const rows: ParsedContactRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const phone = phoneIdx >= 0 ? values[phoneIdx]?.replace(/["']/g, '').trim() ?? '' : '';
    const rawProfile = profileUrlIdx >= 0 ? values[profileUrlIdx]?.replace(/["']/g, '').trim() ?? '' : '';

    let profile_url: string | undefined = undefined;
    let messenger_id: string | undefined = undefined;

    if (rawProfile) {
      const extracted = extractMessengerDetails(rawProfile);
      profile_url = extracted.profileUrl || undefined;
      messenger_id = extracted.messengerId || undefined;
    }

    rows.push({
      phone,
      profile_url,
      messenger_id,
      name:
        nameIdx >= 0
          ? values[nameIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      email:
        emailIdx >= 0
          ? values[emailIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      company:
        companyIdx >= 0
          ? values[companyIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      address:
        addressIdx >= 0
          ? values[addressIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      tagNames:
        tagsIdx >= 0 ? parseTagCell(values[tagsIdx]?.replace(/["']/g, '')) : [],
    });
  }

  return {
    rows,
    hasPhoneColumn: phoneIdx >= 0,
    hasProfileUrlColumn: profileUrlIdx >= 0,
    hasTagsColumn: tagsIdx >= 0,
    hasCompanyColumn: companyIdx >= 0,
    hasAddressColumn: addressIdx >= 0,
  };
}

/** Simple CSV line parse (handles quoted fields). */
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

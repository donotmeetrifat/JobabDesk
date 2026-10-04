/**
 * Profile URL & Messenger ID extraction and normalization utilities.
 * Handles Facebook profile links, Messenger direct links (m.me), and numeric PSIDs.
 */

export interface ExtractedMessengerInfo {
  profileUrl: string;
  messengerId?: string;
}

export function extractMessengerDetails(rawUrlOrId?: string | null): ExtractedMessengerInfo {
  if (!rawUrlOrId) return { profileUrl: '' };
  let val = rawUrlOrId.trim();
  if (!val) return { profileUrl: '' };

  // Strip surrounding quotes
  val = val.replace(/^["']|["']$/g, '').trim();

  // 1. Direct numeric ID (PSID or Facebook User ID, e.g. 100084729182371)
  if (/^\d{10,}$/.test(val)) {
    return {
      profileUrl: `https://www.facebook.com/${val}`,
      messengerId: val,
    };
  }

  let messengerId: string | undefined = undefined;

  // 2. Extract numeric ID from query string: id=12345
  const idQueryMatch = val.match(/[?&]id=(\d{10,})/i);
  if (idQueryMatch) {
    messengerId = idQueryMatch[1];
  }

  // 3. Extract numeric ID from path: /messages/t/12345 or /messages/12345 or m.me/12345
  if (!messengerId) {
    const pathMatch = val.match(/(?:\/messages\/(?:t\/)?|\/m\.me\/|\/facebook\.com\/)(\d{10,})(?:[/?&#]|$)/i);
    if (pathMatch) {
      messengerId = pathMatch[1];
    }
  }

  // 4. Clean URL — strip tracking parameters
  let cleanUrl = val;
  try {
    const parsed = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`);
    // Keep id param if it exists, remove tracking params
    const idParam = parsed.searchParams.get('id');
    const toDelete = ['mibextid', 'ref', 'fref', '__tn__', 'rdid', 'fbclid', 'notif_t', 'notif_id'];
    toDelete.forEach((p) => parsed.searchParams.delete(p));
    if (idParam && !parsed.searchParams.has('id')) {
      parsed.searchParams.set('id', idParam);
    }
    cleanUrl = parsed.toString().replace(/\/$/, '');
  } catch {
    // If not a valid URL yet, normalize prefix
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      if (cleanUrl.startsWith('facebook.com') || cleanUrl.startsWith('www.facebook.com') || cleanUrl.startsWith('m.me')) {
        cleanUrl = `https://${cleanUrl}`;
      } else {
        cleanUrl = `https://www.facebook.com/${cleanUrl.replace(/^@/, '')}`;
      }
    }
  }

  return {
    profileUrl: cleanUrl,
    messengerId,
  };
}

/**
 * Generates a canonical deduplication key for Facebook/Messenger contacts.
 * Examples:
 *   "fb:100084729182371"
 *   "fb:john.doe"
 */
export function normalizeProfileKey(rawUrlOrId?: string | null): string | null {
  if (!rawUrlOrId) return null;
  const { profileUrl, messengerId } = extractMessengerDetails(rawUrlOrId);
  if (!profileUrl && !messengerId) return null;

  if (messengerId) {
    return `fb:${messengerId}`;
  }

  try {
    const parsed = new URL(profileUrl);
    const path = parsed.pathname.replace(/^\/|\/$/g, '').toLowerCase();
    const id = parsed.searchParams.get('id');
    if (id) return `fb:${id}`;
    if (path) return `fb:${path}`;
  } catch {
    // Fallback
  }

  return `fb:${profileUrl.toLowerCase().replace(/https?:\/\/(www\.)?/, '').replace(/\/$/, '')}`;
}

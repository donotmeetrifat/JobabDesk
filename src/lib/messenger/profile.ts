// ============================================================
// Resilient Meta Facebook Profile Resolver
// Supports all Graph API tiers, handling permissions & field errors gracefully
// ============================================================

export interface MetaUserProfile {
  name?: string
  firstName?: string
  lastName?: string
  avatarUrl?: string
}

export async function fetchMetaUserProfile(
  psid: string,
  accessToken: string,
  timeoutMs = 4000
): Promise<MetaUserProfile | null> {
  if (!psid || !accessToken) return null

  // Ensure PSID is not a raw system user or bot ID
  const cleanPsid = psid.trim()
  if (!/^\d+$/.test(cleanPsid)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // 1. Try full fields: name, first_name, last_name, profile_pic
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(cleanPsid)}?fields=name,first_name,last_name,profile_pic&access_token=${encodeURIComponent(accessToken)}`,
        { signal: controller.signal }
      )
      if (res.ok) {
        const json = await res.json()
        const resolvedName =
          json.name ||
          [json.first_name, json.last_name].filter(Boolean).join(' ').trim() ||
          undefined
        if (resolvedName) {
          clearTimeout(timer)
          return {
            name: resolvedName,
            firstName: json.first_name || undefined,
            lastName: json.last_name || undefined,
            avatarUrl: json.profile_pic || undefined,
          }
        }
      }
    } catch {
      // Fall through to fallback fields
    }

    // 2. Fallback: fields=name,profile_pic (avoids #100 nonexisting field errors on first/last name)
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(cleanPsid)}?fields=name,profile_pic&access_token=${encodeURIComponent(accessToken)}`,
        { signal: controller.signal }
      )
      if (res.ok) {
        const json = await res.json()
        if (json.name) {
          clearTimeout(timer)
          return {
            name: json.name.trim(),
            avatarUrl: json.profile_pic || undefined,
          }
        }
      }
    } catch {
      // Fall through to bare name
    }

    // 3. Fallback: bare fields=name
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(cleanPsid)}?fields=name&access_token=${encodeURIComponent(accessToken)}`,
        { signal: controller.signal }
      )
      if (res.ok) {
        const json = await res.json()
        if (json.name) {
          clearTimeout(timer)
          return {
            name: json.name.trim(),
          }
        }
      }
    } catch {
      // safe fallback
    }
  } catch (err) {
    console.warn('[Meta Profile Fetch] Error fetching profile for PSID:', cleanPsid, err)
  } finally {
    clearTimeout(timer)
  }

  return null
}

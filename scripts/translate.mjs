import { GoogleGenAI } from '@google/genai'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const TARGET_LOCALES = {
  bn: 'Bengali (বাংলা) — use natural, simple Bangladeshi Bengali suitable for a business app UI',
}

// Deep-diff: returns only keys present in source but missing/different in target
function findMissingKeys(source, target, path = '') {
  const missing = {}
  for (const [key, value] of Object.entries(source)) {
    const fullPath = path ? `${path}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = findMissingKeys(value, target?.[key] ?? {}, fullPath)
      if (Object.keys(nested).length > 0) missing[key] = nested
    } else {
      // Translate if missing OR if English source matches target (never translated)
      if (target?.[key] === undefined || target?.[key] === value) {
        missing[key] = value
      }
    }
  }
  return missing
}

// Deep-merge: source wins only for keys that exist in source
function deepMerge(existing, fresh) {
  const result = { ...existing }
  for (const [key, value] of Object.entries(fresh)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = deepMerge(existing?.[key] ?? {}, value)
    } else {
      result[key] = value
    }
  }
  return result
}

// Translate a flat object of { key: englishString } using Gemini
async function translateBatch(ai, entries, targetLang) {
  if (Object.keys(entries).length === 0) return {}

  const prompt = `You are a professional translator for a business web app called JobabDesk.
Translate these UI strings from English to ${targetLang}.

Rules:
- Keep {variables} like {count}, {suffix}, {name} exactly as-is
- Keep ICU plural format like {count, plural, =1 {deal} other {deals}} but translate "deal"/"deals"
- Keep HTML tags if any
- Return ONLY valid JSON, no explanation, no markdown code block
- Be concise — these are UI labels, buttons, and short descriptions
- Use simple, natural language that business owners in Bangladesh would understand

Input JSON:
${JSON.stringify(entries, null, 2)}

Output: translated JSON with same keys`

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.1 },
  })

  let text = response.text?.trim() ?? ''
  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    return JSON.parse(text)
  } catch {
    console.error('Failed to parse Gemini response:', text.slice(0, 300))
    return {}
  }
}

// Recursively translate a nested missing-keys object
async function translateNested(ai, missingObj, targetLang, depth = 0) {
  const result = {}
  const flatEntries = {}
  const nestedKeys = []

  for (const [key, value] of Object.entries(missingObj)) {
    if (typeof value === 'object' && value !== null) {
      nestedKeys.push(key)
    } else {
      flatEntries[key] = value
    }
  }

  // Translate flat strings in one batch
  if (Object.keys(flatEntries).length > 0) {
    console.log(`  ${'  '.repeat(depth)}Translating ${Object.keys(flatEntries).length} strings...`)
    const translated = await translateBatch(ai, flatEntries, targetLang)
    Object.assign(result, translated)
  }

  // Recurse into nested objects
  for (const key of nestedKeys) {
    console.log(`  ${'  '.repeat(depth)}[${key}]`)
    result[key] = await translateNested(ai, missingObj[key], targetLang, depth + 1)
  }

  return result
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    console.error('❌ Missing GEMINI_API_KEY environment variable')
    console.error('   Set it in .env.local or export it before running')
    process.exit(1)
  }

  const ai = new GoogleGenAI({ apiKey })
  const enPath = resolve(ROOT, 'messages/en.json')
  const en = JSON.parse(readFileSync(enPath, 'utf-8'))

  for (const [locale, langDesc] of Object.entries(TARGET_LOCALES)) {
    const outPath = resolve(ROOT, `messages/${locale}.json`)
    let existing = {}
    try {
      existing = JSON.parse(readFileSync(outPath, 'utf-8'))
    } catch {
      console.log(`  Creating new ${locale}.json`)
    }

    console.log(`\n🌐 Translating → ${locale} (${langDesc.split('—')[0].trim()})`)
    const missing = findMissingKeys(en, existing)
    const missingCount = JSON.stringify(missing).length

    if (missingCount < 5) {
      console.log('  ✅ Already up to date — nothing to translate')
      continue
    }

    console.log(`  Found missing/untranslated keys, translating...`)
    const translated = await translateNested(ai, missing, langDesc)
    const merged = deepMerge(existing, translated)

    writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
    console.log(`  ✅ Saved messages/${locale}.json`)
  }

  console.log('\n✅ Translation complete!')
}

main().catch(err => { console.error(err); process.exit(1) })

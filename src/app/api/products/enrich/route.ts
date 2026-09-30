import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { GoogleGenAI } from '@google/genai'

// ─── Offline brand/category dictionary ───────────────────────────────────────
// Used when AI is unavailable. Covers the most common beauty/skincare brands.

const BRAND_MAP: Record<string, { brand: string; category: string; description: string }> = {
  'nivea':           { brand: 'Nivea',           category: 'Face Wash & Scrub', description: 'Gentle daily face cleanser that removes dirt and impurities while keeping skin moisturised.' },
  'the body shop':   { brand: 'The Body Shop',   category: 'Skin Care',         description: 'Ethically sourced skincare enriched with natural ingredients for healthy-looking skin.' },
  'neutrogena':      { brand: 'Neutrogena',       category: 'Face Wash & Scrub', description: 'Dermatologist-recommended face wash that deeply cleanses and clears pores.' },
  'st. ives':        { brand: "St. Ives",         category: 'Face Wash & Scrub', description: 'Natural exfoliating scrub that buffs away dead skin cells for a smooth, glowing complexion.' },
  'st ives':         { brand: "St. Ives",         category: 'Face Wash & Scrub', description: 'Natural exfoliating scrub that buffs away dead skin cells for a smooth, glowing complexion.' },
  'superdrug':       { brand: 'Superdrug',        category: 'Skin Care',         description: 'Affordable everyday skincare offering effective cleansing and hydration.' },
  'bulldog':         { brand: 'Bulldog',          category: "Men's Grooming",    description: 'Natural skincare designed specifically for men\'s skin with plant-based ingredients.' },
  'simple':          { brand: 'Simple',           category: 'Face Wash & Scrub', description: 'Kind-to-skin face wash free from artificial perfume and colour, suitable for sensitive skin.' },
  'no7':             { brand: 'No7',              category: 'Skin Care',         description: 'Science-backed skincare clinically proven to improve skin appearance and reduce signs of ageing.' },
  'no 7':            { brand: 'No7',              category: 'Skin Care',         description: 'Science-backed skincare clinically proven to improve skin appearance and reduce signs of ageing.' },
  'boots':           { brand: 'Boots',            category: 'Skin Care',         description: 'Trusted everyday skincare range available at Boots offering effective and affordable solutions.' },
  'botanics':        { brand: 'Botanics',         category: 'Skin Care',         description: 'Plant-powered skincare range using natural botanical extracts to nourish and protect skin.' },
  'clean clear':     { brand: 'Clean & Clear',    category: 'Face Wash & Scrub', description: 'Oil-free face wash that clears breakouts and leaves skin clean and refreshed.' },
  'clean & clear':   { brand: 'Clean & Clear',    category: 'Face Wash & Scrub', description: 'Oil-free face wash that clears breakouts and leaves skin clean and refreshed.' },
  'avenue':          { brand: 'Avenue',           category: 'Face Wash & Scrub', description: 'Everyday face wash for clean, fresh and clear-feeling skin.' },
  'tea tree':        { brand: 'Tea Tree',         category: 'Face Wash & Scrub', description: 'Tea tree-infused cleanser with natural antibacterial properties to clear blemishes.' },
  'olay':            { brand: 'Olay',             category: 'Moisturizer',       description: 'Hydrating moisturiser that visibly reduces fine lines and firms skin over time.' },
  'cerave':          { brand: 'CeraVe',           category: 'Moisturizer',       description: 'Ceramide-enriched moisturiser that restores the skin barrier and provides 24-hour hydration.' },
  'la roche posay':  { brand: 'La Roche-Posay',  category: 'Skin Care',         description: 'Dermatologist-tested skincare formulated for sensitive and reactive skin types.' },
  'garnier':         { brand: 'Garnier',          category: 'Face Wash & Scrub', description: 'Refreshing face wash with natural extracts that cleanses and brightens skin.' },
  "l'oreal":         { brand: "L'Oreal",          category: 'Skin Care',         description: 'Advanced skincare formula developed with dermatological expertise for visible results.' },
  'loreal':          { brand: "L'Oreal",          category: 'Skin Care',         description: 'Advanced skincare formula developed with dermatological expertise for visible results.' },
  'dove':            { brand: 'Dove',             category: 'Body Wash',         description: 'Moisturising body wash with Dove\'s signature 1/4 moisturising cream for soft skin.' },
  'vaseline':        { brand: 'Vaseline',         category: 'Body Lotion',       description: 'Deep-moisturising lotion that heals and protects very dry skin.' },
  'palmer':          { brand: "Palmer's",         category: 'Body Lotion',       description: 'Rich cocoa butter formula that deeply moisturises and improves skin elasticity.' },
  'head shoulders':  { brand: 'Head & Shoulders', category: 'Shampoo',          description: 'Anti-dandruff shampoo that removes flakes and keeps scalp healthy and clean.' },
}

// Keyword-based category detection from product name
function detectCategory(name: string): string {
  const n = name.toLowerCase()
  if (n.match(/face wash|cleanser|cleansing|foaming/)) return 'Face Wash & Scrub'
  if (n.match(/scrub|exfoliat/)) return 'Face Wash & Scrub'
  if (n.match(/moisturis|moisturiz|cream|lotion.*face|day cream|night cream/)) return 'Moisturizer'
  if (n.match(/serum/)) return 'Serum'
  if (n.match(/toner/)) return 'Toner'
  if (n.match(/sunscreen|spf|sun protec/)) return 'Sunscreen'
  if (n.match(/eye cream|eye gel|eye serum/)) return 'Eye Care'
  if (n.match(/lip balm|lip care|lip butter/)) return 'Lip Care'
  if (n.match(/body lotion|body cream|body butter|body moistur/)) return 'Body Lotion'
  if (n.match(/shampoo/)) return 'Shampoo'
  if (n.match(/conditioner/)) return 'Conditioner'
  if (n.match(/hair mask|hair treatment/)) return 'Hair Mask'
  if (n.match(/body wash|shower gel/)) return 'Body Wash'
  if (n.match(/deodoran|antiperspirant/)) return 'Deodorant'
  if (n.match(/perfume|fragrance|cologne/)) return 'Perfume'
  return 'Skin Care'
}

function offlineEnrich(product: { rowIndex: number; name: string; brand?: string }) {
  const nameLower = product.name.toLowerCase()
  const countryNames = ['uk', 'poland', 'france', 'thailand', 'usa', 'china', 'germany', 'italy', 'spain', 'korea', 'japan', 'india', 'bangladesh']
  const currentBrand = countryNames.includes(product.brand?.toLowerCase().trim() ?? '') ? '' : (product.brand ?? '')

  // Try to find brand match in dictionary
  for (const [key, val] of Object.entries(BRAND_MAP)) {
    if (nameLower.includes(key)) {
      return {
        rowIndex: product.rowIndex,
        brand: currentBrand || val.brand,
        category: val.category,
        description: val.description,
      }
    }
  }

  // No brand match — use keyword-based category detection
  return {
    rowIndex: product.rowIndex,
    brand: currentBrand,
    category: detectCategory(product.name),
    description: `${product.name} — quality skincare product for everyday use.`,
  }
}

// ─── API Categories ───────────────────────────────────────────────────────────
const CATEGORIES = [
  'Face Wash & Scrub', 'Moisturizer', 'Serum', 'Toner', 'Sunscreen',
  'Eye Care', 'Lip Care', 'Body Lotion', 'Shampoo', 'Conditioner',
  'Hair Mask', 'Body Wash', 'Deodorant', 'Perfume', 'Makeup',
  'Skin Care', 'Hair Care', 'Baby Care', "Men's Grooming",
  'Electronics', 'Clothing', 'Food & Beverage', 'Supplements',
  'Household', 'Stationery', 'Toys', 'Sports', 'Other'
]

export async function POST(req: Request) {
  try {
    await requireRole('agent')

    const { products } = await req.json() as {
      products: Array<{ rowIndex: number; name: string; brand?: string; category?: string }>
    }

    if (!products?.length) {
      return NextResponse.json({ enriched: [] })
    }

    const apiKey = process.env.GEMINI_API_KEY

    // ── Try Gemini AI first ────────────────────────────────────────────────
    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey })

      const prompt = `You are a product database expert. For each product below, fill in missing information based ONLY on the product name.

Rules:
- ONLY provide information you are highly confident is accurate
- brand: actual manufacturer/brand name (e.g. "Nivea", "The Body Shop", "Neutrogena")
  - If current_brand looks like a country ("uk", "poland", "france", "thailand", "usa") — replace with real brand name
  - If truly unknown, return empty string ""
- category: choose ONE from: ${CATEGORIES.join(', ')}
- description: 1 factual sentence about the product and its key benefit
- Return ONLY a valid JSON array. No markdown. No explanation.

Products:
${products.map((p, i) => `${i + 1}. name: "${p.name}"${p.brand ? `, current_brand: "${p.brand}"` : ''}${p.category ? `, current_category: "${p.category}"` : ''}`).join('\n')}

Return exactly ${products.length} objects with rowIndex values: ${products.map(p => p.rowIndex).join(', ')}
Format: [{"rowIndex":number,"brand":"string","category":"string","description":"string"}]`

      const MODEL_CHAIN = [
        'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash',
        'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash', 'gemini-2.5-flash',
      ]

      for (const model of MODEL_CHAIN) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { temperature: 0.1 },
          })
          const raw = response.text?.trim() ?? ''
          const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
          if (!cleaned) continue
          try {
            const enriched = JSON.parse(cleaned)
            return NextResponse.json({ enriched, model, source: 'ai' })
          } catch { continue }
        } catch {
          continue // try next model — don't stop on any error
        }
      }
    }

    // ── Offline fallback — always works ───────────────────────────────────
    const enriched = products.map(p => offlineEnrich(p))
    return NextResponse.json({ enriched, source: 'offline', model: 'built-in dictionary' })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

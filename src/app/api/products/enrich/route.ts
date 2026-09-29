import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { GoogleGenAI } from '@google/genai'

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
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured in Vercel environment variables. Go to Vercel → Settings → Environment Variables and add GEMINI_API_KEY.' },
        { status: 500 }
      )
    }

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

    // Same model chain as translate.mjs (confirmed working with this API key)
    const MODEL_CHAIN = [
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-2.5-flash',
    ]

    let raw = ''
    let usedModel = ''
    let lastError = ''

    for (const model of MODEL_CHAIN) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { temperature: 0.1 },
        })
        raw = response.text?.trim() ?? ''
        usedModel = model
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        lastError = msg
        // Only continue fallback for model-not-found / deprecated errors
        if (msg.includes('404') || msg.includes('no longer available') || msg.includes('NOT_FOUND') || msg.includes('deprecated')) {
          continue // try next model
        }
        throw err // other errors (auth, quota) — stop immediately
      }
    }

    if (!raw) {
      return NextResponse.json(
        { error: `All AI models failed. Last error: ${lastError}` },
        { status: 500 }
      )
    }

    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    if (!cleaned) {
      return NextResponse.json({ error: 'AI returned empty response. Please try again.' }, { status: 500 })
    }

    let enriched
    try {
      enriched = JSON.parse(cleaned)
    } catch {
      return NextResponse.json(
        { error: `AI response could not be parsed. Raw: ${cleaned.slice(0, 200)}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ enriched, model: usedModel })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { GoogleGenAI } from '@google/genai'

const CATEGORIES = [
  'Face Wash & Scrub', 'Moisturizer', 'Serum', 'Toner', 'Sunscreen',
  'Eye Care', 'Lip Care', 'Body Lotion', 'Shampoo', 'Conditioner',
  'Hair Mask', 'Body Wash', 'Deodorant', 'Perfume', 'Makeup',
  'Skin Care', 'Hair Care', 'Baby Care', 'Men\'s Grooming',
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
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
    }

    const ai = new GoogleGenAI({ apiKey })

    // Send all products in one batch for efficiency
    const prompt = `You are a product database expert. For each product below, fill in missing information based ONLY on the product name. 

Rules:
- ONLY provide information you are highly confident is accurate based on the product name
- brand: the actual manufacturer/brand name (e.g. "Nivea", "The Body Shop", "Neutrogena")
  - If the current brand value looks like a country ("uk", "poland", "france", "thailand") — replace it with the real brand name
  - If truly unknown, return empty string
- category: choose ONE from this list: ${CATEGORIES.join(', ')}
- description: 1 sentence about what the product is and its key benefit. Be factual.
- Do NOT invent prices, stock quantities, or any other data
- Return ONLY valid JSON array, no markdown, no explanation

Products to enrich:
${products.map((p, i) => `${i + 1}. name: "${p.name}"${p.brand ? `, current_brand: "${p.brand}"` : ''}${p.category ? `, current_category: "${p.category}"` : ''}`).join('\n')}

Return JSON array with exactly ${products.length} objects:
[{"rowIndex": number, "brand": "string", "category": "string", "description": "string"}, ...]

The rowIndex values must match: ${products.map(p => p.rowIndex).join(', ')}`

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.1 },
    })

    let text = response.text?.trim() ?? ''
    text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    const enriched = JSON.parse(text)
    return NextResponse.json({ enriched })

  } catch (err) {
    return toErrorResponse(err)
  }
}

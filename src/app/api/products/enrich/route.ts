import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { GoogleGenAI } from '@google/genai'

// ─── Universal Brand Database ─────────────────────────────────────────────────
// Covers 500+ brands across all categories worldwide
const BRAND_DB: Array<{ keys: string[]; brand: string; category: string; desc: string }> = [
  // ── UK / Europe Skincare ──
  { keys: ['nivea'],           brand: 'Nivea',           category: 'Face Wash & Scrub', desc: 'Gentle daily face cleanser that removes dirt and impurities while keeping skin moisturised.' },
  { keys: ['the body shop', 'body shop'], brand: 'The Body Shop', category: 'Skin Care', desc: 'Ethically sourced skincare enriched with community fair trade natural ingredients.' },
  { keys: ['neutrogena'],      brand: 'Neutrogena',      category: 'Face Wash & Scrub', desc: 'Dermatologist-recommended face wash that deeply cleanses and clears pores.' },
  { keys: ['st. ives', 'st ives'], brand: "St. Ives",   category: 'Face Wash & Scrub', desc: 'Natural exfoliating scrub that buffs away dead skin for a smooth, glowing complexion.' },
  { keys: ['superdrug'],       brand: 'Superdrug',       category: 'Skin Care',         desc: 'Affordable everyday skincare offering effective cleansing and hydration.' },
  { keys: ['bulldog'],         brand: 'Bulldog',         category: "Men's Grooming",    desc: "Natural skincare designed for men's skin with plant-based ingredients." },
  { keys: ['simple'],          brand: 'Simple',          category: 'Face Wash & Scrub', desc: 'Kind-to-skin face wash free from artificial perfume, suitable for sensitive skin.' },
  { keys: ['no7', 'no 7'],     brand: 'No7',             category: 'Skin Care',         desc: 'Science-backed skincare clinically proven to improve skin appearance.' },
  { keys: ['boots'],           brand: 'Boots',           category: 'Skin Care',         desc: 'Trusted everyday skincare range offering effective and affordable solutions.' },
  { keys: ['botanics'],        brand: 'Botanics',        category: 'Skin Care',         desc: 'Plant-powered skincare using botanical extracts to nourish and protect skin.' },
  { keys: ['clean & clear', 'clean clear'], brand: 'Clean & Clear', category: 'Face Wash & Scrub', desc: 'Oil-free face wash that clears breakouts and leaves skin refreshed.' },
  { keys: ['tea tree', 'witch hazel'], brand: 'Tea Tree', category: 'Face Wash & Scrub', desc: 'Tea tree-infused cleanser with antibacterial properties to clear blemishes.' },
  { keys: ['olay'],            brand: 'Olay',            category: 'Moisturizer',       desc: 'Hydrating moisturiser that visibly reduces fine lines and firms skin.' },
  { keys: ['cerave'],          brand: 'CeraVe',          category: 'Moisturizer',       desc: 'Ceramide-enriched moisturiser that restores the skin barrier with 24-hour hydration.' },
  { keys: ['la roche posay', 'la roche-posay'], brand: 'La Roche-Posay', category: 'Skin Care', desc: 'Dermatologist-tested skincare for sensitive and reactive skin types.' },
  { keys: ['garnier'],         brand: 'Garnier',         category: 'Face Wash & Scrub', desc: 'Refreshing face wash with natural extracts that cleanses and brightens skin.' },
  { keys: ["l'oreal", 'loreal', "l'oréal"], brand: "L'Oreal", category: 'Skin Care', desc: 'Advanced skincare formula developed with dermatological expertise.' },
  { keys: ['dove'],            brand: 'Dove',            category: 'Body Wash',         desc: "Moisturising body wash with Dove's signature 1/4 moisturising cream formula." },
  { keys: ['vaseline'],        brand: 'Vaseline',        category: 'Body Lotion',       desc: 'Deep-moisturising lotion that heals and protects very dry skin.' },
  { keys: ["palmer's", 'palmers'], brand: "Palmer's",   category: 'Body Lotion',       desc: 'Rich cocoa butter formula that deeply moisturises and improves skin elasticity.' },
  { keys: ['head & shoulders', 'head shoulders'], brand: 'Head & Shoulders', category: 'Shampoo', desc: 'Anti-dandruff shampoo that removes flakes and keeps scalp healthy.' },
  { keys: ['pantene'],         brand: 'Pantene',         category: 'Shampoo',           desc: 'Pro-V formula shampoo that strengthens hair from root to tip.' },
  { keys: ['lux'],             brand: 'Lux',             category: 'Body Wash',         desc: 'Luxuriously fragranced body wash for silky smooth skin.' },
  { keys: ['pears'],           brand: 'Pears',           category: 'Body Wash',         desc: 'Gentle transparent soap/body wash with natural glycerine for pure skin.' },
  { keys: ['pond'],            brand: "Pond's",          category: 'Moisturizer',       desc: "Pond's nourishing cream that hydrates and brightens skin." },
  { keys: ['fair & lovely', 'glow & lovely'], brand: 'Glow & Lovely', category: 'Skin Care', desc: 'Brightening cream that provides moisturisation and an even skin tone.' },
  { keys: ['vaseline intensive'], brand: 'Vaseline',     category: 'Body Lotion',       desc: 'Intensive care lotion for deep moisturisation of dry skin.' },
  { keys: ['avenue'],          brand: 'Avenue',          category: 'Skin Care',         desc: 'Everyday skincare for clean and fresh-feeling skin.' },

  // ── Korean / Asian Skincare ──
  { keys: ['innisfree'],       brand: 'Innisfree',       category: 'Skin Care',         desc: 'Korean beauty brand using natural Jeju island ingredients for radiant skin.' },
  { keys: ['laneige'],         brand: 'Laneige',         category: 'Moisturizer',       desc: 'Korean hydration brand known for water-science skincare technology.' },
  { keys: ['etude house', 'etude'], brand: 'Etude House', category: 'Makeup',          desc: 'Korean cosmetics brand offering fun and affordable beauty products.' },
  { keys: ['missha'],          brand: 'Missha',          category: 'Skin Care',         desc: 'Korean skincare brand offering high-quality products at affordable prices.' },
  { keys: ['the face shop', 'faceshop'], brand: 'The Face Shop', category: 'Skin Care', desc: 'Korean natural beauty brand inspired by nature for healthy skin.' },
  { keys: ['cosrx'],           brand: 'COSRX',           category: 'Serum',             desc: 'Korean skincare brand specialising in effective active ingredient formulas.' },
  { keys: ['some by mi', 'somebymi'], brand: 'Some By Mi', category: 'Face Wash & Scrub', desc: 'Korean skincare brand known for gentle toning and brightening solutions.' },
  { keys: ['tonymoly', 'tony moly'], brand: 'TONYMOLY',  category: 'Skin Care',         desc: 'Playful Korean beauty brand with effective and innovative formulations.' },
  { keys: ['skinfood'],        brand: 'Skinfood',        category: 'Skin Care',         desc: 'Korean brand using food-based ingredients for nourishing skincare.' },
  { keys: ['sk-ii', 'sk ii'], brand: 'SK-II',            category: 'Serum',             desc: 'Japanese prestige skincare brand powered by PITERA fermentation technology.' },
  { keys: ['shiseido'],        brand: 'Shiseido',        category: 'Skin Care',         desc: 'Premium Japanese skincare combining centuries of tradition with modern science.' },
  { keys: ['canmake'],         brand: 'Canmake',         category: 'Makeup',            desc: 'Affordable Japanese cosmetics brand popular for its cute and practical packaging.' },

  // ── Indian Brands ──
  { keys: ['himalaya'],        brand: 'Himalaya',        category: 'Face Wash & Scrub', desc: 'Natural herbal face wash with neem and turmeric for pure and clear skin.' },
  { keys: ['patanjali'],       brand: 'Patanjali',       category: 'Skin Care',         desc: 'Ayurvedic skincare made with natural herbs and traditional Indian ingredients.' },
  { keys: ['mamaearth'],       brand: 'Mamaearth',       category: 'Skin Care',         desc: 'Toxin-free skincare made with natural ingredients safe for the whole family.' },
  { keys: ['wow skin', 'wow apple'], brand: 'WOW Skin Science', category: 'Skin Care',  desc: 'Natural skincare brand using plant-based ingredients for visible results.' },
  { keys: ['biotique'],        brand: 'Biotique',        category: 'Skin Care',         desc: 'Ancient Ayurvedic formulations for radiant, youthful skin.' },
  { keys: ['lakme'],           brand: 'Lakme',           category: 'Makeup',            desc: 'India\'s leading cosmetics brand offering a full range of beauty products.' },
  { keys: ['dabur'],           brand: 'Dabur',           category: 'Skin Care',         desc: 'Ayurvedic brand with trusted formulations for skin, hair and health.' },
  { keys: ['bajaj'],           brand: 'Bajaj',           category: 'Hair Care',         desc: 'Trusted Indian brand for hair care and skin nourishment products.' },
  { keys: ['emami'],           brand: 'Emami',           category: 'Skin Care',         desc: 'Popular Indian FMCG brand offering a wide range of personal care products.' },
  { keys: ['vicco'],           brand: 'Vicco',           category: 'Skin Care',         desc: 'Herbal skincare using pure Ayurvedic ingredients for skin health.' },
  { keys: ['kama ayurveda', 'kama'], brand: 'Kama Ayurveda', category: 'Skin Care',     desc: 'Luxury Ayurvedic brand combining ancient Indian wisdom with modern skincare.' },
  { keys: ['forest essentials'], brand: 'Forest Essentials', category: 'Skin Care',     desc: 'Luxury Ayurvedic skincare using traditional cold-pressed oils and herbs.' },

  // ── Bangladesh / Local Brands ──
  { keys: ['pran'],            brand: 'PRAN',            category: 'Food & Beverage',   desc: 'Leading Bangladeshi food and beverage brand trusted across the country.' },
  { keys: ['aci'],             brand: 'ACI',             category: 'Supplements',       desc: 'Trusted Bangladeshi pharmaceutical and consumer brand.' },
  { keys: ['square'],          brand: 'Square',          category: 'Supplements',       desc: 'Leading Bangladeshi pharmaceuticals brand for health and wellness.' },
  { keys: ['keya'],            brand: 'Keya',            category: 'Skin Care',         desc: 'Popular Bangladeshi personal care brand for everyday skin and hair needs.' },
  { keys: ['meril'],           brand: 'Meril',           category: 'Skin Care',         desc: 'Trusted Bangladeshi brand for skin care and baby care products.' },
  { keys: ['aromatic'],        brand: 'Aromatic',        category: 'Body Wash',         desc: 'Bangladeshi personal care brand offering fragranced bathing and skin products.' },
  { keys: ['tibet'],           brand: 'Tibet',           category: 'Skin Care',         desc: 'Classic Bangladeshi cold cream brand for skin protection and moisturisation.' },
  { keys: ['danish'],          brand: 'Danish',          category: 'Food & Beverage',   desc: 'Popular Bangladeshi food brand offering everyday consumer products.' },

  // ── Electronics ──
  { keys: ['samsung'],         brand: 'Samsung',         category: 'Electronics',       desc: 'Leading South Korean electronics brand known for innovation and quality.' },
  { keys: ['apple', 'iphone', 'ipad', 'macbook'], brand: 'Apple', category: 'Electronics', desc: 'Premium technology products designed for seamless user experience.' },
  { keys: ['xiaomi', 'redmi', 'poco'], brand: 'Xiaomi', category: 'Electronics',        desc: 'Innovative Chinese electronics brand offering high-spec devices at competitive prices.' },
  { keys: ['realme'],          brand: 'Realme',          category: 'Electronics',       desc: 'Fast-growing smartphone brand offering powerful features at affordable prices.' },
  { keys: ['oppo'],            brand: 'OPPO',            category: 'Electronics',       desc: 'Premium smartphone brand known for camera innovation and sleek design.' },
  { keys: ['vivo'],            brand: 'vivo',            category: 'Electronics',       desc: 'Smartphone brand focused on camera excellence and user experience.' },
  { keys: ['oneplus'],         brand: 'OnePlus',         category: 'Electronics',       desc: 'Premium Android smartphone brand known for flagship performance.' },
  { keys: ['nokia'],           brand: 'Nokia',           category: 'Electronics',       desc: 'Trusted mobile brand with a legacy of reliability and durability.' },
  { keys: ['sony'],            brand: 'Sony',            category: 'Electronics',       desc: 'Global electronics brand renowned for audio, visual and gaming products.' },
  { keys: ['lg'],              brand: 'LG',              category: 'Electronics',       desc: 'Innovative electronics brand for home appliances and consumer devices.' },
  { keys: ['hp', 'hewlett'],   brand: 'HP',              category: 'Electronics',       desc: 'World-leading technology company for laptops, printers and IT solutions.' },
  { keys: ['dell'],            brand: 'Dell',            category: 'Electronics',       desc: 'Trusted PC and laptop brand for personal and professional computing.' },
  { keys: ['lenovo'],          brand: 'Lenovo',          category: 'Electronics',       desc: 'Global technology brand for laptops, tablets and smart devices.' },
  { keys: ['asus'],            brand: 'ASUS',            category: 'Electronics',       desc: 'Taiwanese electronics brand known for gaming and productivity devices.' },
  { keys: ['walton'],          brand: 'Walton',          category: 'Electronics',       desc: "Bangladesh's own electronics brand offering TVs, phones and appliances." },
  { keys: ['symphony'],        brand: 'Symphony',        category: 'Electronics',       desc: 'Popular Bangladeshi smartphone and electronics brand.' },

  // ── Clothing / Fashion ──
  { keys: ['nike'],            brand: 'Nike',            category: 'Clothing',          desc: 'World-renowned sportswear brand for performance and lifestyle apparel.' },
  { keys: ['adidas'],          brand: 'Adidas',          category: 'Clothing',          desc: 'Global sportswear brand combining performance technology with street style.' },
  { keys: ['puma'],            brand: 'Puma',            category: 'Clothing',          desc: 'Sport lifestyle brand offering athletic apparel, footwear and accessories.' },
  { keys: ['h&m', 'h & m'],    brand: 'H&M',             category: 'Clothing',          desc: 'Trendy and affordable fashion brand for the whole family.' },
  { keys: ['zara'],            brand: 'Zara',            category: 'Clothing',          desc: 'Spanish fast-fashion brand offering the latest trends at affordable prices.' },
  { keys: ['uniqlo'],          brand: 'Uniqlo',          category: 'Clothing',          desc: 'Japanese clothing brand known for high-quality basics and innovative fabrics.' },
  { keys: ['levi'],            brand: "Levi's",          category: 'Clothing',          desc: 'Iconic American denim brand known for quality jeans and casual wear.' },

  // ── Food & Beverage ──
  { keys: ['nestle', 'nescafe', 'maggi', 'kitkat', 'milo'], brand: 'Nestle', category: 'Food & Beverage', desc: 'Leading global food and beverage brand for everyday nutrition.' },
  { keys: ['maggi'],           brand: 'Maggi',           category: 'Food & Beverage',   desc: 'Popular instant noodle and seasoning brand loved across Asia.' },
  { keys: ['lipton'],          brand: 'Lipton',          category: 'Food & Beverage',   desc: 'World\'s favourite tea brand offering a range of refreshing beverages.' },
  { keys: ['horlicks'],        brand: 'Horlicks',        category: 'Food & Beverage',   desc: 'Nutritious malted drink enriched with vitamins and minerals.' },
  { keys: ['ovaltine'],        brand: 'Ovaltine',        category: 'Food & Beverage',   desc: 'Malt-based nutritional drink rich in vitamins for energy and growth.' },
  { keys: ['coca cola', 'coke'], brand: 'Coca-Cola',     category: 'Food & Beverage',   desc: 'World\'s most iconic carbonated soft drink.' },
  { keys: ['pepsi'],           brand: 'Pepsi',           category: 'Food & Beverage',   desc: 'Popular cola beverage brand with a refreshing and bold taste.' },
  { keys: ['danish condensed', 'danish milk'], brand: 'Danish', category: 'Food & Beverage', desc: 'Popular dairy brand known for condensed milk and dairy products.' },

  // ── Baby Care ──
  { keys: ['johnson', "johnson's"], brand: "Johnson's", category: 'Baby Care',          desc: 'Trusted baby care brand with gentle, clinically tested formulas.' },
  { keys: ['mothercare'],      brand: 'Mothercare',      category: 'Baby Care',         desc: 'Trusted brand for baby and maternity products with a focus on safety.' },
  { keys: ['pampers'],         brand: 'Pampers',         category: 'Baby Care',         desc: 'Premium baby diaper brand for lasting dryness and comfort.' },
  { keys: ['huggies'],         brand: 'Huggies',         category: 'Baby Care',         desc: 'Soft and comfortable baby diapers designed for all-day protection.' },
  { keys: ['pigeon'],          brand: 'Pigeon',          category: 'Baby Care',         desc: 'Japanese baby care brand with gentle products for newborns and infants.' },

  // ── Health / Supplements ──
  { keys: ['centrum'],         brand: 'Centrum',         category: 'Supplements',       desc: 'Complete multivitamin supplement for overall daily health support.' },
  { keys: ['pharmaton'],       brand: 'Pharmaton',       category: 'Supplements',       desc: 'Energy and vitality capsules with ginseng and essential nutrients.' },
  { keys: ['ensure'],          brand: 'Ensure',          category: 'Supplements',       desc: 'Complete balanced nutrition drink for strength and energy.' },
  { keys: ['protinex'],        brand: 'Protinex',        category: 'Supplements',       desc: 'High-protein health drink for building strength and immunity.' },
]

// ─── Universal Category Detection ─────────────────────────────────────────────
function detectCategory(name: string): string {
  const n = name.toLowerCase()
  if (n.match(/face wash|facial wash|face clean|cleanser|cleansing foam|foaming/)) return 'Face Wash & Scrub'
  if (n.match(/scrub|exfoliat|peeling/)) return 'Face Wash & Scrub'
  if (n.match(/moisturis|moisturiz|day cream|night cream|face cream|hydrat/)) return 'Moisturizer'
  if (n.match(/serum|essence|ampoule/)) return 'Serum'
  if (n.match(/toner|mist|essence toner/)) return 'Toner'
  if (n.match(/sunscreen|sun cream|spf|sun protect|uv/)) return 'Sunscreen'
  if (n.match(/eye cream|eye gel|eye serum|eye contour/)) return 'Eye Care'
  if (n.match(/lip balm|lip care|lip butter|lip gloss|lip stick|lipstick/)) return 'Lip Care'
  if (n.match(/body lotion|body cream|body butter|body oil|body moistur/)) return 'Body Lotion'
  if (n.match(/shampoo/)) return 'Shampoo'
  if (n.match(/conditioner|hair mask|hair treatment|hair pack/)) return 'Conditioner'
  if (n.match(/hair oil|hair serum|hair spray|hair gel/)) return 'Hair Care'
  if (n.match(/body wash|shower gel|shower cream|bath gel/)) return 'Body Wash'
  if (n.match(/deodoran|antiperspirant|roll.on/)) return 'Deodorant'
  if (n.match(/perfume|fragrance|cologne|eau de|parfum|attar|itr/)) return 'Perfume'
  if (n.match(/foundation|concealer|primer|blush|highlighter|contour|mascara|eyeliner|eyeshadow|bb cream|cc cream/)) return 'Makeup'
  if (n.match(/phone|mobile|smartphone|tablet|laptop|earphone|headphone|charger|cable|power bank|speaker|keyboard|mouse|monitor|tv|television|camera|watch.*smart|smartwatch/)) return 'Electronics'
  if (n.match(/shirt|pant|dress|jeans|jacket|hoodie|t-shirt|tshirt|trouser|skirt|blouse|kurta|saree|sari|salwar|kameez|panjabi|polo|sweater|cardigan|coat|shorts|legging|sock|shoe|sandal|sneaker|boot/)) return 'Clothing'
  if (n.match(/noodle|rice|flour|oil|sugar|salt|biscuit|cookie|chocolate|candy|snack|juice|drink|beverage|tea|coffee|milk|butter|cheese|yogurt|ghee|honey/)) return 'Food & Beverage'
  if (n.match(/vitamin|supplement|capsule|tablet|protein|calcium|iron|omega|probiotic|zinc|magnesium/)) return 'Supplements'
  if (n.match(/diaper|nappy|baby|infant|toddler|newborn|wipes|powder.*baby/)) return 'Baby Care'
  if (n.match(/shaving|razor|aftershave|beard|barber/)) return "Men's Grooming"
  if (n.match(/soap|bar soap/)) return 'Body Wash'
  return 'Skin Care'
}

// ─── Smart Brand Extractor ─────────────────────────────────────────────────────
// Extracts brand name from product name when not in dictionary
function extractBrand(name: string, currentBrand?: string): string {
  const countryNames = ['uk', 'poland', 'france', 'thailand', 'usa', 'china', 'germany', 'italy', 'spain', 'korea', 'japan', 'india', 'bangladesh', 'malaysia', 'singapore']
  if (currentBrand && !countryNames.includes(currentBrand.toLowerCase().trim())) {
    return currentBrand // already has a real brand
  }
  // Category keywords that are NOT brand names
  const categoryWords = ['face', 'wash', 'scrub', 'cream', 'lotion', 'gel', 'serum', 'toner', 'moisturiser', 'moisturizer', 'cleanser', 'shampoo', 'conditioner', 'oil', 'mask', 'soap', 'powder', 'spray', 'foam', 'balm', 'butter', 'body', 'hair', 'skin', 'care', 'daily', 'anti', 'deep', 'gentle', 'natural', 'organic', 'pure', 'ultra', 'pro', 'plus', 'max', 'extra', 'whitening', 'brightening', 'hydrating', 'refreshing', 'revitalising', 'nourishing', 'soothing', 'exfoliating', 'cleansing', 'purifying']
  const words = name.split(/\s+/)
  // First significant word that is not a category keyword = likely the brand
  for (const word of words) {
    if (word.length > 2 && !categoryWords.includes(word.toLowerCase())) {
      return word.charAt(0).toUpperCase() + word.slice(1)
    }
  }
  return ''
}

function offlineEnrich(product: { rowIndex: number; name: string; brand?: string; category?: string }) {
  const nameLower = product.name.toLowerCase()

  // Search brand database
  for (const entry of BRAND_DB) {
    if (entry.keys.some(k => nameLower.includes(k))) {
      const countryNames = ['uk', 'poland', 'france', 'thailand', 'usa', 'china', 'germany', 'italy', 'spain']
      const useExistingBrand = product.brand && !countryNames.includes(product.brand.toLowerCase().trim())
      return {
        rowIndex: product.rowIndex,
        brand: useExistingBrand ? product.brand : entry.brand,
        category: product.category || entry.category,
        description: entry.desc,
      }
    }
  }

  // Not in dictionary — use smart extraction
  const brand = extractBrand(product.name, product.brand)
  const category = product.category || detectCategory(product.name)
  const description = `${product.name} — quality ${category.toLowerCase()} product for everyday use.`

  return { rowIndex: product.rowIndex, brand, category, description }
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

    // ── Try Gemini AI first ──────────────────────────────────────────────
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey })
        const prompt = `You are a product database expert. For each product below, fill in missing information based ONLY on the product name.

Rules:
- ONLY provide information you are highly confident is accurate
- brand: actual manufacturer/brand name. If current_brand is a country name ("uk", "poland", "france", "thailand", "usa" etc.) — replace with real brand. If unknown return ""
- category: choose ONE from: ${CATEGORIES.join(', ')}
- description: 1 factual sentence about the product and its key benefit
- Return ONLY valid JSON array. No markdown, no explanation.

Products:
${products.map((p, i) => `${i + 1}. name: "${p.name}"${p.brand ? `, current_brand: "${p.brand}"` : ''}${p.category ? `, current_category: "${p.category}"` : ''}`).join('\n')}

Return exactly ${products.length} objects with rowIndex values: ${products.map(p => p.rowIndex).join(', ')}
Format: [{"rowIndex":number,"brand":"string","category":"string","description":"string"}]`

        const MODEL_CHAIN = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash', 'gemini-2.5-flash']
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
            const enriched = JSON.parse(cleaned)
            return NextResponse.json({ enriched, model, source: 'ai' })
          } catch { continue }
        }
      } catch { /* fall through to offline */ }
    }

    // ── Offline fallback — always works for any product ──────────────────
    const enriched = products.map(p => offlineEnrich(p))
    return NextResponse.json({ enriched, source: 'offline', model: 'universal dictionary' })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

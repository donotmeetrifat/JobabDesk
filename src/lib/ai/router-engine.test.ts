import { describe, it, expect } from 'vitest'
import { detectLanguage, buildOfflineReply, formatRelativeMessageTime } from './router-engine'
import { isDetailedDeliveryAddress } from '../contacts/extract-info'

describe('router-engine language detection', () => {
  it('detects explicit request for Bengali even if written in Latin characters', () => {
    expect(detectLanguage('Banglay kotha bolen , pure bangla')).toBe('bn')
    expect(detectLanguage('banglay bolen')).toBe('bn')
    expect(detectLanguage('বাংলায় কথা বলুন')).toBe('bn')
    expect(detectLanguage('speak in bangla')).toBe('bn')
  })

  it('detects explicit request for English', () => {
    expect(detectLanguage('speak in english')).toBe('en')
    expect(detectLanguage('english please')).toBe('en')
  })

  it('persists Bengali preference on short follow-up messages after customer explicitly asked for Bangla', () => {
    const history = 'Customer: Banglay kotha bolen , pure bangla\nBot: অবশ্যই স্যার! বলুন কিভাবে সাহায্য করতে পারি?'
    expect(detectLanguage('Bkash', history)).toBe('bn')
    expect(detectLanguage('Payment done', history)).toBe('bn')
    expect(detectLanguage('ok', history)).toBe('bn')
  })

  it('detects natural Bengali script', () => {
    expect(detectLanguage('আমি একটি পণ্য কিনতে চাই')).toBe('bn')
    expect(detectLanguage('ক্যানভা প্রো কি ফ্রি?')).toBe('bn')
  })

  it('detects natural Banglish', () => {
    expect(detectLanguage('Canva nite chai')).toBe('banglish')
    expect(detectLanguage('dam koto bhaiya')).toBe('banglish')
    expect(detectLanguage('amar dry skin')).toBe('banglish')
    expect(detectLanguage('amake simple cream ar details daw')).toBe('banglish')
  })

  it('detects natural English without confusing it for Bengali or Banglish', () => {
    expect(detectLanguage('which is best cream for my skin')).toBe('en')
    expect(detectLanguage('do you have any moisturizers in stock?')).toBe('en')
    expect(detectLanguage('how much does it cost?')).toBe('en')
  })
})

describe('router-engine buildOfflineReply for free offers', () => {
  it('handles free Canva Pro digital offer without requesting payment or inventing discounts', () => {
    const account = {
      ai_store_instructions: 'We give Canva Pro for free as our special offer.',
    }
    const products = [
      { name: 'Canva Pro', price: 0, stock_qty: 999, is_in_stock: true, category: 'digital' },
    ]

    const replyBn = buildOfflineReply({
      detectedLang: 'bn',
      messageText: 'Canva nite chai',
      products,
      recentOrders: [],
      account,
    })

    expect(replyBn.reply).toContain('ফ্রি')
    expect(replyBn.reply).toContain('ইমেইল')
    expect(replyBn.reply).not.toContain('10%')
    expect(replyBn.reply).not.toContain('৳45')
    expect(replyBn.reply).not.toContain('01326596251')

    const replyBanglish = buildOfflineReply({
      detectedLang: 'banglish',
      messageText: 'Canva nite chai',
      products,
      recentOrders: [],
      account,
    })

    expect(replyBanglish.reply).toContain('Free')
    expect(replyBanglish.reply).toContain('Email')
    expect(replyBanglish.reply).not.toContain('10%')
    expect(replyBanglish.reply).not.toContain('৳45')
    expect(replyBanglish.reply).not.toContain('01326596251')
  })

  it('handles Canva Pro free offer when product is not in catalog at all', () => {
    const account = {
      ai_store_instructions: 'We give Canva Pro for free as our special offer.',
    }
    const products: any[] = [] // Empty products catalog

    const reply = buildOfflineReply({
      detectedLang: 'bn',
      messageText: 'Canva nite chai',
      products,
      recentOrders: [],
      account,
    })

    expect(reply.reply).toContain('ফ্রি')
    expect(reply.reply).toContain('ইমেইল')
    expect(reply.reply).not.toContain('10%')
    expect(reply.reply).not.toContain('৳45')
  })

  it('does NOT treat Canva Pro as free when offer has been removed from instructions and broadcasts', () => {
    const account = {
      ai_store_instructions: 'Customer satisfaction is our priority. We sell digital subscriptions.',
      ai_business_description: 'Digiplus Digital Store',
    }
    const products: any[] = []

    const replyBn = buildOfflineReply({
      detectedLang: 'bn',
      messageText: 'canva pro free?',
      products,
      recentOrders: [],
      account,
    })

    // Should NOT claim Canva Pro is free (৳0)
    expect(replyBn.reply).not.toContain('সম্পূর্ণ ফ্রি')
    expect(replyBn.reply).not.toContain('৳০')
    expect(replyBn.reply).not.toContain('৳0')
    expect(replyBn.reply).toContain('মেয়াদ ইতিমধ্যে শেষ হয়ে গেছে')

    const replyEn = buildOfflineReply({
      detectedLang: 'en',
      messageText: 'is canva free or paid?',
      products,
      recentOrders: [],
      account,
    })

    expect(replyEn.reply).not.toContain('completely free')
    expect(replyEn.reply).not.toContain('৳0')
    expect(replyEn.reply).toContain('offer has now ended')
  })

  it('handles physical product inquiry (e.g. Simple Cream) by asking for delivery address and COD, without asking for email', () => {
    const products = [
      { name: 'Simple Cream', price: 650, stock_qty: 25, is_in_stock: true, category: 'skincare' },
    ]
    const account = {
      ai_store_instructions: 'We sell skincare products.',
      special_instructions: 'Payment: COD or bKash 01326596251',
    }

    const replyBn = buildOfflineReply({
      detectedLang: 'bn',
      messageText: 'Simple cream nite chai',
      products,
      recentOrders: [],
      account,
    })

    expect(replyBn.reply).toContain('Simple Cream')
    expect(replyBn.reply).toContain('৳650')
    expect(replyBn.reply).toContain('ডেলিভারি ঠিকানা')
    expect(replyBn.reply).toContain('ক্যাশ অন ডেলিভারি')
    expect(replyBn.reply).not.toContain('ইমেইল')
    expect(replyBn.reply).not.toContain('Canva')
  })
})

describe('router-engine formatRelativeMessageTime', () => {
  it('formats recent messages accurately', () => {
    const now = new Date().toISOString()
    expect(formatRelativeMessageTime(now)).toBe('[Just now]')

    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    expect(formatRelativeMessageTime(tenMinsAgo)).toBe('[10m ago]')

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeMessageTime(twoHoursAgo)).toBe('[2h ago]')

    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeMessageTime(yesterday)).toBe('[Yesterday]')

    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeMessageTime(twoDaysAgo)).toBe('[2d ago]')
  })

  it('returns empty string on null or invalid timestamp', () => {
    expect(formatRelativeMessageTime(null)).toBe('')
    expect(formatRelativeMessageTime(undefined)).toBe('')
    expect(formatRelativeMessageTime('invalid-date')).toBe('')
  })
})

describe('router-engine checkout info extraction and language persistence', () => {
  it('persists Bengali language when customer sends English-script address and checkout details', () => {
    const history = 'Bot: ধন্যবাদ! number 7 radiance এভেইলেবল আছে। আপনার অর্ডারটি কনফার্ম করতে অনুগ্রহ করে নিচের ৪টি তথ্য জানিয়ে দিন:'
    const checkoutMsg = `Rifat\nAdreess: Mirpur 14,Muktijuddho sarok,Master goli,CB-204/A\n+880 1613-441083\nCOD`
    expect(detectLanguage(checkoutMsg, history)).toBe('bn')
  })

  it('persists Bengali language on follow-up full name answer', () => {
    const history = 'Bot: ধন্যবাদ! পার্সেল বুকিংয়ের জন্য অনুগ্রহ করে আপনার পুরো নামটি (Delivery Name) জানিয়ে দিন।'
    expect(detectLanguage('rifat is the full name', history)).toBe('bn')
  })

  it('persists Banglish when customer was talking in Banglish and sends checkout message', () => {
    const history = 'Customer: amar dry skin\nBot: ড্রাই স্কিনের জন্য আমাদের কাছে Simple আছে\nCustomer: amake simple cream ar details daw\nBot: Simple ক্রিমটি ভালো'
    const checkoutMsg = `Rifat\nMirpur 14\n01326596251\nCOD`
    expect(detectLanguage(checkoutMsg, history)).toBe('banglish')
  })

  it('persists English when customer was talking in English and sends checkout message', () => {
    const history = 'Customer: which is best cream for my skin\nBot: Simple cream is great for sensitive skin'
    const checkoutMsg = `Rifat\nMirpur 14\n01326596251\nCOD`
    expect(detectLanguage(checkoutMsg, history)).toBe('en')
  })
})

describe('isDetailedDeliveryAddress validation', () => {
  it('rejects short or incomplete area names', () => {
    expect(isDetailedDeliveryAddress('Mirpur 14')).toBe(false)
    expect(isDetailedDeliveryAddress('Mirpur-10')).toBe(false)
    expect(isDetailedDeliveryAddress('Dhanmondi')).toBe(false)
    expect(isDetailedDeliveryAddress('Uttara')).toBe(false)
    expect(isDetailedDeliveryAddress('Gulshan 2')).toBe(false)
    expect(isDetailedDeliveryAddress('Chittagong')).toBe(false)
  })

  it('accepts full delivery addresses with house, road, sector, block, or holding', () => {
    expect(isDetailedDeliveryAddress('House 12, Road 4, Sector 10, Uttara, Dhaka')).toBe(true)
    expect(isDetailedDeliveryAddress('Mirpur 14, Muktijuddho sarok, Master goli, CB-204/A, Dhaka')).toBe(true)
    expect(isDetailedDeliveryAddress('Holding 45, Ward 3, Post Office Road, Bogura')).toBe(true)
    expect(isDetailedDeliveryAddress('বাসা নং ১২, রোড ৪, মিরপুর ১০, ঢাকা')).toBe(true)
  })
})

describe('router-engine address validation and COD payment handling in buildOfflineReply', () => {
  const products = [
    { name: 'Simple Cream', price: 1000, stock_qty: 20, is_in_stock: true, category: 'skincare' },
  ]
  const account = {
    ai_store_instructions: 'UK Brand Lover store.',
  }

  it('asks for detailed address when customer only gives short area name like Mirpur 14', () => {
    const reply = buildOfflineReply({
      detectedLang: 'banglish',
      messageText: 'Rifat\nMirpur 14\n01326596251\nCOD',
      products,
      recentOrders: [],
      account,
      recentHistory: 'Customer: amake simple cream ar details daw',
    })

    // Must prompt for full detailed address (house/road)
    expect(reply.reply.toLowerCase()).toMatch(/thikana|address|house|road|basha/)
    // Must NOT confirm the order yet because address is incomplete
    expect(reply.reply).not.toContain('অর্ডারটি সফলভাবে কনফার্ম করা হয়েছে')
    expect(reply.reply).not.toContain('অনলাইন পেমেন্ট')
  })

  it('recognizes COD as Cash on Delivery and clarifies shop owner manual review before confirmation', () => {
    const reply = buildOfflineReply({
      detectedLang: 'bn',
      messageText: 'Rifat\nHouse 12, Road 4, Mirpur 14, Dhaka\n01326596251\nCOD',
      products,
      recentOrders: [],
      account,
      recentHistory: 'Customer: Simple cream nite chai',
    })

    // Must NOT say online payment
    expect(reply.reply).not.toContain('অনলাইন পেমেন্ট')
    expect(reply.reply).not.toContain('Online Payment')
    // Must mention Cash on Delivery
    expect(reply.reply).toContain('ক্যাশ অন ডেলিভারি')
    // Must clarify that order details are received and pending shop owner manual confirmation
    expect(reply.reply).toMatch(/অর্ডারটি পেয়েছি|অর্ডার তথ্য পেয়েছি|অর্ডার ডিটেইলস পেয়েছি|তথ্য সফলভাবে গ্রহণ করা হয়েছে/)
    expect(reply.reply).toMatch(/দোকান কর্তৃপক্ষ|শপ কর্তৃপক্ষ|শপ টিম|যাচাই|ম্যানুয়ালি কনফার্ম/)
    // Must NOT claim that parcel is already dispatched or automation already confirmed
    expect(reply.reply).not.toContain('সফলভাবে কনফার্ম করা হয়েছে')
    expect(reply.reply).not.toContain('পার্সেল প্রস্তুত করে পাঠিয়ে দিচ্ছে')
  })
})


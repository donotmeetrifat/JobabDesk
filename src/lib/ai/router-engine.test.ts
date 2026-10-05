import { describe, it, expect } from 'vitest'
import { detectLanguage, buildOfflineReply } from './router-engine'

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

    const replyEn = buildOfflineReply({
      detectedLang: 'en',
      messageText: 'is it free or paid?',
      products,
      recentOrders: [],
      account,
    })

    expect(replyEn.reply).not.toContain('completely free')
    expect(replyEn.reply).not.toContain('৳0')
  })
})

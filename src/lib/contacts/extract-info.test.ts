import { describe, it, expect } from 'vitest'
import { extractCustomerInfoFromMessage } from './extract-info'

describe('extractCustomerInfoFromMessage', () => {
  it('extracts multi-line checkout info with name Rifat, address, phone, and COD', () => {
    const text = `Rifat
Adreess: Mirpur 14,Muktijuddho sarok,Master goli,CB-204/A
+880 1613-441083
COD`
    const info = extractCustomerInfoFromMessage(text)
    expect(info.name).toBe('Rifat')
    expect(info.phone).toBe('+8801613441083')
    expect(info.address).toContain('Mirpur 14')
    expect(info.address).toContain('CB-204/A')
  })

  it('extracts name from suffix patterns like "rifat is the full name"', () => {
    const info = extractCustomerInfoFromMessage('rifat is the full name')
    expect(info.name).toBe('rifat')
  })

  it('extracts name from prefix patterns like "full name: Md. Rifat"', () => {
    const info = extractCustomerInfoFromMessage('full name: Md. Rifat')
    expect(info.name).toBe('Md. Rifat')
  })

  it('extracts single line name response', () => {
    const info = extractCustomerInfoFromMessage('Rifat Hasan')
    expect(info.name).toBe('Rifat Hasan')
  })

  it('rejects bot instructions or template questions from being extracted as name or address', () => {
    const promptText = 'আপনার পূর্ণাঙ্গ ডেলিভারি ঠিকানা (বাসা/রোড, থানা, জেলা) জানিয়ে দিন?'
    const info = extractCustomerInfoFromMessage(promptText)
    expect(info.name).toBeUndefined()
    expect(info.address).toBeUndefined()
  })

  it('rejects "delivery package" or phrases like "order din" from being treated as names', () => {
    const info = extractCustomerInfoFromMessage('delivery package for you')
    expect(info.name).toBeUndefined()
  })

  it('extracts email cleanly without false positives', () => {
    const info = extractCustomerInfoFromMessage('Amar email: customer123@gmail.com phone: 01711223344')
    expect(info.email).toBe('customer123@gmail.com')
    expect(info.phone).toBe('+8801711223344')
  })
})

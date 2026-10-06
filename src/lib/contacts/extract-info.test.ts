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
})

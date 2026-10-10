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

  it('extracts name with various prefixes like "Ami Tanvir", "Recipient: Fatema", "প্রাপক: সানজিদা"', () => {
    expect(extractCustomerInfoFromMessage('Ami Tanvir').name).toBe('Tanvir')
    expect(extractCustomerInfoFromMessage('Recipient: Fatema Akter').name).toBe('Fatema Akter')
    expect(extractCustomerInfoFromMessage('প্রাপক: সানজিদা খাতুন').name).toBe('সানজিদা খাতুন')
  })

  it('extracts email cleanly without false positives', () => {
    const info = extractCustomerInfoFromMessage('Amar email: customer123@gmail.com phone: 01711223344')
    expect(info.email).toBe('customer123@gmail.com')
    expect(info.phone).toBe('+8801711223344')
  })
})

describe('isInsideDhakaAddress and resolveDeliveryCharge', () => {
  it('correctly determines whether address is inside Dhaka or outside Dhaka', async () => {
    const { isInsideDhakaAddress } = await import('./extract-info')
    expect(isInsideDhakaAddress('Mirpur 10, Road 4, House 12, Dhaka')).toBe(true)
    expect(isInsideDhakaAddress('Uttara Sector 11, Road 2, Dhaka')).toBe(true)
    expect(isInsideDhakaAddress('Dhanmondi 32, Dhaka')).toBe(true)
    expect(isInsideDhakaAddress('বাসা ১২, রোড ৪, মিরপুর ১০, ঢাকা')).toBe(true)
    expect(isInsideDhakaAddress('GEC Circle, Nasirabad, Chittagong')).toBe(false)
    expect(isInsideDhakaAddress('Zindabazar, Sylhet Sadar, Sylhet')).toBe(false)
    expect(isInsideDhakaAddress('Rajshahi University, Motihar, Rajshahi')).toBe(false)
  })

  it('calculates proper delivery charge based on address and policy', async () => {
    const { resolveDeliveryCharge } = await import('./extract-info')
    // Standard default
    const dhakaRes = resolveDeliveryCharge({ address: 'Mirpur 14, Dhaka' })
    expect(dhakaRes.deliveryCharge).toBe(70)
    expect(dhakaRes.isInsideDhaka).toBe(true)

    const outsideRes = resolveDeliveryCharge({ address: 'Chittagong Sadar' })
    expect(outsideRes.deliveryCharge).toBe(130)
    expect(outsideRes.isInsideDhaka).toBe(false)

    // Custom store policy
    const customPolicy = 'Inside Dhaka ৳80, Outside Dhaka ৳150'
    const customDhaka = resolveDeliveryCharge({ address: 'Uttara, Dhaka', policyString: customPolicy })
    expect(customDhaka.deliveryCharge).toBe(80)

    const customOutside = resolveDeliveryCharge({ address: 'Sylhet Sadar', policyString: customPolicy })
    expect(customOutside.deliveryCharge).toBe(150)

    // Digital & Free
    expect(resolveDeliveryCharge({ isDigital: true }).deliveryCharge).toBe(0)
    expect(resolveDeliveryCharge({ isFree: true }).deliveryCharge).toBe(0)
  })
})


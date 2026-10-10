import { describe, it, expect } from 'vitest'
import {
  detectGenderFromName,
  detectGenderFromHistory,
  resolveCustomerAddressing,
  enforceGenderAddressingConsistency,
  cleanCustomerName,
} from './gender-detector'

describe('gender-detector name classification', () => {
  it('correctly cleans non-name placeholders and phones', () => {
    expect(cleanCustomerName('Messenger User (1234)')).toBe('')
    expect(cleanCustomerName('WhatsApp User')).toBe('')
    expect(cleanCustomerName('+8801712345678')).toBe('')
    expect(cleanCustomerName('Unknown')).toBe('')
    expect(cleanCustomerName('Md. Tanvir Hasan')).toBe('Md. Tanvir Hasan')
  })

  it('identifies male names in English and Bengali script', () => {
    expect(detectGenderFromName('Md. Tanvir Hasan')).toBe('male')
    expect(detectGenderFromName('Mohammad Rifat')).toBe('male')
    expect(detectGenderFromName('Rakib Ahmed')).toBe('male')
    expect(detectGenderFromName('Shakil Hossain')).toBe('male')
    expect(detectGenderFromName('Sheikh Fahim')).toBe('male')
    expect(detectGenderFromName('মেহেদী হাসান')).toBe('male')
    expect(detectGenderFromName('মোঃ আরিফুল ইসলাম')).toBe('male')
    expect(detectGenderFromName('তানভীর আহমেদ')).toBe('male')
  })

  it('identifies female names in English and Bengali script', () => {
    expect(detectGenderFromName('Nusrat Jahan')).toBe('female')
    expect(detectGenderFromName('Fatema Akter')).toBe('female')
    expect(detectGenderFromName('Sanjida Begum')).toBe('female')
    expect(detectGenderFromName('Farhana Sultana')).toBe('female')
    expect(detectGenderFromName('Mst. Ayesha Khatun')).toBe('female')
    expect(detectGenderFromName('Sadia Afrin')).toBe('female')
    expect(detectGenderFromName('মোসাম্মৎ আয়েশা আক্তার')).toBe('female')
    expect(detectGenderFromName('সানজিদা খাতুন')).toBe('female')
    expect(detectGenderFromName('ফারহানা সুলতানা')).toBe('female')
  })

  it('returns unknown for ambiguous or missing names', () => {
    expect(detectGenderFromName('')).toBe('unknown')
    expect(detectGenderFromName('Alex')).toBe('unknown')
    expect(detectGenderFromName('UK Customer')).toBe('unknown')
  })
})

describe('gender-detector conversation history scanning', () => {
  it('detects male gender when previous assistant messages addressed customer as Bhaiya', () => {
    const history = `Customer: hi
Salesman: Hello Bhaiya! Welcome to UK BRAND LOVER.
Customer: yes
Salesman: তাহলে ভাইয়া, আপনি কোন ব্র্যান্ড বা স্কিনকেয়ার প্রোডাক্টটি খুঁজছেন?`
    expect(detectGenderFromHistory(history)).toBe('male')
  })

  it('detects female gender when previous assistant messages addressed customer as Apu', () => {
    const history = `Customer: hi
Salesman: Hello Apu! Welcome to our store.
Customer: cream lagbe
Salesman: আপনার স্কিনের ধরন কেমন, আপু?`
    expect(detectGenderFromHistory(history)).toBe('female')
  })

  it('detects male when customer states "ami chele"', () => {
    const history = 'Customer: ami ekta chele, amar jonno cream lagbe'
    expect(detectGenderFromHistory(history)).toBe('male')
  })

  it('detects female when customer states "ami meye"', () => {
    const history = 'Customer: ami meye, amar dry skin'
    expect(detectGenderFromHistory(history)).toBe('female')
  })
})

describe('gender-detector resolveCustomerAddressing', () => {
  it('locks to male when customer name is male', () => {
    const result = resolveCustomerAddressing({
      rawCustomerName: 'Md. Tanvir Hasan',
      historyText: '',
      customerRelationStyle: 'bhaiya_apu',
    })
    expect(result.gender).toBe('male')
    expect(result.addressingTitle).toBe('bhaiya')
    expect(result.promptInstruction).toContain('MALE')
    expect(result.promptInstruction).toContain('Bhaiya')
  })

  it('locks to female when customer name is female', () => {
    const result = resolveCustomerAddressing({
      rawCustomerName: 'Sanjida Akter',
      historyText: '',
      customerRelationStyle: 'bhaiya_apu',
    })
    expect(result.gender).toBe('female')
    expect(result.addressingTitle).toBe('apu')
    expect(result.promptInstruction).toContain('FEMALE')
    expect(result.promptInstruction).toContain('Apu')
  })

  it('locks to prior addressing if name is missing but history has Bhaiya', () => {
    const history = 'Customer: hi\nSalesman: Hello Bhaiya! Welcome to store.'
    const result = resolveCustomerAddressing({
      rawCustomerName: 'Messenger User (1234)',
      historyText: history,
      customerRelationStyle: 'bhaiya_apu',
    })
    expect(result.gender).toBe('male')
    expect(result.addressingTitle).toBe('bhaiya')
  })
})

describe('gender-detector enforceGenderAddressingConsistency sanitizer', () => {
  it('replaces accidental apu with bhaiya for male customers (exact screenshot bug fix)', () => {
    const buggyReply1 = 'আপনার স্কিনের ধরন কেমন, আপু? আমাদের কাছে দারুণ ক্রিম রয়েছে।'
    const fixed1 = enforceGenderAddressingConsistency(buggyReply1, 'male')
    expect(fixed1).toBe('আপনার স্কিনের ধরন কেমন, ভাইয়া? আমাদের কাছে দারুণ ক্রিম রয়েছে।')

    const buggyReply2 = 'ড্রাই স্কিনের জন্য Simple ক্রিম দারুণ কাজ করে, আপু। নিতে চান?'
    const fixed2 = enforceGenderAddressingConsistency(buggyReply2, 'male')
    expect(fixed2).toBe('ড্রাই স্কিনের জন্য Simple ক্রিম দারুণ কাজ করে, ভাইয়া। নিতে চান?')

    const buggyBanglish = 'Apnar skin kemon, apu? Nivea nite paren, Apu.'
    const fixedBanglish = enforceGenderAddressingConsistency(buggyBanglish, 'male')
    expect(fixedBanglish).toBe('Apnar skin kemon, bhaiya? Nivea nite paren, Bhaiya.')
  })

  it('replaces accidental bhaiya with apu for female customers', () => {
    const buggyReply1 = 'আপনার স্কিনের ধরন কেমন, ভাইয়া? আমাদের ক্রিম রয়েছে।'
    const fixed1 = enforceGenderAddressingConsistency(buggyReply1, 'female')
    expect(fixed1).toBe('আপনার স্কিনের ধরন কেমন, আপু? আমাদের ক্রিম রয়েছে।')

    const buggyBanglish = 'Ji Bhaiya, apnar order confirm hoyeche.'
    const fixedBanglish = enforceGenderAddressingConsistency(buggyBanglish, 'female')
    expect(fixedBanglish).toBe('Ji Apu, apnar order confirm hoyeche.')
  })
})

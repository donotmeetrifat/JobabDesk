import { describe, it, expect } from 'vitest'
import { normalizeBanglishSpelling } from './banglish-spelling'

describe('Banglish spelling normalizer', () => {
  it('corrects misspelled pronouns while preserving case', () => {
    expect(normalizeBanglishSpelling('Aponar phone number ta din')).toBe('Apnar phone number ta din')
    expect(normalizeBanglishSpelling('aponake dhonnobad')).toBe('apnake dhonnobad')
    expect(normalizeBanglishSpelling('amk details bolun')).toBe('amake details bolun')
    expect(normalizeBanglishSpelling('apnr address ki?')).toBe('apnar address ki?')
    expect(normalizeBanglishSpelling('APONAR')).toBe('APNAR')
  })

  it('corrects question words and common vocabulary typos', () => {
    expect(normalizeBanglishSpelling('Kibhabe order korbo?')).toBe('Kivabe order korbo?')
    expect(normalizeBanglishSpelling('ki vabe pabo?')).toBe('kivabe pabo?')
    expect(normalizeBanglishSpelling('thikna o phone number pathan')).toBe('thikana o phone number pathan')
    expect(normalizeBanglishSpelling('thikanna confirm korun')).toBe('thikana confirm korun')
    expect(normalizeBanglishSpelling('tikana janaben')).toBe('thikana janaben')
  })

  it('corrects thanks (dhonnobad) misspellings and Hindi borrowings', () => {
    expect(normalizeBanglishSpelling('Dhanyawad bhaiya!')).toBe('Dhonnobad bhaiya!')
    expect(normalizeBanglishSpelling('dhanyabad apu')).toBe('dhonnobad apu')
    expect(normalizeBanglishSpelling('shukriya apnar jonno')).toBe('dhonnobad apnar jonno')
    expect(normalizeBanglishSpelling('donnobad apnake')).toBe('dhonnobad apnake')
    expect(normalizeBanglishSpelling('dhonnobaad')).toBe('dhonnobad')
  })

  it('corrects expired offer phrasing (meyad iti moddhe) and future phrasing', () => {
    expect(normalizeBanglishSpelling('Offer tir meyadh itomoddhe sesh hoye geche')).toBe('Offer tir meyad iti moddhe sesh hoye geche')
    expect(normalizeBanglishSpelling('Bhabisshote amader janaben')).toBe('Bhobisshote amader janaben')
    expect(normalizeBanglishSpelling('shompurno Free deya hocche')).toBe('shompurno Free deya hocche')
    expect(normalizeBanglishSpelling('sompurno free')).toBe('shompurno free')
  })

  it('corrects verb conjugations for 1st person vs 2nd person', () => {
    expect(normalizeBanglishSpelling('Ami ekhoni shob janacche!')).toBe('Ami ekhoni shob janacchi!')
    expect(normalizeBanglishSpelling('ami apnake details janacche')).toBe('ami apnake details janacchi')
    expect(normalizeBanglishSpelling('amra apnake janacche')).toBe('amra apnake janacchi')
    expect(normalizeBanglishSpelling('apni kindly janacche')).toBe('apni kindly janaben')
  })

  it('cleans up accidental Hindi/Urdu words', () => {
    expect(normalizeBanglishSpelling('kripya apka pata bataye')).toBe('kindly apnar thikana janaben')
    expect(normalizeBanglishSpelling('aap kitna piece nite chan?')).toBe('apni koto piece nite chan?')
    expect(normalizeBanglishSpelling('kripaya amader bolun')).toBe('kindly amader bolun')
    expect(normalizeBanglishSpelling('madad lagbe ki?')).toBe('shahajjo lagbe ki?')
  })

  it('fixes punctuation spacing and cleans whitespace', () => {
    expect(normalizeBanglishSpelling('Product er dam koto ?')).toBe('Product er dam koto?')
    expect(normalizeBanglishSpelling('Bhaiya , stock e ache')).toBe('Bhaiya, stock e ache')
    expect(normalizeBanglishSpelling('Dhonnobad!Apnar order peyechi')).toBe('Dhonnobad! Apnar order peyechi')
  })

  it('preserves official Bengali order invoice summary block without corrupting Bangla script', () => {
    const raw = `Dhonnobad, Tanvir Bhaiya! Apnar order ti peyechi.

📦 অর্ডার বিবরণী:
• পণ্য: Simple Cream
• পরিমাণ: 1 টি
• ডেলিভারি চার্জ: ৳80 (ঢাকার ভিতরে)
• সর্বমোট প্রদেয়: ৳730`

    const normalized = normalizeBanglishSpelling(raw)
    expect(normalized).toContain('Dhonnobad, Tanvir Bhaiya!')
    expect(normalized).toContain('📦 অর্ডার বিবরণী:')
    expect(normalized).toContain('• পণ্য: Simple Cream')
    expect(normalized).toContain('• ডেলিভারি চার্জ: ৳80 (ঢাকার ভিতরে)')
  })
})

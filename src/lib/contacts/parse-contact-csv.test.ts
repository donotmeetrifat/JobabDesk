import { describe, expect, it } from 'vitest';
import { parseContactCsv, parseTagCell } from './parse-contact-csv';

describe('parseTagCell', () => {
  it('splits comma-separated tags and trims whitespace', () => {
    expect(parseTagCell(' VIP , Lead ,  ')).toEqual(['VIP', 'Lead']);
  });

  it('splits semicolon-separated tags', () => {
    expect(parseTagCell('VIP; Lead; Customer')).toEqual([
      'VIP',
      'Lead',
      'Customer',
    ]);
  });

  it('de-dupes case-insensitively', () => {
    expect(parseTagCell('vip, VIP, Lead')).toEqual(['vip', 'Lead']);
  });

  it('returns empty for blank values', () => {
    expect(parseTagCell('')).toEqual([]);
    expect(parseTagCell(undefined)).toEqual([]);
  });
});

describe('parseContactCsv', () => {
  it('parses optional tags column', () => {
    const csv = `phone,name,tags
+15551234567,Alice,"VIP, Lead"
+15559876543,Bob,Customer`;

    expect(parseContactCsv(csv)).toEqual({
      hasPhoneColumn: true,
      hasProfileUrlColumn: false,
      hasTagsColumn: true,
      hasCompanyColumn: false,
      hasAddressColumn: false,
      rows: [
        {
          phone: '+15551234567',
          profile_url: undefined,
          messenger_id: undefined,
          name: 'Alice',
          email: undefined,
          company: undefined,
          address: undefined,
          tagNames: ['VIP', 'Lead'],
        },
        {
          phone: '+15559876543',
          profile_url: undefined,
          messenger_id: undefined,
          name: 'Bob',
          email: undefined,
          company: undefined,
          address: undefined,
          tagNames: ['Customer'],
        },
      ],
    });
  });

  it('parses profile_url column for Messenger marketing', () => {
    const csv = `profile_url,name,tags
https://www.facebook.com/profile.php?id=100084729182371,Karim,"VIP, Messenger"
https://m.me/100099887766554,Rahim,Lead`;

    const res = parseContactCsv(csv);
    expect(res.hasProfileUrlColumn).toBe(true);
    expect(res.hasPhoneColumn).toBe(false);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].profile_url).toBe('https://www.facebook.com/profile.php?id=100084729182371');
    expect(res.rows[0].messenger_id).toBe('100084729182371');
    expect(res.rows[0].name).toBe('Karim');
    expect(res.rows[1].messenger_id).toBe('100099887766554');
  });

  it('parses both phone and profile_url in omnichannel CSV', () => {
    const csv = `phone,profile_url,name
+8801700000000,https://facebook.com/john.doe,John Doe`;

    const res = parseContactCsv(csv);
    expect(res.hasPhoneColumn).toBe(true);
    expect(res.hasProfileUrlColumn).toBe(true);
    expect(res.rows[0].phone).toBe('+8801700000000');
    expect(res.rows[0].profile_url).toBe('https://facebook.com/john.doe');
    expect(res.rows[0].name).toBe('John Doe');
  });

  it('keeps a row with an empty phone cell if other fields exist', () => {
    const csv = `phone,name
+15551234567,Alice
,Bob`;

    const { rows } = parseContactCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      phone: '',
      profile_url: undefined,
      messenger_id: undefined,
      name: 'Bob',
      email: undefined,
      company: undefined,
      address: undefined,
      tagNames: [],
    });
  });

  it('returns empty tagNames when tags column is absent', () => {
    const csv = `phone,name
+15551234567,Alice`;

    expect(parseContactCsv(csv)).toEqual({
      hasPhoneColumn: true,
      hasProfileUrlColumn: false,
      hasTagsColumn: false,
      hasCompanyColumn: false,
      hasAddressColumn: false,
      rows: [
        {
          phone: '+15551234567',
          profile_url: undefined,
          messenger_id: undefined,
          name: 'Alice',
          email: undefined,
          company: undefined,
          address: undefined,
          tagNames: [],
        },
      ],
    });
  });
});

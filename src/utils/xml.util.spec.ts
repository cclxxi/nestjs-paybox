import { parseXmlValue, redactXml } from './xml.util'

describe('parseXmlValue', () => {
  it('extracts simple tag content', () => {
    expect(parseXmlValue('<pg_status>ok</pg_status>', 'pg_status')).toBe('ok')
  })

  it('returns undefined when tag is missing', () => {
    expect(parseXmlValue('<other>x</other>', 'pg_status')).toBeUndefined()
  })

  it('returns undefined for empty tag', () => {
    expect(
      parseXmlValue('<pg_status></pg_status>', 'pg_status'),
    ).toBeUndefined()
  })

  it('decodes HTML entities', () => {
    expect(
      parseXmlValue(
        '<pg_x>a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;</pg_x>',
        'pg_x',
      ),
    ).toBe('a & b <c> "d" \'e\'')
  })

  it('reads first occurrence when tag repeats', () => {
    expect(parseXmlValue('<x>a</x><x>b</x>', 'x')).toBe('a')
  })

  it('handles tags inside multi-line XML', () => {
    const xml = `<?xml version="1.0"?>
      <response>
        <pg_status>ok</pg_status>
        <pg_payment_id>p-42</pg_payment_id>
      </response>`
    expect(parseXmlValue(xml, 'pg_status')).toBe('ok')
    expect(parseXmlValue(xml, 'pg_payment_id')).toBe('p-42')
  })
})

describe('redactXml', () => {
  it('masks card pan and customer PII while leaving other tags intact', () => {
    const xml =
      '<pg_status>ok</pg_status><pg_card_pan>4400********1234</pg_card_pan>' +
      '<pg_user_phone>77001234567</pg_user_phone>' +
      '<pg_user_contact_email>a@b.com</pg_user_contact_email>'
    const out = redactXml(xml)

    expect(out).toContain('<pg_status>ok</pg_status>')
    expect(out).toContain('<pg_card_pan>***</pg_card_pan>')
    expect(out).toContain('<pg_user_phone>***</pg_user_phone>')
    expect(out).toContain('<pg_user_contact_email>***</pg_user_contact_email>')
    expect(out).not.toContain('4400')
    expect(out).not.toContain('77001234567')
    expect(out).not.toContain('a@b.com')
  })

  it('returns input unchanged when no sensitive tags are present', () => {
    const xml = '<pg_status>ok</pg_status><pg_payment_id>p1</pg_payment_id>'
    expect(redactXml(xml)).toBe(xml)
  })
})

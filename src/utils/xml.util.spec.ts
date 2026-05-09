import { parseXmlValue } from './xml.util'

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

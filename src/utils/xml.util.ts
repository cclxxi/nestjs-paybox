/**
 * Extracts the text content of the first occurrence of `<tag>...</tag>`.
 *
 * This is a deliberately small regex reader for the flat, single-level XML the
 * Paybox API returns. It does NOT handle CDATA sections, tag attributes,
 * namespaces, or repeated tags (only the first match is returned). If the
 * provider ever returns nested or attributed XML, replace this with a real
 * XML parser.
 */
export function parseXmlValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
  if (match?.[1] == null || match[1] === '') return undefined
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/**
 * Tags whose contents must never reach logs (card data and customer PII).
 */
const SENSITIVE_TAGS = [
  'pg_card_pan',
  'pg_card_hash',
  'pg_user_phone',
  'pg_user_contact_email',
] as const

/**
 * Masks the contents of sensitive tags before an XML payload is logged, so
 * raw provider responses can be logged for debugging without leaking PAN/PII.
 */
export function redactXml(xml: string): string {
  return SENSITIVE_TAGS.reduce(
    (acc, tag) =>
      acc.replace(new RegExp(`(<${tag}>)([^<]*)(</${tag}>)`, 'g'), '$1***$3'),
    xml,
  )
}

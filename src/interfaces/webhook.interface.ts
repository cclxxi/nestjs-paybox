/**
 * Webhook payload from Paybox. Bodies arrive as `application/x-www-form-urlencoded`,
 * so every field is a string — including numeric and boolean-like fields.
 */
export interface PayboxWebhookPayload {
  pg_order_id: string
  pg_payment_id: string
  /** '1' = success, '0' = failure */
  pg_result: string
  pg_amount: string
  pg_payment_date: string
  pg_card_pan?: string
  pg_salt: string
  pg_sig: string
  pg_failure_code?: string
  pg_failure_description?: string
  [key: string]: string | undefined
}

/**
 * Payload of the `check_url` webhook. Same encoding caveat — all values are strings.
 */
export interface PayboxCheckWebhookPayload {
  pg_order_id: string
  pg_payment_id: string
  pg_amount: string
  pg_currency?: string
  pg_salt: string
  pg_sig: string
  [key: string]: string | undefined
}

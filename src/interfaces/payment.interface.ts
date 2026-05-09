export interface InitPaymentParams {
  orderId: string
  amount: number
  currency: string
  description: string
  userPhone?: string
  userEmail?: string
  userIp?: string
  userId?: string
}

export interface InitPaymentResult {
  providerPaymentId: string
  redirectUrl: string
}

export enum ProviderPaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export interface PaymentStatusResult {
  providerPaymentId: string
  status: ProviderPaymentStatus
  amount?: number
  currency?: string
  capturedAt?: string
  failureCode?: string
  failureDescription?: string
  canReject?: boolean
  refundAmount?: number
  paymentMethod?: string
  cardPan?: string
}

export interface RefundResult {
  ok: boolean
  errorCode?: string
  errorDescription?: string
}

export interface CancelResult {
  ok: boolean
  errorCode?: string
  errorDescription?: string
}

export interface CaptureResult {
  ok: boolean
  amount?: number
  clearingAmount?: number
  errorDescription?: string
}

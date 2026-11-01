/** Only Stripe sandbox keys. The caller must still verify the exact account and paid TEST order. */
export function isStripeSandboxTestKey(value: string | undefined): value is string {
  return Boolean(value && (value.startsWith("sk_test_") || value.startsWith("rk_test_")))
}

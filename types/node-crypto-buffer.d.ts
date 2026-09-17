import "node:crypto"

declare module "node:crypto" {
  export function timingSafeEqual(a: Buffer, b: Buffer): boolean
}

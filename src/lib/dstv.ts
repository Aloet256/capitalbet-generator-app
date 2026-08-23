import type { DstvPackage, DstvPackagePrices } from '../types/database'

export const DSTV_PACKAGES: DstvPackage[] = ['Access', 'Family', 'Compact', 'Compact Plus', 'Premium']

export const DEFAULT_DSTV_PACKAGE_PRICES: DstvPackagePrices = {
  Access: 49000,
  Family: 76000,
  Compact: 120000,
  'Compact Plus': 185000,
  Premium: 320000,
}

export function coerceDstvPackagePrices(value: unknown): DstvPackagePrices {
  const prices = { ...DEFAULT_DSTV_PACKAGE_PRICES }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return prices

  const raw = value as Record<string, unknown>
  for (const pkg of DSTV_PACKAGES) {
    const amount = Number(raw[pkg])
    if (Number.isFinite(amount) && amount >= 0) prices[pkg] = amount
  }
  return prices
}

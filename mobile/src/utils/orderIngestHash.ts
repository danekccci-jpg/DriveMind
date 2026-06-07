/** Stable content hash for ingest deduplication (price + platform + route text). */
export function buildIngestOrderHash(params: {
  platform: string
  price: string
  pickup?: string
  destination?: string
  text?: string
}): string {
  const priceNorm = (params.price ?? '').replace(/\s+/g, '').toLowerCase()
  const desc = [params.pickup, params.destination, params.text]
    .filter(Boolean)
    .join('|')
    .trim()
    .toLowerCase()
  return `${params.platform}|${priceNorm}|${desc.slice(0, 160)}`
}

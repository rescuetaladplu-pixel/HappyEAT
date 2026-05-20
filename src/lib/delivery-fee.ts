// Pure tiered delivery-fee calculator.
// Tiers (driving distance in km):
//   0-4 km   : flat 35฿
//   >4-7 km  : +6฿/km (fractional)
//   >7-10 km : +7฿/km
//   >10+ km  : +8฿/km
// Final amount is Math.ceil()'d to a whole baht.
export function calcDeliveryFee(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 35;
  const km = distanceKm;
  let fee = 35;
  if (km > 4) fee += Math.min(km - 4, 3) * 6;
  if (km > 7) fee += Math.min(km - 7, 3) * 7;
  if (km > 10) fee += (km - 10) * 8;
  return Math.ceil(fee);
}

// Haversine fallback distance in km (great-circle).
// We bump by 1.3x to roughly approximate road distance when OSRM is unreachable.
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function haversineRoadFallbackKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 1.3;
}

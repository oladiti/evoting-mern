function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Haversine distance in meters
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function isWithinGeofence(lat, lng, centerLat, centerLng, radius) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return false;
  return distanceMeters(lat, lng, centerLat, centerLng) <= radius;
}

const COORDINATE_SYSTEMS = Object.freeze({
  GCJ02: "GCJ02",
  WGS84: "WGS84",
});

function isValidCoordinate(longitude, latitude) {
  const lng = Number(longitude);
  const lat = Number(latitude);
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function getDistanceMeters(from, to) {
  const rad = Math.PI / 180;
  const earthRadius = 6371000;
  const lat1 = Number(from.latitude) * rad;
  const lat2 = Number(to.latitude) * rad;
  const deltaLat = (Number(to.latitude) - Number(from.latitude)) * rad;
  const deltaLng = (Number(to.longitude) - Number(from.longitude)) * rad;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pickName(values, fallback) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function normalizeGeoapifyFeature(feature, options) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates || [];
  const longitude = Number(properties.lon ?? coordinates[0]);
  const latitude = Number(properties.lat ?? coordinates[1]);
  if (!isValidCoordinate(longitude, latitude)) return null;
  const type = options.type;
  const sourceId = String(properties.place_id || properties.datasource?.raw?.osm_id || `${longitude},${latitude}`);
  return {
    id: `geoapify:${sourceId}`,
    sourceId,
    source: "geoapify",
    providerUsed: "geoapify",
    type,
    name: pickName(
      [properties.name, properties.address_line1, properties.formatted],
      type === "subway" ? "地铁站" : type === "toilet" ? "公共厕所" : "地点",
    ),
    nameLocal: properties.name || "",
    nameEnglish: properties.name_international?.en || "",
    address: properties.formatted || [properties.address_line1, properties.address_line2].filter(Boolean).join(", "),
    longitude,
    latitude,
    coordinateSystem: COORDINATE_SYSTEMS.WGS84,
    countryCode: String(properties.country_code || options.countryCode || "").toLowerCase(),
    city: properties.city || properties.county || properties.state || "",
    cityId: properties.place_id || "",
    toilet: type === "subway" ? 2 : undefined,
    toiletStatus: type === "subway" ? 2 : undefined,
    retrievedAt: options.retrievedAt,
  };
}

function normalizeName(value) {
  return String(value || "")
    .toLocaleLowerCase()
    .replace(/[\s\-_'’.,()（）]/g, "")
    .replace(/(metro|subway|station|地铁站|车站|站)$/iu, "");
}

function sortAndLimitPlaces(places, center, options = {}) {
  const radius = Number(options.radius || Infinity);
  const limit = Number(options.limit || places.length);
  const normalized = places
    .filter(Boolean)
    .map((place) => ({ ...place, distanceMeters: Math.round(getDistanceMeters(center, place)) }))
    .filter((place) => place.distanceMeters <= radius)
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
  return {
    rawCount: normalized.length,
    truncated: normalized.length > limit,
    places: normalized.slice(0, limit),
  };
}

function dedupeSubwayStations(stations) {
  const result = [];
  for (const station of stations) {
    const normalizedName = normalizeName(station.name);
    const duplicate = result.find((candidate) => {
      if (normalizedName && normalizeName(candidate.name) !== normalizedName) return false;
      return getDistanceMeters(candidate, station) <= 180;
    });
    if (!duplicate) result.push(station);
  }
  return result;
}

function getMapDisplayCoordinate(place) {
  if (!isValidCoordinate(place?.longitude, place?.latitude)) throw new Error("地点坐标无效");
  if (![COORDINATE_SYSTEMS.GCJ02, COORDINATE_SYSTEMS.WGS84].includes(place.coordinateSystem)) {
    throw new Error("地点坐标系未声明");
  }
  return { longitude: Number(place.longitude), latitude: Number(place.latitude) };
}

function getNavigationCoordinate(place) {
  return getMapDisplayCoordinate(place);
}

module.exports = {
  COORDINATE_SYSTEMS,
  dedupeSubwayStations,
  getDistanceMeters,
  getMapDisplayCoordinate,
  getNavigationCoordinate,
  isValidCoordinate,
  normalizeGeoapifyFeature,
  normalizeName,
  sortAndLimitPlaces,
};

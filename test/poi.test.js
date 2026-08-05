const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COORDINATE_SYSTEMS,
  dedupeSubwayStations,
  getNavigationCoordinate,
  normalizeGeoapifyFeature,
  sortAndLimitPlaces,
} = require("../lib/poi");

test("normalizes overseas places as WGS84 without coordinate conversion", () => {
  const retrievedAt = "2026-08-05T00:00:00.000Z";
  const geoapify = normalizeGeoapifyFeature(
    { properties: { place_id: "x", name: "Tokyo", country_code: "jp" }, geometry: { coordinates: [139.7, 35.6] } },
    { type: "place", countryCode: "jp", retrievedAt },
  );
  assert.equal(geoapify.coordinateSystem, COORDINATE_SYSTEMS.WGS84);
  assert.deepEqual(getNavigationCoordinate(geoapify), { longitude: 139.7, latitude: 35.6 });
});

test("sorts, filters and limits by calculated distance", () => {
  const center = { longitude: 0, latitude: 0 };
  const result = sortAndLimitPlaces(
    [
      { id: "far", longitude: 0.02, latitude: 0 },
      { id: "near", longitude: 0.001, latitude: 0 },
      { id: "middle", longitude: 0.005, latitude: 0 },
    ],
    center,
    { radius: 3000, limit: 2 },
  );
  assert.deepEqual(result.places.map((item) => item.id), ["near", "middle"]);
  assert.equal(result.truncated, true);
});

test("deduplicates same-name subway objects only when geographically close", () => {
  const stations = dedupeSubwayStations([
    { name: "Central Station", longitude: 0, latitude: 0 },
    { name: "Central", longitude: 0.0003, latitude: 0 },
    { name: "Central", longitude: 0.02, latitude: 0 },
  ]);
  assert.equal(stations.length, 2);
});

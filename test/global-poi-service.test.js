const test = require("node:test");
const assert = require("node:assert/strict");
const { createGlobalPoiService } = require("../lib/global-poi-service");

const cities = [
  {
    id: "test-city",
    countryCode: "gb",
    nameZh: "测试城",
    nameLocal: "Test City",
    center: { longitude: 0, latitude: 0 },
    defaultScale: 10,
    bounds: { west: -1, south: -1, east: 1, north: 1 },
  },
];

test("overseas place search filters out candidates outside configured city", async () => {
  let searchParams;
  const service = createGlobalPoiService({
    cities,
    geoapify: {
      search: async (params) => {
        searchParams = params;
        return [
          { place_id: "inside", name: "Inside", country_code: "gb", lon: 0.5, lat: 0.5 },
          { place_id: "outside", name: "Outside", country_code: "gb", lon: 2, lat: 2 },
        ];
      },
    },
  });
  const result = await service.searchPlaces({ cityId: "test-city", keywords: "x", limit: 10 });
  assert.deepEqual(result.places.map((place) => place.sourceId), ["inside"]);
  assert.equal(result.coordinateSystem, "WGS84");
  assert.equal(searchParams.text, "x, Test City");
  assert.equal(searchParams.timeoutMs, 6000);
  assert.equal(result.cacheHit, false);
});

test("overseas place search reuses a short-lived city and keyword cache", async () => {
  let calls = 0;
  const service = createGlobalPoiService({
    cities,
    placeSearchCacheTtlMs: 60000,
    geoapify: {
      search: async () => {
        calls += 1;
        return [{ place_id: "inside", name: "Inside", country_code: "gb", lon: 0.5, lat: 0.5 }];
      },
    },
  });
  const first = await service.searchPlaces({ cityId: "test-city", keywords: "University", limit: 10 });
  const second = await service.searchPlaces({ cityId: "test-city", keywords: " university ", limit: 10 });
  assert.equal(calls, 1);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.deepEqual(second.places, first.places);
});

test("global reverse rejects an empty country instead of misclassifying it as overseas", async () => {
  const service = createGlobalPoiService({
    cities,
    geoapify: { reverse: async () => null },
  });
  await assert.rejects(
    () => service.reverse({ longitude: 0, latitude: 0 }),
    (error) => error.code === "PROVIDER_INVALID_RESPONSE" && error.provider === "geoapify",
  );
});

test("toilet query uses Geoapify directly without fallback delay", async () => {
  const service = createGlobalPoiService({
    cities,
    geoapify: {
      places: async () => [
        {
          properties: { place_id: "fallback", name: "Toilet", country_code: "gb" },
          geometry: { coordinates: [0.001, 0] },
        },
      ],
    },
  });
  const result = await service.queryToilets({
    center: { longitude: 0, latitude: 0 },
    radius: 500,
    countryCode: "gb",
  });
  assert.equal(result.providerUsed, "geoapify");
  assert.equal(result.isFallback, false);
  assert.equal(result.messageCode, "");
  assert.equal(result.places.length, 1);
});

test("toilet query keeps overseas coordinates as WGS84", async () => {
  const service = createGlobalPoiService({
    cities,
    geoapify: {
      places: async () => [
        {
          properties: { place_id: "direct", name: "Direct toilet", country_code: "gb" },
          geometry: { coordinates: [0.001, 0] },
        },
      ],
    },
  });
  const result = await service.queryToilets({
    center: { longitude: 0, latitude: 0 },
    radius: 500,
    countryCode: "gb",
  });
  assert.equal(result.providerUsed, "geoapify");
  assert.equal(result.isFallback, false);
  assert.equal(result.places[0].coordinateSystem, "WGS84");
});

test("subway query deduplicates and returns the closest ten or fewer", async () => {
  const features = Array.from({ length: 12 }, (_, index) => ({
    properties: { place_id: `station-${index}`, name: `Station ${index}`, country_code: "gb" },
    geometry: { coordinates: [index * 0.001, 0] },
  }));
  const service = createGlobalPoiService({
    cities,
    geoapify: { places: async () => features },
  });
  const result = await service.querySubway({
    center: { longitude: 0, latitude: 0 },
    radius: 20000,
    limit: 10,
    countryCode: "gb",
  });
  assert.equal(result.places.length, 10);
  assert.equal(result.truncated, true);
  assert.ok(result.places[0].distanceMeters <= result.places[9].distanceMeters);
});

test("direct Geoapify toilet results enforce the documented cap", async () => {
  const features = Array.from({ length: 105 }, (_, index) => ({
    properties: { place_id: `toilet-${index}`, name: `Toilet ${index}`, country_code: "gb" },
    geometry: { coordinates: [index * 0.00001, 0] },
  }));
  const service = createGlobalPoiService({
    cities,
    geoapify: { places: async () => features },
  });
  const result = await service.queryToilets({
    center: { longitude: 0, latitude: 0 },
    radius: 3000,
    countryCode: "gb",
  });
  assert.equal(result.places.length, 100);
  assert.equal(result.truncated, true);
  assert.equal(result.providerUsed, "geoapify");
});

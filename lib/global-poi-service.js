const fs = require("node:fs");
const path = require("node:path");
const { createGeoapifyClient } = require("./providers/geoapify");
const {
  COORDINATE_SYSTEMS,
  dedupeSubwayStations,
  normalizeGeoapifyFeature,
  sortAndLimitPlaces,
} = require("./poi");
const { ProviderError } = require("./provider-error");

function createGlobalPoiService(options = {}) {
  const cityFile = options.cityFile || path.join(__dirname, "..", "data", "global", "cities.json");
  const cities = options.cities || JSON.parse(fs.readFileSync(cityFile, "utf8"));
  const geoapify =
    options.geoapify ||
    createGeoapifyClient({
      apiKey: options.geoapifyApiKey,
      baseUrl: options.geoapifyBaseUrl,
      timeoutMs: options.providerTimeoutMs,
    });
  function getCities() {
    return cities.map((city) => ({
      id: city.id,
      countryCode: city.countryCode,
      nameZh: city.nameZh,
      nameLocal: city.nameLocal,
      center: city.center,
      defaultScale: city.defaultScale,
    }));
  }

  function getCity(cityId) {
    const city = cities.find((item) => item.id === cityId);
    if (!city) {
      throw new ProviderError("不支持的海外城市配置", {
        code: "INVALID_CITY",
        provider: "local",
        statusCode: 400,
      });
    }
    return city;
  }

  async function reverse(center) {
    const startedAt = Date.now();
    const result = await geoapify.reverse(center, { lang: "zh" });
    const countryCode = String(result?.country_code || "").toLowerCase();
    if (!result || !countryCode) {
      throw new ProviderError("未能识别当前位置，请手动选择城市或地点", {
        code: "PROVIDER_INVALID_RESPONSE",
        provider: "geoapify",
        statusCode: 502,
        retryable: true,
      });
    }
    return {
      province: result?.state || "",
      city: result?.city || result?.county || result?.state || result?.country || "",
      district: result?.district || result?.suburb || "",
      country: result?.country || "",
      countryCode,
      cityId: result?.place_id || "",
      regionMode: countryCode === "cn" ? "mainland" : "overseas",
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      providerUsed: "geoapify",
      retrievedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    };
  }

  async function searchPlaces(params) {
    const city = getCity(params.cityId);
    const startedAt = Date.now();
    const filter = [
      `rect:${city.bounds.west},${city.bounds.south},${city.bounds.east},${city.bounds.north}`,
      `countrycode:${city.countryCode}`,
    ].join("|");
    const results = await geoapify.search({
      text: params.keywords,
      filter,
      bias: `proximity:${city.center.longitude},${city.center.latitude}`,
      limit: params.limit,
      lang: "zh",
    });
    const retrievedAt = new Date().toISOString();
    const places = results
      .filter((result) => isInsideCity(result, city))
      .map((result) =>
        normalizeGeoapifyFeature(
          {
            properties: result,
            geometry: { coordinates: [result.lon, result.lat] },
          },
          { type: "place", countryCode: city.countryCode, retrievedAt },
        ),
      )
      .filter(Boolean);
    return responseMeta({
      places,
      providerUsed: "geoapify",
      rawCount: results.length,
      startedAt,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
    });
  }

  async function queryToilets(params) {
    return queryGeoapify({
      type: "toilet",
      center: params.center,
      radius: params.radius,
      countryCode: params.countryCode,
      limit: 100,
      geoapifyCategory: "amenity.toilet",
    });
  }

  async function querySubway(params) {
    return queryGeoapify({
      type: "subway",
      center: params.center,
      radius: params.radius,
      countryCode: params.countryCode,
      limit: params.limit,
      geoapifyCategory: "public_transport.subway",
      dedupe: dedupeSubwayStations,
    });
  }

  async function queryGeoapify(options) {
    const startedAt = Date.now();
    const retrievedAt = new Date().toISOString();
    const features = await geoapify.places({
      category: options.geoapifyCategory,
      center: options.center,
      radius: options.radius,
      limit: options.limit,
    });
    let places = features
      .map((feature) =>
        normalizeGeoapifyFeature(feature, {
          type: options.type,
          countryCode: options.countryCode,
          retrievedAt,
        }),
      )
      .filter(Boolean);
    if (options.dedupe) places = options.dedupe(places);
    const result = sortAndLimitPlaces(places, options.center, {
      radius: options.radius,
      limit: options.limit,
    });
    return responseMeta({
      places: result.places,
      providerUsed: "geoapify",
      rawCount: result.rawCount,
      truncated: result.truncated,
      startedAt,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
    });
  }

  return {
    getCities,
    getCity,
    querySubway,
    queryToilets,
    reverse,
    searchPlaces,
  };
}

function isInsideCity(result, city) {
  const longitude = Number(result?.lon);
  const latitude = Number(result?.lat);
  return (
    String(result?.country_code || "").toLowerCase() === city.countryCode &&
    longitude >= city.bounds.west &&
    longitude <= city.bounds.east &&
    latitude >= city.bounds.south &&
    latitude <= city.bounds.north
  );
}

function responseMeta(options) {
  return {
    places: options.places,
    providerUsed: options.providerUsed,
    isFallback: Boolean(options.isFallback),
    truncated: Boolean(options.truncated),
    rawCount: Number(options.rawCount || 0),
    displayCount: options.places.length,
    messageCode: options.messageCode || "",
    message: options.message || "",
    coordinateSystem: options.coordinateSystem,
    retrievedAt: new Date().toISOString(),
    durationMs: Date.now() - options.startedAt,
    diagnostic: options.diagnostic,
  };
}

module.exports = {
  createGlobalPoiService,
  isInsideCity,
};

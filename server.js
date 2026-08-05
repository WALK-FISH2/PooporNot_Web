const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { createGlobalPoiService } = require("./lib/global-poi-service");
const { COORDINATE_SYSTEMS } = require("./lib/poi");
const { safeProviderError } = require("./lib/provider-error");

const rootDir = __dirname;
const metroDataDir = path.join(rootDir, "data", "metro");
const metroCityIndexPath = path.join(metroDataDir, "city_index.json");
loadEnv(path.join(rootDir, ".env"));

const PORT = Number(process.env.PORT || 5174);
const AMAP_JS_KEY = process.env.AMAP_JS_KEY || "";
const AMAP_SECURITY_JS_CODE = process.env.AMAP_SECURITY_JS_CODE || "";
const AMAP_WEB_SERVICE_KEY = process.env.AMAP_WEB_SERVICE_KEY || process.env.AMAP_KEY || "";
const AMAP_PAGE_DELAY_MS = Number(process.env.AMAP_PAGE_DELAY_MS || 260);
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || "";
const GEOAPIFY_BASE_URL = process.env.GEOAPIFY_BASE_URL || "https://api.geoapify.com";
const GEOAPIFY_TIMEOUT_MS = Number(process.env.GEOAPIFY_TIMEOUT_MS || 4000);
const metroCityStationCache = new Map();
let metroCityIndexCache = null;
let localMetroStatusCache = null;
const globalPoiService = createGlobalPoiService({
  geoapifyApiKey: GEOAPIFY_API_KEY,
  geoapifyBaseUrl: GEOAPIFY_BASE_URL,
  providerTimeoutMs: GEOAPIFY_TIMEOUT_MS,
});

const PROVINCE_SLUG_ALIASES = {
  江苏: "jiangsu",
};

const CITY_SLUG_ALIASES = {
  无锡: "wuxi",
  南京: "nanjing",
};

const MUNICIPALITIES = new Set(["北京", "上海", "天津", "重庆"]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    setCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (reqUrl.pathname === "/api/health") {
      return sendJson(res, { ok: true });
    }

    if (reqUrl.pathname === "/api/config") {
      return sendJson(res, {
        jsKey: AMAP_JS_KEY,
        securityJsCode: AMAP_SECURITY_JS_CODE,
      });
    }

    if (reqUrl.pathname === "/api/global/cities") {
      return sendJson(res, { cities: globalPoiService.getCities() });
    }

    if (reqUrl.pathname === "/api/location/reverse") {
      return await handleReverseLocation(reqUrl, res);
    }

    if (reqUrl.pathname === "/api/places") {
      return await handlePlaceSearch(reqUrl, res);
    }

    if (reqUrl.pathname === "/api/toilets") {
      return await handleToiletSearch(reqUrl, res);
    }

    if (reqUrl.pathname === "/api/navigation") {
      return await handleNavigation(reqUrl, res);
    }

    if (reqUrl.pathname === "/api/metro/nearby") {
      return await handleNearbyMetro(reqUrl, res);
    }

    return serveStatic(reqUrl.pathname, res);
  } catch (error) {
    console.error("Request failed", safeProviderError(error, [AMAP_WEB_SERVICE_KEY, GEOAPIFY_API_KEY]));
    return sendJson(res, { error: getClientErrorMessage(error) }, getErrorStatus(error));
  }
});

server.listen(PORT, () => {
  console.log(`拉了么统一后端已启动: http://localhost:${PORT}`);
});

async function handleReverseLocation(reqUrl, res) {
  const lng = reqUrl.searchParams.get("lng");
  const lat = reqUrl.searchParams.get("lat");
  if (!isLngLat(lng, lat)) {
    return sendJson(res, { error: "当前基准点坐标无效" }, 400);
  }

  if (isGlobalReverseRequest(reqUrl)) {
    const result = await globalPoiService.reverse({ longitude: Number(lng), latitude: Number(lat) });
    logQueryDiagnostic("reverse", "global", result);
    return sendJson(res, result);
  }

  requireAmapKey();

  const location = await reverseGeocode(lng, lat);
  const mainland = isMainlandAmapLocation(location);
  return sendJson(res, {
    ...location,
    countryCode: mainland ? "cn" : "",
    cityId: "",
    regionMode: mainland ? "mainland" : "overseas",
    coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
    providerUsed: "amap",
    retrievedAt: new Date().toISOString(),
  });
}

async function handlePlaceSearch(reqUrl, res) {
  const city = normalizeText(reqUrl.searchParams.get("city")).trim();
  const keywords = normalizeText(reqUrl.searchParams.get("keywords")).trim();
  const mode = normalizeText(reqUrl.searchParams.get("mode")).trim();
  const limit = clampNumber(reqUrl.searchParams.get("limit"), 1, 25, 10);

  if (getRegionMode(reqUrl) === "overseas") {
    const cityId = normalizeText(reqUrl.searchParams.get("cityId")).trim();
    const countryCode = normalizeCountryCode(reqUrl.searchParams.get("countryCode"));
    if (!cityId || !keywords) return sendJson(res, { error: "请先选择海外城市并输入地点" }, 400);
    if (!countryCode) return sendJson(res, { error: "海外城市国家代码无效" }, 400);
    const configuredCity = globalPoiService.getCity(cityId);
    if (configuredCity.countryCode !== countryCode) {
      return sendJson(res, { error: "海外城市与国家代码不匹配" }, 400);
    }
    const result = await globalPoiService.searchPlaces({ cityId, keywords, limit });
    logQueryDiagnostic("places", "overseas", result, { cityId, countryCode });
    return sendJson(res, {
      city: cityId,
      keywords,
      places: result.places,
      ...withoutPlaces(result),
    });
  }

  requireAmapKey();

  if (!city && !keywords) {
    return sendJson(res, { error: "请先输入城市或地点" }, 400);
  }

  if (mode === "city") {
    const cityPlace = await geocodeAddress(city || keywords);
    return sendJson(res, {
      city: city || keywords,
      places: cityPlace ? [cityPlace] : [],
      providerUsed: "amap",
      coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
    });
  }

  const searchKeyword = keywords || city;
  const data = await fetchAmap("/v3/place/text", {
    keywords: searchKeyword,
    city,
    citylimit: city ? "true" : "",
    offset: String(limit),
    page: "1",
    extensions: "base",
  });

  let places = Array.isArray(data.pois) ? data.pois.map(normalizePoi).filter(Boolean) : [];

  if (!places.length) {
    const geocoded = await geocodeAddress(searchKeyword, city);
    places = geocoded ? [geocoded] : [];
  }

  return sendJson(res, {
    city,
    keywords: searchKeyword,
    places,
    providerUsed: "amap",
    coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
    isFallback: false,
    rawCount: places.length,
    displayCount: places.length,
  });
}

async function handleToiletSearch(reqUrl, res) {
  const lng = reqUrl.searchParams.get("lng");
  const lat = reqUrl.searchParams.get("lat");
  const radius = clampNumber(reqUrl.searchParams.get("radius"), 100, 50000, 1000);
  const keywords = reqUrl.searchParams.get("keywords") || "公共厕所";
  const pageSize = 25;
  const maxResults = clampNumber(reqUrl.searchParams.get("limit"), pageSize, 200, 100);
  const maxPages = Math.ceil(maxResults / pageSize);

  if (!isLngLat(lng, lat)) {
    return sendJson(res, { error: "当前基准点坐标无效" }, 400);
  }

  if (getRegionMode(reqUrl) === "overseas") {
    const countryCode = normalizeCountryCode(reqUrl.searchParams.get("countryCode"));
    if (!countryCode) return sendJson(res, { error: "海外查询国家代码无效" }, 400);
    if (normalizeText(reqUrl.searchParams.get("coordinateSystem")) !== COORDINATE_SYSTEMS.WGS84) {
      return sendJson(res, { error: "海外查询必须使用 WGS84 坐标" }, 400);
    }
    const result = await globalPoiService.queryToilets({
      center: { longitude: Number(lng), latitude: Number(lat) },
      radius: clampNumber(radius, 100, 3000, 500),
      countryCode,
    });
    logQueryDiagnostic("toilets", "overseas", result, { lng: Number(lng), lat: Number(lat), radius, countryCode });
    return sendJson(res, {
      pois: result.places,
      radius,
      total: result.rawCount,
      partial: result.isFallback,
      ...withoutPlaces(result),
    });
  }

  requireAmapKey();

  const pois = [];
  const seen = new Set();
  let total = 0;
  let partial = false;

  for (let page = 1; page <= maxPages && pois.length < maxResults; page += 1) {
    if (page > 1) await delay(AMAP_PAGE_DELAY_MS);
    let data;
    try {
      data = await fetchAmap("/v3/place/around", {
        location: `${lng},${lat}`,
        keywords,
        radius: String(radius),
        offset: String(pageSize),
        page: String(page),
        extensions: "base",
        sortrule: "distance",
      });
    } catch (error) {
      if (pois.length > 0 && isAmapRateLimit(error)) {
        partial = true;
        break;
      }
      throw error;
    }

    total = Number(data.count || total || 0);
    const pagePois = Array.isArray(data.pois) ? data.pois.map(normalizePoi).filter(Boolean) : [];
    pagePois.forEach((poi) => {
      const key = poi.id || `${poi.longitude},${poi.latitude},${poi.name}`;
      if (!seen.has(key) && pois.length < maxResults) {
        seen.add(key);
        pois.push(poi);
      }
    });
    if (pagePois.length < pageSize) break;
  }

  return sendJson(res, {
    pois,
    radius,
    total,
    partial,
    providerUsed: "amap",
    isFallback: false,
    truncated: total > pois.length,
    rawCount: total,
    displayCount: pois.length,
    coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
    retrievedAt: new Date().toISOString(),
  });
}

async function handleNavigation(reqUrl, res) {
  requireAmapKey();

  const origin = reqUrl.searchParams.get("origin");
  const destination = reqUrl.searchParams.get("destination");
  const [originLng, originLat] = splitLngLat(origin);
  const [destinationLng, destinationLat] = splitLngLat(destination);

  if (!isLngLat(originLng, originLat) || !isLngLat(destinationLng, destinationLat)) {
    return sendJson(res, { error: "导航坐标无效" }, 400);
  }

  const data = await fetchAmap("/v3/direction/walking", { origin, destination });
  const pathData = data.route?.paths?.[0];
  if (!pathData) {
    return sendJson(res, { error: "没有找到可用步行路线" }, 404);
  }

  const steps = Array.isArray(pathData.steps) ? pathData.steps : [];
  const points = steps.flatMap((step) => parsePolyline(step.polyline || ""));

  return sendJson(res, {
    distance: Number(pathData.distance || 0),
    duration: Number(pathData.duration || 0),
    points,
    steps: steps.map((step) => ({
      instruction: step.instruction || "",
      distance: Number(step.distance || 0),
      duration: Number(step.duration || 0),
    })),
  });
}

async function handleNearbyMetro(reqUrl, res) {
  const lng = reqUrl.searchParams.get("lng");
  const lat = reqUrl.searchParams.get("lat");
  const radius = clampNumber(reqUrl.searchParams.get("radius"), 1000, 20000, 20000);
  const limit = clampNumber(reqUrl.searchParams.get("limit"), 1, 10, 10);
  const debugCity = normalizeAmapName(reqUrl.searchParams.get("debugCity") || "");
  if (!isLngLat(lng, lat)) {
    return sendJson(res, { error: "当前基准点坐标无效" }, 400);
  }

  const center = { longitude: Number(lng), latitude: Number(lat) };
  if (getRegionMode(reqUrl) === "overseas") {
    const countryCode = normalizeCountryCode(reqUrl.searchParams.get("countryCode"));
    if (!countryCode) return sendJson(res, { error: "海外查询国家代码无效" }, 400);
    if (normalizeText(reqUrl.searchParams.get("coordinateSystem")) !== COORDINATE_SYSTEMS.WGS84) {
      return sendJson(res, { error: "海外查询必须使用 WGS84 坐标" }, 400);
    }
    const result = await globalPoiService.querySubway({
      center,
      radius,
      limit,
      countryCode,
    });
    const stations = result.places.map((station) => ({
      ...station,
      toilet: 2,
      lineId: "overseas_subway",
      lineName: "地铁站",
      lineColor: "#F59E0B",
      distance: station.distanceMeters,
    }));
    logQueryDiagnostic("metro", "overseas", result, {
      lng: Number(lng),
      lat: Number(lat),
      radius,
      countryCode,
      cityId: normalizeText(reqUrl.searchParams.get("cityId")),
    });
    return sendJson(res, {
      city: normalizeText(reqUrl.searchParams.get("cityId")),
      hasMetro: stations.length > 0,
      location: { countryCode: normalizeCountryCode(reqUrl.searchParams.get("countryCode")) },
      radius,
      lines: [],
      stations,
      ...withoutPlaces(result),
    });
  }

  requireAmapKey();

  try {
    const amapStations = await searchNearbyMetroStationsFromAmap(center, radius, limit);
    const stations = dedupeMetroStations(amapStations.map(applyLocalMetroStatus))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, limit);
    const city = debugCity || stations[0]?.city || "";
    return sendJson(res, {
      city,
      hasMetro: stations.length > 0,
      location: { province: stations[0]?.province || "", city },
      radius,
      lines: [],
      stations,
      providerUsed: "amap",
      isFallback: false,
      truncated: amapStations.length > limit,
      rawCount: amapStations.length,
      displayCount: stations.length,
      coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
      retrievedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Nearby AMap metro lookup failed", safeProviderError(error, [AMAP_WEB_SERVICE_KEY]));
    throw error;
  }
}

async function geocodeAddress(address, city = "") {
  if (!address) return null;
  const data = await fetchAmap("/v3/geocode/geo", {
    address,
    city,
  });
  const geocode = Array.isArray(data.geocodes) ? data.geocodes[0] : null;
  if (!geocode?.location) return null;
  const [lng, lat] = splitLngLat(geocode.location);
  if (!isLngLat(lng, lat)) return null;
  const longitude = Number(lng);
  const latitude = Number(lat);
  return {
    id: geocode.adcode || geocode.location,
    name: geocode.formatted_address || address,
    address: geocode.formatted_address || address,
    cityName: normalizeAmapName(geocode.city || city),
    district: normalizeText(geocode.district),
    distance: 0,
    type: "地理编码",
    longitude,
    latitude,
    location: {
      lng: longitude,
      lat: latitude,
    },
  };
}

async function reverseGeocode(lng, lat) {
  const data = await fetchAmap("/v3/geocode/regeo", {
    location: `${lng},${lat}`,
    extensions: "base",
  });
  const component = data.regeocode?.addressComponent || {};
  const countryName = normalizeAmapName(component.country);
  const provinceName = normalizeAmapName(component.province);
  const rawCity = Array.isArray(component.city) ? "" : component.city;
  const fallbackCity = MUNICIPALITIES.has(provinceName) ? provinceName : component.district;
  const cityName = normalizeAmapName(rawCity || fallbackCity);

  return {
    country: countryName,
    province: provinceName,
    city: cityName,
    district: normalizeAmapName(component.district),
    provinceSlug: slugifyCn(provinceName),
    citySlug: slugifyCn(cityName),
  };
}


function getMetroEntriesWithLineFiles() {
  return loadMetroCityIndex().filter((entry) => {
    const cityDir = path.join(metroDataDir, entry.provinceSlug, entry.citySlug);
    if (!fs.existsSync(cityDir)) return false;
    return fs.readdirSync(cityDir).some((fileName) => fileName.endsWith(".json"));
  });
}

function readMetroLinesByEntry(entry) {
  const cityDir = path.join(metroDataDir, entry.provinceSlug, entry.citySlug);
  if (!fs.existsSync(cityDir)) return [];
  return fs
    .readdirSync(cityDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort()
    .map((fileName) => {
      const filePath = path.join(cityDir, fileName);
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return {
        id: data.id || path.basename(fileName, ".json"),
        name: data.name || path.basename(fileName, ".json"),
        displayName: data.displayName || data.name || path.basename(fileName, ".json"),
        color: data.color || "#888888",
        stations: Array.isArray(data.stations) ? data.stations.map(normalizeStation).filter(Boolean) : [],
      };
    });
}

function readMetroLinesByCity(city) {
  const entry = findMetroCityEntry(city);
  if (!entry) return [];
  return readMetroLinesByEntry(entry);
}

function findMetroCityEntry(city) {
  const normalized = normalizeAmapName(city);
  if (!normalized) return null;
  const citySlug = slugifyCn(normalized);
  return loadMetroCityIndex().find((entry) => normalizeAmapName(entry.city) === normalized || entry.citySlug === citySlug) || null;
}

function loadMetroCityIndex() {
  if (metroCityIndexCache) return metroCityIndexCache;
  if (!fs.existsSync(metroCityIndexPath)) {
    metroCityIndexCache = [];
    return metroCityIndexCache;
  }
  metroCityIndexCache = JSON.parse(fs.readFileSync(metroCityIndexPath, "utf8"));
  return metroCityIndexCache;
}

function normalizeStation(station) {
  if (!station || !station.name) return null;
  return {
    name: station.name,
    toilet: [0, 1, 2].includes(Number(station.toilet)) ? Number(station.toilet) : 2,
  };
}


function dedupeMetroStations(stations) {
  const seen = new Set();
  return stations.filter((station) => {
    const key = [normalizeStationName(station.name), Math.round(Number(station.longitude) * 10000), Math.round(Number(station.latitude) * 10000)].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchNearbyMetroStationsFromAmap(center, radius, limit = 10) {
  const pageSize = 25;
  const stations = [];
  const data = await fetchAmap("/v3/place/around", {
    location: `${center.longitude},${center.latitude}`,
    keywords: "地铁站",
    types: "150500",
    radius: String(radius),
    sortrule: "distance",
    offset: String(pageSize),
    page: "1",
    extensions: "base",
  });

  const pois = Array.isArray(data.pois) ? data.pois : [];
  pois.forEach((poi) => {
    if (!poi.name || !poi.location) return;
    const [lng, lat] = splitLngLat(poi.location);
    if (!isLngLat(lng, lat)) return;
    const longitude = Number(lng);
    const latitude = Number(lat);
    const distance = Number(poi.distance);
    stations.push({
      id: poi.id || `${longitude},${latitude}`,
      sourceId: poi.id || `${longitude},${latitude}`,
      name: normalizeAmapStationDisplayName(poi.name),
      toilet: 2,
      longitude,
      latitude,
      lineId: "amap_nearby_metro",
      lineName: "附近地铁站",
      lineColor: "#F59E0B",
      city: normalizeAmapName(poi.cityname || ""),
      province: normalizeAmapName(poi.pname || ""),
      distance: Number.isFinite(distance) ? distance : getDistanceMeters(center, { longitude, latitude }),
      distanceMeters: Number.isFinite(distance) ? distance : getDistanceMeters(center, { longitude, latitude }),
      source: "amap",
      providerUsed: "amap",
      coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
      countryCode: "cn",
      retrievedAt: new Date().toISOString(),
    });
  });

  return stations.sort((left, right) => left.distance - right.distance).slice(0, Math.max(limit, 10));
}

function getLocalMetroStatusIndex() {
  if (localMetroStatusCache) return localMetroStatusCache;
  const byCity = new Map();
  const byUniqueName = new Map();
  const duplicateNames = new Set();

  for (const entry of getMetroEntriesWithLineFiles()) {
    const cityKey = normalizeAmapName(entry.city);
    const cityStations = byCity.get(cityKey) || new Map();
    for (const line of readMetroLinesByEntry(entry)) {
      for (const station of line.stations) {
        const nameKey = normalizeStationName(station.name);
        if (!nameKey) continue;
        const current = cityStations.get(nameKey);
        const match = current || {
          name: station.name,
          toilet: station.toilet,
          lineIds: [],
          lineNames: [],
          lineColors: [],
        };
        if (!match.lineIds.includes(line.id)) match.lineIds.push(line.id);
        if (!match.lineNames.includes(line.displayName)) match.lineNames.push(line.displayName);
        if (!match.lineColors.includes(line.color)) match.lineColors.push(line.color);
        if (match.toilet !== station.toilet) match.toilet = 2;
        cityStations.set(nameKey, match);

        if (byUniqueName.has(nameKey)) duplicateNames.add(nameKey);
        else byUniqueName.set(nameKey, match);
      }
    }
    byCity.set(cityKey, cityStations);
  }

  for (const name of duplicateNames) byUniqueName.delete(name);
  localMetroStatusCache = { byCity, byUniqueName };
  return localMetroStatusCache;
}

function applyLocalMetroStatus(station) {
  const index = getLocalMetroStatusIndex();
  const nameKey = normalizeStationName(station.name);
  const cityKey = normalizeAmapName(station.city);
  const match = index.byCity.get(cityKey)?.get(nameKey) || index.byUniqueName.get(nameKey);
  if (!match) return station;
  return {
    ...station,
    name: match.name || station.name,
    toilet: match.toilet,
    lineId: match.lineIds.join(",") || station.lineId,
    lineName: match.lineNames.join(" / ") || station.lineName,
    lineColor: match.lineColors[0] || station.lineColor,
  };
}

function isMainlandAmapLocation(location) {
  const country = normalizeAmapName(location.country);
  const province = normalizeAmapName(location.province);
  const city = normalizeAmapName(location.city);
  if (/香港|澳门|台湾/.test(`${province}${city}`)) return false;
  if (country && !/中国|中华人民共和国|china/i.test(country)) return false;
  return Boolean(province || city);
}

function hydrateMetroLines(lines, stationIndex) {
  return lines.map((line) => ({
    ...line,
    stations: line.stations
      .map((station) => {
        const found = stationIndex.get(normalizeStationName(station.name));
        if (!found?.location) return null;
        return {
          ...station,
          location: found.location,
          amapName: found.amapName,
        };
      })
      .filter(Boolean),
  }));
}

function flattenMetroStations(lines) {
  return lines.flatMap((line) =>
    line.stations.map((station) => ({
      name: station.name,
      toilet: station.toilet,
      longitude: station.location[0],
      latitude: station.location[1],
      lineId: line.id,
      lineName: line.displayName,
      lineColor: line.color,
    })),
  );
}

async function getCityMetroStationIndex(city) {
  if (metroCityStationCache.has(city)) return metroCityStationCache.get(city);
  const pageSize = 25;
  const maxPages = 8;
  const index = new Map();

  for (let page = 1; page <= maxPages; page += 1) {
    if (page > 1) await delay(AMAP_PAGE_DELAY_MS);
    let data;
    try {
      data = await fetchAmap("/v3/place/text", {
        keywords: "地铁站",
        city,
        citylimit: "true",
        types: "150500",
        offset: String(pageSize),
        page: String(page),
        extensions: "base",
      });
    } catch (error) {
      if (index.size > 0 && isAmapRateLimit(error)) break;
      throw error;
    }
    const pois = Array.isArray(data.pois) ? data.pois : [];
    pois.forEach((poi) => {
      if (!poi.name || !poi.location) return;
      const [lng, lat] = splitLngLat(poi.location);
      if (!isLngLat(lng, lat)) return;
      const key = normalizeStationName(poi.name);
      if (!key || index.has(key)) return;
      index.set(key, {
        location: [Number(lng), Number(lat)],
        amapName: poi.name,
      });
    });
    if (pois.length < pageSize) break;
  }

  metroCityStationCache.set(city, index);
  return index;
}

async function fetchAmap(apiPath, params) {
  const url = new URL(`https://restapi.amap.com${apiPath}`);
  url.searchParams.set("key", AMAP_WEB_SERVICE_KEY);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.status !== "1") {
    const error = new Error(data.info || "高德服务请求失败");
    error.infocode = data.infocode;
    throw error;
  }
  return data;
}

function normalizePoi(poi) {
  if (!poi.location) return null;
  const [lng, lat] = splitLngLat(poi.location);
  if (!isLngLat(lng, lat)) return null;
  const longitude = Number(lng);
  const latitude = Number(lat);

  return {
    id: poi.id || "",
    sourceId: poi.id || "",
    source: "amap",
    providerUsed: "amap",
    name: poi.name || "地点",
    address: normalizeText(poi.address),
    cityName: normalizeAmapName(poi.cityname),
    district: normalizeText(poi.adname),
    distance: Number(poi.distance || 0),
    type: poi.type || "",
    tel: normalizeText(poi.tel),
    longitude,
    latitude,
    coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
    countryCode: "cn",
    retrievedAt: new Date().toISOString(),
    location: {
      lng: longitude,
      lat: latitude,
    },
  };
}

function parsePolyline(polyline) {
  if (!polyline) return [];
  return polyline
    .split(";")
    .map((item) => {
      const [lng, lat] = splitLngLat(item);
      return {
        longitude: Number(lng),
        latitude: Number(lat),
      };
    })
    .filter((point) => isLngLat(point.longitude, point.latitude));
}

function serveStatic(pathname, res) {
  const safePathname = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(rootDir, safePathname));

  if (!filePath.startsWith(rootDir)) {
    return sendText(res, "Forbidden", 403);
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      return sendText(res, "Not found", 404);
    }
    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

function normalizeText(value) {
  return typeof value === "string" && value !== "[]" ? value : "";
}

function normalizeAmapName(value) {
  return normalizeText(value).replace(/(省|市|自治区|特别行政区)$/u, "");
}

function normalizeStationName(value) {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/[（(]地铁站[）)]/gu, "")
    .replace(/地铁站/u, "")
    .replace(/站/u, "");
}


function normalizeAmapStationDisplayName(value) {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/[（(]地铁站[）)]/gu, "")
    .replace(/地铁站$/u, "")
    .replace(/站$/u, "");
}

function slugifyCn(value) {
  const normalized = normalizeAmapName(value);
  return PROVINCE_SLUG_ALIASES[normalized] || CITY_SLUG_ALIASES[normalized] || normalized.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}


function getDistanceMeters(from, to) {
  const rad = Math.PI / 180;
  const earthRadius = 6371000;
  const lat1 = from.latitude * rad;
  const lat2 = to.latitude * rad;
  const deltaLat = (to.latitude - from.latitude) * rad;
  const deltaLng = (to.longitude - from.longitude) * rad;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function splitLngLat(value = "") {
  return String(value).split(",").map((item) => item.trim());
}

function isLngLat(lng, lat) {
  const lngNumber = Number(lng);
  const latNumber = Number(lat);
  return Number.isFinite(lngNumber) && Number.isFinite(latNumber) && lngNumber >= -180 && lngNumber <= 180 && latNumber >= -90 && latNumber <= 90;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function getRegionMode(reqUrl) {
  const value = normalizeText(reqUrl.searchParams.get("region") || reqUrl.searchParams.get("regionMode")).toLowerCase();
  return value === "overseas" ? "overseas" : "mainland";
}

function isGlobalReverseRequest(reqUrl) {
  const value = normalizeText(reqUrl.searchParams.get("region") || reqUrl.searchParams.get("scope")).toLowerCase();
  return value === "global" || value === "overseas";
}

function normalizeCountryCode(value) {
  const countryCode = normalizeText(value).trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(countryCode)) return "";
  return countryCode;
}

function withoutPlaces(result) {
  const { places: _places, ...metadata } = result;
  return metadata;
}

function logQueryDiagnostic(requestType, regionMode, result, request = {}) {
  console.info("POI query", {
    requestType,
    regionMode,
    providerUsed: result.providerUsed,
    isFallback: Boolean(result.isFallback),
    rawCount: Number(result.rawCount || 0),
    displayCount: Number(result.displayCount || result.places?.length || 0),
    truncated: Boolean(result.truncated),
    coordinateSystem: result.coordinateSystem,
    durationMs: Number(result.durationMs || 0),
    request: {
      ...request,
      lng: request.lng === undefined ? undefined : Number(Number(request.lng).toFixed(5)),
      lat: request.lat === undefined ? undefined : Number(Number(request.lat).toFixed(5)),
    },
  });
}

function isAmapRateLimit(error) {
  return error.infocode === "10021" || /LIMIT|QPS/i.test(error.message || "");
}

function getErrorStatus(error) {
  if (error?.statusCode) return error.statusCode;
  if (error?.infocode === "20803") return 400;
  if (error?.infocode) return 502;
  return 500;
}

function getClientErrorMessage(error) {
  if (error?.infocode === "20803" || error?.message === "OVER_DIRECTION_RANGE") {
    return "步行路线距离过远，无法规划。请先选定更近的基准点，或改用系统地图导航。";
  }
  if (error?.code === "ALL_PROVIDERS_FAILED" || error?.code === "PROVIDER_NOT_CONFIGURED") {
    return error.message;
  }
  if (error?.provider && error?.code) return "第三方地点服务暂时不可用，请稍后重试";
  return error?.message || "服务器内部错误";
}

function requireAmapKey() {
  if (!AMAP_WEB_SERVICE_KEY) throw new Error("后端缺少 AMAP_WEB_SERVICE_KEY");
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

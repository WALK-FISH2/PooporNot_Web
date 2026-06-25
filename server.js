const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const rootDir = __dirname;
const metroDataDir = path.join(rootDir, "data", "metro");
loadEnv(path.join(rootDir, ".env"));

const PORT = Number(process.env.PORT || 5173);
const AMAP_JS_KEY = process.env.AMAP_JS_KEY || "";
const AMAP_SECURITY_JS_CODE = process.env.AMAP_SECURITY_JS_CODE || "";
const AMAP_WEB_SERVICE_KEY = process.env.AMAP_WEB_SERVICE_KEY || process.env.AMAP_KEY || "";
const AMAP_PAGE_DELAY_MS = Number(process.env.AMAP_PAGE_DELAY_MS || 260);
const metroCityStationCache = new Map();

const PROVINCE_SLUG_ALIASES = {
  江苏: "jiangsu",
};

const CITY_SLUG_ALIASES = {
  无锡: "wuxi",
  南京: "nanjing",
};

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
    console.error(error);
    return sendJson(res, { error: getClientErrorMessage(error) }, getErrorStatus(error));
  }
});

server.listen(PORT, () => {
  console.log(`拉了么统一后端已启动: http://localhost:${PORT}`);
});

async function handlePlaceSearch(reqUrl, res) {
  requireAmapKey();

  const city = normalizeText(reqUrl.searchParams.get("city")).trim();
  const keywords = normalizeText(reqUrl.searchParams.get("keywords")).trim();
  const mode = normalizeText(reqUrl.searchParams.get("mode")).trim();
  const limit = clampNumber(reqUrl.searchParams.get("limit"), 1, 25, 10);

  if (!city && !keywords) {
    return sendJson(res, { error: "请先输入城市或地点" }, 400);
  }

  if (mode === "city") {
    const cityPlace = await geocodeAddress(city || keywords);
    return sendJson(res, {
      city: city || keywords,
      places: cityPlace ? [cityPlace] : [],
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
  });
}

async function handleToiletSearch(reqUrl, res) {
  requireAmapKey();

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
  requireAmapKey();

  const lng = reqUrl.searchParams.get("lng");
  const lat = reqUrl.searchParams.get("lat");
  const debugCity = normalizeAmapName(reqUrl.searchParams.get("debugCity") || "");
  if (!isLngLat(lng, lat)) {
    return sendJson(res, { error: "当前基准点坐标无效" }, 400);
  }

  const location = await reverseGeocode(lng, lat);
  const city = debugCity || location.city;
  const lines = readMetroLinesByCity(city);
  if (!lines.length) {
    return sendJson(res, {
      city,
      hasMetro: false,
      location,
      lines: [],
      stations: [],
    });
  }

  const stationIndex = await getCityMetroStationIndex(city);
  const hydratedLines = hydrateMetroLines(lines, stationIndex);
  const stations = flattenMetroStations(hydratedLines);

  return sendJson(res, {
    city,
    hasMetro: true,
    location,
    lines: hydratedLines,
    stations,
  });
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
  const provinceName = normalizeAmapName(component.province);
  const cityName = normalizeAmapName(Array.isArray(component.city) ? "" : component.city || component.district);

  return {
    province: provinceName,
    city: cityName,
    provinceSlug: slugifyCn(provinceName),
    citySlug: slugifyCn(cityName),
  };
}

function readMetroLinesByCity(city) {
  const citySlug = slugifyCn(city);
  if (citySlug !== "wuxi") return [];

  const cityDir = path.join(metroDataDir, "jiangsu", "wuxi");
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

function normalizeStation(station) {
  if (!station || !station.name) return null;
  return {
    name: station.name,
    toilet: [0, 1, 2].includes(Number(station.toilet)) ? Number(station.toilet) : 2,
  };
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
    name: poi.name || "地点",
    address: normalizeText(poi.address),
    cityName: normalizeAmapName(poi.cityname),
    district: normalizeText(poi.adname),
    distance: Number(poi.distance || 0),
    type: poi.type || "",
    tel: normalizeText(poi.tel),
    longitude,
    latitude,
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

function slugifyCn(value) {
  const normalized = normalizeAmapName(value);
  return PROVINCE_SLUG_ALIASES[normalized] || CITY_SLUG_ALIASES[normalized] || normalized.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
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

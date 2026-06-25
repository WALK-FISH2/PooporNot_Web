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
const AMAP_PAGE_DELAY_MS = Number(process.env.AMAP_PAGE_DELAY_MS || 300);
const metroCityStationCache = new Map();

const PROVINCE_SLUG_ALIASES = {
  北京: "beijing",
  上海: "shanghai",
  天津: "tianjin",
  重庆: "chongqing",
  江苏: "jiangsu",
  浙江: "zhejiang",
  广东: "guangdong",
  四川: "sichuan",
  湖北: "hubei",
  湖南: "hunan",
  河南: "henan",
  山东: "shandong",
  安徽: "anhui",
  福建: "fujian",
  陕西: "shaanxi",
  辽宁: "liaoning",
  吉林: "jilin",
  黑龙江: "heilongjiang",
  河北: "hebei",
  江西: "jiangxi",
  广西: "guangxi",
  云南: "yunnan",
  贵州: "guizhou",
  甘肃: "gansu",
  海南: "hainan",
  香港: "hongkong",
  澳门: "macau",
};

const CITY_SLUG_ALIASES = {
  北京: "beijing",
  上海: "shanghai",
  天津: "tianjin",
  重庆: "chongqing",
  无锡: "wuxi",
  南京: "nanjing",
  苏州: "suzhou",
  常州: "changzhou",
  徐州: "xuzhou",
  杭州: "hangzhou",
  宁波: "ningbo",
  温州: "wenzhou",
  广州: "guangzhou",
  深圳: "shenzhen",
  佛山: "foshan",
  东莞: "dongguan",
  成都: "chengdu",
  武汉: "wuhan",
  长沙: "changsha",
  郑州: "zhengzhou",
  济南: "jinan",
  青岛: "qingdao",
  合肥: "hefei",
  福州: "fuzhou",
  厦门: "xiamen",
  西安: "xian",
  沈阳: "shenyang",
  大连: "dalian",
  长春: "changchun",
  哈尔滨: "harbin",
  石家庄: "shijiazhuang",
  南昌: "nanchang",
  南宁: "nanning",
  昆明: "kunming",
  贵阳: "guiyang",
  兰州: "lanzhou",
  海口: "haikou",
  香港: "hongkong",
  澳门: "macau",
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

    if (reqUrl.pathname === "/api/config") {
      return sendJson(res, {
        jsKey: AMAP_JS_KEY,
        securityJsCode: AMAP_SECURITY_JS_CODE,
      });
    }

    if (reqUrl.pathname === "/api/toilets") {
      return handleToiletSearch(reqUrl, res);
    }

    if (reqUrl.pathname === "/api/navigation") {
      return handleNavigation(reqUrl, res);
    }

    if (reqUrl.pathname === "/api/metro/nearby") {
      return handleNearbyMetro(reqUrl, res);
    }

    return serveStatic(reqUrl.pathname, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: "服务器内部错误" }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`拉了么后端已启动: http://localhost:${PORT}`);
});

async function handleToiletSearch(reqUrl, res) {
  if (!AMAP_WEB_SERVICE_KEY) {
    return sendJson(res, { error: "后端缺少 AMAP_WEB_SERVICE_KEY" }, 500);
  }

  const lng = reqUrl.searchParams.get("lng");
  const lat = reqUrl.searchParams.get("lat");
  const radius = clampNumber(reqUrl.searchParams.get("radius"), 1000, 50000, 3000);
  const keywords = reqUrl.searchParams.get("keywords") || "公共厕所";
  const pageSize = 25;
  const maxResults = clampNumber(reqUrl.searchParams.get("limit"), pageSize, 200, 200);
  const maxPages = Math.ceil(maxResults / pageSize);

  if (!isLngLat(lng, lat)) {
    return sendJson(res, { error: "当前位置坐标无效" }, 400);
  }

  const amapUrl = new URL("https://restapi.amap.com/v3/place/around");
  amapUrl.searchParams.set("key", AMAP_WEB_SERVICE_KEY);
  amapUrl.searchParams.set("location", `${lng},${lat}`);
  amapUrl.searchParams.set("keywords", keywords);
  amapUrl.searchParams.set("radius", String(radius));
  amapUrl.searchParams.set("offset", String(pageSize));
  amapUrl.searchParams.set("extensions", "base");
  amapUrl.searchParams.set("sortrule", "distance");

  const pois = [];
  const seen = new Set();
  let total = 0;

  let partial = false;

  for (let page = 1; page <= maxPages && pois.length < maxResults; page += 1) {
    if (page > 1 && AMAP_PAGE_DELAY_MS > 0) {
      await delay(AMAP_PAGE_DELAY_MS);
    }

    amapUrl.searchParams.set("page", String(page));
    let data;
    try {
      data = await fetchAmap(amapUrl);
    } catch (error) {
      if (pois.length > 0 && isAmapRateLimit(error)) {
        partial = true;
        break;
      }
      throw error;
    }

    total = Number(data.count || total || 0);

    const pagePois = Array.isArray(data.pois) ? data.pois.map(normalizePoi).filter(Boolean) : [];
    if (!pagePois.length) break;

    pagePois.forEach((poi) => {
      const key = poi.id || `${poi.location.lng},${poi.location.lat},${poi.name}`;
      if (!seen.has(key) && pois.length < maxResults) {
        seen.add(key);
        pois.push(poi);
      }
    });

    if (pagePois.length < pageSize) break;
  }

  return sendJson(res, { pois, radius, total, partial });
}

async function handleNearbyMetro(reqUrl, res) {
  if (!AMAP_WEB_SERVICE_KEY) {
    return sendJson(res, { error: "后端缺少 AMAP_WEB_SERVICE_KEY" }, 500);
  }

  const lng = reqUrl.searchParams.get("lng");
  const lat = reqUrl.searchParams.get("lat");
  if (!isLngLat(lng, lat)) {
    return sendJson(res, { error: "当前位置坐标无效" }, 400);
  }

  const location = await reverseGeocode(lng, lat);
  const candidates = getMetroPathCandidates(location);
  const metroPath = candidates.find((candidate) => fs.existsSync(candidate.path));

  if (!metroPath) {
    return sendJson(res, {
      hasMetro: false,
      location,
      lines: [],
    });
  }

  return sendJson(res, {
    hasMetro: true,
    location,
    dataPath: metroPath.relativePath,
    lines: await hydrateMetroLines(readMetroLines(metroPath.path), location),
  });
}

async function reverseGeocode(lng, lat) {
  const amapUrl = new URL("https://restapi.amap.com/v3/geocode/regeo");
  amapUrl.searchParams.set("key", AMAP_WEB_SERVICE_KEY);
  amapUrl.searchParams.set("location", `${lng},${lat}`);
  amapUrl.searchParams.set("extensions", "base");

  const data = await fetchAmap(amapUrl);
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

function getMetroPathCandidates(location) {
  const candidates = [];
  const citySlug = location.citySlug;
  const provinceSlug = location.provinceSlug;
  const cityAlias = CITY_SLUG_ALIASES[location.city] || citySlug;
  const provinceAlias = PROVINCE_SLUG_ALIASES[location.province] || provinceSlug;

  [
    [provinceAlias, cityAlias],
    [provinceSlug, citySlug],
    [provinceAlias, citySlug],
    [provinceSlug, cityAlias],
  ].forEach(([province, city]) => {
    if (!province || !city) return;
    const relativePath = path.join("data", "metro", province, city);
    const fullPath = path.join(rootDir, relativePath);
    if (!candidates.some((candidate) => candidate.path === fullPath)) {
      candidates.push({ path: fullPath, relativePath });
    }
  });

  return candidates;
}

function readMetroLines(cityDir) {
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
        source: data.source || "",
        stations: Array.isArray(data.stations) ? data.stations.map(normalizeStation).filter(Boolean) : [],
      };
    });
}

function normalizeStation(station) {
  if (!station || !station.name) return null;
  let location = null;
  if (station.location) {
    const [lng, lat] = Array.isArray(station.location) ? station.location : splitLngLat(station.location);
    if (isLngLat(lng, lat)) {
      location = [Number(lng), Number(lat)];
    }
  }

  return {
    name: station.name,
    toilet: [0, 1, 2].includes(Number(station.toilet)) ? Number(station.toilet) : 2,
    location,
  };
}

async function hydrateMetroLines(lines, location) {
  const stationIndex = await getCityMetroStationIndex(location);

  return lines.map((line) => ({
    ...line,
    stations: line.stations
      .map((station) => {
        const resolved = station.location ? station : stationIndex.get(normalizeStationName(station.name));
        if (!resolved?.location) {
          console.warn(`Metro station not found in city index: ${line.name} ${station.name}`);
          return null;
        }
        return { ...station, location: resolved.location, amapName: resolved.amapName };
      })
      .filter(Boolean),
  }));
}

async function getCityMetroStationIndex(location) {
  const cacheKey = `${location.province || ""}:${location.city || ""}`;
  if (metroCityStationCache.has(cacheKey)) {
    return metroCityStationCache.get(cacheKey);
  }

  const pois = await searchCityMetroStations(location);
  const index = new Map();
  pois.forEach((poi) => {
    if (!poi.location) return;
    const [lng, lat] = splitLngLat(poi.location);
    if (!isLngLat(lng, lat)) return;
    const key = normalizeStationName(poi.name || "");
    if (!key || index.has(key)) return;
    index.set(key, {
      location: [Number(lng), Number(lat)],
      amapName: poi.name || "",
      lineText: poi.address || "",
    });
  });

  metroCityStationCache.set(cacheKey, index);
  return index;
}

async function searchCityMetroStations(location) {
  const pageSize = 25;
  const maxPages = 8;
  const pois = [];

  for (let page = 1; page <= maxPages; page += 1) {
    if (page > 1 && AMAP_PAGE_DELAY_MS > 0) {
      await delay(AMAP_PAGE_DELAY_MS);
    }

    const amapUrl = new URL("https://restapi.amap.com/v3/place/text");
    amapUrl.searchParams.set("key", AMAP_WEB_SERVICE_KEY);
    amapUrl.searchParams.set("keywords", "地铁站");
    amapUrl.searchParams.set("city", location.city || "");
    amapUrl.searchParams.set("citylimit", "true");
    amapUrl.searchParams.set("types", "150500");
    amapUrl.searchParams.set("offset", String(pageSize));
    amapUrl.searchParams.set("page", String(page));
    amapUrl.searchParams.set("extensions", "base");

    let data;
    try {
      data = await fetchAmap(amapUrl);
    } catch (error) {
      if (pois.length > 0 && isAmapRateLimit(error)) break;
      throw error;
    }

    const pagePois = Array.isArray(data.pois) ? data.pois : [];
    pois.push(...pagePois);
    if (pagePois.length < pageSize) break;
  }

  return pois;
}

async function handleNavigation(reqUrl, res) {
  if (!AMAP_WEB_SERVICE_KEY) {
    return sendJson(res, { error: "后端缺少 AMAP_WEB_SERVICE_KEY" }, 500);
  }

  const origin = reqUrl.searchParams.get("origin");
  const destination = reqUrl.searchParams.get("destination");
  const [originLng, originLat] = splitLngLat(origin);
  const [destinationLng, destinationLat] = splitLngLat(destination);

  if (!isLngLat(originLng, originLat) || !isLngLat(destinationLng, destinationLat)) {
    return sendJson(res, { error: "导航坐标无效" }, 400);
  }

  const amapUrl = new URL("https://restapi.amap.com/v3/direction/walking");
  amapUrl.searchParams.set("key", AMAP_WEB_SERVICE_KEY);
  amapUrl.searchParams.set("origin", origin);
  amapUrl.searchParams.set("destination", destination);

  const data = await fetchAmap(amapUrl);
  const pathData = data.route?.paths?.[0];
  if (!pathData) {
    return sendJson(res, { error: "没有找到可用步行路线" }, 404);
  }

  const steps = Array.isArray(pathData.steps) ? pathData.steps : [];
  const points = steps.flatMap((step) => parsePolyline(step.polyline));

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

async function fetchAmap(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.status !== "1") {
    const error = new Error(data.info || "高德服务请求失败");
    error.infocode = data.infocode;
    throw error;
  }
  return data;
}

function isAmapRateLimit(error) {
  return error.infocode === "10021" || /LIMIT|QPS/i.test(error.message || "");
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

function normalizePoi(poi) {
  const [lng, lat] = splitLngLat(poi.location);
  if (!isLngLat(lng, lat)) return null;

  return {
    id: poi.id || "",
    name: poi.name || "公共厕所",
    address: normalizeText(poi.address),
    distance: Number(poi.distance || 0),
    type: poi.type || "",
    tel: normalizeText(poi.tel),
    location: {
      lng: Number(lng),
      lat: Number(lat),
    },
  };
}

function normalizeText(value) {
  return typeof value === "string" && value !== "[]" ? value : "";
}

function normalizeAmapName(value) {
  return normalizeText(value).replace(/(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区|特别行政区)$/u, "");
}

function normalizeStationName(value) {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/[（(]地铁站[）)]/gu, "")
    .replace(/地铁站$/u, "")
    .replace(/站$/u, "");
}

function slugifyCn(value) {
  return normalizeAmapName(value)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
}

function parsePolyline(polyline) {
  if (!polyline) return [];
  return polyline
    .split(";")
    .map(splitLngLat)
    .filter(([lng, lat]) => isLngLat(lng, lat))
    .map(([lng, lat]) => [Number(lng), Number(lat)]);
}

function splitLngLat(value = "") {
  return String(value).split(",").map((item) => item.trim());
}

function isLngLat(lng, lat) {
  const lngNumber = Number(lng);
  const latNumber = Number(lat);
  return (
    Number.isFinite(lngNumber) &&
    Number.isFinite(latNumber) &&
    lngNumber >= -180 &&
    lngNumber <= 180 &&
    latNumber >= -90 &&
    latNumber <= 90
  );
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

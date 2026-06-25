const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const rootDir = __dirname;
loadEnv(path.join(rootDir, ".env"));

const PORT = Number(process.env.PORT || 5173);
const AMAP_JS_KEY = process.env.AMAP_JS_KEY || "";
const AMAP_SECURITY_JS_CODE = process.env.AMAP_SECURITY_JS_CODE || "";
const AMAP_WEB_SERVICE_KEY = process.env.AMAP_WEB_SERVICE_KEY || process.env.AMAP_KEY || "";
const AMAP_PAGE_DELAY_MS = Number(process.env.AMAP_PAGE_DELAY_MS || 300);

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

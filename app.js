const els = {
  map: document.querySelector("#map"),
  status: document.querySelector("#statusPill"),
  drawerEyebrow: document.querySelector("#drawerEyebrow"),
  keyword: document.querySelector("#keywordInput"),
  radius: document.querySelector("#radiusSelect"),
  search: document.querySelector("#searchButton"),
  locate: document.querySelector("#locateButton"),
  fit: document.querySelector("#fitButton"),
  config: document.querySelector("#configButton"),
  theme: document.querySelector("#themeButton"),
  themeIcon: document.querySelector("#themeIcon"),
  dialog: document.querySelector("#configDialog"),
  resultTitle: document.querySelector("#resultTitle"),
  resultCount: document.querySelector("#resultCount"),
  resultList: document.querySelector("#resultList"),
};

const THEME_STORAGE_KEY = "laleme-theme";
const MAP_STYLES = {
  light: "amap://styles/normal",
  dark: "amap://styles/dark",
};

let AMapRef;
let map;
let geolocation;
let userMarker;
let routePolyline;
let userPosition;
let selectedPoiId = "";
let toiletMarkers = [];
let currentPois = [];
let currentSearchRadius = 0;
let currentTheme = localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";

const setStatus = (text, mode = "") => {
  els.status.textContent = text;
  els.status.className = `status-pill ${mode}`.trim();
};

const applyTheme = (theme) => {
  currentTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = currentTheme;
  localStorage.setItem(THEME_STORAGE_KEY, currentTheme);

  if (els.theme && els.themeIcon) {
    const isDark = currentTheme === "dark";
    els.theme.title = isDark ? "切换白天版" : "切换夜晚版";
    els.theme.setAttribute("aria-label", els.theme.title);
    els.themeIcon.textContent = isDark ? "☀" : "☾";
  }

  if (map) {
    map.setMapStyle(MAP_STYLES[currentTheme]);
  }
};

const toggleTheme = () => {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
};

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

const apiGet = async (path, params = {}) => {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
};

const initMap = async () => {
  try {
    setStatus("读取配置");
    const config = await apiGet("/api/config");

    if (!config.jsKey) {
      setStatus("缺少 Key", "error");
      els.dialog.showModal();
      renderEmpty("后端没有配置 AMAP_JS_KEY。请参考 .env.example。");
      return;
    }

    if (config.securityJsCode) {
      window._AMapSecurityConfig = { securityJsCode: config.securityJsCode };
    }

    setStatus("加载地图");
    await loadScript("https://webapi.amap.com/loader.js");
    AMapRef = await window.AMapLoader.load({
      key: config.jsKey,
      version: "2.0",
      plugins: ["AMap.Geolocation", "AMap.Scale", "AMap.ToolBar"],
    });

    map = new AMapRef.Map("map", {
      zoom: 15,
      center: [116.397428, 39.90923],
      viewMode: "2D",
      mapStyle: MAP_STYLES[currentTheme],
    });

    map.addControl(new AMapRef.Scale());
    map.addControl(new AMapRef.ToolBar({ position: "RB" }));

    geolocation = new AMapRef.Geolocation({
      enableHighAccuracy: true,
      timeout: 10000,
      position: "RB",
      offset: [20, 120],
      zoomToAccuracy: true,
    });

    setStatus("已就绪", "ready");
    locateUser(true);
  } catch (error) {
    console.error(error);
    setStatus("启动失败", "error");
    renderEmpty(error.message || "地图启动失败，请检查后端服务和 Key 配置。");
  }
};

const locateUser = (searchAfterLocate = false) => {
  if (!geolocation || !map) return;

  setStatus("定位中");
  geolocation.getCurrentPosition((status, result) => {
    if (status !== "complete") {
      setStatus("定位失败", "error");
      renderEmpty(result?.message || "浏览器没有返回当前位置。");
      return;
    }

    const position = [result.position.lng, result.position.lat];
    userPosition = position;
    setUserMarker(position);
    map.setCenter(position);
    map.setZoom(16);
    setStatus("已定位", "ready");

    if (searchAfterLocate) {
      searchToilets();
    }
  });
};

const setUserMarker = (position) => {
  if (userMarker) {
    userMarker.setPosition(position);
    return;
  }

  userMarker = new AMapRef.Marker({
    position,
    content: '<div class="user-marker"></div>',
    offset: new AMapRef.Pixel(-9, -9),
    zIndex: 200,
  });
  map.add(userMarker);
};

const searchToilets = async () => {
  if (!userPosition) {
    locateUser(true);
    return;
  }

  clearRoute();
  selectedPoiId = "";
  const keyword = els.keyword.value.trim() || "公共厕所";
  const radius = Number(els.radius.value);
  currentSearchRadius = radius;
  setStatus("搜索中");
  els.search.disabled = true;

  try {
    const result = await apiGet("/api/toilets", {
      lng: userPosition[0],
      lat: userPosition[1],
      radius,
      keywords: keyword,
    });

    currentPois = result.pois || [];
    renderPois(currentPois);
    drawToiletMarkers(currentPois);
    fitAllMarkers();
    setStatus(result.partial ? "部分结果" : "已更新", "ready");
  } catch (error) {
    console.error(error);
    setStatus("搜索失败", "error");
    clearToiletMarkers();
    renderEmpty(error.message || "附近没有搜到公共厕所，可以扩大半径再试。");
  } finally {
    els.search.disabled = false;
  }
};

const startNavigation = async (poi) => {
  if (!userPosition || !poi.location) return;

  setStatus("规划中");
  try {
    const route = await apiGet("/api/navigation", {
      origin: userPosition.join(","),
      destination: `${poi.location.lng},${poi.location.lat}`,
      type: "walking",
    });

    drawRoute(route.points || []);
    renderRouteSummary(poi, route);
    setStatus("导航中", "ready");
  } catch (error) {
    console.error(error);
    setStatus("规划失败", "error");
    renderRouteError(poi, error.message || "路线规划失败。");
  }
};

const clearToiletMarkers = () => {
  if (toiletMarkers.length) {
    map.remove(toiletMarkers);
  }
  toiletMarkers = [];
};

const clearRoute = () => {
  if (routePolyline) {
    map.remove(routePolyline);
    routePolyline = null;
  }
};

const drawToiletMarkers = (pois) => {
  clearToiletMarkers();
  toiletMarkers = pois
    .filter((poi) => poi.location)
    .map((poi, index) => {
      const marker = new AMapRef.Marker({
        position: [poi.location.lng, poi.location.lat],
        content: '<div class="toilet-marker">厕</div>',
        offset: new AMapRef.Pixel(-14, -14),
        title: poi.name,
        zIndex: 100 + index,
      });

      marker.poiId = getPoiKey(poi);
      marker.on("click", () => selectPoi(poi, { zoom: false }));

      return marker;
    });

  map.add(toiletMarkers);
  updateMarkerSelection();
};

const drawRoute = (points) => {
  clearRoute();
  if (!points.length) return;

  routePolyline = new AMapRef.Polyline({
    path: points,
    isOutline: true,
    outlineColor: "#ffffff",
    borderWeight: 2,
    strokeColor: "#2374ab",
    strokeWeight: 7,
    strokeOpacity: 0.92,
    lineJoin: "round",
    lineCap: "round",
    zIndex: 80,
  });

  map.add(routePolyline);
  const overlays = [userMarker, routePolyline, ...toiletMarkers].filter(Boolean);
  map.setFitView(overlays, false, [110, 70, 250, 70]);
};

const selectPoi = (poi, options = {}) => {
  if (!poi.location) return;

  clearRoute();
  selectedPoiId = getPoiKey(poi);
  const position = [poi.location.lng, poi.location.lat];
  map.setCenter(position);
  if (options.zoom !== false) {
    map.setZoom(17);
  }
  renderPoiDetail(poi);
  updateMarkerSelection();
  setStatus("已选择", "ready");
};

const updateMarkerSelection = () => {
  toiletMarkers.forEach((marker) => {
    const active = marker.poiId && marker.poiId === selectedPoiId;
    marker.setContent(`<div class="toilet-marker${active ? " selected" : ""}">厕</div>`);
    setMarkerZIndex(marker, active ? 300 : 100);
  });
};

const renderPois = (pois) => {
  els.drawerEyebrow.textContent = "结果";
  els.resultTitle.textContent = currentSearchRadius ? `${formatDistance(currentSearchRadius)} 内公共厕所` : "附近公共厕所";
  els.resultCount.textContent = String(pois.length);
  els.resultList.className = "result-list";
  els.resultList.innerHTML = "";

  if (!pois.length) {
    renderEmpty("附近没有搜到公共厕所，可以扩大半径再试。");
    return;
  }

  const fragment = document.createDocumentFragment();
  pois.forEach((poi) => {
    const card = document.createElement("article");
    card.className = "result-card";
    card.innerHTML = `
      <button class="result-main" type="button">
        <strong>${escapeHtml(poi.name)}</strong>
        <span>${escapeHtml(poi.address || "暂无地址")}</span>
        <span>${formatDistance(poi.distance)}</span>
      </button>
      <button class="route-button" type="button">路线</button>
    `;

    card.querySelector(".result-main").addEventListener("click", () => selectPoi(poi));
    card.querySelector(".route-button").addEventListener("click", () => startNavigation(poi));
    fragment.appendChild(card);
  });

  els.resultList.appendChild(fragment);
};

const renderPoiDetail = (poi) => {
  els.drawerEyebrow.textContent = "地点详情";
  els.resultTitle.textContent = poi.name;
  els.resultCount.textContent = formatDistance(poi.distance);
  els.resultList.className = "result-list detail-mode";
  els.resultList.innerHTML = `
    <article class="poi-detail">
      <div class="poi-detail-main">
        <strong>${escapeHtml(poi.name)}</strong>
        <span>${escapeHtml(poi.address || "暂无地址")}</span>
        <span>${formatDistance(poi.distance)} · ${escapeHtml(poi.type || "公共厕所")}</span>
      </div>
      <div class="detail-actions">
        <button id="detailRouteButton" class="route-button large" type="button">路线</button>
        <button id="backToResultsButton" class="ghost-button" type="button">返回结果</button>
      </div>
    </article>
  `;

  document.querySelector("#detailRouteButton").addEventListener("click", () => startNavigation(poi));
  document.querySelector("#backToResultsButton").addEventListener("click", () => {
    selectedPoiId = "";
    updateMarkerSelection();
    renderPois(currentPois);
    fitAllMarkers();
    setStatus("已更新", "ready");
  });
};

const renderRouteSummary = (poi, route) => {
  els.drawerEyebrow.textContent = "步行导航";
  els.resultTitle.textContent = poi.name;
  els.resultCount.textContent = formatDuration(route.duration);
  els.resultList.className = "result-list detail-mode";
  els.resultList.innerHTML = `
    <article class="route-summary">
      <strong>${formatDistance(route.distance)} · ${formatDuration(route.duration)}</strong>
      <span>${escapeHtml(poi.address || "暂无地址")}</span>
      <button id="backToDetailButton" class="ghost-button" type="button">返回详情</button>
    </article>
  `;

  document.querySelector("#backToDetailButton").addEventListener("click", () => {
    clearRoute();
    renderPoiDetail(poi);
    updateMarkerSelection();
    setStatus("已选择", "ready");
  });
};

const renderRouteError = (poi, message) => {
  els.drawerEyebrow.textContent = "步行导航";
  els.resultTitle.textContent = poi.name;
  els.resultCount.textContent = "!";
  els.resultList.className = "result-list detail-mode";
  els.resultList.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
};

const renderEmpty = (message) => {
  els.drawerEyebrow.textContent = "结果";
  els.resultTitle.textContent = "等待搜索";
  els.resultCount.textContent = "0";
  els.resultList.className = "result-list";
  els.resultList.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
};

const fitAllMarkers = () => {
  const overlays = [userMarker, routePolyline, ...toiletMarkers].filter(Boolean);
  if (map && overlays.length) {
    map.setFitView(overlays, false, [110, 70, 250, 70]);
  }
};

const getPoiKey = (poi) => poi.id || `${poi.location?.lng},${poi.location?.lat},${poi.name}`;

const setMarkerZIndex = (marker, zIndex) => {
  if (typeof marker.setzIndex === "function") {
    marker.setzIndex(zIndex);
    return;
  }
  if (typeof marker.setZIndex === "function") {
    marker.setZIndex(zIndex);
  }
};

const formatDistance = (distance) => {
  const meters = Number(distance);
  if (!Number.isFinite(meters)) return "距离未知";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
};

const formatDuration = (duration) => {
  const seconds = Number(duration);
  if (!Number.isFinite(seconds)) return "未知";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} 分钟`;
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

els.search.addEventListener("click", searchToilets);
els.locate.addEventListener("click", () => locateUser(true));
els.fit.addEventListener("click", fitAllMarkers);
els.config.addEventListener("click", () => els.dialog.showModal());
els.theme.addEventListener("click", toggleTheme);

applyTheme(currentTheme);
renderEmpty("启动后会自动定位并搜索附近公共厕所。");
initMap();

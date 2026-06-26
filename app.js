const els = {
  map: document.querySelector("#map"),
  status: document.querySelector("#statusPill"),
  drawerEyebrow: document.querySelector("#drawerEyebrow"),
  city: document.querySelector("#cityInput"),
  place: document.querySelector("#placeInput"),
  cityButton: document.querySelector("#cityButton"),
  placeButton: document.querySelector("#placeButton"),
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
let baseMarker;
let routePolyline;
let userPosition;
let basePosition;
let baseName = "当前位置";
let selectedCity = "无锡";
let selectedPoiId = "";
let selectedPlaceId = "";
let toiletMarkers = [];
let placeMarkers = [];
let metroOverlays = [];
let currentPois = [];
let currentPlaces = [];
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
      renderEmpty("后端没有配置 AMAP_JS_KEY。请在 03_SourceCode/.env 中填写高德 JS API Key。");
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
      zoom: 12,
      center: [120.31191, 31.49117],
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
    locateUser(false);
  } catch (error) {
    console.error(error);
    setStatus("启动失败", "error");
    renderEmpty(error.message || "地图启动失败，请检查后端服务和 Key 配置。");
  }
};

const locateUser = (searchAfterLocate = false) => {
  if (!geolocation || !map) return;

  setStatus("\u5b9a\u4f4d\u4e2d");
  geolocation.getCurrentPosition((status, result) => {
    if (status !== "complete") {
      setStatus("\u5b9a\u4f4d\u5931\u8d25", "error");
      if (!basePosition) {
        renderEmpty(result?.message || "\u6d4f\u89c8\u5668\u6ca1\u6709\u8fd4\u56de\u5f53\u524d\u4f4d\u7f6e\u3002\u53ef\u4ee5\u5148\u8f93\u5165\u57ce\u5e02\u548c\u5730\u70b9\u4f5c\u4e3a\u57fa\u51c6\u70b9\u3002");
        useCity(true);
      }
      return;
    }

    const position = [result.position.lng, result.position.lat];
    userPosition = position;
    setUserMarker(position);

    if (!basePosition) {
      setBasePoint(position, "\u5f53\u524d\u4f4d\u7f6e", { zoom: 15, loadMetro: true });
    }

    setStatus("\u5df2\u5b9a\u4f4d", "ready");
    if (searchAfterLocate) {
      setBasePoint(position, "\u5f53\u524d\u4f4d\u7f6e", { zoom: 15, loadMetro: true });
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
    zIndex: 240,
  });
  map.add(userMarker);
};

const setBasePoint = (position, name, options = {}) => {
  if (!position || !map) return;
  basePosition = position;
  baseName = name || "已选地点";
  selectedCity = els.city.value.trim() || selectedCity;

  if (baseMarker) {
    baseMarker.setPosition(position);
    baseMarker.setTitle(baseName);
  } else {
    baseMarker = new AMapRef.Marker({
      position,
      content: '<div class="base-marker">我</div>',
      offset: new AMapRef.Pixel(-14, -32),
      title: baseName,
      zIndex: 230,
    });
    map.add(baseMarker);
  }

  map.setCenter(position);
  if (options.zoom) map.setZoom(options.zoom);
  if (options.loadMetro) loadMetroForBase(selectedCity);
};

const useCity = async (silent = false) => {
  const city = els.city.value.trim();
  if (!city) {
    renderEmpty("请先输入城市。");
    return;
  }

  selectedCity = city;
  clearRoute();
  clearToiletMarkers();
  clearPlaceMarkers();
  selectedPoiId = "";
  selectedPlaceId = "";
  currentPois = [];
  currentPlaces = [];
  if (!silent) setStatus("切换城市");

  try {
    const result = await apiGet("/api/places", {
      mode: "city",
      city,
    });
    const cityPlace = result.places?.[0];
    if (!cityPlace) throw new Error("没有找到这个城市的位置");

    const position = getDestinationLocation(cityPlace);
    setBasePoint(position, city, { zoom: 12, loadMetro: true });
    renderEmpty(`已切换到 ${city}。可以在上方输入具体地点，再点击“选地点”。`, {
      title: `${city} 地图`,
      eyebrow: "城市",
    });
    setStatus("已切换", "ready");
  } catch (error) {
    console.error(error);
    setStatus("城市失败", "error");
    renderEmpty(error.message || "城市定位失败，请检查城市名称。");
  }
};

const searchPlaces = async () => {
  const city = els.city.value.trim();
  const keywords = els.place.value.trim();
  if (!city) {
    renderEmpty("请先输入城市。");
    return;
  }
  if (!keywords) {
    renderEmpty("请输入要作为基准点的小区、商场、地铁站或地址。");
    return;
  }

  selectedCity = city;
  clearRoute();
  clearToiletMarkers();
  selectedPoiId = "";
  selectedPlaceId = "";
  setStatus("找地点");
  els.placeButton.disabled = true;

  try {
    const result = await apiGet("/api/places", {
      city,
      keywords,
      limit: 10,
    });
    currentPlaces = result.places || [];
    renderPlaces(currentPlaces);
    drawPlaceMarkers(currentPlaces);
    fitAllMarkers();
    setStatus("请选择地点", "ready");
  } catch (error) {
    console.error(error);
    setStatus("地点失败", "error");
    clearPlaceMarkers();
    renderEmpty(error.message || "没有找到这个地点，请换一个关键词。");
  } finally {
    els.placeButton.disabled = false;
  }
};

const searchToilets = async () => {
  if (!basePosition) {
    locateUser(true);
    return;
  }

  clearRoute();
  clearPlaceMarkers();
  selectedPoiId = "";
  selectedPlaceId = "";
  const radius = Number(els.radius.value);
  currentSearchRadius = radius;
  setStatus("搜索中");
  els.search.disabled = true;

  try {
    const result = await apiGet("/api/toilets", {
      lng: basePosition[0],
      lat: basePosition[1],
      radius,
      keywords: "公共厕所",
      limit: 100,
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
  const destination = getDestinationLocation(poi);
  const origin = userPosition || basePosition;
  if (!origin || !destination) return;

  setStatus("规划中");
  try {
    const route = await apiGet("/api/navigation", {
      origin: origin.join(","),
      destination: `${destination[0]},${destination[1]}`,
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

const getDestinationLocation = (target) => {
  if (Array.isArray(target?.location) && target.location.length >= 2) {
    return target.location;
  }
  if (target?.location && Number.isFinite(Number(target.location.lng)) && Number.isFinite(Number(target.location.lat))) {
    return [Number(target.location.lng), Number(target.location.lat)];
  }
  if (Number.isFinite(Number(target?.longitude)) && Number.isFinite(Number(target?.latitude))) {
    return [Number(target.longitude), Number(target.latitude)];
  }
  return null;
};

const getMetroNavigationTarget = (line, station) => ({
  kind: "metro",
  name: station.name,
  address: line.displayName || line.name,
  location: station.location,
  line,
  station,
});

const clearToiletMarkers = () => {
  if (toiletMarkers.length) {
    map.remove(toiletMarkers);
  }
  toiletMarkers = [];
};

const clearPlaceMarkers = () => {
  if (placeMarkers.length) {
    map.remove(placeMarkers);
  }
  placeMarkers = [];
};

const clearRoute = () => {
  if (routePolyline) {
    map.remove(routePolyline);
    routePolyline = null;
  }
};

const clearMetro = () => {
  if (metroOverlays.length) {
    map.remove(metroOverlays);
  }
  metroOverlays = [];
};

const loadMetroForBase = async (cityOverride = "") => {
  if (!basePosition || !map) return;

  try {
    const result = await apiGet("/api/metro/nearby", {
      lng: basePosition[0],
      lat: basePosition[1],
      radius: 20000,
      debugCity: cityOverride || selectedCity,
    });

    if (!result.hasMetro || !result.stations?.length) {
      clearMetro();
      return;
    }

    drawMetro(result.stations);
  } catch (error) {
    console.warn("Metro data unavailable", error);
    clearMetro();
  }
};

const drawMetro = (stations) => {
  clearMetro();
  const overlays = stations
    .map((station) => {
      const position = getDestinationLocation(station);
      if (!position) return null;
      const line = {
        id: station.lineId,
        name: station.lineName,
        displayName: station.lineName,
        color: station.lineColor,
      };
      const marker = new AMapRef.Marker({
        position,
        content: `<div class="metro-station status-${station.toilet}" title="${escapeHtml(station.name)}"></div>`,
        offset: new AMapRef.Pixel(-9, -9),
        title: station.name,
        zIndex: 220,
      });

      marker.on("click", () => renderMetroStationDetail(line, { ...station, location: position }));
      return marker;
    })
    .filter(Boolean);

  metroOverlays = overlays;
  map.add(metroOverlays);
};

const drawPlaceMarkers = (places) => {
  clearPlaceMarkers();
  placeMarkers = places
    .map((place, index) => {
      const position = getDestinationLocation(place);
      if (!position) return null;
      const marker = new AMapRef.Marker({
        position,
        content: '<div class="place-marker">点</div>',
        offset: new AMapRef.Pixel(-14, -14),
        title: place.name,
        zIndex: 150 + index,
      });

      marker.placeId = getPoiKey(place);
      marker.on("click", () => selectPlace(place, { zoom: false }));
      return marker;
    })
    .filter(Boolean);

  map.add(placeMarkers);
  updatePlaceSelection();
};

const drawToiletMarkers = (pois) => {
  clearToiletMarkers();
  toiletMarkers = pois
    .map((poi, index) => {
      const position = getDestinationLocation(poi);
      if (!position) return null;
      const marker = new AMapRef.Marker({
        position,
        content: '<div class="toilet-marker">厕</div>',
        offset: new AMapRef.Pixel(-14, -14),
        title: poi.name,
        zIndex: 100 + index,
      });

      marker.poiId = getPoiKey(poi);
      marker.on("click", () => selectPoi(poi, { zoom: false }));

      return marker;
    })
    .filter(Boolean);

  map.add(toiletMarkers);
  updateMarkerSelection();
};

const drawRoute = (points) => {
  clearRoute();
  if (!points.length) return;

  const path = points
    .map((point) => {
      if (Array.isArray(point)) return point;
      if (Number.isFinite(Number(point.longitude)) && Number.isFinite(Number(point.latitude))) {
        return [Number(point.longitude), Number(point.latitude)];
      }
      return null;
    })
    .filter(Boolean);

  routePolyline = new AMapRef.Polyline({
    path,
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
  const overlays = [userMarker, baseMarker, routePolyline, ...toiletMarkers, ...placeMarkers].filter(Boolean);
  map.setFitView(overlays, false, [110, 70, 250, 70]);
};

const selectPlace = (place, options = {}) => {
  const position = getDestinationLocation(place);
  if (!position) return;

  clearRoute();
  selectedPlaceId = getPoiKey(place);
  setBasePoint(position, place.name, { zoom: options.zoom === false ? null : 16, loadMetro: true });
  renderPlaceDetail(place);
  updatePlaceSelection();
  setStatus("已选地点", "ready");
};

const selectPoi = (poi, options = {}) => {
  const position = getDestinationLocation(poi);
  if (!position) return;

  clearRoute();
  selectedPoiId = getPoiKey(poi);
  map.setCenter(position);
  if (options.zoom !== false) {
    map.setZoom(17);
  }
  renderPoiDetail(poi);
  updateMarkerSelection();
  setStatus("已选择", "ready");
};

const updatePlaceSelection = () => {
  placeMarkers.forEach((marker) => {
    const active = marker.placeId && marker.placeId === selectedPlaceId;
    marker.setContent(`<div class="place-marker${active ? " selected" : ""}">点</div>`);
    setMarkerZIndex(marker, active ? 310 : 150);
  });
};

const updateMarkerSelection = () => {
  toiletMarkers.forEach((marker) => {
    const active = marker.poiId && marker.poiId === selectedPoiId;
    marker.setContent(`<div class="toilet-marker${active ? " selected" : ""}">厕</div>`);
    setMarkerZIndex(marker, active ? 300 : 100);
  });
};

const renderPlaces = (places) => {
  els.drawerEyebrow.textContent = "地点候选";
  els.resultTitle.textContent = els.place.value.trim() || "搜索地点";
  els.resultCount.textContent = String(places.length);
  els.resultList.className = "result-list";
  els.resultList.innerHTML = "";

  if (!places.length) {
    renderEmpty("没有找到地点，请换一个关键词。");
    return;
  }

  const fragment = document.createDocumentFragment();
  places.forEach((place) => {
    const card = document.createElement("article");
    card.className = "result-card place-card";
    card.innerHTML = `
      <button class="result-main" type="button">
        <strong>${escapeHtml(place.name)}</strong>
        <span>${escapeHtml(place.address || place.district || "暂无地址")}</span>
        <span>${escapeHtml(place.type || "地点")}</span>
      </button>
      <button class="route-button" type="button">选定</button>
    `;

    card.querySelector(".result-main").addEventListener("click", () => selectPlace(place));
    card.querySelector(".route-button").addEventListener("click", () => selectPlace(place));
    fragment.appendChild(card);
  });

  els.resultList.appendChild(fragment);
};

const renderPois = (pois) => {
  els.drawerEyebrow.textContent = "厕所";
  els.resultTitle.textContent = `${baseName} · ${formatDistance(currentSearchRadius)} 内`;
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

const renderPlaceDetail = (place) => {
  els.drawerEyebrow.textContent = "基准地点";
  els.resultTitle.textContent = place.name;
  els.resultCount.textContent = "点";
  els.resultList.className = "result-list detail-mode";
  els.resultList.innerHTML = `
    <article class="poi-detail">
      <div class="poi-detail-main">
        <strong>${escapeHtml(place.name)}</strong>
        <span>${escapeHtml(place.address || place.district || "暂无地址")}</span>
        <span>${escapeHtml(place.type || "地点")}</span>
      </div>
      <div class="detail-actions">
        <button id="searchAroundButton" class="route-button large" type="button">查找周围厕所</button>
        <button id="backToPlacesButton" class="ghost-button" type="button">返回候选</button>
      </div>
    </article>
  `;

  document.querySelector("#searchAroundButton").addEventListener("click", searchToilets);
  document.querySelector("#backToPlacesButton").addEventListener("click", () => {
    selectedPlaceId = "";
    updatePlaceSelection();
    renderPlaces(currentPlaces);
    fitAllMarkers();
    setStatus("请选择地点", "ready");
  });
};

const renderPoiDetail = (poi) => {
  els.drawerEyebrow.textContent = "厕所详情";
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
    if (poi.kind === "metro") {
      renderMetroStationDetail(poi.line, poi.station);
    } else {
      renderPoiDetail(poi);
    }
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

const renderMetroStationDetail = (line, station) => {
  const status = getMetroToiletStatus(station.toilet);
  els.drawerEyebrow.textContent = line.displayName || line.name;
  els.resultTitle.textContent = station.name;
  els.resultCount.textContent = status.shortText;
  els.resultList.className = "result-list detail-mode";
  els.resultList.innerHTML = `
    <article class="metro-detail">
      <div class="metro-line-chip" style="--line-color: ${escapeHtml(line.color || "#888888")}">
        <span></span>
        <strong>${escapeHtml(line.displayName || line.name)}</strong>
      </div>
      <div class="metro-status status-${station.toilet}">
        <strong>${escapeHtml(status.text)}</strong>
        <span>${escapeHtml(station.name)} · ${escapeHtml(line.displayName || line.name)}</span>
      </div>
      <div class="detail-actions">
        <button id="metroRouteButton" class="route-button large" type="button">路线</button>
      </div>
    </article>
  `;

  document.querySelector("#metroRouteButton").addEventListener("click", () => {
    startNavigation(getMetroNavigationTarget(line, station));
  });
};

const getMetroToiletStatus = (value) => {
  if (Number(value) === 1) return { shortText: "有", text: "有厕所" };
  if (Number(value) === 0) return { shortText: "无", text: "无厕所" };
  return { shortText: "未知", text: "厕所情况不确定" };
};

const renderEmpty = (message, options = {}) => {
  els.drawerEyebrow.textContent = options.eyebrow || "结果";
  els.resultTitle.textContent = options.title || "等待搜索";
  els.resultCount.textContent = "0";
  els.resultList.className = "result-list";
  els.resultList.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
};

const fitAllMarkers = () => {
  const overlays = [userMarker, baseMarker, routePolyline, ...placeMarkers, ...toiletMarkers].filter(Boolean);
  if (map && overlays.length) {
    map.setFitView(overlays, false, [110, 70, 250, 70]);
  }
};

const getPoiKey = (poi) => poi.id || `${poi.location?.lng || poi.longitude},${poi.location?.lat || poi.latitude},${poi.name}`;

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

els.cityButton.addEventListener("click", () => useCity(false));
els.placeButton.addEventListener("click", searchPlaces);
els.search.addEventListener("click", searchToilets);
els.locate.addEventListener("click", () => locateUser(true));
els.fit.addEventListener("click", fitAllMarkers);
els.config.addEventListener("click", () => els.dialog.showModal());
els.theme.addEventListener("click", toggleTheme);
els.city.addEventListener("keydown", (event) => {
  if (event.key === "Enter") useCity(false);
});
els.place.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchPlaces();
});

applyTheme(currentTheme);
renderEmpty("启动后会默认切换到无锡。也可以手动输入城市，再选择具体地点作为查找厕所的基准点。");
initMap();

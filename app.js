const Core = window.LalemeCore;
const Maps = window.LalemeMaps;

if (!Core || !Maps) throw new Error("网页基础模块加载失败");

const { COORDINATE_SYSTEMS, REGION_MODES } = Core;
const DEFAULT_MAINLAND_CENTER = [104.1954, 35.8617];
const THEME_STORAGE_KEY = "laleme-theme";

const els = {
  map: document.querySelector("#map"),
  status: document.querySelector("#statusPill"),
  drawerEyebrow: document.querySelector("#drawerEyebrow"),
  region: document.querySelector("#regionSelect"),
  city: document.querySelector("#cityInput"),
  overseasCity: document.querySelector("#overseasCitySelect"),
  place: document.querySelector("#placeInput"),
  cityButton: document.querySelector("#cityButton"),
  placeButton: document.querySelector("#placeButton"),
  radius: document.querySelector("#radiusSelect"),
  search: document.querySelector("#searchButton"),
  locate: document.querySelector("#locateButton"),
  metro: document.querySelector("#metroButton"),
  theme: document.querySelector("#themeButton"),
  themeIcon: document.querySelector("#themeIcon"),
  resultTitle: document.querySelector("#resultTitle"),
  resultCount: document.querySelector("#resultCount"),
  resultList: document.querySelector("#resultList"),
};

const state = {
  config: null,
  globalCities: [],
  regionMode: REGION_MODES.MAINLAND,
  mapRegion: "",
  coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
  countryCode: "cn",
  activeOverseasCityId: "",
  selectedCity: "",
  queryCenter: null,
  temporarySelection: null,
  panelBeforeTemporary: "empty",
  userRegionMode: "",
  userCoordinates: {
    [COORDINATE_SYSTEMS.WGS84]: null,
    [COORDINATE_SYSTEMS.GCJ02]: null,
  },
  places: [],
  toilets: [],
  metroStations: [],
  selectedPlaceId: "",
  selectedPoiId: "",
  selectedPoiKind: "",
  currentRadius: Number(els.radius.value),
  panelMode: "empty",
  contextRevision: 0,
  loading: {
    bootstrap: true,
    location: false,
    city: false,
    places: false,
    toilets: false,
    metro: false,
    navigation: false,
  },
  theme: localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light",
};

const requestGate = Core.createRequestGate();
let mapAdapter = null;

const markManualInteraction = () => {
  state.contextRevision += 1;
};

const setStatus = (text, mode = "", detail = "") => {
  els.status.textContent = text;
  els.status.className = `status-pill ${mode}`.trim();
  els.status.title = detail || text;
};

const updateBusyControls = () => {
  const booting = state.loading.bootstrap;
  els.region.disabled = booting;
  els.city.disabled = booting;
  els.overseasCity.disabled = booting;
  els.place.disabled = booting;
  els.radius.disabled = booting;
  els.locate.disabled = booting || state.loading.location;
  els.cityButton.disabled = booting || state.loading.city;
  els.placeButton.disabled = booting || state.loading.places;
  els.search.disabled = booting || state.loading.toilets;
  els.metro.disabled = booting || state.loading.metro;
};

const applyTheme = (theme) => {
  state.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem(THEME_STORAGE_KEY, state.theme);
  const isDark = state.theme === "dark";
  els.theme.title = isDark ? "切换白天版" : "切换夜晚版";
  els.theme.setAttribute("aria-label", els.theme.title);
  els.themeIcon.textContent = isDark ? "☀" : "☾";
  mapAdapter?.setTheme(state.theme);
};

const apiGet = async (path, params = {}) => {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败 ${response.status}`);
  return data;
};

const getActiveOverseasCity = () =>
  state.globalCities.find((city) => city.id === state.activeOverseasCityId) || null;

const updateCityControls = () => {
  const overseas = state.regionMode === REGION_MODES.OVERSEAS;
  els.region.value = state.regionMode;
  els.city.hidden = overseas;
  els.overseasCity.hidden = !overseas;
  els.cityButton.textContent = overseas ? "切换城市" : "切换城市";
  if (!overseas) els.city.value = state.selectedCity || els.city.value;
  if (overseas) els.overseasCity.value = state.activeOverseasCityId;
};

const populateOverseasCities = () => {
  els.overseasCity.innerHTML = '<option value="">选择重点城市</option>';
  state.globalCities.forEach((city) => {
    const option = document.createElement("option");
    option.value = city.id;
    option.textContent = city.nameZh;
    option.title = city.nameLocal || city.nameZh;
    els.overseasCity.appendChild(option);
  });
};

const ensureMap = async (regionMode, center, zoom) => {
  if (mapAdapter && state.mapRegion === regionMode) {
    mapAdapter.setTheme(state.theme);
    mapAdapter.setCenter(center, zoom);
    return;
  }

  mapAdapter?.destroy();
  mapAdapter = null;
  state.mapRegion = "";
  setStatus(regionMode === REGION_MODES.MAINLAND ? "加载高德" : "加载海外地图");

  if (regionMode === REGION_MODES.MAINLAND) {
    mapAdapter = await Maps.createAmapAdapter(els.map, {
      config: state.config,
      center,
      zoom,
      theme: state.theme,
    });
  } else {
    mapAdapter = await Maps.createLeafletAdapter(els.map, {
      tileKey: state.config?.geoapifyMapTileKey,
      center,
      zoom,
      theme: state.theme,
      onTileError: () =>
        showRecoverableError("海外地图瓦片加载失败，请检查网络、Key、来源限制或 Geoapify 配额。"),
    });
  }

  state.mapRegion = regionMode;
  mapAdapter.onMapSelection(handleMapSelection);
  refreshAllMarkerLayers();
};

const markerDescriptor = (position, html, options = {}) => ({
  position,
  html,
  title: options.title || "",
  zIndex: options.zIndex || 100,
  size: options.size || [28, 28],
  anchor: options.anchor || [14, 14],
  onClick: options.onClick,
});

const refreshUserMarker = () => {
  if (!mapAdapter) return;
  const coordinateSystem =
    state.regionMode === REGION_MODES.MAINLAND ? COORDINATE_SYSTEMS.GCJ02 : COORDINATE_SYSTEMS.WGS84;
  const coordinate = state.userRegionMode === state.regionMode ? state.userCoordinates[coordinateSystem] : null;
  mapAdapter.setMarkers(
    "user",
    coordinate
      ? [markerDescriptor([coordinate.longitude, coordinate.latitude], '<div class="user-marker"></div>', { size: [18, 18], anchor: [9, 9], zIndex: 240 })]
      : [],
  );
};

const refreshQueryMarker = () => {
  if (!mapAdapter) return;
  mapAdapter.setMarkers(
    "query",
    state.queryCenter
      ? [
          markerDescriptor(
            [state.queryCenter.longitude, state.queryCenter.latitude],
            '<div class="base-marker">基</div>',
            { title: state.queryCenter.name, size: [30, 30], anchor: [15, 30], zIndex: 230 },
          ),
        ]
      : [],
  );
};

const refreshTemporaryMarker = () => {
  if (!mapAdapter) return;
  mapAdapter.setMarkers(
    "temporary",
    state.temporarySelection
      ? [
          markerDescriptor(
            [state.temporarySelection.longitude, state.temporarySelection.latitude],
            '<div class="temporary-marker">选</div>',
            { title: "临时选点", size: [30, 30], anchor: [15, 30], zIndex: 320 },
          ),
        ]
      : [],
  );
};

const refreshPlaceMarkers = () => {
  if (!mapAdapter) return;
  const markers = state.places
    .map((place, index) => {
      const coordinate = Core.getTargetCoordinate(place, state.coordinateSystem);
      if (!coordinate) return null;
      const active = getPoiKey(place) === state.selectedPlaceId;
      return markerDescriptor(
        [coordinate.longitude, coordinate.latitude],
        `<div class="place-marker${active ? " selected" : ""}">点</div>`,
        {
          title: place.name,
          zIndex: active ? 310 : 150 + index,
          onClick: () => selectPlace(place),
        },
      );
    })
    .filter(Boolean);
  mapAdapter.setMarkers("places", markers);
};

const refreshToiletMarkers = () => {
  if (!mapAdapter) return;
  const markers = state.toilets
    .map((poi, index) => {
      const coordinate = Core.getTargetCoordinate(poi, state.coordinateSystem);
      if (!coordinate) return null;
      const active = state.selectedPoiKind === "toilet" && getPoiKey(poi) === state.selectedPoiId;
      return markerDescriptor(
        [coordinate.longitude, coordinate.latitude],
        `<div class="toilet-marker${active ? " selected" : ""}">厕</div>`,
        {
          title: poi.name,
          zIndex: active ? 300 : 100 + index,
          onClick: () => selectPoi(poi, "toilet", { zoom: false }),
        },
      );
    })
    .filter(Boolean);
  mapAdapter.setMarkers("toilets", markers);
};

const refreshMetroMarkers = () => {
  if (!mapAdapter) return;
  const markers = state.metroStations
    .map((station, index) => {
      const coordinate = Core.getTargetCoordinate(station, state.coordinateSystem);
      if (!coordinate) return null;
      const active = state.selectedPoiKind === "metro" && getPoiKey(station) === state.selectedPoiId;
      return markerDescriptor(
        [coordinate.longitude, coordinate.latitude],
        `<div class="metro-station status-${Number(station.toilet) === 0 ? 0 : Number(station.toilet) === 1 ? 1 : 2}${active ? " selected" : ""}"></div>`,
        {
          title: station.name,
          size: [18, 18],
          anchor: [9, 9],
          zIndex: active ? 305 : 220 + index,
          onClick: () => selectPoi(station, "metro", { zoom: false }),
        },
      );
    })
    .filter(Boolean);
  mapAdapter.setMarkers("metro", markers);
};

const refreshAllMarkerLayers = () => {
  refreshUserMarker();
  refreshQueryMarker();
  refreshTemporaryMarker();
  refreshPlaceMarkers();
  refreshToiletMarkers();
  refreshMetroMarkers();
};

const clearForNewContext = ({ clearQueryCenter = true } = {}) => {
  requestGate.invalidateAll();
  state.loading.places = false;
  state.loading.toilets = false;
  state.loading.metro = false;
  state.loading.navigation = false;
  updateBusyControls();
  if (clearQueryCenter) state.queryCenter = null;
  state.temporarySelection = null;
  state.places = [];
  state.toilets = [];
  state.metroStations = [];
  state.selectedPlaceId = "";
  state.selectedPoiId = "";
  state.selectedPoiKind = "";
  mapAdapter?.clearRoute();
  refreshAllMarkerLayers();
};

const commitQueryCenter = (coordinate, options) => {
  clearForNewContext();
  state.queryCenter = Core.createQueryCenter(coordinate, options);
  state.coordinateSystem = state.queryCenter.coordinateSystem;
  refreshQueryMarker();
  mapAdapter?.setCenter([state.queryCenter.longitude, state.queryCenter.latitude], options.zoom || 16);
};

const getRequestContext = () => Core.buildRequestContext(state.queryCenter, getActiveOverseasCity());

const handleMapSelection = (position) => {
  if (!Array.isArray(position) || position.length < 2) return;
  markManualInteraction();
  state.panelBeforeTemporary = state.panelMode;
  state.temporarySelection = {
    longitude: Number(position[0]),
    latitude: Number(position[1]),
    coordinateSystem: state.coordinateSystem,
  };
  refreshTemporaryMarker();
  renderTemporarySelection();
  setStatus("等待确认", "ready");
};

const confirmTemporarySelection = () => {
  const selection = state.temporarySelection;
  if (!selection) return;
  commitQueryCenter(selection, {
    source: "map-selection",
    name: "地图选点",
    regionMode: state.regionMode,
    coordinateSystem: state.coordinateSystem,
    countryCode: state.countryCode,
    cityId: getActiveOverseasCity()?.id || "",
    zoom: 16,
  });
  renderQueryCenterDetail(state.queryCenter, "地图选点");
  setStatus("已选地点", "ready");
};

const cancelTemporarySelection = () => {
  state.temporarySelection = null;
  refreshTemporaryMarker();
  renderCurrentPanel(state.panelBeforeTemporary);
  setStatus(state.queryCenter ? "已选地点" : "已就绪", "ready");
};

const useCity = async () => {
  if (state.regionMode === REGION_MODES.OVERSEAS) {
    await useOverseasCity(true);
    return;
  }
  markManualInteraction();

  const city = els.city.value.trim();
  if (!city) {
    renderEmpty("请先输入城市。", { title: "请选择城市", eyebrow: "城市" });
    return;
  }

  const { duplicate, token } = requestGate.begin("city", `mainland|${city}`);
  if (duplicate) return;
  state.loading.city = true;
  updateBusyControls();
  setStatus("切换城市");

  try {
    const result = await apiGet("/api/places", { mode: "city", city });
    if (!requestGate.isCurrent(token)) return;
    const cityPlace = result.places?.[0];
    const coordinate = Core.getTargetCoordinate(cityPlace, COORDINATE_SYSTEMS.GCJ02);
    if (!coordinate) throw new Error("没有找到这个城市的位置");
    state.regionMode = REGION_MODES.MAINLAND;
    state.coordinateSystem = COORDINATE_SYSTEMS.GCJ02;
    state.countryCode = "cn";
    state.selectedCity = city;
    state.activeOverseasCityId = "";
    updateCityControls();
    await ensureMap(REGION_MODES.MAINLAND, [coordinate.longitude, coordinate.latitude], 12);
    clearForNewContext();
    renderEmpty(`已切换到 ${city}。请搜索具体地点或在地图上右键/长按选点。`, {
      title: `${city} 地图`,
      eyebrow: "城市",
    });
    setStatus("请先选地点", "ready");
  } catch (error) {
    console.error(error);
    if (requestGate.isCurrent(token)) {
      setStatus("城市失败", "error", error.message);
      showRecoverableError(error.message || "城市定位失败，请检查城市名称。", true);
    }
  } finally {
    if (requestGate.isCurrent(token)) requestGate.finish(token);
    state.loading.city = false;
    updateBusyControls();
  }
};

const useOverseasCity = async (manual = true) => {
  if (manual) markManualInteraction();
  const cityId = els.overseasCity.value;
  const city = state.globalCities.find((item) => item.id === cityId);
  if (!city) {
    renderEmpty("请先选择一个海外重点城市。", { title: "请选择城市", eyebrow: "城市" });
    return;
  }

  state.loading.city = true;
  updateBusyControls();
  setStatus("切换城市");
  try {
    state.regionMode = REGION_MODES.OVERSEAS;
    state.coordinateSystem = COORDINATE_SYSTEMS.WGS84;
    state.countryCode = city.countryCode;
    state.activeOverseasCityId = city.id;
    state.selectedCity = city.nameZh;
    updateCityControls();
    await ensureMap(
      REGION_MODES.OVERSEAS,
      [city.center.longitude, city.center.latitude],
      city.defaultScale || 11,
    );
    clearForNewContext();
    renderEmpty(`已切换到 ${city.nameZh}。请搜索具体地点或在地图上右键/长按选点。`, {
      title: `${city.nameZh} 地图`,
      eyebrow: "城市",
    });
    setStatus("请先选地点", "ready");
  } catch (error) {
    console.error(error);
    setStatus("地图失败", "error", error.message);
    showRecoverableError(error.message || "海外地图加载失败。", true);
  } finally {
    state.loading.city = false;
    updateBusyControls();
  }
};

const handleRegionChange = async () => {
  markManualInteraction();
  const regionMode = els.region.value;
  clearForNewContext();
  if (regionMode === REGION_MODES.OVERSEAS) {
    state.regionMode = REGION_MODES.OVERSEAS;
    state.coordinateSystem = COORDINATE_SYSTEMS.WGS84;
    if (!state.activeOverseasCityId) state.activeOverseasCityId = state.globalCities[0]?.id || "";
    updateCityControls();
    await useOverseasCity(false);
    return;
  }

  state.regionMode = REGION_MODES.MAINLAND;
  state.coordinateSystem = COORDINATE_SYSTEMS.GCJ02;
  state.countryCode = "cn";
  state.activeOverseasCityId = "";
  state.selectedCity = "";
  updateCityControls();
  try {
    await ensureMap(REGION_MODES.MAINLAND, DEFAULT_MAINLAND_CENTER, 4);
    renderEmpty("请输入城市并切换，或者重新定位。城市中心不会直接用于查询。", {
      title: "中国大陆地图",
      eyebrow: "区域",
    });
    setStatus("请先选地点", "ready");
  } catch (error) {
    console.error(error);
    setStatus("地图失败", "error", error.message);
    showRecoverableError(error.message, true);
  }
};

const searchPlaces = async () => {
  markManualInteraction();
  const keywords = els.place.value.trim();
  if (!keywords) {
    renderEmpty("请输入小区、商场、地铁站或地址。", { title: "搜索地点", eyebrow: "地点" });
    return;
  }

  const activeCity = getActiveOverseasCity();
  const city = state.regionMode === REGION_MODES.MAINLAND ? els.city.value.trim() : activeCity?.nameZh || "";
  if (state.regionMode === REGION_MODES.MAINLAND && !city) {
    renderEmpty("请先输入并切换城市。", { title: "请选择城市", eyebrow: "地点" });
    return;
  }
  if (state.regionMode === REGION_MODES.OVERSEAS && !activeCity) {
    renderEmpty("请先选择一个海外重点城市。", { title: "请选择城市", eyebrow: "地点" });
    return;
  }

  const params =
    state.regionMode === REGION_MODES.OVERSEAS
      ? {
          region: REGION_MODES.OVERSEAS,
          coordinateSystem: COORDINATE_SYSTEMS.WGS84,
          countryCode: activeCity.countryCode,
          cityId: activeCity.id,
          city: activeCity.nameZh,
          keywords,
          limit: 10,
        }
      : { city, keywords, limit: 10 };
  const fingerprint = `places|${state.regionMode}|${activeCity?.id || city}|${keywords}`;
  const { duplicate, token } = requestGate.begin("places", fingerprint);
  if (duplicate) return;

  state.loading.places = true;
  updateBusyControls();
  setStatus("找地点");
  try {
    const result = await apiGet("/api/places", params);
    if (!requestGate.isCurrent(token)) return;
    state.places = result.places || [];
    state.selectedPlaceId = "";
    refreshPlaceMarkers();
    renderPlaces(state.places);
    mapAdapter?.fitView(["places"]);
    setStatus(state.places.length ? "请选择地点" : "暂无候选", state.places.length ? "ready" : "");
  } catch (error) {
    console.error(error);
    if (requestGate.isCurrent(token)) {
      setStatus("地点失败", "error", error.message);
      showRecoverableError(error.message || "没有找到这个地点，请换一个关键词。", !state.places.length);
    }
  } finally {
    if (requestGate.isCurrent(token)) {
      requestGate.finish(token);
      state.loading.places = false;
      updateBusyControls();
    }
  }
};

const selectPlace = (place) => {
  markManualInteraction();
  const coordinate = Core.getTargetCoordinate(place, state.coordinateSystem);
  if (!coordinate) return;
  const activeCity = getActiveOverseasCity();
  commitQueryCenter(coordinate, {
    source: "place-search",
    name: place.name,
    regionMode: state.regionMode,
    coordinateSystem: state.coordinateSystem,
    countryCode: state.countryCode || place.countryCode,
    cityId: activeCity?.id || "",
    zoom: 16,
  });
  renderQueryCenterDetail(place, "已选地点");
  setStatus("已选地点", "ready");
};

const searchToilets = async () => {
  if (!state.queryCenter) {
    renderEmpty("请先通过文字搜索或地图右键/长按选择具体地点。", {
      title: "请先选择地点",
      eyebrow: "厕所",
    });
    setStatus("请先选地点", "error");
    return;
  }

  const radius = Number(els.radius.value);
  const context = getRequestContext();
  const fingerprint = Core.buildRequestFingerprint("toilets", state.queryCenter, { radius });
  const { duplicate, token } = requestGate.begin("toilets", fingerprint);
  if (duplicate) return;

  state.loading.toilets = true;
  updateBusyControls();
  setStatus("搜索厕所");
  mapAdapter?.clearRoute();
  try {
    const result = await apiGet("/api/toilets", {
      lng: state.queryCenter.longitude,
      lat: state.queryCenter.latitude,
      radius,
      keywords: "公共厕所",
      limit: 100,
      ...context,
    });
    if (!requestGate.isCurrent(token)) return;
    state.toilets = result.pois || [];
    state.currentRadius = radius;
    state.selectedPoiId = "";
    state.selectedPoiKind = "";
    refreshToiletMarkers();
    renderPois(state.toilets);
    mapAdapter?.fitView(["query", "toilets"]);
    setStatus(result.partial ? "部分结果" : "已更新", "ready");
  } catch (error) {
    console.error(error);
    if (requestGate.isCurrent(token)) {
      setStatus("搜索失败", "error", error.message);
      showRecoverableError(error.message || "厕所查询失败，请稍后重试。", !state.toilets.length);
    }
  } finally {
    if (requestGate.isCurrent(token)) {
      requestGate.finish(token);
      state.loading.toilets = false;
      updateBusyControls();
    }
  }
};

const searchMetro = async () => {
  if (!state.queryCenter) {
    renderEmpty("请先通过文字搜索或地图右键/长按选择具体地点。", {
      title: "请先选择地点",
      eyebrow: "地铁",
    });
    setStatus("请先选地点", "error");
    return;
  }

  const context = getRequestContext();
  const fingerprint = Core.buildRequestFingerprint("metro", state.queryCenter, { radius: 20000, limit: 10 });
  const { duplicate, token } = requestGate.begin("metro", fingerprint);
  if (duplicate) return;

  state.loading.metro = true;
  updateBusyControls();
  setStatus("查找地铁");
  try {
    const result = await apiGet("/api/metro/nearby", {
      lng: state.queryCenter.longitude,
      lat: state.queryCenter.latitude,
      radius: 20000,
      limit: 10,
      debugCity: state.regionMode === REGION_MODES.MAINLAND ? state.selectedCity : "",
      ...context,
    });
    if (!requestGate.isCurrent(token)) return;
    state.metroStations = result.stations || [];
    state.selectedPoiId = "";
    state.selectedPoiKind = "";
    refreshMetroMarkers();
    renderMetroList(state.metroStations);
    mapAdapter?.fitView(["query", "metro"]);
    setStatus("地铁已更新", "ready");
  } catch (error) {
    console.error(error);
    if (requestGate.isCurrent(token)) {
      setStatus("地铁失败", "error", error.message);
      showRecoverableError(error.message || "地铁查询失败，请稍后重试。", !state.metroStations.length);
    }
  } finally {
    if (requestGate.isCurrent(token)) {
      requestGate.finish(token);
      state.loading.metro = false;
      updateBusyControls();
    }
  }
};

const getBrowserPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("当前浏览器不支持定位"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          longitude: Number(position.coords.longitude),
          latitude: Number(position.coords.latitude),
          coordinateSystem: COORDINATE_SYSTEMS.WGS84,
        }),
      (error) => reject(new Error(error.message || "浏览器没有返回当前位置")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });

const locateUser = async () => {
  if (state.loading.location) return;
  const locationRevision = state.contextRevision;
  state.loading.location = true;
  updateBusyControls();
  setStatus("定位中");

  try {
    const wgs84 = await getBrowserPosition();
    if (locationRevision !== state.contextRevision) return;
    state.userCoordinates[COORDINATE_SYSTEMS.WGS84] = wgs84;

    if (Core.isMainlandCandidate(wgs84)) {
      const gcj02 = await Maps.convertGpsToGcj(wgs84, state.config);
      if (locationRevision !== state.contextRevision) return;
      const reverse = await apiGet("/api/location/reverse", {
        lng: gcj02.longitude,
        lat: gcj02.latitude,
      });
      if (locationRevision !== state.contextRevision) return;
      if (reverse.countryCode === "cn" || reverse.regionMode === REGION_MODES.MAINLAND) {
        state.userCoordinates[COORDINATE_SYSTEMS.GCJ02] = {
          ...gcj02,
          coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
        };
        state.userRegionMode = REGION_MODES.MAINLAND;
        state.regionMode = REGION_MODES.MAINLAND;
        state.coordinateSystem = COORDINATE_SYSTEMS.GCJ02;
        state.countryCode = "cn";
        state.activeOverseasCityId = "";
        state.selectedCity = reverse.city || reverse.province || "当前位置";
        updateCityControls();
        await ensureMap(REGION_MODES.MAINLAND, [gcj02.longitude, gcj02.latitude], 15);
        commitQueryCenter(gcj02, {
          source: "current-location",
          name: "当前位置",
          regionMode: REGION_MODES.MAINLAND,
          coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
          countryCode: "cn",
          zoom: 15,
        });
        refreshUserMarker();
        setStatus("已定位", "ready");
        await searchToilets();
        return;
      }
    }

    const reverse = await apiGet("/api/location/reverse", {
      lng: wgs84.longitude,
      lat: wgs84.latitude,
      scope: "global",
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
    });
    if (locationRevision !== state.contextRevision) return;
    if (reverse.countryCode === "cn") {
      const gcj02 = await Maps.convertGpsToGcj(wgs84, state.config);
      if (locationRevision !== state.contextRevision) return;
      state.userCoordinates[COORDINATE_SYSTEMS.GCJ02] = {
        ...gcj02,
        coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
      };
      state.userRegionMode = REGION_MODES.MAINLAND;
      state.regionMode = REGION_MODES.MAINLAND;
      state.coordinateSystem = COORDINATE_SYSTEMS.GCJ02;
      state.countryCode = "cn";
      state.activeOverseasCityId = "";
      state.selectedCity = reverse.city || reverse.province || "当前位置";
      updateCityControls();
      await ensureMap(REGION_MODES.MAINLAND, [gcj02.longitude, gcj02.latitude], 15);
      commitQueryCenter(gcj02, {
        source: "current-location",
        name: "当前位置",
        regionMode: REGION_MODES.MAINLAND,
        coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
        countryCode: "cn",
        zoom: 15,
      });
      refreshUserMarker();
      setStatus("已定位", "ready");
      await searchToilets();
      return;
    }

    const matchedCity = state.globalCities.find((city) => city.countryCode === reverse.countryCode) || null;
    state.userRegionMode = REGION_MODES.OVERSEAS;
    state.regionMode = REGION_MODES.OVERSEAS;
    state.coordinateSystem = COORDINATE_SYSTEMS.WGS84;
    state.countryCode = reverse.countryCode;
    state.activeOverseasCityId = matchedCity?.id || "";
    state.selectedCity = reverse.city || reverse.country || "当前位置";
    updateCityControls();
    await ensureMap(REGION_MODES.OVERSEAS, [wgs84.longitude, wgs84.latitude], 15);
    commitQueryCenter(wgs84, {
      source: "current-location",
      name: "当前位置",
      regionMode: REGION_MODES.OVERSEAS,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      countryCode: reverse.countryCode,
      cityId: matchedCity?.id || "",
      zoom: 15,
    });
    refreshUserMarker();
    setStatus("已定位", "ready");
    await searchToilets();
  } catch (error) {
    if (locationRevision !== state.contextRevision) return;
    console.error(error);
    if (!mapAdapter) {
      try {
        await ensureMap(REGION_MODES.MAINLAND, DEFAULT_MAINLAND_CENTER, 4);
      } catch (mapError) {
        console.error(mapError);
      }
    }
    setStatus("定位失败", "error", error.message);
    renderEmpty(`定位失败：${error.message}。仍可选择区域、城市和具体地点。`, {
      title: "请选择地点",
      eyebrow: "定位",
    });
  } finally {
    state.loading.location = false;
    updateBusyControls();
  }
};

const selectPoi = (poi, kind, options = {}) => {
  const coordinate = Core.getTargetCoordinate(poi, state.coordinateSystem);
  if (!coordinate) return;
  mapAdapter?.clearRoute();
  state.selectedPoiId = getPoiKey(poi);
  state.selectedPoiKind = kind;
  if (kind === "metro") refreshMetroMarkers();
  else refreshToiletMarkers();
  mapAdapter?.setCenter([coordinate.longitude, coordinate.latitude], options.zoom === false ? undefined : 17);
  if (kind === "metro") renderMetroStationDetail(poi);
  else renderPoiDetail(poi);
  setStatus("已选择", "ready");
};

const startNavigation = async (target, kind = "toilet") => {
  const destination = Core.getTargetCoordinate(target, state.coordinateSystem);
  if (!destination) return;

  if (destination.coordinateSystem === COORDINATE_SYSTEMS.WGS84 || state.regionMode === REGION_MODES.OVERSEAS) {
    try {
      const url = Core.buildGoogleMapsDirectionsUrl(destination);
      const opened = window.open("about:blank", "_blank");
      if (!opened) throw new Error("浏览器阻止了导航窗口，请允许本站打开新窗口后重试");
      opened.opener = null;
      opened.location.href = url;
      setStatus("已打开导航", "ready");
    } catch (error) {
      console.error(error);
      setStatus("导航失败", "error", error.message);
      showRecoverableError(error.message || "无法打开外部导航。", false);
    }
    return;
  }

  const origin =
    state.userRegionMode === REGION_MODES.MAINLAND && state.userCoordinates[COORDINATE_SYSTEMS.GCJ02]
      ? state.userCoordinates[COORDINATE_SYSTEMS.GCJ02]
      : state.queryCenter;
  if (!origin) return;
  state.loading.navigation = true;
  setStatus("规划中");
  try {
    const route = await apiGet("/api/navigation", {
      origin: `${origin.longitude},${origin.latitude}`,
      destination: `${destination.longitude},${destination.latitude}`,
      type: "walking",
    });
    const points = (route.points || [])
      .map((point) => Core.getTargetCoordinate(point, COORDINATE_SYSTEMS.GCJ02))
      .filter(Boolean)
      .map((point) => [point.longitude, point.latitude]);
    mapAdapter?.drawRoute(points);
    renderRouteSummary(target, route, kind);
    setStatus("路线已生成", "ready");
  } catch (error) {
    console.error(error);
    setStatus("规划失败", "error", error.message);
    renderRouteError(target, error.message || "路线规划失败。", kind);
  } finally {
    state.loading.navigation = false;
  }
};

const renderPlaces = (places) => {
  state.panelMode = "places";
  els.drawerEyebrow.textContent = "地点候选";
  els.resultTitle.textContent = els.place.value.trim() || "搜索地点";
  els.resultCount.textContent = String(places.length);
  els.resultList.className = "result-list";
  els.resultList.innerHTML = "";
  if (!places.length) {
    renderEmpty("没有找到地点，请换一个关键词。", { title: "暂无候选", eyebrow: "地点" });
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

const renderQueryCenterDetail = (target, eyebrow) => {
  state.panelMode = "query";
  const coordinate = Core.getTargetCoordinate(target, state.coordinateSystem) || state.queryCenter;
  els.drawerEyebrow.textContent = eyebrow;
  els.resultTitle.textContent = target.name || state.queryCenter?.name || "已选地点";
  els.resultCount.textContent = "点";
  els.resultList.className = "result-list detail-mode";
  els.resultList.innerHTML = `
    <article class="poi-detail">
      <div class="poi-detail-main">
        <strong>${escapeHtml(target.name || state.queryCenter?.name || "已选地点")}</strong>
        <span>${escapeHtml(target.address || target.district || "已设为查询中心")}</span>
        <span>${coordinate ? `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)} · ${escapeHtml(state.coordinateSystem)}` : ""}</span>
      </div>
      <div class="detail-actions">
        <button id="searchAroundButton" class="route-button large" type="button">查厕所</button>
      </div>
    </article>
  `;
  document.querySelector("#searchAroundButton").addEventListener("click", searchToilets);
};

const renderTemporarySelection = () => {
  state.panelMode = "temporary";
  const selection = state.temporarySelection;
  els.drawerEyebrow.textContent = "地图选点";
  els.resultTitle.textContent = "使用这个位置？";
  els.resultCount.textContent = "点";
  els.resultList.className = "result-list detail-mode";
  els.resultList.innerHTML = `
    <article class="poi-detail">
      <div class="poi-detail-main">
        <strong>临时位置</strong>
        <span>${selection.latitude.toFixed(6)}, ${selection.longitude.toFixed(6)}</span>
        <span>确认后才会替换当前查询中心，不会自动查询。</span>
      </div>
      <div class="detail-actions">
        <button id="confirmMapSelectionButton" class="route-button large" type="button">选这里</button>
        <button id="cancelMapSelectionButton" class="ghost-button" type="button">取消</button>
      </div>
    </article>
  `;
  document.querySelector("#confirmMapSelectionButton").addEventListener("click", confirmTemporarySelection);
  document.querySelector("#cancelMapSelectionButton").addEventListener("click", cancelTemporarySelection);
};

const renderPois = (pois) => {
  state.panelMode = "toilets";
  els.drawerEyebrow.textContent = "厕所";
  els.resultTitle.textContent = `${state.queryCenter?.name || "查询中心"} · ${formatDistance(state.currentRadius)} 内`;
  els.resultCount.textContent = String(pois.length);
  els.resultList.className = "result-list";
  els.resultList.innerHTML = "";
  if (!pois.length) {
    renderEmpty("附近没有搜到公共厕所，可以扩大半径再试。", {
      title: "暂无厕所",
      eyebrow: "厕所",
    });
    return;
  }
  const fragment = document.createDocumentFragment();
  pois.forEach((poi) => {
    const card = document.createElement("article");
    card.className = "result-card";
    const actionText = state.regionMode === REGION_MODES.OVERSEAS ? "导航" : "路线";
    card.innerHTML = `
      <button class="result-main" type="button">
        <strong>${escapeHtml(poi.name)}</strong>
        <span>${escapeHtml(poi.address || "暂无地址")}</span>
        <span>${formatDistance(getPoiDistance(poi))}</span>
      </button>
      <button class="route-button" type="button">${actionText}</button>
    `;
    card.querySelector(".result-main").addEventListener("click", () => selectPoi(poi, "toilet"));
    card.querySelector(".route-button").addEventListener("click", () => startNavigation(poi, "toilet"));
    fragment.appendChild(card);
  });
  els.resultList.appendChild(fragment);
};

const renderMetroList = (stations) => {
  state.panelMode = "metro";
  els.drawerEyebrow.textContent = "地铁";
  els.resultTitle.textContent = "最近地铁站";
  els.resultCount.textContent = String(stations.length);
  els.resultList.className = "result-list";
  els.resultList.innerHTML = "";
  if (!stations.length) {
    renderEmpty("20 km 内没有找到地铁站。", { title: "暂无地铁", eyebrow: "地铁" });
    return;
  }
  const fragment = document.createDocumentFragment();
  stations.forEach((station) => {
    const status = getMetroToiletStatus(station.toilet);
    const statusValue = Number(station.toilet) === 0 ? 0 : Number(station.toilet) === 1 ? 1 : 2;
    const actionText = state.regionMode === REGION_MODES.OVERSEAS ? "导航" : "路线";
    const card = document.createElement("article");
    card.className = "result-card metro-card";
    card.innerHTML = `
      <button class="result-main" type="button">
        <strong>${escapeHtml(station.name)}</strong>
        <span>${escapeHtml(station.lineName || "地铁站")}</span>
        <span class="metro-meta"><i class="status-dot status-${statusValue}"></i>${escapeHtml(status.text)} · ${formatDistance(getPoiDistance(station))}</span>
      </button>
      <button class="route-button" type="button">${actionText}</button>
    `;
    card.querySelector(".result-main").addEventListener("click", () => selectPoi(station, "metro"));
    card.querySelector(".route-button").addEventListener("click", () => startNavigation(station, "metro"));
    fragment.appendChild(card);
  });
  els.resultList.appendChild(fragment);
};

const renderPoiDetail = (poi) => {
  state.panelMode = "toilet-detail";
  const actionText = state.regionMode === REGION_MODES.OVERSEAS ? "导航" : "路线";
  els.drawerEyebrow.textContent = "厕所详情";
  els.resultTitle.textContent = poi.name;
  els.resultCount.textContent = formatDistance(getPoiDistance(poi));
  els.resultList.className = "result-list detail-mode";
  els.resultList.innerHTML = `
    <article class="poi-detail">
      <div class="poi-detail-main">
        <strong>${escapeHtml(poi.name)}</strong>
        <span>${escapeHtml(poi.address || "暂无地址")}</span>
        <span>${formatDistance(getPoiDistance(poi))} · ${escapeHtml(poi.type || "公共厕所")}</span>
      </div>
      <div class="detail-actions">
        <button id="detailRouteButton" class="route-button large" type="button">${actionText}</button>
        <button id="backToResultsButton" class="ghost-button" type="button">返回结果</button>
      </div>
    </article>
  `;
  document.querySelector("#detailRouteButton").addEventListener("click", () => startNavigation(poi, "toilet"));
  document.querySelector("#backToResultsButton").addEventListener("click", () => {
    state.selectedPoiId = "";
    state.selectedPoiKind = "";
    refreshToiletMarkers();
    renderPois(state.toilets);
    mapAdapter?.fitView(["query", "toilets"]);
  });
};

const renderMetroStationDetail = (station) => {
  state.panelMode = "metro-detail";
  const status = getMetroToiletStatus(station.toilet);
  const actionText = state.regionMode === REGION_MODES.OVERSEAS ? "导航" : "路线";
  els.drawerEyebrow.textContent = station.lineName || "地铁站";
  els.resultTitle.textContent = station.name;
  els.resultCount.textContent = status.shortText;
  els.resultList.className = "result-list detail-mode";
  els.resultList.innerHTML = `
    <article class="metro-detail">
      <div class="metro-line-chip" style="--line-color: ${escapeHtml(station.lineColor || "#F59E0B")}">
        <span></span>
        <strong>${escapeHtml(station.lineName || "地铁站")}</strong>
      </div>
      <div class="metro-status status-${Number(station.toilet) === 0 ? 0 : Number(station.toilet) === 1 ? 1 : 2}">
        <strong>${escapeHtml(status.text)}</strong>
        <span>${formatDistance(getPoiDistance(station))} · ${escapeHtml(station.name)}</span>
      </div>
      <div class="detail-actions">
        <button id="metroRouteButton" class="route-button large" type="button">${actionText}</button>
        <button id="backToMetroButton" class="ghost-button" type="button">返回结果</button>
      </div>
    </article>
  `;
  document.querySelector("#metroRouteButton").addEventListener("click", () => startNavigation(station, "metro"));
  document.querySelector("#backToMetroButton").addEventListener("click", () => {
    state.selectedPoiId = "";
    state.selectedPoiKind = "";
    refreshMetroMarkers();
    renderMetroList(state.metroStations);
    mapAdapter?.fitView(["query", "metro"]);
  });
};

const renderRouteSummary = (target, route, kind) => {
  state.panelMode = "route";
  els.drawerEyebrow.textContent = "步行路线";
  els.resultTitle.textContent = target.name;
  els.resultCount.textContent = formatDuration(route.duration);
  els.resultList.className = "result-list detail-mode";
  els.resultList.innerHTML = `
    <article class="route-summary">
      <strong>${formatDistance(route.distance)} · ${formatDuration(route.duration)}</strong>
      <span>${escapeHtml(target.address || target.lineName || "暂无地址")}</span>
      <button id="backToDetailButton" class="ghost-button" type="button">返回详情</button>
    </article>
  `;
  document.querySelector("#backToDetailButton").addEventListener("click", () => {
    mapAdapter?.clearRoute();
    if (kind === "metro") renderMetroStationDetail(target);
    else renderPoiDetail(target);
  });
};

const renderRouteError = (target, message, kind) => {
  state.panelMode = "route-error";
  els.drawerEyebrow.textContent = "步行路线";
  els.resultTitle.textContent = target.name;
  els.resultCount.textContent = "!";
  els.resultList.className = "result-list detail-mode";
  els.resultList.innerHTML = `
    <p class="inline-error">${escapeHtml(message)}</p>
    <button id="backFromRouteError" class="ghost-button" type="button">返回详情</button>
  `;
  document.querySelector("#backFromRouteError").addEventListener("click", () => {
    if (kind === "metro") renderMetroStationDetail(target);
    else renderPoiDetail(target);
  });
};

const renderEmpty = (message, options = {}) => {
  state.panelMode = "empty";
  els.drawerEyebrow.textContent = options.eyebrow || "结果";
  els.resultTitle.textContent = options.title || "等待搜索";
  els.resultCount.textContent = "0";
  els.resultList.className = "result-list";
  els.resultList.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
};

const showRecoverableError = (message, replace = false) => {
  if (replace || !els.resultList.children.length) {
    renderEmpty(message, { title: "暂时不可用", eyebrow: "错误" });
    return;
  }
  els.resultList.querySelector(".inline-error")?.remove();
  const error = document.createElement("p");
  error.className = "inline-error";
  error.textContent = message;
  els.resultList.prepend(error);
};

const renderCurrentPanel = (preferredMode = "") => {
  if (preferredMode === "toilets" && state.toilets.length) return renderPois(state.toilets);
  if (preferredMode === "metro" && state.metroStations.length) return renderMetroList(state.metroStations);
  if (preferredMode === "places" && state.places.length) return renderPlaces(state.places);
  if (state.queryCenter) return renderQueryCenterDetail(state.queryCenter, "查询中心");
  renderEmpty("请先定位，或选择城市和具体地点。", { title: "等待选择", eyebrow: "结果" });
};

const getPoiDistance = (poi) => poi.distanceMeters ?? poi.distance;

const getMetroToiletStatus = (value) => {
  if (Number(value) === 1) return { shortText: "有", text: "有厕所" };
  if (Number(value) === 0) return { shortText: "无", text: "无厕所" };
  return { shortText: "未知", text: "厕所情况不确定" };
};

const getPoiKey = (poi) =>
  poi.id || `${poi.location?.lng ?? poi.longitude},${poi.location?.lat ?? poi.latitude},${poi.name}`;

const formatDistance = (distance) => {
  const meters = Number(distance);
  if (!Number.isFinite(meters)) return "距离未知";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
};

const formatDuration = (duration) => {
  const seconds = Number(duration);
  if (!Number.isFinite(seconds)) return "未知";
  return `${Math.max(1, Math.round(seconds / 60))} 分钟`;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const bootstrap = async () => {
  applyTheme(state.theme);
  updateBusyControls();
  renderEmpty("正在读取配置并获取当前位置。", { title: "启动中", eyebrow: "结果" });
  try {
    const [config, cityResult] = await Promise.all([apiGet("/api/config"), apiGet("/api/global/cities")]);
    state.config = config;
    state.globalCities = cityResult.cities || [];
    populateOverseasCities();
    updateCityControls();
    state.loading.bootstrap = false;
    updateBusyControls();
    await locateUser();
  } catch (error) {
    console.error(error);
    setStatus("启动失败", "error", error.message);
    renderEmpty(error.message || "页面启动失败，请检查后端服务和配置。", {
      title: "启动失败",
      eyebrow: "错误",
    });
  } finally {
    state.loading.bootstrap = false;
    updateBusyControls();
  }
};

els.region.addEventListener("change", handleRegionChange);
els.cityButton.addEventListener("click", useCity);
els.overseasCity.addEventListener("change", () => useOverseasCity(true));
els.placeButton.addEventListener("click", searchPlaces);
els.search.addEventListener("click", searchToilets);
els.locate.addEventListener("click", locateUser);
els.metro.addEventListener("click", searchMetro);
els.theme.addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark"));
els.radius.addEventListener("change", () => {
  state.currentRadius = Number(els.radius.value);
  if (state.queryCenter) searchToilets();
  else {
    setStatus("请先选地点", "error");
    renderEmpty("半径已更新。选择具体地点后才能查询厕所。", {
      title: "请先选择地点",
      eyebrow: "厕所",
    });
  }
});
els.city.addEventListener("keydown", (event) => {
  if (event.key === "Enter") useCity();
});
els.place.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchPlaces();
});

bootstrap();

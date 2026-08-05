(function initLalemeMaps(root) {
  const LEAFLET_VERSION = "1.9.4";
  const LEAFLET_CSS_URL = `./vendor/leaflet/leaflet.css?v=${LEAFLET_VERSION}`;
  const LEAFLET_JS_URL = `./vendor/leaflet/leaflet.js?v=${LEAFLET_VERSION}`;
  const AMAP_STYLES = {
    light: "amap://styles/normal",
    dark: "amap://styles/dark",
  };
  const GEOAPIFY_STYLES = {
    light: "osm-bright",
    dark: "dark-matter",
  };

  let amapPromise;
  let leafletPromise;

  const loadScript = (src, options = {}) =>
    new Promise((resolve, reject) => {
      if (options.ready?.()) {
        resolve();
        return;
      }

      let script = document.querySelector(`script[src="${src}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = src;
        script.async = true;
        if (options.integrity) script.integrity = options.integrity;
        if (options.crossOrigin) script.crossOrigin = options.crossOrigin;
        document.head.appendChild(script);
      }

      const onLoad = () => {
        cleanup();
        if (!options.ready || options.ready()) resolve();
        else reject(new Error(options.errorMessage || "脚本加载后未能初始化"));
      };
      const onError = () => {
        cleanup();
        reject(new Error(options.errorMessage || "脚本加载失败"));
      };
      const cleanup = () => {
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
      };
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
    });

  const loadStyle = (href, integrity = "") =>
    new Promise((resolve, reject) => {
      let link = document.querySelector(`link[href="${href}"]`);
      if (link?.sheet) {
        resolve();
        return;
      }
      if (!link) {
        link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        if (integrity) {
          link.integrity = integrity;
          link.crossOrigin = "anonymous";
        }
        document.head.appendChild(link);
      }
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", () => reject(new Error("Leaflet 样式加载失败")), { once: true });
    });

  const ensureAmapLoaded = async (config) => {
    if (root.AMap && root.AMap.Map) return root.AMap;
    if (!config?.jsKey) throw new Error("后端没有配置 AMAP_JS_KEY");
    if (config.securityJsCode) {
      root._AMapSecurityConfig = { securityJsCode: config.securityJsCode };
    }
    if (!amapPromise) {
      amapPromise = loadScript("https://webapi.amap.com/loader.js", {
        ready: () => Boolean(root.AMapLoader),
        errorMessage: "高德地图加载器加载失败",
      })
        .then(() =>
          root.AMapLoader.load({
            key: config.jsKey,
            version: "2.0",
            plugins: ["AMap.Scale", "AMap.ToolBar"],
          }),
        )
        .catch((error) => {
          amapPromise = null;
          throw error;
        });
    }
    return amapPromise;
  };

  const ensureLeafletLoaded = async () => {
    if (root.L?.map) return root.L;
    if (!leafletPromise) {
      leafletPromise = Promise.all([
        loadStyle(LEAFLET_CSS_URL),
        loadScript(LEAFLET_JS_URL, {
          ready: () => Boolean(root.L?.map),
          errorMessage: "Leaflet 加载失败，请检查网络连接",
        }),
      ])
        .then(() => root.L)
        .catch((error) => {
          leafletPromise = null;
          throw error;
        });
    }
    return leafletPromise;
  };

  const convertGpsToGcj = async (coordinate, config) => {
    const AMap = await ensureAmapLoaded(config);
    return new Promise((resolve, reject) => {
      AMap.convertFrom([coordinate.longitude, coordinate.latitude], "gps", (status, result) => {
        const converted = result?.locations?.[0];
        if (status !== "complete" || !converted) {
          reject(new Error("国内定位坐标转换失败"));
          return;
        }
        resolve({ longitude: Number(converted.getLng()), latitude: Number(converted.getLat()) });
      });
    });
  };

  class AmapAdapter {
    constructor(AMap, container, options) {
      this.AMap = AMap;
      this.container = container;
      this.markerLayers = new Map();
      this.layerCoordinates = new Map();
      this.route = null;
      this.selectionHandler = null;
      this.longPressTimer = null;
      this.longPressStart = null;
      container.innerHTML = "";
      this.map = new AMap.Map(container, {
        zoom: options.zoom || 11,
        center: options.center,
        viewMode: "2D",
        mapStyle: AMAP_STYLES[options.theme] || AMAP_STYLES.light,
      });
      this.map.addControl(new AMap.Scale());
      this.map.addControl(new AMap.ToolBar({ position: "RB" }));
      this.rightClickListener = (event) => {
        if (!this.selectionHandler || !event?.lnglat) return;
        this.selectionHandler([event.lnglat.getLng(), event.lnglat.getLat()]);
      };
      this.map.on("rightclick", this.rightClickListener);
      this.bindLongPress();
    }

    bindLongPress() {
      this.preventContextMenu = (event) => event.preventDefault();
      this.pointerDown = (event) => {
        if (event.pointerType !== "touch") return;
        this.cancelLongPress();
        this.longPressStart = { x: event.clientX, y: event.clientY };
        this.longPressTimer = root.setTimeout(() => {
          const rect = this.container.getBoundingClientRect();
          const pixel = new this.AMap.Pixel(event.clientX - rect.left, event.clientY - rect.top);
          const lnglat = this.map.containerToLngLat(pixel);
          if (this.selectionHandler && lnglat) {
            this.selectionHandler([lnglat.getLng(), lnglat.getLat()]);
          }
          this.cancelLongPress();
        }, 650);
      };
      this.pointerMove = (event) => {
        if (!this.longPressStart) return;
        if (Math.hypot(event.clientX - this.longPressStart.x, event.clientY - this.longPressStart.y) > 12) {
          this.cancelLongPress();
        }
      };
      this.pointerUp = () => this.cancelLongPress();
      this.container.addEventListener("contextmenu", this.preventContextMenu);
      this.container.addEventListener("pointerdown", this.pointerDown);
      this.container.addEventListener("pointermove", this.pointerMove);
      this.container.addEventListener("pointerup", this.pointerUp);
      this.container.addEventListener("pointercancel", this.pointerUp);
    }

    cancelLongPress() {
      if (this.longPressTimer) root.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
      this.longPressStart = null;
    }

    setCenter(position, zoom) {
      this.map.setCenter(position);
      if (zoom) this.map.setZoom(zoom);
    }

    setTheme(theme) {
      this.map.setMapStyle(AMAP_STYLES[theme] || AMAP_STYLES.light);
    }

    setMarkers(layerName, items) {
      this.clearMarkers(layerName);
      const markers = items.map((item) => {
        const marker = new this.AMap.Marker({
          position: item.position,
          content: item.html,
          offset: new this.AMap.Pixel(-(item.anchor?.[0] || 0), -(item.anchor?.[1] || 0)),
          title: item.title || "",
          zIndex: item.zIndex || 100,
        });
        if (item.onClick) marker.on("click", item.onClick);
        return marker;
      });
      if (markers.length) this.map.add(markers);
      this.markerLayers.set(layerName, markers);
      this.layerCoordinates.set(layerName, items.map((item) => item.position));
    }

    clearMarkers(layerName) {
      const markers = this.markerLayers.get(layerName) || [];
      if (markers.length) this.map.remove(markers);
      this.markerLayers.delete(layerName);
      this.layerCoordinates.delete(layerName);
    }

    clearAllMarkers() {
      [...this.markerLayers.keys()].forEach((layerName) => this.clearMarkers(layerName));
    }

    fitView(layerNames) {
      const names = Array.isArray(layerNames) ? layerNames : [...this.markerLayers.keys()];
      const markers = names.flatMap((layerName) => this.markerLayers.get(layerName) || []);
      const overlays = [...markers];
      if (!Array.isArray(layerNames) && this.route) overlays.unshift(this.route);
      if (overlays.length) this.map.setFitView(overlays, false, [110, 70, 250, 70]);
    }

    drawRoute(points) {
      this.clearRoute();
      if (!points.length) return;
      this.route = new this.AMap.Polyline({
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
      this.map.add(this.route);
      this.fitView();
    }

    clearRoute() {
      if (this.route) this.map.remove(this.route);
      this.route = null;
    }

    onMapSelection(handler) {
      this.selectionHandler = handler;
    }

    destroy() {
      this.cancelLongPress();
      this.container.removeEventListener("contextmenu", this.preventContextMenu);
      this.container.removeEventListener("pointerdown", this.pointerDown);
      this.container.removeEventListener("pointermove", this.pointerMove);
      this.container.removeEventListener("pointerup", this.pointerUp);
      this.container.removeEventListener("pointercancel", this.pointerUp);
      this.map.off("rightclick", this.rightClickListener);
      this.clearAllMarkers();
      this.clearRoute();
      this.map.destroy();
      this.container.innerHTML = "";
      this.container.className = "map-surface";
      this.container.removeAttribute("style");
      this.container.removeAttribute("tabindex");
    }
  }

  class LeafletAdapter {
    constructor(L, container, options) {
      this.L = L;
      this.container = container;
      this.tileKey = options.tileKey;
      this.markerLayers = new Map();
      this.layerCoordinates = new Map();
      this.route = null;
      this.tileLayer = null;
      this.tileErrorReported = false;
      this.onTileError = options.onTileError;
      container.innerHTML = "";
      this.map = L.map(container, { zoomControl: true, attributionControl: true });
      this.setTheme(options.theme || "light");
      this.setCenter(options.center, options.zoom || 11);
      this.contextMenuListener = (event) => {
        if (this.selectionHandler) this.selectionHandler([event.latlng.lng, event.latlng.lat]);
      };
      this.map.on("contextmenu", this.contextMenuListener);
      root.setTimeout(() => this.map.invalidateSize(), 0);
    }

    setCenter(position, zoom) {
      this.map.setView([position[1], position[0]], zoom || this.map.getZoom() || 11, { animate: false });
    }

    setTheme(theme) {
      if (this.tileLayer) this.map.removeLayer(this.tileLayer);
      const style = GEOAPIFY_STYLES[theme] || GEOAPIFY_STYLES.light;
      const encodedKey = encodeURIComponent(this.tileKey);
      this.tileErrorReported = false;
      this.tileLayer = this.L.tileLayer(
        `https://maps.geoapify.com/v1/tile/${style}/{z}/{x}/{y}.png?apiKey=${encodedKey}`,
        {
          maxZoom: 20,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors | &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> | <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a>',
        },
      );
      this.tileLayer.on("tileerror", () => {
        if (this.tileErrorReported) return;
        this.tileErrorReported = true;
        this.onTileError?.();
      });
      this.tileLayer.addTo(this.map);
    }

    setMarkers(layerName, items) {
      this.clearMarkers(layerName);
      const group = this.L.layerGroup();
      items.forEach((item) => {
        const size = item.size || [28, 28];
        const anchor = item.anchor || [size[0] / 2, size[1] / 2];
        const icon = this.L.divIcon({
          className: "laleme-leaflet-icon",
          html: item.html,
          iconSize: size,
          iconAnchor: anchor,
        });
        const marker = this.L.marker([item.position[1], item.position[0]], {
          icon,
          title: item.title || "",
          zIndexOffset: item.zIndex || 0,
        });
        if (item.onClick) marker.on("click", item.onClick);
        marker.addTo(group);
      });
      group.addTo(this.map);
      this.markerLayers.set(layerName, group);
      this.layerCoordinates.set(layerName, items.map((item) => item.position));
    }

    clearMarkers(layerName) {
      const group = this.markerLayers.get(layerName);
      if (group) this.map.removeLayer(group);
      this.markerLayers.delete(layerName);
      this.layerCoordinates.delete(layerName);
    }

    clearAllMarkers() {
      [...this.markerLayers.keys()].forEach((layerName) => this.clearMarkers(layerName));
    }

    fitView(layerNames) {
      const names = Array.isArray(layerNames) ? layerNames : [...this.layerCoordinates.keys()];
      const positions = names.flatMap((layerName) => this.layerCoordinates.get(layerName) || []);
      if (!positions.length) return;
      const bounds = this.L.latLngBounds(positions.map((position) => [position[1], position[0]]));
      const leftPadding = root.innerWidth <= 760 ? 24 : 420;
      if (bounds.isValid()) {
        this.map.fitBounds(bounds, {
          paddingTopLeft: [leftPadding, 110],
          paddingBottomRight: [70, 70],
          maxZoom: 17,
        });
      }
    }

    drawRoute(points) {
      this.clearRoute();
      if (!points.length) return;
      this.route = this.L.polyline(
        points.map((point) => [point[1], point[0]]),
        { color: "#2374ab", weight: 7, opacity: 0.92 },
      ).addTo(this.map);
      this.map.fitBounds(this.route.getBounds(), { padding: [70, 70] });
    }

    clearRoute() {
      if (this.route) this.map.removeLayer(this.route);
      this.route = null;
    }

    onMapSelection(handler) {
      this.selectionHandler = handler;
    }

    destroy() {
      this.map.off("contextmenu", this.contextMenuListener);
      this.clearAllMarkers();
      this.clearRoute();
      this.map.remove();
      this.container.innerHTML = "";
      this.container.className = "map-surface";
      this.container.removeAttribute("style");
      this.container.removeAttribute("tabindex");
    }
  }

  const createAmapAdapter = async (container, options) => {
    const AMap = await ensureAmapLoaded(options.config);
    return new AmapAdapter(AMap, container, options);
  };

  const createLeafletAdapter = async (container, options) => {
    if (!options.tileKey) throw new Error("后端没有配置 GEOAPIFY_MAP_TILE_KEY，海外底图暂不可用");
    const L = await ensureLeafletLoaded();
    return new LeafletAdapter(L, container, options);
  };

  root.LalemeMaps = {
    createAmapAdapter,
    createLeafletAdapter,
    convertGpsToGcj,
    ensureAmapLoaded,
    ensureLeafletLoaded,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

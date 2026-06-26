import {
  getCurrentLocation,
  getWalkingRoute,
  loadMetroForLocation,
  LngLat,
  MetroStation,
  PlacePoi,
  reverseLocation,
  searchNearbyToilets,
  searchPlaces,
  ToiletPoi,
} from "../../services/api";
import { TENCENT_MAP_STYLE_DARK, TENCENT_MAP_STYLE_LIGHT, TENCENT_MAP_SUBKEY } from "../../config/api";
import { CITY_GROUPS, RECOMMENDED_CITIES } from "../../data/cities";

type PanelMode = "places" | "toilets" | "metro" | "detail" | "route" | "empty";
type DetailType = "place" | "toilet" | "metro";

interface MarkerLabel {
  content: string;
  color: string;
  fontSize: number;
  bgColor: string;
  borderRadius: number;
  padding: number;
  anchorX: number;
  anchorY: number;
  textAlign: "center";
}

interface MapMarker {
  id: number;
  latitude: number;
  longitude: number;
  width: number;
  height: number;
  iconPath?: string;
  title?: string;
  zIndex?: number;
  label?: MarkerLabel;
}

interface MapPolyline {
  points: LngLat[];
  color: string;
  width: number;
  dottedLine?: boolean;
  arrowLine?: boolean;
}

interface DetailInfo {
  type: DetailType;
  title: string;
  subtitle: string;
  meta: string;
  location: LngLat;
  toiletText?: string;
}

interface PlaceView extends PlacePoi {
  metaText: string;
}

interface ToiletView extends ToiletPoi {
  distanceText: string;
}

interface MetroStationView extends MetroStation {
  toiletText: string;
  statusClass: string;
  distance: number;
  distanceText: string;
}

const TOILET_MARKER_BASE = 10000;
const METRO_MARKER_BASE = 20000;
const PLACE_MARKER_BASE = 30000;
const BASE_MARKER_ID = 40000;

Component({
  data: {
    latitude: 31.49117,
    longitude: 120.31191,
    scale: 12,
    mapSubkey: TENCENT_MAP_SUBKEY,
    mapLayerStyle: TENCENT_MAP_STYLE_LIGHT,
    markers: [] as MapMarker[],
    polyline: [] as MapPolyline[],
    places: [] as PlaceView[],
    toilets: [] as ToiletView[],
    metroStations: [] as MetroStationView[],
    panelMode: "empty" as PanelMode,
    statusText: "启动中",
    cityKeyword: "",
    placeKeyword: "",
    baseName: "",
    radius: 500,
    resultTitle: "等待选择",
    resultCount: "0",
    detail: null as DetailInfo | null,
    routeSummary: "",
    darkMode: false,
    radiusText: "500 m",
    userLocation: null as LngLat | null,
    baseLocation: null as LngLat | null,
    radiusOptions: ["300 m", "500 m", "1 km", "3 km"],
    cityPanelVisible: false,
    recommendedCities: RECOMMENDED_CITIES,
    cityGroups: CITY_GROUPS,
    cityLetters: CITY_GROUPS.map((group) => group.letter),
    activeCityLetter: "A",
    visibleCities: CITY_GROUPS[0].cities,
    metroCity: "",
    metroMessage: "当前城市暂无地铁厕所数据",
  },

  lifetimes: {
    attached() {
      this.bootstrap();
    },
  },

  methods: {
    noop() {},

    async bootstrap() {
      this.setData({ radiusText: this.formatDistance(this.data.radius) });
      try {
        const location = await getCurrentLocation();
        const city = await this.resolveCityByLocation(location);
        this.setData({
          userLocation: location,
          baseLocation: location,
          cityKeyword: city,
          baseName: "\u5f53\u524d\u4f4d\u7f6e",
          latitude: location.latitude,
          longitude: location.longitude,
          scale: 15,
          statusText: "\u5df2\u5b9a\u4f4d",
          resultTitle: "\u5f53\u524d\u4f4d\u7f6e",
          resultCount: "0",
        });
        await this.loadMetro(location, city);
        await this.searchToilets(location);
      } catch (error) {
        console.warn("location unavailable", error);
        this.setData({
          cityPanelVisible: true,
          statusText: "请选择城市",
          panelMode: "empty",
          resultTitle: "请选择城市",
          resultCount: "0",
        });
      }
    },

    async useCity(silent = false) {
      const city = this.data.cityKeyword.trim();
      if (!city) {
        this.showError("请先输入城市");
        return;
      }

      try {
        this.setData({ statusText: "切换城市" });
        const places = await searchPlaces(city, city, "city");
        const cityPlace = places[0];
        if (!cityPlace) throw new Error("没有找到这个城市");

        const baseLocation = this.toLocation(cityPlace);
        this.setData({
          latitude: baseLocation.latitude,
          longitude: baseLocation.longitude,
          scale: 12,
          baseLocation,
          baseName: city,
          places: [],
          toilets: [],
          polyline: [],
          panelMode: "empty",
          resultTitle: `${city} 地图`,
          resultCount: "0",
          statusText: "已切换",
          detail: null,
        });
        await this.loadMetro(baseLocation, city);
        this.refreshMarkers();
        if (!silent) wx.showToast({ title: `已切换到${city}`, icon: "none" });
      } catch (error) {
        this.showError(error);
      }
    },

    async searchPlaceCandidates() {
      const city = this.data.cityKeyword.trim();
      const keywords = this.data.placeKeyword.trim();
      if (!city) {
        this.showError("请先输入城市");
        return;
      }
      if (!keywords) {
        this.showError("请输入小区、商场、地铁站或地址");
        return;
      }

      try {
        this.setData({ statusText: "找地点", polyline: [], toilets: [] });
        const places = this.toPlaceViews(await searchPlaces(city, keywords));
        this.setData({
          places,
          panelMode: places.length ? "places" : "empty",
          resultTitle: keywords,
          resultCount: String(places.length),
          statusText: "请选择地点",
          detail: null,
        });
        this.refreshMarkers();
      } catch (error) {
        this.showError(error);
      }
    },

    async searchToilets(location?: LngLat) {
      const center = location || this.data.baseLocation;
      if (!center) {
        this.showError("请先选择城市或地点");
        return;
      }

      try {
        this.setData({ statusText: "搜索厕所", polyline: [], places: [] });
        const toilets = this.toToiletViews(await searchNearbyToilets(center, this.data.radius));
        this.setData({
          toilets,
          panelMode: toilets.length ? "toilets" : "empty",
          resultTitle: `${this.data.baseName} · ${this.formatDistance(this.data.radius)} 内`,
          resultCount: String(toilets.length),
          statusText: "已更新",
          detail: null,
        });
        this.refreshMarkers();
      } catch (error) {
        this.showError(error);
      }
    },

    async resolveCityByLocation(location: LngLat) {
      try {
        const result = await reverseLocation(location);
        return result.city || "";
      } catch (error) {
        console.warn("city reverse geocode failed", error);
        return "";
      }
    },

    async loadMetro(location?: LngLat, city?: string) {
      try {
        const center = location || this.data.baseLocation || this.getCurrentCenter();
        const result = await loadMetroForLocation(center, city || "");
        const metroStations = this.toMetroViews(result.stations);
        const update: Record<string, unknown> = {
          metroStations,
          metroCity: result.city,
          metroMessage: result.hasMetro ? "该城市地铁数据暂未匹配到站点" : `${result.city || "当前城市"}暂无地铁厕所数据`,
        };
        if (!city && result.city) {
          update.cityKeyword = result.city;
        }
        this.setData(update);
      } catch (error) {
        console.warn("metro load failed", error);
      }
    },

    onCityPickerTap() {
      this.setData({ cityPanelVisible: true });
    },

    onCityPanelClose() {
      this.setData({ cityPanelVisible: false });
    },

    onCityLetterTap(event: any) {
      const letter = String(event.currentTarget.dataset.letter || "A");
      const group = CITY_GROUPS.find((item) => item.letter === letter) || CITY_GROUPS[0];
      this.setData({
        activeCityLetter: group.letter,
        visibleCities: group.cities,
      });
    },

    onCitySelectTap(event: any) {
      const city = String(event.currentTarget.dataset.city || "");
      if (!city) return;
      this.setData({
        cityKeyword: city,
        cityPanelVisible: false,
      });
      this.useCity(false);
    },

    onPlaceInput(event: any) {
      this.setData({ placeKeyword: event.detail.value });
    },

    onCityTap() {
      this.useCity(false);
    },

    onPlaceSearchTap() {
      this.searchPlaceCandidates();
    },

    onSearchTap() {
      this.searchToilets();
    },

    async onLocateTap() {
      try {
        this.setData({ statusText: "定位中" });
        const location = await getCurrentLocation();
        const city = await this.resolveCityByLocation(location);
        this.setData({
          userLocation: location,
          baseLocation: location,
          cityKeyword: city,
          baseName: "当前位置",
          latitude: location.latitude,
          longitude: location.longitude,
          scale: 15,
          statusText: "已定位",
        });
        await this.loadMetro(location, city);
        await this.searchToilets(location);
      } catch (error) {
        this.showError(error);
      }
    },

    onRadiusChange(event: any) {
      const values = [300, 500, 1000, 3000];
      const index = Number(event.detail.value || 0);
      const radius = values[index] || 500;
      this.setData({ radius, radiusText: this.formatDistance(radius) });
      this.searchToilets();
    },

    onThemeTap() {
      const darkMode = !this.data.darkMode;
      this.setData({
        darkMode,
        mapLayerStyle: darkMode ? TENCENT_MAP_STYLE_DARK : TENCENT_MAP_STYLE_LIGHT,
      });
    },

    onShowToiletsTap() {
      this.setData({
        panelMode: this.data.toilets.length ? "toilets" : "empty",
        resultTitle: `${this.data.baseName} · ${this.formatDistance(this.data.radius)} 内`,
        resultCount: String(this.data.toilets.length),
      });
    },

    onShowMetroTap() {
      const metroStations = this.getNearestMetroStations(10);
      this.setData({
        metroStations,
        panelMode: metroStations.length ? "metro" : "empty",
        resultTitle: metroStations.length ? "最近地铁站" : this.data.metroMessage,
        resultCount: String(metroStations.length),
      });
      this.refreshMarkers();
    },

    onMarkerTap(event: any) {
      const markerId = Number(event.detail.markerId);
      if (markerId === BASE_MARKER_ID) return;
      if (markerId >= PLACE_MARKER_BASE) {
        const place = this.data.places[markerId - PLACE_MARKER_BASE];
        if (place) this.selectPlace(place);
        return;
      }
      if (markerId >= METRO_MARKER_BASE) {
        const station = this.data.metroStations[markerId - METRO_MARKER_BASE];
        if (station) this.selectMetroStation(station);
        return;
      }
      if (markerId >= TOILET_MARKER_BASE) {
        const toilet = this.data.toilets[markerId - TOILET_MARKER_BASE];
        if (toilet) this.selectToilet(toilet);
      }
    },

    onPlaceTap(event: any) {
      const index = Number(event.currentTarget.dataset.index);
      const place = this.data.places[index];
      if (place) this.selectPlace(place);
    },

    onPlaceUseTap(event: any) {
      const index = Number(event.currentTarget.dataset.index);
      const place = this.data.places[index];
      if (place) this.selectPlace(place);
    },

    onToiletTap(event: any) {
      const index = Number(event.currentTarget.dataset.index);
      const toilet = this.data.toilets[index];
      if (toilet) this.selectToilet(toilet);
    },

    onToiletRouteTap(event: any) {
      const index = Number(event.currentTarget.dataset.index);
      const toilet = this.data.toilets[index];
      if (!toilet) return;
      this.selectToilet(toilet);
      this.onRouteTap();
    },

    onToiletNavigateTap(event: any) {
      const index = Number(event.currentTarget.dataset.index);
      const toilet = this.data.toilets[index];
      if (!toilet) return;
      this.selectToilet(toilet);
      this.openLocation({
        type: "toilet",
        title: toilet.name,
        subtitle: toilet.address || "暂无地址",
        meta: this.formatDistance(toilet.distance),
        location: this.toLocation(toilet),
      });
    },

    onMetroTap(event: any) {
      const index = Number(event.currentTarget.dataset.index);
      const station = this.data.metroStations[index];
      if (station) this.selectMetroStation(station);
    },

    onMetroRouteTap(event: any) {
      const index = Number(event.currentTarget.dataset.index);
      const station = this.data.metroStations[index];
      if (!station) return;
      this.selectMetroStation(station);
      this.onRouteTap();
    },

    onMetroNavigateTap(event: any) {
      const index = Number(event.currentTarget.dataset.index);
      const station = this.data.metroStations[index];
      if (!station) return;
      this.selectMetroStation(station);
      this.openLocation({
        type: "metro",
        title: station.name,
        subtitle: station.lineName,
        meta: this.getToiletText(station.toilet),
        location: this.toLocation(station),
        toiletText: this.getToiletText(station.toilet),
      });
    },

    selectPlace(place: PlacePoi) {
      const baseLocation = this.toLocation(place);
      this.setData({
        latitude: place.latitude,
        longitude: place.longitude,
        scale: 16,
        baseLocation,
        baseName: place.name,
        panelMode: "detail",
        resultTitle: place.name,
        resultCount: "点",
        detail: {
          type: "place",
          title: place.name,
          subtitle: place.address || "暂无地址",
          meta: place.type || "地点",
          location: baseLocation,
        },
      });
      this.loadMetro(baseLocation, this.data.cityKeyword.trim());
      this.refreshMarkers();
    },

    selectToilet(toilet: ToiletPoi) {
      this.setData({
        latitude: toilet.latitude,
        longitude: toilet.longitude,
        scale: 17,
        panelMode: "detail",
        resultTitle: toilet.name,
        resultCount: this.formatDistance(toilet.distance),
        detail: {
          type: "toilet",
          title: toilet.name,
          subtitle: toilet.address || "暂无地址",
          meta: this.formatDistance(toilet.distance),
          location: this.toLocation(toilet),
        },
      });
    },

    selectMetroStation(station: MetroStation) {
      this.setData({
        latitude: station.latitude,
        longitude: station.longitude,
        scale: 17,
        panelMode: "detail",
        resultTitle: station.name,
        resultCount: this.getToiletShortText(station.toilet),
        detail: {
          type: "metro",
          title: station.name,
          subtitle: station.lineName,
          meta: "地铁站",
          location: this.toLocation(station),
          toiletText: this.getToiletText(station.toilet),
        },
      });
    },

    async onRouteTap() {
      const detail = this.data.detail;
      if (!detail || detail.type === "place") {
        this.searchToilets();
        return;
      }
      const origin = this.data.baseLocation || this.data.userLocation;
      if (!origin) return;

      try {
        const route = await getWalkingRoute(origin, detail.location);
        this.setData({
          polyline: [
            {
              points: route.points,
              color: "#2374abdd",
              width: 7,
              arrowLine: true,
            },
          ],
          panelMode: "route",
          routeSummary: `${this.formatDistance(route.distance)} · ${this.formatDuration(route.duration)}`,
          resultTitle: detail.title,
          resultCount: this.formatDuration(route.duration),
        });
      } catch (error) {
        this.showError(error);
      }
    },

    onNavigateTap() {
      const detail = this.data.detail;
      if (!detail || detail.type === "place") return;
      this.openLocation(detail);
    },

    openLocation(detail: DetailInfo) {
      wx.openLocation({
        latitude: detail.location.latitude,
        longitude: detail.location.longitude,
        scale: 18,
        name: detail.title,
        address: detail.subtitle,
        fail: (error) => this.showError(new Error(error.errMsg || "打开地图失败")),
      });
    },

    onBackTap() {
      this.setData({
        polyline: [],
        panelMode: this.data.toilets.length ? "toilets" : "empty",
        resultTitle: `${this.data.baseName} · ${this.formatDistance(this.data.radius)} 内`,
        resultCount: String(this.data.toilets.length),
      });
    },

    getCurrentCenter(): LngLat {
      return {
        longitude: Number(this.data.longitude),
        latitude: Number(this.data.latitude),
      };
    },
    refreshMarkers() {
      this.setData({
        markers: this.buildMarkers(this.data.places, this.data.toilets, this.data.metroStations, this.data.baseLocation),
      });
    },

    toLocation(item: { longitude: number; latitude: number }): LngLat {
      return { longitude: item.longitude, latitude: item.latitude };
    },

    toPlaceViews(places: PlacePoi[]): PlaceView[] {
      return places.map((place) => ({ ...place, metaText: place.type || "地点" }));
    },

    toToiletViews(toilets: ToiletPoi[]): ToiletView[] {
      return toilets.map((toilet) => ({ ...toilet, distanceText: this.formatDistance(toilet.distance) }));
    },

    toMetroViews(stations: MetroStation[]): MetroStationView[] {
      const origin = this.data.baseLocation || this.data.userLocation || this.getCurrentCenter();
      return stations.map((station) => {
        const distance = this.getDistance(origin, this.toLocation(station));
        return {
          ...station,
          distance,
          distanceText: this.formatDistance(distance),
          toiletText: this.getToiletText(station.toilet),
          statusClass: this.getMetroDotClass(station.toilet),
        };
      });
    },

    getNearestMetroStations(limit = 10): MetroStationView[] {
      const origin = this.data.baseLocation || this.data.userLocation || this.getCurrentCenter();
      return this.data.metroStations
        .map((station) => {
          const distance = this.getDistance(origin, this.toLocation(station));
          return {
            ...station,
            distance,
            distanceText: this.formatDistance(distance),
            toiletText: this.getToiletText(station.toilet),
            statusClass: this.getMetroDotClass(station.toilet),
          };
        })
        .sort((left, right) => left.distance - right.distance)
        .slice(0, limit);
    },

    buildMarkers(places: PlacePoi[], toilets: ToiletPoi[], metroStations: MetroStation[], baseLocation: LngLat | null): MapMarker[] {
      const baseMarker = baseLocation
        ? [
            {
              id: BASE_MARKER_ID,
              longitude: baseLocation.longitude,
              latitude: baseLocation.latitude,
              width: 26,
              height: 26,
              iconPath: "/assets/metro_gray.png",
              title: this.data.baseName,
              zIndex: 200,
              label: this.markerLabel("我", "#2374ab"),
            },
          ]
        : [];

      const placeMarkers = places.map((place, index) => ({
        id: PLACE_MARKER_BASE + index,
        longitude: place.longitude,
        latitude: place.latitude,
        width: 24,
        height: 24,
        iconPath: "/assets/metro_gray.png",
        title: place.name,
        zIndex: 100,
        label: this.markerLabel("点", "#2374ab"),
      }));

      const toiletMarkers = toilets.map((toilet, index) => ({
        id: TOILET_MARKER_BASE + index,
        longitude: toilet.longitude,
        latitude: toilet.latitude,
        width: 30,
        height: 30,
        iconPath: "/assets/marker_toilet.png",
        title: toilet.name,
        zIndex: 80,
      }));

      const metroMarkers = metroStations.map((station, index) => ({
        id: METRO_MARKER_BASE + index,
        longitude: station.longitude,
        latitude: station.latitude,
        width: 20,
        height: 20,
        iconPath: this.getMetroIcon(station.toilet),
        title: station.name,
        zIndex: 120,
      }));

      return [...metroMarkers, ...placeMarkers, ...toiletMarkers, ...baseMarker];
    },

    markerLabel(content: string, bgColor: string): MarkerLabel {
      return {
        content,
        color: "#ffffff",
        fontSize: 12,
        bgColor,
        borderRadius: 10,
        padding: 4,
        anchorX: -9,
        anchorY: -32,
        textAlign: "center",
      };
    },

    getMetroIcon(status: 0 | 1 | 2) {
      if (status === 1) return "/assets/metro_green.png";
      if (status === 0) return "/assets/metro_red.png";
      return "/assets/metro_gray.png";
    },

    getMetroDotClass(status: 0 | 1 | 2) {
      if (status === 1) return "metro-dot-green";
      if (status === 0) return "metro-dot-red";
      return "metro-dot-gray";
    },

    getToiletText(status: 0 | 1 | 2) {
      if (status === 1) return "有厕所";
      if (status === 0) return "无厕所";
      return "厕所情况不确定";
    },

    getToiletShortText(status: 0 | 1 | 2) {
      if (status === 1) return "有";
      if (status === 0) return "无";
      return "未知";
    },

    formatDistance(distance: number) {
      if (distance >= 1000) return `${(distance / 1000).toFixed(1)} km`;
      return `${Math.round(distance)} m`;
    },

    getDistance(from: LngLat, to: LngLat) {
      const rad = Math.PI / 180;
      const earthRadius = 6371000;
      const lat1 = from.latitude * rad;
      const lat2 = to.latitude * rad;
      const deltaLat = (to.latitude - from.latitude) * rad;
      const deltaLng = (to.longitude - from.longitude) * rad;
      const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
      return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    formatDuration(duration: number) {
      return `${Math.max(1, Math.round(duration / 60))} 分钟`;
    },

    showError(error: unknown) {
      const message = error instanceof Error ? error.message : String(error || "操作失败");
      this.setData({ statusText: message, panelMode: "empty", resultTitle: "出错了", resultCount: "!" });
      wx.showToast({ title: message, icon: "none" });
    },
  },
});

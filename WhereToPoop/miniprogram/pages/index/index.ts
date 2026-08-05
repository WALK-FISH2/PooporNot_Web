import {
  CoordinateSystem,
  getCurrentLocation,
  getOverseasCities,
  LngLat,
  loadMetroForLocation,
  MetroStation,
  OverseasCity,
  PlacePoi,
  RegionMode,
  reverseGlobalLocation,
  reverseLocation,
  SearchCenter,
  searchNearbyToilets,
  searchPlaces,
  ToiletPoi,
} from "../../services/api";
import { CITY_GROUPS, RECOMMENDED_CITIES } from "../../data/cities";
import { getMapDisplayCoordinate, getNavigationCoordinate } from "../../utils/coordinates";

type PanelMode = "places" | "toilets" | "metro" | "detail" | "empty";
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

interface MarkerCallout {
  content: string;
  color: string;
  fontSize: number;
  bgColor: string;
  borderRadius: number;
  padding: number;
  display: "ALWAYS";
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
  callout?: MarkerCallout;
}

interface DetailInfo {
  type: DetailType;
  title: string;
  subtitle: string;
  meta: string;
  location: SearchCenter;
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
  distanceText: string;
}

const TOILET_MARKER_BASE = 10000;
const METRO_MARKER_BASE = 20000;
const PLACE_MARKER_BASE = 30000;
const QUERY_CENTER_MARKER_ID = 40000;
const TEMP_SELECTION_MARKER_ID = 50000;
const METRO_RADIUS = 20000;
const METRO_LIMIT = 10;

Component({
  data: {
    latitude: 31.49117,
    longitude: 120.31191,
    scale: 12,
    markers: [] as MapMarker[],
    places: [] as PlaceView[],
    toilets: [] as ToiletView[],
    metroStations: [] as MetroStationView[],
    panelMode: "empty" as PanelMode,
    statusText: "启动中",
    cityKeyword: "",
    placeKeyword: "",
    queryCenterName: "",
    radius: 500,
    resultTitle: "等待定位",
    resultCount: "0",
    detail: null as DetailInfo | null,
    darkMode: false,
    radiusText: "500 m",
    userLocation: null as SearchCenter | null,
    queryCenter: null as SearchCenter | null,
    temporarySelection: null as SearchCenter | null,
    radiusOptions: ["300 m", "500 m", "1 km", "3 km"],
    cityPanelVisible: false,
    cityPanelRegion: "mainland" as RegionMode,
    regionMode: "mainland" as RegionMode,
    recommendedCities: RECOMMENDED_CITIES,
    cityGroups: CITY_GROUPS,
    cityLetters: CITY_GROUPS.map((group) => group.letter),
    activeCityLetter: "A",
    visibleCities: CITY_GROUPS[0].cities,
    overseasCities: [] as OverseasCity[],
    activeOverseasCityId: "",
    warningText: "",
    placeLoading: false,
    toiletLoading: false,
    metroLoading: false,
    placeRequestId: 0,
    toiletRequestId: 0,
    metroRequestId: 0,
    cityRequestId: 0,
    placeRequestFingerprint: "",
    toiletRequestFingerprint: "",
    metroRequestFingerprint: "",
  },

  lifetimes: {
    attached() {
      wx.showShareMenu({
        menus: ["shareAppMessage", "shareTimeline"],
        fail: (error) => console.warn("show share menu failed", error),
      });
      this.bootstrap();
    },
    detached() {
      this.setData({
        placeRequestId: this.data.placeRequestId + 1,
        toiletRequestId: this.data.toiletRequestId + 1,
        metroRequestId: this.data.metroRequestId + 1,
        cityRequestId: this.data.cityRequestId + 1,
      });
    },
  },

  methods: {
    noop() {},

    onShareAppMessage() {
      return {
        title: "拉了么｜快速查找附近厕所",
        path: "/pages/index/index",
        imageUrl: "/assets/share-cover.png",
      };
    },

    onShareTimeline() {
      return {
        title: "拉了么｜快速查找附近厕所",
        query: "",
        imageUrl: "/assets/share-cover.png",
      };
    },

    async bootstrap() {
      this.setData({ radiusText: this.formatDistance(this.data.radius) });
      const citiesPromise = getOverseasCities().catch((error) => {
        console.warn("overseas city config unavailable", error);
        return [] as OverseasCity[];
      });

      try {
        const located = await this.resolveCurrentLocation();
        const overseasCities = await citiesPromise;
        await this.applyLocatedPosition(located.location, located.resolved, overseasCities);
      } catch (error) {
        const overseasCities = await citiesPromise;
        console.warn("location unavailable", error);
        this.setData({
          overseasCities,
          cityPanelVisible: true,
          statusText: "请选择地点",
          panelMode: "empty",
          resultTitle: "未能获取当前位置",
          resultCount: "0",
          queryCenter: null,
        });
        wx.showToast({
          title: "未能获取当前位置，请选择城市、搜索地点或在地图上长按选点",
          icon: "none",
          duration: 3200,
        });
      }
    },

    async resolveCurrentLocation() {
      const gcjLocation = await getCurrentLocation("gcj02");
      if (this.isLikelyMainlandCoordinate(gcjLocation)) {
        try {
          const domesticResolved = await reverseLocation(gcjLocation);
          if (String(domesticResolved.countryCode || "").toLowerCase() === "cn") {
            return { location: gcjLocation, resolved: domesticResolved };
          }
        } catch (error) {
          console.warn("domestic reverse location unavailable", error);
        }
      }

      const wgsLocation = await getCurrentLocation("wgs84");
      const globalResolved = await reverseGlobalLocation(wgsLocation);
      return { location: wgsLocation, resolved: globalResolved };
    },

    isLikelyMainlandCoordinate(location: LngLat) {
      return (
        location.longitude >= 73 &&
        location.longitude <= 135 &&
        location.latitude >= 18 &&
        location.latitude <= 54
      );
    },

    async applyLocatedPosition(location: LngLat, resolved: any, overseasCities: OverseasCity[]) {
      const countryCode = String(resolved.countryCode || "").toLowerCase();
      const mainland = countryCode === "cn";
      const coordinateSystem: CoordinateSystem = mainland ? "GCJ02" : "WGS84";
      const regionMode: RegionMode = mainland ? "mainland" : "overseas";
      const cityName = this.normalizeCityName(resolved.city || resolved.province || resolved.country || "当前位置");
      const matchedCity = mainland ? null : this.findClosestOverseasCity(location, overseasCities);
      const queryCenter: SearchCenter = {
        ...location,
        coordinateSystem,
        countryCode: countryCode || (mainland ? "cn" : ""),
        cityId: matchedCity ? matchedCity.id : String(resolved.cityId || ""),
        source: "current-location",
      };

      this.invalidateQueries();
      this.setData({
        overseasCities,
        userLocation: queryCenter,
        queryCenter,
        temporarySelection: null,
        regionMode,
        cityPanelRegion: regionMode,
        activeOverseasCityId: matchedCity ? matchedCity.id : "",
        cityKeyword: matchedCity ? matchedCity.nameZh : cityName,
        queryCenterName: "当前位置",
        latitude: location.latitude,
        longitude: location.longitude,
        scale: 15,
        places: [],
        toilets: [],
        metroStations: [],
        statusText: "已定位",
        resultTitle: "当前位置",
        resultCount: "0",
        warningText: "",
        detail: null,
      });
      this.refreshMarkers();
      this.syncMapCenter(location);
      await this.searchToilets();
    },

    onCityPickerTap() {
      this.setData({ cityPanelVisible: true, cityPanelRegion: this.data.regionMode });
    },

    onCityPanelClose() {
      this.setData({ cityPanelVisible: false });
    },

    onRegionModeTap(event: any) {
      const region = String(event.currentTarget.dataset.region || "mainland") as RegionMode;
      this.setData({ cityPanelRegion: region });
    },

    onCityLetterTap(event: any) {
      const letter = String(event.currentTarget.dataset.letter || "A");
      const group = CITY_GROUPS.find((item) => item.letter === letter) || CITY_GROUPS[0];
      this.setData({ activeCityLetter: group.letter, visibleCities: group.cities });
    },

    onCitySelectTap(event: any) {
      const city = String(event.currentTarget.dataset.city || "");
      if (city) this.useMainlandCity(city);
    },

    onOverseasCityTap(event: any) {
      const cityId = String(event.currentTarget.dataset.cityId || "");
      const city = this.data.overseasCities.find((item) => item.id === cityId);
      if (!city) return;
      this.invalidateQueries();
      this.setData({
        cityKeyword: city.nameZh,
        cityPanelVisible: false,
        regionMode: "overseas",
        cityPanelRegion: "overseas",
        activeOverseasCityId: city.id,
        latitude: city.center.latitude,
        longitude: city.center.longitude,
        scale: city.defaultScale,
        queryCenter: null,
        queryCenterName: "",
        temporarySelection: null,
        places: [],
        toilets: [],
        metroStations: [],
        panelMode: "empty",
        resultTitle: `${city.nameZh} 地图`,
        resultCount: "0",
        statusText: "请选地点",
        warningText: "",
        detail: null,
      });
      this.refreshMarkers();
      this.syncMapCenter(city.center);
      wx.showToast({ title: `已切换到${city.nameZh}，请先选择地点`, icon: "none" });
    },

    async useMainlandCity(city: string) {
      const requestId = this.data.cityRequestId + 1;
      try {
        this.setData({ statusText: "切换城市", cityRequestId: requestId });
        const places = await searchPlaces(city, city, "city");
        if (requestId !== this.data.cityRequestId) return;
        const cityPlace = places[0];
        if (!cityPlace) throw new Error("没有找到这个城市");
        this.invalidateQueries();
        this.setData({
          cityKeyword: city,
          cityPanelVisible: false,
          regionMode: "mainland",
          cityPanelRegion: "mainland",
          activeOverseasCityId: "",
          latitude: cityPlace.latitude,
          longitude: cityPlace.longitude,
          scale: 12,
          queryCenter: null,
          queryCenterName: "",
          temporarySelection: null,
          places: [],
          toilets: [],
          metroStations: [],
          panelMode: "empty",
          resultTitle: `${city} 地图`,
          resultCount: "0",
          statusText: "请选地点",
          warningText: "",
          detail: null,
        });
        this.refreshMarkers();
        this.syncMapCenter(cityPlace);
        wx.showToast({ title: `已切换到${city}，请先选择地点`, icon: "none" });
      } catch (error) {
        if (requestId === this.data.cityRequestId) this.showError(error);
      }
    },

    onPlaceInput(event: any) {
      this.setData({ placeKeyword: event.detail.value });
    },

    onPlaceSearchTap() {
      this.searchPlaceCandidates();
    },

    async searchPlaceCandidates() {
      const city = this.data.cityKeyword.trim();
      const keywords = this.data.placeKeyword.trim();
      if (!city) return this.showError("请先选择城市");
      if (!keywords) return this.showError("请输入小区、商场、地铁站或地址");
      if (this.data.regionMode === "overseas" && !this.data.activeOverseasCityId) {
        return this.showError("请先从其他地区列表选择城市，再搜索地点");
      }

      const context = this.getRequestContext();
      const fingerprint = [this.data.regionMode, city, keywords, this.data.activeOverseasCityId].join("|");
      if (this.data.placeLoading && this.data.placeRequestFingerprint === fingerprint) return;
      const requestId = this.data.placeRequestId + 1;
      this.setData({
        placeLoading: true,
        placeRequestId: requestId,
        placeRequestFingerprint: fingerprint,
        statusText: "找地点",
      });

      try {
        const places = this.toPlaceViews(
          await searchPlaces(city, keywords, "", {
            ...context,
            cityId: this.data.activeOverseasCityId,
          }),
        );
        if (requestId !== this.data.placeRequestId) return;
        this.setData({
          places,
          panelMode: places.length ? "places" : "empty",
          resultTitle: places.length ? keywords : "当前城市内无匹配地点",
          resultCount: String(places.length),
          statusText: places.length ? "请选择地点" : "无匹配地点",
          detail: null,
          warningText: "",
        });
        this.refreshMarkers();
      } catch (error) {
        if (requestId === this.data.placeRequestId) this.showError(error);
      } finally {
        if (requestId === this.data.placeRequestId) this.setData({ placeLoading: false });
      }
    },

    onSearchTap() {
      this.searchToilets();
    },

    async searchToilets() {
      const center = this.data.queryCenter;
      if (!center) return this.showMissingQueryCenter();
      const fingerprint = [center.longitude, center.latitude, center.coordinateSystem, this.data.radius].join("|");
      if (this.data.toiletLoading && this.data.toiletRequestFingerprint === fingerprint) return;
      const requestId = this.data.toiletRequestId + 1;
      this.setData({
        toiletLoading: true,
        toiletRequestId: requestId,
        toiletRequestFingerprint: fingerprint,
        statusText: "搜索厕所",
      });

      try {
        const result = await searchNearbyToilets(center, this.data.radius, this.getRequestContext(center));
        if (requestId !== this.data.toiletRequestId) return;
        const toilets = this.toToiletViews(result.pois);
        this.setData({
          places: [],
          toilets,
          panelMode: toilets.length ? "toilets" : "empty",
          resultTitle: `${this.data.queryCenterName || "选定地点"} · ${this.formatDistance(this.data.radius)} 内`,
          resultCount: String(toilets.length),
          statusText: "已更新",
          detail: null,
          warningText: result.message || "",
        });
        this.refreshMarkers();
      } catch (error) {
        if (requestId === this.data.toiletRequestId) this.showError(error);
      } finally {
        if (requestId === this.data.toiletRequestId) this.setData({ toiletLoading: false });
      }
    },

    async onShowMetroTap() {
      const center = this.data.queryCenter;
      if (!center) return this.showMissingQueryCenter();
      const fingerprint = [center.longitude, center.latitude, center.coordinateSystem, METRO_RADIUS, METRO_LIMIT].join("|");
      if (this.data.metroLoading && this.data.metroRequestFingerprint === fingerprint) return;
      const requestId = this.data.metroRequestId + 1;
      this.setData({
        metroLoading: true,
        metroRequestId: requestId,
        metroRequestFingerprint: fingerprint,
        statusText: "搜索地铁",
      });

      try {
        const result = await loadMetroForLocation(center, this.data.cityKeyword.trim(), this.getRequestContext(center));
        if (requestId !== this.data.metroRequestId) return;
        const metroStations = this.toMetroViews(result.stations).slice(0, METRO_LIMIT);
        this.setData({
          metroStations,
          panelMode: metroStations.length ? "metro" : "empty",
          resultTitle: metroStations.length ? "最近地铁站" : "20 km 内暂无地铁站",
          resultCount: String(metroStations.length),
          statusText: "已更新",
          detail: null,
          warningText: result.message || "",
        });
        this.refreshMarkers();
      } catch (error) {
        if (requestId === this.data.metroRequestId) this.showError(error);
      } finally {
        if (requestId === this.data.metroRequestId) this.setData({ metroLoading: false });
      }
    },

    async onLocateTap() {
      try {
        this.setData({ statusText: "定位中" });
        const located = await this.resolveCurrentLocation();
        const cities = this.data.overseasCities.length ? this.data.overseasCities : await getOverseasCities();
        await this.applyLocatedPosition(located.location, located.resolved, cities);
      } catch (error) {
        this.showError(error);
      }
    },

    onRadiusChange(event: any) {
      const values = [300, 500, 1000, 3000];
      const index = Number(event.detail.value || 0);
      const radius = values[index] || 500;
      this.setData({ radius, radiusText: this.formatDistance(radius) });
      if (!this.data.queryCenter) {
        this.showMissingQueryCenter();
        return;
      }
      this.searchToilets();
    },

    onThemeTap() {
      const darkMode = !this.data.darkMode;
      this.setData({ darkMode });
    },

    onMapLongPress(event: any) {
      const detail = event.detail || {};
      const longitude = Number(detail.longitude);
      const latitude = Number(detail.latitude);
      if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        this.setTemporaryMapSelection(longitude, latitude);
        return;
      }

      const touches = event.changedTouches || event.touches || [];
      const touch = touches[0];
      if (!touch) return;
      const x = Number(touch.x !== undefined ? touch.x : touch.clientX);
      const y = Number(touch.y !== undefined ? touch.y : touch.clientY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const mapContext: any = wx.createMapContext("mainMap", this);
      mapContext.fromScreenLocation({
        x,
        y,
        success: (result: LngLat) => this.setTemporaryMapSelection(Number(result.longitude), Number(result.latitude)),
        fail: () => this.showError("暂时无法识别这个位置，请再长按一次"),
      });
    },

    setTemporaryMapSelection(longitude: number, latitude: number) {
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
      const city = this.getActiveOverseasCity();
      const currentCountryCode =
        (this.data.queryCenter && this.data.queryCenter.countryCode) ||
        (this.data.userLocation && this.data.userLocation.countryCode) ||
        "";
      const temporarySelection: SearchCenter = {
        longitude,
        latitude,
        coordinateSystem: this.data.regionMode === "mainland" ? "GCJ02" : "WGS84",
        countryCode: this.data.regionMode === "mainland" ? "cn" : city ? city.countryCode : currentCountryCode,
        cityId: this.data.regionMode === "overseas" && city ? city.id : "",
        source: "map-selection",
      };
      this.setData({ temporarySelection, statusText: "点击\"选这里\"确认" });
      this.refreshMarkers();
    },

    onMarkerCalloutTap(event: any) {
      if (Number(event.detail.markerId) === TEMP_SELECTION_MARKER_ID) this.confirmMapSelection();
    },

    confirmMapSelection() {
      const center = this.data.temporarySelection;
      if (!center) return;
      this.commitQueryCenter(center, "地图选点", {
        type: "place",
        title: "地图选点",
        subtitle: "已选定地图上的位置",
        meta: center.coordinateSystem,
        location: center,
      });
    },

    onMarkerTap(event: any) {
      const markerId = Number(event.detail.markerId);
      if (markerId === QUERY_CENTER_MARKER_ID || markerId === TEMP_SELECTION_MARKER_ID) return;
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
      const place = this.data.places[Number(event.currentTarget.dataset.index)];
      if (place) this.selectPlace(place);
    },

    onPlaceUseTap(event: any) {
      const place = this.data.places[Number(event.currentTarget.dataset.index)];
      if (place) this.selectPlace(place);
    },

    onToiletTap(event: any) {
      const toilet = this.data.toilets[Number(event.currentTarget.dataset.index)];
      if (toilet) this.selectToilet(toilet);
    },

    onToiletNavigateTap(event: any) {
      const toilet = this.data.toilets[Number(event.currentTarget.dataset.index)];
      if (!toilet) return;
      const detail = this.toToiletDetail(toilet);
      this.selectToilet(toilet);
      this.openLocation(detail);
    },

    onMetroTap(event: any) {
      const station = this.data.metroStations[Number(event.currentTarget.dataset.index)];
      if (station) this.selectMetroStation(station);
    },

    onMetroNavigateTap(event: any) {
      const station = this.data.metroStations[Number(event.currentTarget.dataset.index)];
      if (!station) return;
      const detail = this.toMetroDetail(station);
      this.selectMetroStation(station);
      this.openLocation(detail);
    },

    selectPlace(place: PlacePoi) {
      const center: SearchCenter = {
        longitude: place.longitude,
        latitude: place.latitude,
        coordinateSystem: place.coordinateSystem,
        countryCode: place.countryCode,
        cityId: this.data.regionMode === "overseas" ? this.data.activeOverseasCityId : "",
        source: "place-search",
      };
      this.commitQueryCenter(center, place.name, {
        type: "place",
        title: place.name,
        subtitle: place.address || "暂无地址",
        meta: place.type || "地点",
        location: center,
      });
    },

    commitQueryCenter(center: SearchCenter, name: string, detail: DetailInfo) {
      this.invalidateQueries();
      this.setData({
        latitude: center.latitude,
        longitude: center.longitude,
        scale: 16,
        queryCenter: center,
        queryCenterName: name,
        temporarySelection: null,
        places: [],
        toilets: [],
        metroStations: [],
        panelMode: "detail",
        resultTitle: name,
        resultCount: "点",
        detail,
        warningText: "",
        statusText: "已选定",
      });
      this.refreshMarkers();
      this.syncMapCenter(center);
    },

    syncMapCenter(location: LngLat) {
      const wxRuntime: any = wx;
      if (typeof wxRuntime.getDeviceInfo === "function") {
        const deviceInfo = wxRuntime.getDeviceInfo();
        if (String(deviceInfo.platform || "").toLowerCase() === "devtools") return;
      }

      setTimeout(() => {
        const mapContext: any = wx.createMapContext("mainMap", this);
        if (!mapContext || typeof mapContext.moveToLocation !== "function") return;
        mapContext.moveToLocation({
          longitude: Number(location.longitude),
          latitude: Number(location.latitude),
          fail: (error: unknown) => console.warn("map viewport refresh failed", error),
        });
      }, 80);
    },

    selectToilet(toilet: ToiletPoi) {
      this.setData({
        latitude: toilet.latitude,
        longitude: toilet.longitude,
        scale: 17,
        panelMode: "detail",
        resultTitle: toilet.name,
        resultCount: this.formatDistance(toilet.distance),
        detail: this.toToiletDetail(toilet),
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
        detail: this.toMetroDetail(station),
      });
    },

    onNavigateTap() {
      const detail = this.data.detail;
      if (detail && detail.type !== "place") this.openLocation(detail);
    },

    openLocation(detail: DetailInfo) {
      const coordinate = getNavigationCoordinate(detail.location);
      wx.openLocation({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        scale: 18,
        name: detail.title,
        address: detail.subtitle,
        fail: (error) => this.showError(new Error(error.errMsg || "打开地图失败")),
      });
    },

    toToiletDetail(toilet: ToiletPoi): DetailInfo {
      return {
        type: "toilet",
        title: toilet.name,
        subtitle: toilet.address || "暂无地址",
        meta: this.formatDistance(toilet.distance),
        location: this.toSearchCenter(toilet, "place-search"),
      };
    },

    toMetroDetail(station: MetroStation): DetailInfo {
      return {
        type: "metro",
        title: station.name,
        subtitle: station.lineName,
        meta: "地铁站",
        location: this.toSearchCenter(station, "place-search"),
        toiletText: this.getToiletText(station.toilet),
      };
    },

    toSearchCenter(
      item: { longitude: number; latitude: number; coordinateSystem: CoordinateSystem; countryCode: string },
      source: "place-search",
    ): SearchCenter {
      return {
        ...getMapDisplayCoordinate(item),
        coordinateSystem: item.coordinateSystem,
        countryCode: item.countryCode,
        cityId: this.data.activeOverseasCityId,
        source,
      };
    },

    getRequestContext(center?: SearchCenter) {
      const queryCenter = center || this.data.queryCenter;
      const activeOverseasCity = this.getActiveOverseasCity();
      const fallbackCoordinateSystem: CoordinateSystem = this.data.regionMode === "mainland" ? "GCJ02" : "WGS84";
      const fallbackCountryCode = this.data.regionMode === "mainland"
        ? "cn"
        : activeOverseasCity
          ? activeOverseasCity.countryCode
          : "";
      return {
        regionMode: this.data.regionMode,
        coordinateSystem: queryCenter ? queryCenter.coordinateSystem : fallbackCoordinateSystem,
        countryCode: queryCenter ? queryCenter.countryCode : fallbackCountryCode,
        cityId: queryCenter ? queryCenter.cityId : activeOverseasCity ? activeOverseasCity.id : this.data.activeOverseasCityId,
      };
    },

    getActiveOverseasCity(): OverseasCity | null {
      return this.data.overseasCities.find((city) => city.id === this.data.activeOverseasCityId) || null;
    },

    findClosestOverseasCity(location: LngLat, cities: OverseasCity[]): OverseasCity | null {
      const nearby = cities
        .map((city) => ({ city, distance: this.getDistance(location, city.center) }))
        .sort((left, right) => left.distance - right.distance)[0];
      return nearby && nearby.distance <= 80000 ? nearby.city : null;
    },

    invalidateQueries() {
      this.setData({
        placeRequestId: this.data.placeRequestId + 1,
        toiletRequestId: this.data.toiletRequestId + 1,
        metroRequestId: this.data.metroRequestId + 1,
        cityRequestId: this.data.cityRequestId + 1,
        placeLoading: false,
        toiletLoading: false,
        metroLoading: false,
      });
    },

    refreshMarkers() {
      this.setData({
        markers: this.buildMarkers(
          this.data.places,
          this.data.toilets,
          this.data.metroStations,
          this.data.queryCenter,
          this.data.temporarySelection,
        ),
      });
    },

    toPlaceViews(places: PlacePoi[]): PlaceView[] {
      return places.map((place) => ({ ...place, metaText: place.type || "地点" }));
    },

    toToiletViews(toilets: ToiletPoi[]): ToiletView[] {
      return toilets.map((toilet) => ({ ...toilet, distanceText: this.formatDistance(toilet.distance) }));
    },

    toMetroViews(stations: MetroStation[]): MetroStationView[] {
      const origin = this.data.queryCenter;
      return stations
        .map((station) => {
          const distance = station.distanceMeters || station.distance || (origin ? this.getDistance(origin, station) : 0);
          return {
            ...station,
            distance,
            distanceMeters: distance,
            distanceText: this.formatDistance(distance),
            toiletText: this.getToiletText(station.toilet),
            statusClass: this.getMetroDotClass(station.toilet),
          };
        })
        .sort((left, right) => left.distance - right.distance);
    },

    buildMarkers(
      places: PlacePoi[],
      toilets: ToiletPoi[],
      metroStations: MetroStation[],
      queryCenter: SearchCenter | null,
      temporarySelection: SearchCenter | null,
    ): MapMarker[] {
      const queryMarkers: MapMarker[] = queryCenter
        ? [
            {
              id: QUERY_CENTER_MARKER_ID,
              ...getMapDisplayCoordinate(queryCenter),
              width: 26,
              height: 26,
              iconPath: "/assets/metro_gray.png",
              title: this.data.queryCenterName,
              zIndex: 200,
              label: this.markerLabel(queryCenter.source === "current-location" ? "我" : "点", "#2374ab"),
            },
          ]
        : [];
      const temporaryMarkers: MapMarker[] = temporarySelection
        ? [
            {
              id: TEMP_SELECTION_MARKER_ID,
              ...getMapDisplayCoordinate(temporarySelection),
              width: 30,
              height: 30,
              iconPath: "/assets/metro_orange.png",
              title: "地图选点",
              zIndex: 240,
              callout: this.selectionCallout(),
            },
          ]
        : [];
      const placeMarkers = places.map((place, index) => ({
        id: PLACE_MARKER_BASE + index,
        ...getMapDisplayCoordinate(place),
        width: 24,
        height: 24,
        iconPath: "/assets/metro_gray.png",
        title: place.name,
        zIndex: 100,
        label: this.markerLabel("点", "#2374ab"),
      }));
      const toiletMarkers = toilets.map((toilet, index) => ({
        id: TOILET_MARKER_BASE + index,
        ...getMapDisplayCoordinate(toilet),
        width: 30,
        height: 30,
        iconPath: "/assets/marker_toilet.png",
        title: toilet.name,
        zIndex: 80,
      }));
      const metroMarkers = metroStations.map((station, index) => ({
        id: METRO_MARKER_BASE + index,
        ...getMapDisplayCoordinate(station),
        width: 20,
        height: 20,
        iconPath: this.getMetroIcon(station.toilet),
        title: station.name,
        zIndex: 120,
      }));
      return [...metroMarkers, ...placeMarkers, ...toiletMarkers, ...queryMarkers, ...temporaryMarkers];
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

    selectionCallout(): MarkerCallout {
      return {
        content: "选这里",
        color: "#ffffff",
        fontSize: 14,
        bgColor: "#17211b",
        borderRadius: 6,
        padding: 8,
        display: "ALWAYS",
        textAlign: "center",
      };
    },

    getMetroIcon(status: 0 | 1 | 2) {
      if (status === 1) return "/assets/metro_green.png";
      if (status === 0) return "/assets/metro_red.png";
      return "/assets/metro_orange.png";
    },

    getMetroDotClass(status: 0 | 1 | 2) {
      if (status === 1) return "metro-dot-green";
      if (status === 0) return "metro-dot-red";
      return "metro-dot-orange";
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

    normalizeCityName(value: string) {
      return String(value || "").replace(/(省|市|自治区|特别行政区)$/u, "");
    },

    showMissingQueryCenter() {
      this.showError("请先搜索地点或在地图上长按选点");
    },

    showError(error: unknown) {
      const message = error instanceof Error ? error.message : String(error || "操作失败");
      this.setData({ statusText: message });
      wx.showToast({ title: message, icon: "none", duration: 2600 });
    },
  },
});

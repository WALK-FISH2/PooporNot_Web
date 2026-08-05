import { API_BASE_URL, DEBUG_METRO_CITY } from "../config/api";

export type CoordinateSystem = "GCJ02" | "WGS84";
export type RegionMode = "mainland" | "overseas";
export type SearchCenterSource = "current-location" | "place-search" | "map-selection";

export interface LngLat {
  longitude: number;
  latitude: number;
}

export interface SearchCenter extends LngLat {
  coordinateSystem: CoordinateSystem;
  countryCode: string;
  cityId: string;
  source: SearchCenterSource;
}

export interface PlacePoi extends LngLat {
  id: string;
  sourceId: string;
  source: "amap" | "geoapify" | "local";
  providerUsed: "amap" | "geoapify" | "local";
  name: string;
  address: string;
  type: string;
  coordinateSystem: CoordinateSystem;
  countryCode: string;
  retrievedAt: string;
}

export interface ToiletPoi extends PlacePoi {
  distance: number;
  distanceMeters: number;
}

export interface MetroStation extends LngLat {
  id: string;
  sourceId: string;
  source: "amap" | "geoapify" | "local";
  providerUsed: "amap" | "geoapify" | "local";
  name: string;
  toilet: 0 | 1 | 2;
  lineId: string;
  lineName: string;
  lineColor: string;
  distance: number;
  distanceMeters: number;
  coordinateSystem: CoordinateSystem;
  countryCode: string;
  retrievedAt: string;
}

export interface QueryMetadata {
  providerUsed: "amap" | "geoapify" | "local";
  isFallback: boolean;
  truncated: boolean;
  rawCount: number;
  displayCount: number;
  messageCode: string;
  message: string;
  coordinateSystem: CoordinateSystem;
  retrievedAt: string;
}

export interface ToiletResult extends QueryMetadata {
  pois: ToiletPoi[];
  radius: number;
  total: number;
  partial: boolean;
}

export interface MetroResult extends QueryMetadata {
  city: string;
  hasMetro: boolean;
  stations: MetroStation[];
}

export interface ReverseLocationResult {
  province: string;
  city: string;
  district: string;
  country: string;
  countryCode: string;
  cityId: string;
  regionMode: RegionMode;
  coordinateSystem: CoordinateSystem;
  providerUsed: "amap" | "geoapify";
  retrievedAt: string;
}

export interface OverseasCity extends LngLat {
  id: string;
  countryCode: string;
  nameZh: string;
  nameLocal: string;
  defaultScale: number;
  center: LngLat;
}

interface RawLocation {
  lng?: number;
  lat?: number;
}

interface RawPoi {
  id?: string;
  sourceId?: string;
  source?: "amap" | "geoapify" | "local";
  providerUsed?: "amap" | "geoapify" | "local";
  name?: string;
  address?: string;
  type?: string;
  distance?: number;
  distanceMeters?: number;
  longitude?: number;
  latitude?: number;
  coordinateSystem?: CoordinateSystem;
  countryCode?: string;
  retrievedAt?: string;
  location?: RawLocation;
}

interface RequestContext {
  regionMode: RegionMode;
  coordinateSystem: CoordinateSystem;
  countryCode: string;
  cityId?: string;
}

interface RawQueryMetadata {
  providerUsed?: "amap" | "geoapify" | "local";
  isFallback?: boolean;
  truncated?: boolean;
  rawCount?: number;
  displayCount?: number;
  messageCode?: string;
  message?: string;
  coordinateSystem?: CoordinateSystem;
  retrievedAt?: string;
}

interface RawMetroResult extends RawQueryMetadata {
  city?: string;
  hasMetro?: boolean;
  stations?: Array<RawPoi & {
    toilet?: number;
    lineId?: string;
    lineName?: string;
    lineColor?: string;
  }>;
}

export const getCurrentLocation = (type: "gcj02" | "wgs84" = "gcj02") =>
  new Promise<LngLat>((resolve, reject) => {
    wx.getLocation({
      type,
      success: (res) => resolve({ longitude: res.longitude, latitude: res.latitude }),
      fail: () => reject(new Error("定位失败，请授权位置信息，或手动选择城市和地点")),
    });
  });

export const getOverseasCities = () =>
  apiRequest<{ cities: Array<Omit<OverseasCity, "longitude" | "latitude">> }>("/api/global/cities", {}).then((res) =>
    res.cities.map((city) => ({
      ...city,
      longitude: city.center.longitude,
      latitude: city.center.latitude,
    })),
  );

export const searchPlaces = (
  city: string,
  keywords: string,
  mode = "",
  context?: RequestContext,
) =>
  apiRequest<{ places: RawPoi[] }>("/api/places", {
    city,
    keywords,
    mode,
    limit: "10",
    region: context ? context.regionMode : "",
    coordinateSystem: context ? context.coordinateSystem : "",
    countryCode: context ? context.countryCode : "",
    cityId: context && context.cityId ? context.cityId : "",
  }).then((res) =>
    res.places
      .map((poi) => toPlacePoi(poi, context ? context.coordinateSystem : "GCJ02", context ? context.countryCode : "cn"))
      .filter(Boolean) as PlacePoi[],
  );

export const reverseGlobalLocation = (location: LngLat) =>
  apiRequest<ReverseLocationResult>("/api/location/reverse", {
    lng: String(location.longitude),
    lat: String(location.latitude),
    scope: "global",
    coordinateSystem: "WGS84",
  });

export const reverseLocation = (location: LngLat) =>
  apiRequest<ReverseLocationResult>("/api/location/reverse", {
    lng: String(location.longitude),
    lat: String(location.latitude),
  });

export const searchNearbyToilets = (location: LngLat, radius: number, context?: RequestContext) =>
  apiRequest<RawQueryMetadata & { pois: RawPoi[]; radius?: number; total?: number; partial?: boolean }>("/api/toilets", {
    lng: String(location.longitude),
    lat: String(location.latitude),
    radius: String(radius),
    keywords: "公共厕所",
    limit: "100",
    region: context ? context.regionMode : "",
    coordinateSystem: context ? context.coordinateSystem : "",
    countryCode: context ? context.countryCode : "",
    cityId: context && context.cityId ? context.cityId : "",
  }).then((res) => {
    const coordinateSystem = res.coordinateSystem || (context ? context.coordinateSystem : "GCJ02");
    const countryCode = context ? context.countryCode : "cn";
    const pois = res.pois
      .map((poi) => toToiletPoi(poi, coordinateSystem, countryCode))
      .filter(Boolean) as ToiletPoi[];
    return {
      ...toMetadata(res, coordinateSystem),
      pois,
      radius: Number(res.radius || radius),
      total: Number(res.total || res.rawCount || pois.length),
      partial: Boolean(res.partial),
    };
  });

export const loadMetroForLocation = (location: LngLat, city = "", context?: RequestContext) =>
  apiRequest<RawMetroResult>("/api/metro/nearby", {
    lng: String(location.longitude),
    lat: String(location.latitude),
    radius: "20000",
    limit: "10",
    debugCity: context && context.regionMode === "mainland" ? city || DEBUG_METRO_CITY : "",
    region: context ? context.regionMode : "",
    coordinateSystem: context ? context.coordinateSystem : "",
    countryCode: context ? context.countryCode : "",
    cityId: context && context.cityId ? context.cityId : "",
  }).then((res) => {
    const coordinateSystem = res.coordinateSystem || (context ? context.coordinateSystem : "GCJ02");
    const countryCode = context ? context.countryCode : "cn";
    const stations = (res.stations || [])
      .map((station) => toMetroStation(station, coordinateSystem, countryCode))
      .filter(Boolean) as MetroStation[];
    return {
      ...toMetadata(res, coordinateSystem),
      city: res.city || city,
      hasMetro: Boolean(res.hasMetro || stations.length),
      stations,
    };
  });

const toPlacePoi = (poi: RawPoi, coordinateSystem: CoordinateSystem, countryCode: string): PlacePoi | null => {
  const location = getPoiLocation(poi);
  if (!location) return null;
  return {
    id: poi.id || `${location.longitude},${location.latitude},${poi.name || "地点"}`,
    sourceId: poi.sourceId || poi.id || `${location.longitude},${location.latitude}`,
    source: poi.source || "amap",
    providerUsed: poi.providerUsed || poi.source || "amap",
    name: poi.name || "地点",
    address: poi.address || "",
    type: poi.type || "地点",
    longitude: location.longitude,
    latitude: location.latitude,
    coordinateSystem: poi.coordinateSystem || coordinateSystem,
    countryCode: poi.countryCode || countryCode,
    retrievedAt: poi.retrievedAt || new Date().toISOString(),
  };
};

const toToiletPoi = (poi: RawPoi, coordinateSystem: CoordinateSystem, countryCode: string): ToiletPoi | null => {
  const place = toPlacePoi(poi, coordinateSystem, countryCode);
  if (!place) return null;
  const distance = Number(poi.distanceMeters !== undefined ? poi.distanceMeters : poi.distance || 0);
  return { ...place, distance, distanceMeters: distance };
};

const toMetroStation = (
  station: RawPoi & { toilet?: number; lineId?: string; lineName?: string; lineColor?: string },
  coordinateSystem: CoordinateSystem,
  countryCode: string,
): MetroStation | null => {
  const place = toPlacePoi(station, coordinateSystem, countryCode);
  if (!place) return null;
  const status = Number(station.toilet);
  const distance = Number(station.distanceMeters !== undefined ? station.distanceMeters : station.distance || 0);
  return {
    id: place.id,
    sourceId: place.sourceId,
    source: place.source,
    providerUsed: place.providerUsed,
    name: place.name,
    toilet: status === 0 || status === 1 || status === 2 ? status : 2,
    longitude: place.longitude,
    latitude: place.latitude,
    lineId: station.lineId || "subway",
    lineName: station.lineName || "地铁站",
    lineColor: station.lineColor || "#F59E0B",
    distance,
    distanceMeters: distance,
    coordinateSystem: place.coordinateSystem,
    countryCode: place.countryCode,
    retrievedAt: place.retrievedAt,
  };
};

const getPoiLocation = (poi: RawPoi): LngLat | null => {
  const location = poi.location || {};
  const rawLongitude = poi.longitude !== undefined && poi.longitude !== null ? poi.longitude : location.lng;
  const rawLatitude = poi.latitude !== undefined && poi.latitude !== null ? poi.latitude : location.lat;
  const longitude = Number(rawLongitude);
  const latitude = Number(rawLatitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { longitude, latitude };
};

const toMetadata = (raw: RawQueryMetadata, coordinateSystem: CoordinateSystem): QueryMetadata => ({
  providerUsed: raw.providerUsed || "amap",
  isFallback: Boolean(raw.isFallback),
  truncated: Boolean(raw.truncated),
  rawCount: Number(raw.rawCount || 0),
  displayCount: Number(raw.displayCount || 0),
  messageCode: raw.messageCode || "",
  message: raw.message || "",
  coordinateSystem: raw.coordinateSystem || coordinateSystem,
  retrievedAt: raw.retrievedAt || new Date().toISOString(),
});

const apiRequest = <T>(path: string, data: Record<string, string>) =>
  new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method: "GET",
      data,
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const body = res.data as { error?: string };
          reject(new Error((body && body.error) || `请求失败 ${res.statusCode}`));
          return;
        }
        resolve(res.data as T);
      },
      fail: (error) => reject(new Error(error.errMsg || "网络请求失败")),
    });
  });

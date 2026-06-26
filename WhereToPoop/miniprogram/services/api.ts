import { API_BASE_URL, DEBUG_METRO_CITY } from "../config/api";

export interface LngLat {
  longitude: number;
  latitude: number;
}

export interface PlacePoi {
  id: string;
  name: string;
  address: string;
  type: string;
  longitude: number;
  latitude: number;
}

export interface ToiletPoi {
  id: string;
  name: string;
  address: string;
  distance: number;
  longitude: number;
  latitude: number;
}

export interface RouteResult {
  distance: number;
  duration: number;
  points: LngLat[];
}

export interface MetroStation {
  name: string;
  toilet: 0 | 1 | 2;
  longitude: number;
  latitude: number;
  lineId: string;
  lineName: string;
  lineColor: string;
}

export interface MetroResult {
  city: string;
  hasMetro: boolean;
  stations: MetroStation[];
}

interface RawLocation {
  lng?: number;
  lat?: number;
}

interface RawPoi {
  id?: string;
  name?: string;
  address?: string;
  type?: string;
  distance?: number;
  longitude?: number;
  latitude?: number;
  location?: RawLocation;
}

export const getCurrentLocation = () =>
  new Promise<LngLat>((resolve, reject) => {
    wx.getLocation({
      type: "gcj02",
      success: (res) => resolve({ longitude: res.longitude, latitude: res.latitude }),
      fail: () => reject(new Error("定位失败，请授权位置信息，或手动选择城市和地点")),
    });
  });

export const searchPlaces = (city: string, keywords: string, mode = "") =>
  apiRequest<{ places: RawPoi[] }>("/api/places", {
    city,
    keywords,
    mode,
    limit: "10",
  }).then((res) => res.places.map(toPlacePoi).filter(Boolean) as PlacePoi[]);

export const searchNearbyToilets = (location: LngLat, radius: number) =>
  apiRequest<{ pois: RawPoi[] }>("/api/toilets", {
    lng: String(location.longitude),
    lat: String(location.latitude),
    radius: String(radius),
    keywords: "公共厕所",
    limit: "100",
  }).then((res) => res.pois.map(toToiletPoi).filter(Boolean) as ToiletPoi[]);

export const getWalkingRoute = (origin: LngLat, destination: LngLat) =>
  apiRequest<RouteResult>("/api/navigation", {
    origin: `${origin.longitude},${origin.latitude}`,
    destination: `${destination.longitude},${destination.latitude}`,
  });

export const loadMetroForLocation = (location: LngLat, city = "") =>
  apiRequest<MetroResult>("/api/metro/nearby", {
    lng: String(location.longitude),
    lat: String(location.latitude),
    debugCity: city || DEBUG_METRO_CITY,
  });

const toPlacePoi = (poi: RawPoi): PlacePoi | null => {
  const location = getPoiLocation(poi);
  if (!location) return null;
  return {
    id: poi.id || `${location.longitude},${location.latitude},${poi.name || "地点"}`,
    name: poi.name || "地点",
    address: poi.address || "",
    type: poi.type || "地点",
    longitude: location.longitude,
    latitude: location.latitude,
  };
};

const toToiletPoi = (poi: RawPoi): ToiletPoi | null => {
  const location = getPoiLocation(poi);
  if (!location) return null;
  return {
    id: poi.id || `${location.longitude},${location.latitude},${poi.name || "公共厕所"}`,
    name: poi.name || "公共厕所",
    address: poi.address || "",
    distance: Number(poi.distance || 0),
    longitude: location.longitude,
    latitude: location.latitude,
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

import { CoordinateSystem, LngLat } from "../services/api";

interface CoordinatePlace extends LngLat {
  coordinateSystem: CoordinateSystem;
}

const isValidCoordinate = (place: CoordinatePlace) =>
  Number.isFinite(place.longitude) &&
  Number.isFinite(place.latitude) &&
  place.longitude >= -180 &&
  place.longitude <= 180 &&
  place.latitude >= -90 &&
  place.latitude <= 90;

export const getMapDisplayCoordinate = (place: CoordinatePlace): LngLat => {
  if (!isValidCoordinate(place)) throw new Error("地点坐标无效");
  return { longitude: place.longitude, latitude: place.latitude };
};

export const getNavigationCoordinate = (place: CoordinatePlace): LngLat => {
  return getMapDisplayCoordinate(place);
};

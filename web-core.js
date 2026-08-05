(function initLalemeCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LalemeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const REGION_MODES = Object.freeze({
    MAINLAND: "mainland",
    OVERSEAS: "overseas",
  });

  const COORDINATE_SYSTEMS = Object.freeze({
    GCJ02: "GCJ02",
    WGS84: "WGS84",
  });

  const isCoordinate = (longitude, latitude) => {
    const lng = Number(longitude);
    const lat = Number(latitude);
    return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
  };

  const getTargetCoordinate = (target, fallbackCoordinateSystem = "") => {
    if (!target) return null;
    let longitude;
    let latitude;

    if (Array.isArray(target.location) && target.location.length >= 2) {
      [longitude, latitude] = target.location;
    } else if (target.location && typeof target.location === "object") {
      longitude = target.location.lng ?? target.location.longitude;
      latitude = target.location.lat ?? target.location.latitude;
    } else {
      longitude = target.longitude;
      latitude = target.latitude;
    }

    if (!isCoordinate(longitude, latitude)) return null;
    return {
      longitude: Number(longitude),
      latitude: Number(latitude),
      coordinateSystem: target.coordinateSystem || fallbackCoordinateSystem || "",
    };
  };

  const createQueryCenter = (coordinate, options = {}) => {
    const normalized = getTargetCoordinate(coordinate, options.coordinateSystem);
    if (!normalized) throw new Error("查询中心坐标无效");
    return {
      ...normalized,
      source: options.source || "map-selection",
      name: options.name || "已选地点",
      regionMode: options.regionMode || REGION_MODES.MAINLAND,
      countryCode: String(options.countryCode || "").toLowerCase(),
      cityId: options.cityId || "",
    };
  };

  const isMainlandCandidate = (coordinate) => {
    const normalized = getTargetCoordinate(coordinate, COORDINATE_SYSTEMS.WGS84);
    if (!normalized) return false;
    return (
      normalized.longitude >= 73.5 &&
      normalized.longitude <= 135.1 &&
      normalized.latitude >= 18 &&
      normalized.latitude <= 53.6
    );
  };

  const buildRequestContext = (queryCenter, activeCity = null) => {
    if (!queryCenter || queryCenter.regionMode !== REGION_MODES.OVERSEAS) return {};
    return {
      region: REGION_MODES.OVERSEAS,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      countryCode: String(queryCenter.countryCode || activeCity?.countryCode || "").toLowerCase(),
      cityId: queryCenter.cityId || activeCity?.id || "",
    };
  };

  const buildRequestFingerprint = (kind, queryCenter, params = {}) => {
    const coordinate = getTargetCoordinate(queryCenter, queryCenter?.coordinateSystem);
    if (!coordinate) return `${kind}|none`;
    const tail = Object.keys(params)
      .sort()
      .map((key) => `${key}:${String(params[key])}`)
      .join("|");
    return [
      kind,
      coordinate.longitude.toFixed(6),
      coordinate.latitude.toFixed(6),
      queryCenter.regionMode || "",
      coordinate.coordinateSystem || "",
      tail,
    ].join("|");
  };

  const createRequestGate = () => {
    let generation = 0;
    let sequence = 0;
    const active = new Map();

    return {
      begin(kind, fingerprint) {
        const current = active.get(kind);
        if (current && current.fingerprint === fingerprint) {
          return { duplicate: true, token: current };
        }
        const token = { kind, fingerprint, generation, sequence: ++sequence };
        active.set(kind, token);
        return { duplicate: false, token };
      },
      finish(token) {
        if (this.isCurrent(token)) active.delete(token.kind);
      },
      invalidateAll() {
        generation += 1;
        active.clear();
      },
      isCurrent(token) {
        const current = token && active.get(token.kind);
        return Boolean(
          current &&
            token.generation === generation &&
            current.sequence === token.sequence &&
            current.fingerprint === token.fingerprint,
        );
      },
    };
  };

  const buildGoogleMapsDirectionsUrl = (target) => {
    const coordinate = getTargetCoordinate(target, COORDINATE_SYSTEMS.WGS84);
    if (!coordinate) throw new Error("导航坐标无效");
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("destination", `${coordinate.latitude},${coordinate.longitude}`);
    url.searchParams.set("travelmode", "walking");
    return url.toString();
  };

  return {
    COORDINATE_SYSTEMS,
    REGION_MODES,
    buildGoogleMapsDirectionsUrl,
    buildRequestContext,
    buildRequestFingerprint,
    createQueryCenter,
    createRequestGate,
    getTargetCoordinate,
    isCoordinate,
    isMainlandCandidate,
  };
});

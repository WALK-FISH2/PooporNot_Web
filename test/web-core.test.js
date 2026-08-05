const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COORDINATE_SYSTEMS,
  REGION_MODES,
  buildGoogleMapsDirectionsUrl,
  buildRequestContext,
  buildRequestFingerprint,
  createQueryCenter,
  createRequestGate,
  isMainlandCandidate,
} = require("../web-core");

test("mainland candidate check only selects the broad China candidate bounds", () => {
  assert.equal(isMainlandCandidate({ longitude: 120.31, latitude: 31.49 }), true);
  assert.equal(isMainlandCandidate({ longitude: 151.21, latitude: -33.87 }), false);
});

test("request context preserves domestic compatibility and adds overseas WGS84 fields", () => {
  const mainland = createQueryCenter(
    { longitude: 120.31, latitude: 31.49 },
    {
      regionMode: REGION_MODES.MAINLAND,
      coordinateSystem: COORDINATE_SYSTEMS.GCJ02,
      countryCode: "cn",
    },
  );
  assert.deepEqual(buildRequestContext(mainland), {});

  const overseas = createQueryCenter(
    { longitude: 151.2083, latitude: -33.8698 },
    {
      regionMode: REGION_MODES.OVERSEAS,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      countryCode: "AU",
    },
  );
  assert.deepEqual(buildRequestContext(overseas, { id: "sydney", countryCode: "au" }), {
    region: "overseas",
    coordinateSystem: "WGS84",
    countryCode: "au",
    cityId: "sydney",
  });
});

test("request gate rejects duplicates and invalidates stale responses", () => {
  const gate = createRequestGate();
  const center = createQueryCenter(
    { longitude: 103.8519, latitude: 1.2899 },
    { regionMode: REGION_MODES.OVERSEAS, coordinateSystem: COORDINATE_SYSTEMS.WGS84 },
  );
  const fingerprint = buildRequestFingerprint("toilets", center, { radius: 500 });
  const first = gate.begin("toilets", fingerprint);
  assert.equal(first.duplicate, false);
  assert.equal(gate.begin("toilets", fingerprint).duplicate, true);
  assert.equal(gate.isCurrent(first.token), true);
  gate.invalidateAll();
  assert.equal(gate.isCurrent(first.token), false);
});

test("Google Maps navigation URL uses the original WGS84 destination", () => {
  const url = new URL(
    buildGoogleMapsDirectionsUrl({
      longitude: 103.8519,
      latitude: 1.2899,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
    }),
  );
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.searchParams.get("destination"), "1.2899,103.8519");
  assert.equal(url.searchParams.get("travelmode"), "walking");
  assert.equal(url.searchParams.has("key"), false);
});

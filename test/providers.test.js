const test = require("node:test");
const assert = require("node:assert/strict");
const { createGeoapifyClient } = require("../lib/providers/geoapify");
const { safeProviderError } = require("../lib/provider-error");

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("Geoapify search applies hard filter and keeps key in backend request only", async () => {
  let requestedUrl = "";
  const client = createGeoapifyClient({
    apiKey: "test-key",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return jsonResponse({ results: [] });
    },
  });
  await client.search({
    text: "Central",
    filter: "rect:-0.6,51.2,0.3,51.8|countrycode:gb",
    bias: "proximity:-0.1276,51.5072",
  });
  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("filter"), "rect:-0.6,51.2,0.3,51.8|countrycode:gb");
  assert.equal(url.searchParams.get("apiKey"), "test-key");
});

test("Geoapify search supports a request-specific timeout", async () => {
  const client = createGeoapifyClient({
    apiKey: "test-key",
    timeoutMs: 1000,
    fetchImpl: async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
  });
  await assert.rejects(
    () => client.search({ text: "slow", timeoutMs: 5 }),
    (error) => error.code === "PROVIDER_TIMEOUT" && error.statusCode === 504,
  );
});

test("Geoapify Places applies subway category, radius and result limit", async () => {
  let requestedUrl = "";
  const client = createGeoapifyClient({
    apiKey: "test-key",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return jsonResponse({ features: [] });
    },
  });
  await client.places({
    category: "public_transport.subway",
    center: { longitude: -0.1, latitude: 51.5 },
    radius: 20000,
    limit: 10,
  });
  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("categories"), "public_transport.subway");
  assert.equal(url.searchParams.get("filter"), "circle:-0.1,51.5,20000");
  assert.equal(url.searchParams.get("limit"), "10");
});

test("Geoapify Places applies toilet category without an Overpass preflight", async () => {
  let requestedUrl = "";
  const client = createGeoapifyClient({
    apiKey: "test-key",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return jsonResponse({ features: [] });
    },
  });
  await client.places({
    category: "amenity.toilet",
    center: { longitude: 139.7, latitude: 35.6 },
    radius: 500,
    limit: 100,
  });
  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("categories"), "amenity.toilet");
  assert.equal(url.searchParams.get("filter"), "circle:139.7,35.6,500");
  assert.equal(url.searchParams.get("limit"), "100");
});

test("provider HTTP 429 is exposed as a retryable typed error", async () => {
  const client = createGeoapifyClient({ apiKey: "test-key", fetchImpl: async () => jsonResponse({}, 429) });
  await assert.rejects(
    () => client.places({ category: "amenity.toilet", center: { longitude: 1, latitude: 1 }, radius: 500 }),
    (error) => error.code === "PROVIDER_RATE_LIMIT" && error.provider === "geoapify" && error.retryable,
  );
});

test("provider diagnostics redact API keys and known secrets", () => {
  const safe = safeProviderError(
    {
      message: "request failed: https://example.test?apiKey=visible&key=also-visible",
      diagnostic: { response: "secret-value" },
    },
    ["secret-value"],
  );
  const serialized = JSON.stringify(safe);
  assert.doesNotMatch(serialized, /visible|also-visible|secret-value/);
  assert.match(serialized, /REDACTED/);
});

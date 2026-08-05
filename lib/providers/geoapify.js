const { fetchJson } = require("../http-json");
const { ProviderError } = require("../provider-error");

function createGeoapifyClient(options) {
  const apiKey = options.apiKey || "";
  const baseUrl = String(options.baseUrl || "https://api.geoapify.com").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs || 8000);

  function requireKey() {
    if (!apiKey) {
      throw new ProviderError("后端缺少 GEOAPIFY_API_KEY", {
        code: "PROVIDER_NOT_CONFIGURED",
        provider: "geoapify",
        statusCode: 503,
      });
    }
  }

  async function request(pathname, params) {
    requireKey();
    const url = new URL(`${baseUrl}${pathname}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    url.searchParams.set("apiKey", apiKey);
    return fetchJson(url, { provider: "geoapify", fetchImpl, timeoutMs });
  }

  return {
    async reverse(center, params = {}) {
      const data = await request("/v1/geocode/reverse", {
        lat: center.latitude,
        lon: center.longitude,
        format: "json",
        lang: params.lang || "zh",
        limit: 1,
      });
      if (!Array.isArray(data.results)) {
        throw new ProviderError("Geoapify 逆地理编码响应格式无效", {
          code: "PROVIDER_INVALID_RESPONSE",
          provider: "geoapify",
          retryable: true,
        });
      }
      return data.results[0] || null;
    },

    async search(params) {
      const data = await request("/v1/geocode/search", {
        text: params.text,
        city: params.city,
        format: "json",
        lang: params.lang || "zh",
        limit: params.limit || 10,
        type: params.type,
        filter: params.filter,
        bias: params.bias || "countrycode:none",
      });
      if (!Array.isArray(data.results)) {
        throw new ProviderError("Geoapify 正向地理编码响应格式无效", {
          code: "PROVIDER_INVALID_RESPONSE",
          provider: "geoapify",
          retryable: true,
        });
      }
      return data.results;
    },

    async places(params) {
      const data = await request("/v2/places", {
        categories: params.category,
        filter: `circle:${params.center.longitude},${params.center.latitude},${params.radius}`,
        bias: `proximity:${params.center.longitude},${params.center.latitude}`,
        limit: params.limit,
        lang: params.lang || "zh",
      });
      if (!Array.isArray(data.features)) {
        throw new ProviderError("Geoapify Places 响应格式无效", {
          code: "PROVIDER_INVALID_RESPONSE",
          provider: "geoapify",
          retryable: true,
        });
      }
      return data.features;
    },
  };
}

module.exports = { createGeoapifyClient };

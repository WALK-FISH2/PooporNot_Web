const { ProviderError } = require("./provider-error");

async function fetchJson(url, options = {}) {
  const {
    provider = "unknown",
    timeoutMs = 8000,
    fetchImpl = globalThis.fetch,
    method = "GET",
    headers = {},
    body,
  } = options;

  if (typeof fetchImpl !== "function") {
    throw new ProviderError("当前 Node.js 运行时不支持 fetch", {
      code: "FETCH_UNAVAILABLE",
      provider,
      statusCode: 500,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ProviderError(`${provider} 请求超时`, {
        code: "PROVIDER_TIMEOUT",
        provider,
        statusCode: 504,
        retryable: true,
        cause: error,
      });
    }
    throw new ProviderError(`${provider} 网络请求失败`, {
      code: "PROVIDER_NETWORK_ERROR",
      provider,
      statusCode: 502,
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new ProviderError(`${provider} 返回 HTTP ${response.status}`, {
      code: response.status === 429 ? "PROVIDER_RATE_LIMIT" : "PROVIDER_HTTP_ERROR",
      provider,
      statusCode: response.status === 429 ? 503 : 502,
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ProviderError(`${provider} 返回了无效 JSON`, {
      code: "PROVIDER_INVALID_RESPONSE",
      provider,
      statusCode: 502,
      retryable: true,
      cause: error,
    });
  }
}

module.exports = { fetchJson };

class ProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = options.code || "PROVIDER_ERROR";
    this.provider = options.provider || "unknown";
    this.statusCode = options.statusCode || 502;
    this.retryable = Boolean(options.retryable);
    this.cause = options.cause;
    this.diagnostic = options.diagnostic;
  }
}

function redactSecrets(value, secrets = []) {
  let text = String(value || "");
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[REDACTED]");
  }
  return text.replace(/([?&](?:apiKey|key)=)[^&\s]+/gi, "$1[REDACTED]");
}

function safeProviderError(error, secrets = []) {
  return {
    name: error?.name || "Error",
    code: error?.code || "UNKNOWN_ERROR",
    provider: error?.provider || "unknown",
    statusCode: Number(error?.statusCode || 500),
    retryable: Boolean(error?.retryable),
    message: redactSecrets(error?.message || error, secrets),
    diagnostic: redactDiagnostic(error?.diagnostic, secrets),
  };
}

function redactDiagnostic(value, secrets) {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactSecrets(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactDiagnostic(item, secrets));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDiagnostic(item, secrets)]));
  }
  return redactSecrets(value, secrets);
}

module.exports = {
  ProviderError,
  redactSecrets,
  safeProviderError,
};

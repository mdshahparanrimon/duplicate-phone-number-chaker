function parseTenantAccessKeyMap() {
  const rawMap = process.env.ACCESS_KEY_MAP_JSON;
  if (!rawMap) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawMap);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch (error) {
    console.error("Invalid ACCESS_KEY_MAP_JSON value:", error.message);
    return {};
  }
}

function getExpectedAccessKey(locationId) {
  const tenantMap = parseTenantAccessKeyMap();

  if (locationId && tenantMap[locationId]) {
    return String(tenantMap[locationId]);
  }

  return process.env.API_SECRET_KEY || process.env.ACCESS_KEY || "";
}

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }

  return String(value || "").trim();
}

function normalizeBodyValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveAuthContextFromRequest(req, options = {}) {
  const { allowBodyFallback = true } = options;
  const body = req.body || {};

  const accessKeyFromHeader = normalizeHeaderValue(req.headers["x-api-key"]);
  const locationIdFromHeader = normalizeHeaderValue(req.headers["x-location-id"]);
  const ghlApiKeyFromHeader = normalizeHeaderValue(req.headers["x-ghl-api-key"]);

  const accessKey = accessKeyFromHeader || (allowBodyFallback ? normalizeBodyValue(body.accessKey) : "");
  const locationId = locationIdFromHeader || (allowBodyFallback ? normalizeBodyValue(body.locationId) : "");
  const apiKey = ghlApiKeyFromHeader || (allowBodyFallback ? normalizeBodyValue(body.apiKey) : "");

  return {
    accessKey,
    locationId,
    apiKey
  };
}

export function validateAccessKey({ accessKey, locationId }) {
  const expectedAccessKey = getExpectedAccessKey(locationId);

  if (!expectedAccessKey) {
    return {
      valid: false,
      reason: "config_missing"
    };
  }

  if (!accessKey || accessKey !== expectedAccessKey) {
    return {
      valid: false,
      reason: "invalid"
    };
  }

  return {
    valid: true,
    reason: "ok"
  };
}

export function validateRequestAuthContext(context) {
  if (!context.locationId || !context.apiKey) {
    return {
      valid: false,
      statusCode: 400,
      message: "Missing required headers: x-location-id and x-ghl-api-key"
    };
  }

  const accessKeyResult = validateAccessKey({
    accessKey: context.accessKey,
    locationId: context.locationId
  });

  if (!accessKeyResult.valid) {
    if (accessKeyResult.reason === "config_missing") {
      return {
        valid: false,
        statusCode: 500,
        message: "Server access key configuration is missing"
      };
    }

    return {
      valid: false,
      statusCode: 401,
      message: "Unauthorized: invalid x-api-key"
    };
  }

  return {
    valid: true,
    statusCode: 200,
    message: "ok"
  };
}

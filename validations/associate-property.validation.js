function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return normalizeText(value[0]);
  }

  return normalizeText(value);
}

export function validateAssociatePropertyHeaders(headers = {}) {
  const objectId = normalizeHeaderValue(headers["x-object-id"]);

  if (!objectId) {
    return {
      valid: false,
      objectId: "",
      message: "Missing required header: x-object-id"
    };
  }

  return {
    valid: true,
    objectId,
    message: "ok"
  };
}

export function normalizeAssociatePropertyPayload(body = {}) {
  return {
    contactId: normalizeText(body.contactId || body.id),
    name: normalizeText(body.name),
    address: normalizeText(body.address),
    city: normalizeText(body.city),
    state: normalizeText(body.state)
  };
}

export function validateAssociatePropertyPayload(payload = {}) {
  const missingFields = [];

  if (!normalizeText(payload.contactId)) {
    missingFields.push("contactId/id");
  }

  if (!normalizeText(payload.address)) {
    missingFields.push("address");
  }

  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

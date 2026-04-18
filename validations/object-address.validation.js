function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

export function normalizeCheckObjectAddressPayload(body = {}) {
  return {
    id: normalizeText(body.id),
    address: normalizeText(body.address)
  };
}

export function validateCheckObjectAddressPayload(payload = {}) {
  const missingFields = [];

  if (!normalizeText(payload.id)) {
    missingFields.push("id");
  }

  if (!normalizeText(payload.address)) {
    missingFields.push("address");
  }

  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

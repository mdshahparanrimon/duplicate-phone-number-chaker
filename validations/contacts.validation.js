function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parseFullAddress(fullAddress) {
  const normalized = normalizeText(fullAddress);
  if (!normalized) {
    return {
      address: "",
      city: "",
      state: "",
      country: "",
      postalCode: ""
    };
  }

  const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return {
      address: "",
      city: "",
      state: "",
      country: "",
      postalCode: ""
    };
  }

  let country = "";
  let state = "";
  let postalCode = "";

  const lastPart = parts[parts.length - 1] || "";
  if (/^[A-Za-z]{2,3}$/.test(lastPart)) {
    country = lastPart.toUpperCase();
    parts.pop();
  }

  const stateZipPart = parts[parts.length - 1] || "";
  const stateZipMatch = stateZipPart.match(/^([A-Za-z]{2})\s+([A-Za-z0-9-]{3,10})$/);
  if (stateZipMatch) {
    state = stateZipMatch[1].toUpperCase();
    postalCode = stateZipMatch[2];
    parts.pop();
  } else if (/^[A-Za-z]{2}$/.test(stateZipPart)) {
    state = stateZipPart.toUpperCase();
    parts.pop();
  }

  if (!postalCode) {
    const possibleZip = parts[parts.length - 1] || "";
    if (/^[A-Za-z0-9-]{3,10}$/.test(possibleZip) && /\d/.test(possibleZip)) {
      postalCode = possibleZip;
      parts.pop();
    }
  }

  const city = parts.length > 0 ? parts.pop() : "";
  const address = parts.join(", ");

  return {
    address,
    city,
    state,
    country,
    postalCode
  };
}

export function normalizeCheckDuplicateBusinessPayload(body = {}) {
  const fullAddress = normalizeText(body.fullAddress || body.full_address);
  const parsedAddress = parseFullAddress(fullAddress);

  return {
    businessName: normalizeText(body.businessName),
    fullAddress,
    address: normalizeText(body.address || body.address1 || body.streetaddress) || parsedAddress.address,
    city: normalizeText(body.city) || parsedAddress.city,
    state: normalizeText(body.state) || parsedAddress.state,
    country: normalizeText(body.country) || parsedAddress.country,
    postalCode: normalizeText(
      body.postalCode || body.postal_code || body.zip || body.zipCode || body["Postal Code"]
    ) || parsedAddress.postalCode,
    id: normalizeText(body.id)
  };
}

export function hasBusinessName(payload) {
  return Boolean(payload.businessName);
}

export function hasStreetAddress(payload) {
  return Boolean(payload.address);
}

export function hasCity(payload) {
  return Boolean(payload.city);
}

export function hasFullBusinessAddress(payload) {
  return Boolean(payload.fullAddress || payload.address || payload.city);
}

export function normalizeCheckDuplicatePhoneEmailPayload(body = {}) {
  return {
    phone: normalizeText(body.phone),
    email: normalizeText(body.email),
    id: normalizeText(body.id)
  };
}

export function hasPhoneOrEmail(payload) {
  return Boolean(payload.phone || payload.email);
}

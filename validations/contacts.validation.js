function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

export function normalizeCheckDuplicateBusinessPayload(body = {}) {
  return {
    businessName: normalizeText(body.businessName),
    address: normalizeText(body.address || body.address1 || body.streetaddress),
    city: normalizeText(body.city),
    state: normalizeText(body.state),
    country: normalizeText(body.country),
    postalCode: normalizeText(
      body.postalCode || body.postal_code || body.zip || body.zipCode || body["Postal Code"]
    ),
    id: normalizeText(body.id)
  };
}

export function hasBusinessName(payload) {
  return Boolean(payload.businessName);
}

export function hasFullBusinessAddress(payload) {
  return Boolean(payload.address && payload.city && payload.country);
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

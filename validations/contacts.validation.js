function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCheckDuplicateBusinessPayload(body = {}) {
  return {
    businessName: normalizeText(body.businessName),
    address1: normalizeText(body.address1),
    city: normalizeText(body.city),
    state: normalizeText(body.state),
    country: normalizeText(body.country),
    id: normalizeText(body.id)
  };
}

export function hasRequiredBusinessAddressFields(payload) {
  return Boolean(
    payload.businessName &&
      payload.address1 &&
      payload.city &&
      payload.state &&
      payload.country
  );
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

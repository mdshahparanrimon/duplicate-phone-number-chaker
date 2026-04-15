function normalizeAddressPart(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildFullAddress(contact = {}) {
  const parts = [
    normalizeAddressPart(contact.address1),
    normalizeAddressPart(contact.city),
    normalizeAddressPart(contact.state),
    normalizeAddressPart(contact.country)
  ].filter(Boolean);

  return parts.join(", ");
}

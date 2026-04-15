function normalizeAddressPart(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildFullAddress(contact = {}) {
  const parts = [
    normalizeAddressPart(contact.address || contact.address1), // Support both "address" and "address1" for backward compatibility
    normalizeAddressPart(contact.city),
    normalizeAddressPart(contact.state),
    normalizeAddressPart(contact.country)
  ].filter(Boolean);

  return parts.join(", ");
}

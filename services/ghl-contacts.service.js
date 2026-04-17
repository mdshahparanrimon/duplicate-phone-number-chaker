import axios from "axios";
import { buildFullAddress } from "../utils/address.js";

const GHL_BASE_URL = process.env.GHL_BASE_URL || "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const REQUEST_TIMEOUT_MS = 15000;
const CONTACT_PAGE_LIMIT = 100;
const MAX_CONTACT_SEARCH_PAGES = 50;

function toErrorMessage(error, fallback = "Unknown GHL error") {
  return error?.response?.data?.message || error?.message || fallback;
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAddressFingerprint(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTokenFingerprint(value) {
  const tokens = normalizeAddressFingerprint(value)
    .split(" ")
    .filter(Boolean)
    .sort();

  return tokens.join(" ");
}

function isEquivalentAddress(candidate, target) {
  const candidateSeq = normalizeAddressFingerprint(candidate);
  const targetSeq = normalizeAddressFingerprint(target);

  if (!candidateSeq || !targetSeq) {
    return false;
  }

  if (candidateSeq === targetSeq) {
    return true;
  }

  return buildTokenFingerprint(candidate) === buildTokenFingerprint(target);
}

function getPrimaryAddressRecord(contact = {}) {
  if (Array.isArray(contact?.addresses) && contact.addresses.length > 0) {
    return contact.addresses[0] || {};
  }

  return {};
}

function getStreetAddress(contact = {}) {
  const primaryAddress = getPrimaryAddressRecord(contact);
  return (
    contact?.address ||
    contact?.address1 ||
    contact?.streetAddress ||
    contact?.streetaddress ||
    primaryAddress?.address ||
    primaryAddress?.address1 ||
    primaryAddress?.street ||
    primaryAddress?.streetAddress ||
    primaryAddress?.streetaddress
  );
}

function getCity(contact = {}) {
  const primaryAddress = getPrimaryAddressRecord(contact);
  return contact?.city || primaryAddress?.city;
}

function getCountry(contact = {}) {
  const primaryAddress = getPrimaryAddressRecord(contact);
  return contact?.country || primaryAddress?.country;
}

function getState(contact = {}) {
  const primaryAddress = getPrimaryAddressRecord(contact);
  return contact?.state || primaryAddress?.state;
}

function getPostalCode(contact = {}) {
  const primaryAddress = getPrimaryAddressRecord(contact);
  return (
    contact?.postalCode ||
    contact?.postal_code ||
    contact?.zipCode ||
    contact?.zip ||
    contact?.zipcode ||
    contact?.["Postal Code"] ||
    primaryAddress?.postalCode ||
    primaryAddress?.postal_code ||
    primaryAddress?.zipCode ||
    primaryAddress?.zip ||
    primaryAddress?.zipcode ||
    primaryAddress?.["Postal Code"]
  );
}

function buildContactFullAddressCandidates(contact = {}) {
  const primaryAddress = getPrimaryAddressRecord(contact);
  const street = getStreetAddress(contact);
  const city = getCity(contact);
  const state = getState(contact);
  const postalCode = getPostalCode(contact);
  const country = getCountry(contact);

  const candidates = [
    contact?.fullAddress,
    contact?.full_address,
    primaryAddress?.fullAddress,
    primaryAddress?.full_address,
    buildFullAddress(contact),
    [street, city, state, postalCode, country].filter(Boolean).join(", "),
    [street, city, state, country].filter(Boolean).join(", "),
    [street, city, country].filter(Boolean).join(", ")
  ];

  return candidates
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function buildTargetAddressCandidates(target = {}) {
  const candidates = [
    target.fullAddress,
    [target.address, target.city, target.state, target.postalCode, target.country]
      .filter(Boolean)
      .join(", "),
    [target.address, target.city, target.state, target.country].filter(Boolean).join(", "),
    [target.address, target.city, target.country].filter(Boolean).join(", ")
  ];

  return candidates
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function isExactBusinessNameMatch(contact, businessName) {
  return normalizeValue(contact?.companyName) === normalizeValue(businessName);
}

function isExactAddressMatch(contact, target) {
  const contactCandidates = buildContactFullAddressCandidates(contact);
  const targetCandidates = buildTargetAddressCandidates(target);

  if (targetCandidates.length > 0) {
    const matchedByAddressCandidates = targetCandidates.some((targetCandidate) =>
      contactCandidates.some((candidate) => isEquivalentAddress(candidate, targetCandidate))
    );

    if (matchedByAddressCandidates) {
      return true;
    }
  }

  return (
    normalizeValue(getStreetAddress(contact)) === normalizeValue(target.address) &&
    normalizeValue(getCity(contact)) === normalizeValue(target.city)
    // normalizeValue(getCountry(contact)) === normalizeValue(target.country)
  );
}

function extractContacts(searchResponseData) {
  if (Array.isArray(searchResponseData?.contacts)) {
    return searchResponseData.contacts;
  }

  if (Array.isArray(searchResponseData?.data?.contacts)) {
    return searchResponseData.data.contacts;
  }

  if (Array.isArray(searchResponseData?.results)) {
    return searchResponseData.results;
  }

  return [];
}

function extractSingleContact(duplicateResponseData) {
  if (duplicateResponseData?.contact) {
    return duplicateResponseData.contact;
  }

  if (duplicateResponseData?.data?.contact) {
    return duplicateResponseData.data.contact;
  }

  return null;
}

function buildSearchPayload(criteria) {
  return {
    locationId: criteria.locationId,
    page: criteria.page || 1,
    pageLimit: criteria.pageLimit || CONTACT_PAGE_LIMIT,
    filters: criteria.filters
  };
}

function buildGetAllContactsPayload(criteria) {
  return {
    locationId: criteria.locationId,
    page: criteria.page,
    pageLimit: criteria.pageLimit,
    ...(criteria.query ? { query: criteria.query } : {})
  };
}

export class GhlServiceError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "GhlServiceError";
    this.statusCode = statusCode;
  }
}

async function runDuplicateLookup({ apiKey, locationId, fieldKey, fieldValue }) {
  const endpoint = `${GHL_BASE_URL}/contacts/search/duplicate`;

  try {
    const response = await axios.get(endpoint, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: GHL_VERSION
      },
      params: {
        locationId,
        [fieldKey]: fieldValue
      }
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("[duplicate-contact] GHL response error", {
        status: error.response.status,
        locationId,
        fieldKey,
        message: toErrorMessage(error)
      });
      throw new GhlServiceError("Failed to fetch contacts from GHL", 502);
    }

    if (error.request) {
      console.error("[duplicate-contact] GHL network error", {
        locationId,
        fieldKey,
        message: error.message
      });
      throw new GhlServiceError("Network error while contacting GHL API", 502);
    }

    console.error("[duplicate-contact] Unexpected GHL service error", {
      locationId,
      fieldKey,
      message: error.message
    });
    throw new GhlServiceError("Unexpected error while contacting GHL API", 500);
  }
}

export async function searchDuplicateContactByPhoneEmail(criteria) {
  const tasks = [];

  if (criteria.phone) {
    tasks.push(
      runDuplicateLookup({
        apiKey: criteria.apiKey,
        locationId: criteria.locationId,
        fieldKey: "number",
        fieldValue: criteria.phone
      }).then((data) => ({ field: "phone", data }))
    );
  }

  if (criteria.email) {
    tasks.push(
      runDuplicateLookup({
        apiKey: criteria.apiKey,
        locationId: criteria.locationId,
        fieldKey: "email",
        fieldValue: criteria.email
      }).then((data) => ({ field: "email", data }))
    );
  }

  const results = await Promise.all(tasks);

  const phoneData = results.find((item) => item.field === "phone")?.data || null;
  const emailData = results.find((item) => item.field === "email")?.data || null;

  return {
    phoneData,
    emailData,
    phoneContact: extractSingleContact(phoneData),
    emailContact: extractSingleContact(emailData)
  };
}

async function searchContacts(criteria, filters, logPrefix) {
  const payload = buildSearchPayload({
    locationId: criteria.locationId,
    filters
  });
  const endpoint = `${GHL_BASE_URL}/contacts/search`;

  try {
    const response = await axios.post(endpoint, payload, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${criteria.apiKey}`,
        Version: GHL_VERSION,
        "Content-Type": "application/json"
      }
    });

    return extractContacts(response.data);
  } catch (error) {
    if (error.response) {
      console.error(`[${logPrefix}] GHL response error`, {
        status: error.response.status,
        locationId: criteria.locationId,
        message: toErrorMessage(error)
      });

      throw new GhlServiceError("Failed to fetch contacts from GHL", 502);
    }

    if (error.request) {
      console.error(`[${logPrefix}] GHL network error`, {
        locationId: criteria.locationId,
        message: error.message
      });

      throw new GhlServiceError("Network error while contacting GHL API", 502);
    }

    console.error(`[${logPrefix}] Unexpected GHL service error`, {
      locationId: criteria.locationId,
      message: error.message
    });

    throw new GhlServiceError("Unexpected error while contacting GHL API", 500);
  }
}

export async function searchContactsByBusinessName(criteria) {
  const filters = [
    {
      field: "companyName",
      operator: "eq",
      value: criteria.businessName
    }
  ];

  console.info("[duplicate-business-name] GHL search request", {
    locationId: criteria.locationId,
    businessName: criteria.businessName
  });

  const contacts = await searchContacts(criteria, filters, "duplicate-business-name");
  const exactMatches = contacts.filter((contact) =>
    isExactBusinessNameMatch(contact, criteria.businessName)
  );

  console.info("[duplicate-business-name] GHL search response", {
    locationId: criteria.locationId,
    totalContactsReturned: contacts.length,
    exactMatches: exactMatches.length
  });

  return exactMatches;
}

export async function searchContactsByAddress(criteria) {
  console.info("[duplicate-business-address] GHL search request", {
    locationId: criteria.locationId,
    targetAddress: criteria.fullAddress || [criteria.address, criteria.city, criteria.country]
      .filter(Boolean)
      .join(", ")
  });

  const contacts = [];
  let page = 1;

  while (page <= MAX_CONTACT_SEARCH_PAGES) {
    const pageResult = await getAllContacts({
      apiKey: criteria.apiKey,
      locationId: criteria.locationId,
      page,
      pageLimit: CONTACT_PAGE_LIMIT,
      query: ""
    });

    if (!Array.isArray(pageResult.contacts) || pageResult.contacts.length === 0) {
      break;
    }

    contacts.push(...pageResult.contacts);

    if (pageResult.contacts.length < CONTACT_PAGE_LIMIT) {
      break;
    }

    page += 1;
  }

  const exactMatches = contacts.filter((contact) => isExactAddressMatch(contact, criteria));

  console.info("[duplicate-business-address] GHL search response", {
    locationId: criteria.locationId,
    totalContactsScanned: contacts.length,
    exactMatches: exactMatches.length,
    sampleAddress: buildFullAddress(exactMatches[0] || {})
  });

  return exactMatches;
}

export async function getAllContacts(criteria) {
  const payload = buildGetAllContactsPayload(criteria);
  const endpoint = `${GHL_BASE_URL}/contacts/search`;

  console.info("[get-all-contacts] GHL search request", {
    locationId: criteria.locationId,
    page: criteria.page,
    pageLimit: criteria.pageLimit,
    hasQuery: Boolean(criteria.query)
  });

  try {
    const response = await axios.post(endpoint, payload, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${criteria.apiKey}`,
        Version: GHL_VERSION,
        "Content-Type": "application/json"
      }
    });

    const contacts = extractContacts(response.data);

    return {
      contacts,
      meta: {
        page: criteria.page,
        pageLimit: criteria.pageLimit,
        total: Number(response.data?.total || response.data?.meta?.total || contacts.length)
      }
    };
  } catch (error) {
    if (error.response) {
      console.error("[get-all-contacts] GHL response error", {
        status: error.response.status,
        locationId: criteria.locationId,
        message: toErrorMessage(error)
      });

      throw new GhlServiceError("Failed to fetch contacts from GHL", 502);
    }

    if (error.request) {
      console.error("[get-all-contacts] GHL network error", {
        locationId: criteria.locationId,
        message: error.message
      });

      throw new GhlServiceError("Network error while contacting GHL API", 502);
    }

    console.error("[get-all-contacts] Unexpected GHL service error", {
      locationId: criteria.locationId,
      message: error.message
    });

    throw new GhlServiceError("Unexpected error while contacting GHL API", 500);
  }
}

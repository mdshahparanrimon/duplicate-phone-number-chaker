import axios from "axios";
import { buildFullAddress } from "../utils/address.js";

const GHL_BASE_URL = process.env.GHL_BASE_URL || "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const REQUEST_TIMEOUT_MS = 15000;

function toErrorMessage(error, fallback = "Unknown GHL error") {
  return error?.response?.data?.message || error?.message || fallback;
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function isExactBusinessMatch(contact, target) {
  return (
    normalizeValue(contact?.companyName) === normalizeValue(target.businessName) &&
    normalizeValue(contact?.address1) === normalizeValue(target.address1) &&
    normalizeValue(contact?.city) === normalizeValue(target.city) &&
    normalizeValue(contact?.state) === normalizeValue(target.state) &&
    normalizeValue(contact?.country) === normalizeValue(target.country)
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
    page: 1,
    pageLimit: 100,
    filters: [
      {
        field: "companyName",
        operator: "eq",
        value: criteria.businessName
      },
      {
        field: "address1",
        operator: "eq",
        value: criteria.address1
      },
      {
        field: "city",
        operator: "eq",
        value: criteria.city
      },
      {
        field: "state",
        operator: "eq",
        value: criteria.state
      },
      {
        field: "country",
        operator: "eq",
        value: criteria.country
      }
    ]
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

export async function searchContactsByBusinessAddress(criteria) {
  const payload = buildSearchPayload(criteria);
  const endpoint = `${GHL_BASE_URL}/contacts/search`;

  console.info("[duplicate-business] GHL search request", {
    locationId: criteria.locationId,
    businessName: criteria.businessName,
    targetAddress: [
      criteria.address1,
      criteria.city,
      criteria.state,
      criteria.country
    ]
      .filter(Boolean)
      .join(", ")
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
    const exactMatches = contacts.filter((contact) =>
      isExactBusinessMatch(contact, criteria)
    );

    console.info("[duplicate-business] GHL search response", {
      locationId: criteria.locationId,
      totalContactsReturned: contacts.length,
      exactMatches: exactMatches.length,
      sampleAddress: buildFullAddress(exactMatches[0] || {})
    });

    return exactMatches;
  } catch (error) {
    if (error.response) {
      console.error("[duplicate-business] GHL response error", {
        status: error.response.status,
        locationId: criteria.locationId,
        message: toErrorMessage(error)
      });

      throw new GhlServiceError("Failed to fetch contacts from GHL", 502);
    }

    if (error.request) {
      console.error("[duplicate-business] GHL network error", {
        locationId: criteria.locationId,
        message: error.message
      });

      throw new GhlServiceError("Network error while contacting GHL API", 502);
    }

    console.error("[duplicate-business] Unexpected GHL service error", {
      locationId: criteria.locationId,
      message: error.message
    });

    throw new GhlServiceError("Unexpected error while contacting GHL API", 500);
  }
}

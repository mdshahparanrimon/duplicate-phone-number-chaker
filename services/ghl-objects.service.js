import axios from "axios";
import { GhlServiceError } from "./ghl-contacts.service.js";
import { retryAsync } from "../utils/retry.js";
import { logger } from "../utils/logger.js";
import { normalizePropertyAddress } from "../utils/address.js";

const GHL_BASE_URL = process.env.GHL_BASE_URL || "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = Math.min(
  Number.parseInt(process.env.GHL_OBJECT_MAX_PAGES || "200", 10) || 200,
  500
);

const PROPERTY_WORKFLOW_TIMEOUT_MS = Number.parseInt(process.env.GHL_TIMEOUT_MS || "5000", 10) || 5000;
const PROPERTY_WORKFLOW_RETRY_ATTEMPTS = Math.min(
  Math.max(Number.parseInt(process.env.GHL_RETRY_ATTEMPTS || "3", 10) || 3, 1),
  3
);

function toErrorMessage(error, fallback = "Unknown GHL error") {
  return error?.response?.data?.message || error?.message || fallback;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item)).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    const bestGuess =
      value.fullAddress ||
      value.address ||
      value.value ||
      value.text ||
      value.label ||
      value.name;

    if (bestGuess) {
      return normalizeValue(bestGuess);
    }
  }

  return "";
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

function buildHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: GHL_VERSION,
    "Content-Type": "application/json"
  };
}

function extractRecordId(entity = {}) {
  const candidates = [
    entity?.id,
    entity?._id,
    entity?.recordId,
    entity?.objectId,
    entity?.record?.id,
    entity?.record?._id,
    entity?.record?.recordId,
    entity?.data?.id,
    entity?.data?._id,
    entity?.data?.recordId,
    entity?.data?.record?.id,
    entity?.data?.record?._id,
    entity?.data?.record?.recordId
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function isRetryableAxiosError(error) {
  if (!error?.response) {
    return true;
  }

  const statusCode = Number(error.response?.status || 0);
  return statusCode === 429 || statusCode >= 500;
}

function resolveWorkflowStatusCode(error) {
  if (error?.response) {
    const statusCode = Number(error.response.status || 0);

    if (statusCode === 400 || statusCode === 404 || statusCode === 422) {
      return 400;
    }

    if (statusCode === 401 || statusCode === 403) {
      return 401;
    }

    return 502;
  }

  if (error?.code === "ECONNABORTED") {
    return 504;
  }

  return 502;
}

function toWorkflowServiceError(error, fallbackMessage) {
  return new GhlServiceError(
    toErrorMessage(error, fallbackMessage),
    resolveWorkflowStatusCode(error)
  );
}

function buildPropertyName(name) {
  const normalizedName = normalizeText(name);
  return normalizedName ? `${normalizedName}'s Property` : "Property";
}

async function requestWithRetry({ request, requestId, operation, objectId, contactId }) {
  return retryAsync(request, {
    attempts: PROPERTY_WORKFLOW_RETRY_ATTEMPTS,
    delayMs: 300,
    shouldRetry: isRetryableAxiosError,
    onRetry: (error, attempt, nextAttempt) => {
      logger.warn("associate_contact_property.retry", {
        requestId,
        operation,
        objectId,
        contactId,
        currentAttempt: attempt,
        nextAttempt,
        message: toErrorMessage(error)
      });
    }
  });
}

function extractObjectSchemaPayload(rawData) {
  const candidates = [
    rawData,
    rawData?.data,
    rawData?.object,
    rawData?.schema,
    rawData?.data?.object,
    rawData?.data?.schema
  ];

  return candidates.find((candidate) => candidate && typeof candidate === "object") || {};
}

function extractSchemaProperties(rawData) {
  const candidates = [
    rawData?.properties,
    rawData?.fields,
    rawData?.data?.properties,
    rawData?.data?.fields,
    rawData?.object?.properties,
    rawData?.object?.fields,
    rawData?.schema?.properties,
    rawData?.schema?.fields,
    rawData?.data?.object?.properties,
    rawData?.data?.schema?.properties
  ];

  const match = candidates.find((candidate) => Array.isArray(candidate));
  return Array.isArray(match) ? match : [];
}

function mapProperty(property = {}) {
  return {
    key: normalizeText(property.key || property.fieldKey || property.name || property.id),
    label: normalizeText(property.label || property.displayName || property.title || property.name),
    type: normalizeText(property.type || property.fieldType || property.dataType)
  };
}

function resolveSchemaKey(schemaPayload, fallbackKey) {
  const candidates = [
    schemaPayload?.schemaKey,
    schemaPayload?.key,
    schemaPayload?.objectKey,
    schemaPayload?.id,
    schemaPayload?.data?.schemaKey,
    fallbackKey
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return normalizeText(fallbackKey);
}

function resolveAddressField(properties = []) {
  const preferredField = properties.find(
    (property) => normalizeKey(property.key) === "propertyaddress"
  );

  if (preferredField?.key) {
    return preferredField.key;
  }

  const exactKeys = new Set([
    "address",
    "fulladdress",
    "propertyaddress",
    "streetaddress",
    "addressline1",
    "locationaddress"
  ]);

  const exactMatch = properties.find((property) => {
    const key = normalizeKey(property.key);
    const label = normalizeKey(property.label);
    return exactKeys.has(key) || exactKeys.has(label);
  });

  if (exactMatch?.key) {
    return exactMatch.key;
  }

  const typeMatch = properties.find((property) => normalizeKey(property.type).includes("address"));
  if (typeMatch?.key) {
    return typeMatch.key;
  }

  const heuristicMatch = properties.find((property) => {
    const key = normalizeKey(property.key);
    const label = normalizeKey(property.label);

    return (
      key.includes("address") ||
      key.includes("street") ||
      key.includes("location") ||
      label.includes("address") ||
      label.includes("street") ||
      label.includes("location")
    );
  });

  return heuristicMatch?.key || "";
}

function extractRecords(responseData) {
  const candidates = [
    responseData?.records,
    responseData?.items,
    responseData?.results,
    responseData?.data?.records,
    responseData?.data?.items,
    responseData?.data?.results,
    responseData?.data
  ];

  const match = candidates.find((candidate) => Array.isArray(candidate));
  return Array.isArray(match) ? match : [];
}

function extractNextCursor(responseData) {
  const candidates = [
    responseData?.nextCursor,
    responseData?.cursor,
    responseData?.meta?.nextCursor,
    responseData?.pagination?.nextCursor,
    responseData?.data?.nextCursor,
    responseData?.data?.meta?.nextCursor,
    responseData?.data?.pagination?.nextCursor
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function extractHasMore(responseData) {
  const candidates = [
    responseData?.hasMore,
    responseData?.more,
    responseData?.meta?.hasMore,
    responseData?.pagination?.hasMore,
    responseData?.data?.hasMore,
    responseData?.data?.meta?.hasMore,
    responseData?.data?.pagination?.hasMore
  ];

  return candidates.some((candidate) => candidate === true);
}

function extractFromKeyValueArray(arrayCandidate, fieldKey) {
  if (!Array.isArray(arrayCandidate) || !fieldKey) {
    return "";
  }

  const normalizedTarget = normalizeKey(fieldKey);

  const matchedItem = arrayCandidate.find((item) => {
    const key = normalizeKey(item?.key || item?.name || item?.fieldKey || item?.id);
    return key && key === normalizedTarget;
  });

  if (!matchedItem) {
    return "";
  }

  return normalizeValue(
    matchedItem.value ||
      matchedItem.fieldValue ||
      matchedItem.text ||
      matchedItem.data ||
      matchedItem.label
  );
}

function extractFieldValue(record = {}, fieldKey) {
  if (!fieldKey) {
    return "";
  }

  const directCandidates = [
    record[fieldKey],
    record?.values?.[fieldKey],
    record?.properties?.[fieldKey],
    record?.data?.[fieldKey],
    record?.customFields?.[fieldKey],
    record?.fields?.[fieldKey]
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const arrayCandidates = [record?.properties, record?.fields, record?.values, record?.customFields];
  for (const arrayCandidate of arrayCandidates) {
    const fromArray = extractFromKeyValueArray(arrayCandidate, fieldKey);
    if (fromArray) {
      return fromArray;
    }
  }

  return "";
}

async function getObjectSchema({ apiKey, locationId, objectId }) {
  const endpoint = `${GHL_BASE_URL}/objects/${encodeURIComponent(objectId)}`;

  try {
    const response = await axios.get(endpoint, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: buildHeaders(apiKey),
      params: {
        locationId
      }
    });

    const schemaPayload = extractObjectSchemaPayload(response.data);
    const properties = extractSchemaProperties(response.data).map((property) => mapProperty(property));

    return {
      properties,
      schemaKey: resolveSchemaKey(schemaPayload, objectId)
    };
  } catch (error) {
    if (error.response) {
      console.error("[object-schema] GHL response error", {
        status: error.response.status,
        locationId,
        objectId,
        message: toErrorMessage(error)
      });
      throw new GhlServiceError("Failed to fetch object schema from GHL", 502);
    }

    if (error.request) {
      console.error("[object-schema] GHL network error", {
        locationId,
        objectId,
        message: error.message
      });
      throw new GhlServiceError("Network error while fetching object schema", 502);
    }

    console.error("[object-schema] Unexpected GHL service error", {
      locationId,
      objectId,
      message: error.message
    });
    throw new GhlServiceError("Unexpected error while fetching object schema", 500);
  }
}

async function scanObjectRecordsForAddress({
  apiKey,
  locationId,
  schemaKey,
  addressField,
  targetAddress,
  sourceId
}) {
  const endpoint = `${GHL_BASE_URL}/objects/${encodeURIComponent(schemaKey)}/records/search`;
  let cursor = "";
  let page = 1;

  for (let pageNumber = 1; pageNumber <= DEFAULT_MAX_PAGES; pageNumber += 1) {
    const payload = {
      locationId,
      pageLimit: DEFAULT_PAGE_LIMIT
    };

    if (cursor) {
      payload.cursor = cursor;
    } else {
      payload.page = page;
    }

    let response;

    try {
      response = await axios.post(endpoint, payload, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: buildHeaders(apiKey)
      });
    } catch (error) {
      if (error.response) {
        console.error("[object-records] GHL response error", {
          status: error.response.status,
          locationId,
          schemaKey,
          sourceId,
          page,
          hasCursor: Boolean(cursor),
          message: toErrorMessage(error)
        });
        throw new GhlServiceError("Failed to fetch object records from GHL", 502);
      }

      if (error.request) {
        console.error("[object-records] GHL network error", {
          locationId,
          schemaKey,
          sourceId,
          page,
          hasCursor: Boolean(cursor),
          message: error.message
        });
        throw new GhlServiceError("Network error while fetching object records", 502);
      }

      console.error("[object-records] Unexpected GHL service error", {
        locationId,
        schemaKey,
        sourceId,
        page,
        hasCursor: Boolean(cursor),
        message: error.message
      });
      throw new GhlServiceError("Unexpected error while fetching object records", 500);
    }

    const responseData = response.data || {};
    const pageRecords = extractRecords(responseData);

    for (const record of pageRecords) {
      const recordAddress = extractFieldValue(record, addressField);

      if (recordAddress && isEquivalentAddress(recordAddress, targetAddress)) {
        return true;
      }
    }

    const nextCursor = extractNextCursor(responseData);
    const hasMore = extractHasMore(responseData);

    if (nextCursor) {
      if (nextCursor === cursor) {
        break;
      }

      cursor = nextCursor;
      continue;
    }

    if (!cursor) {
      if (!hasMore && pageRecords.length < DEFAULT_PAGE_LIMIT) {
        break;
      }

      if (!hasMore && pageRecords.length === 0) {
        break;
      }

      page += 1;
      continue;
    }

    if (!hasMore) {
      break;
    }
  }

  return false;
}

export async function checkObjectAddressExists({ apiKey, locationId, objectId, id, address }) {
  const normalizedObjectId = normalizeText(objectId);
  const normalizedAddress = normalizeText(address);

  if (!normalizedObjectId) {
    throw new GhlServiceError("Missing required header: x-object-id", 400);
  }

  if (!normalizedAddress) {
    throw new GhlServiceError("Missing required body field: address", 400);
  }

  const schemaResult = await getObjectSchema({
    apiKey,
    locationId,
    objectId: normalizedObjectId
  });

  const resolvedAddressField = resolveAddressField(schemaResult.properties);

  if (!resolvedAddressField) {
    throw new GhlServiceError("Address field not found in object schema", 400);
  }

  return scanObjectRecordsForAddress({
    apiKey,
    locationId,
    schemaKey: schemaResult.schemaKey || normalizedObjectId,
    addressField: resolvedAddressField,
    targetAddress: normalizedAddress,
    sourceId: normalizeText(id)
  });
}

export async function searchPropertyRecordByAddress({
  apiKey,
  locationId,
  objectId,
  normalizedAddress,
  requestId
}) {
  const normalizedObjectId = normalizeText(objectId);
  const normalizedLocationId = normalizeText(locationId);
  const targetAddress = normalizeText(normalizedAddress);

  if (!normalizedObjectId) {
    throw new GhlServiceError("Missing required header: x-object-id", 400);
  }

  if (!targetAddress) {
    throw new GhlServiceError("Missing required body field: address", 400);
  }

  const endpoint = `${GHL_BASE_URL}/objects/${encodeURIComponent(normalizedObjectId)}/records/search`;
  const payload = {
    locationId: normalizedLocationId,
    filters: [
      {
        fieldKey: "property_address",
        operator: "eq",
        value: targetAddress
      }
    ]
  };

  let response;

  try {
    response = await requestWithRetry({
      request: () =>
        axios.post(endpoint, payload, {
          timeout: PROPERTY_WORKFLOW_TIMEOUT_MS,
          headers: buildHeaders(apiKey)
        }),
      requestId,
      operation: "search_property",
      objectId: normalizedObjectId
    });
  } catch (error) {
    logger.error("associate_contact_property.search_error", {
      requestId,
      locationId: normalizedLocationId,
      objectId: normalizedObjectId,
      message: toErrorMessage(error)
    });
    throw toWorkflowServiceError(error, "Failed to search property record");
  }

  const records = extractRecords(response.data || {});
  let propertyId = "";

  for (const record of records) {
    const candidateRecordId = extractRecordId(record);
    if (candidateRecordId) {
      propertyId = candidateRecordId;
      break;
    }
  }

  if (!propertyId) {
    propertyId = extractRecordId(response.data || {});
  }

  if (records.length > 0 && !propertyId) {
    throw new GhlServiceError("Property record ID is missing in search response", 502);
  }

  const existing = Boolean(propertyId);

  logger.info("associate_contact_property.search_result", {
    requestId,
    locationId: normalizedLocationId,
    objectId: normalizedObjectId,
    recordCount: records.length,
    existing,
    propertyId: propertyId || null
  });

  return {
    existing,
    propertyId
  };
}

export async function createPropertyRecord({
  apiKey,
  locationId,
  objectId,
  normalizedAddress,
  name,
  requestId
}) {
  const normalizedObjectId = normalizeText(objectId);
  const normalizedLocationId = normalizeText(locationId);
  const targetAddress = normalizeText(normalizedAddress);

  if (!normalizedObjectId) {
    throw new GhlServiceError("Missing required header: x-object-id", 400);
  }

  if (!targetAddress) {
    throw new GhlServiceError("Missing required body field: address", 400);
  }

  const endpoint = `${GHL_BASE_URL}/objects/${encodeURIComponent(normalizedObjectId)}/records`;
  const payload = {
    locationId: normalizedLocationId,
    properties: {
      property_address: targetAddress,
      property_name: buildPropertyName(name)
    }
  };

  let response;

  try {
    response = await requestWithRetry({
      request: () =>
        axios.post(endpoint, payload, {
          timeout: PROPERTY_WORKFLOW_TIMEOUT_MS,
          headers: buildHeaders(apiKey)
        }),
      requestId,
      operation: "create_property",
      objectId: normalizedObjectId
    });
  } catch (error) {
    logger.error("associate_contact_property.create_error", {
      requestId,
      locationId: normalizedLocationId,
      objectId: normalizedObjectId,
      message: toErrorMessage(error)
    });
    throw toWorkflowServiceError(error, "Failed to create property record");
  }

  const propertyId = extractRecordId(response.data || {});

  if (!propertyId) {
    throw new GhlServiceError("Property record ID is missing in create response", 502);
  }

  logger.info("associate_contact_property.created_property", {
    requestId,
    locationId: normalizedLocationId,
    objectId: normalizedObjectId,
    propertyId
  });

  return propertyId;
}

export async function createPropertyContactAssociation({
  apiKey,
  propertyRecordId,
  contactId,
  requestId
}) {
  const normalizedPropertyRecordId = normalizeText(propertyRecordId);
  const normalizedContactId = normalizeText(contactId);

  if (!normalizedPropertyRecordId) {
    throw new GhlServiceError("Property record ID is required for association", 400);
  }

  if (!normalizedContactId) {
    throw new GhlServiceError("Contact ID is required for association", 400);
  }

  const endpoint = `${GHL_BASE_URL}/associations/`;
  const payload = {
    fromObjectId: normalizedPropertyRecordId,
    toObjectId: normalizedContactId,
    fromObjectType: "custom_object",
    toObjectType: "contact"
  };

  try {
    await requestWithRetry({
      request: () =>
        axios.post(endpoint, payload, {
          timeout: PROPERTY_WORKFLOW_TIMEOUT_MS,
          headers: buildHeaders(apiKey)
        }),
      requestId,
      operation: "create_association",
      objectId: normalizedPropertyRecordId,
      contactId: normalizedContactId
    });

    logger.info("associate_contact_property.association_result", {
      requestId,
      propertyId: normalizedPropertyRecordId,
      contactId: normalizedContactId,
      associated: true,
      alreadyAssociated: false
    });

    return {
      associated: true,
      alreadyAssociated: false
    };
  } catch (error) {
    if (error?.response?.status === 409) {
      logger.info("associate_contact_property.association_result", {
        requestId,
        propertyId: normalizedPropertyRecordId,
        contactId: normalizedContactId,
        associated: true,
        alreadyAssociated: true
      });

      return {
        associated: true,
        alreadyAssociated: true
      };
    }

    logger.error("associate_contact_property.association_error", {
      requestId,
      propertyId: normalizedPropertyRecordId,
      contactId: normalizedContactId,
      message: toErrorMessage(error)
    });

    throw toWorkflowServiceError(error, "Failed to create association");
  }
}

export async function associateContactWithProperty({
  apiKey,
  locationId,
  objectId,
  contactId,
  name,
  address,
  city,
  state,
  requestId
}) {
  const normalizedContactId = normalizeText(contactId);
  const normalizedObjectId = normalizeText(objectId);
  const normalizedLocationId = normalizeText(locationId);
  const normalizedAddress = normalizePropertyAddress({
    address,
    city,
    state
  });

  if (!normalizedContactId) {
    throw new GhlServiceError("Missing required body field: contactId/id", 400);
  }

  if (!normalizedObjectId) {
    throw new GhlServiceError("Missing required header: x-object-id", 400);
  }

  if (!normalizedAddress) {
    throw new GhlServiceError("Missing required body field: address", 400);
  }

  const searchResult = await searchPropertyRecordByAddress({
    apiKey,
    locationId: normalizedLocationId,
    objectId: normalizedObjectId,
    normalizedAddress,
    requestId
  });

  let propertyId = searchResult.propertyId;
  const existing = Boolean(searchResult.existing && propertyId);

  if (!propertyId) {
    propertyId = await createPropertyRecord({
      apiKey,
      locationId: normalizedLocationId,
      objectId: normalizedObjectId,
      normalizedAddress,
      name,
      requestId
    });
  }

  await createPropertyContactAssociation({
    apiKey,
    propertyRecordId: propertyId,
    contactId: normalizedContactId,
    requestId
  });

  return {
    propertyId,
    existing
  };
}
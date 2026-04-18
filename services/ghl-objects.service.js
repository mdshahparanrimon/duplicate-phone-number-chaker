import axios from "axios";
import { GhlServiceError } from "./ghl-contacts.service.js";

const GHL_BASE_URL = process.env.GHL_BASE_URL || "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = Math.min(
  Number.parseInt(process.env.GHL_OBJECT_MAX_PAGES || "200", 10) || 200,
  500
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
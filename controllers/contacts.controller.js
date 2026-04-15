import {
  resolveAuthContextFromRequest,
  validateRequestAuthContext
} from "../middleware/auth.middleware.js";
import {
  hasPhoneOrEmail,
  hasRequiredBusinessAddressFields,
  normalizeCheckDuplicateBusinessPayload,
  normalizeCheckDuplicatePhoneEmailPayload
} from "../validations/contacts.validation.js";
import {
  GhlServiceError,
  searchContactsByBusinessAddress,
  searchDuplicateContactByPhoneEmail
} from "../services/ghl-contacts.service.js";

function excludeCurrentContact(matches, id) {
  if (!id) {
    return matches;
  }

  const normalizedId = String(id);
  return matches.filter((contact) => String(contact?.id) !== normalizedId);
}

function resolveFieldStatus(contact, id) {
  if (!contact) {
    return "null";
  }

  if (id && String(contact.id) === String(id)) {
    return "unique";
  }

  return "duplicate";
}

function computeAndTopStatus(fieldStatuses) {
  if (fieldStatuses.length === 0) {
    return "null";
  }

  if (fieldStatuses.every((status) => status === "null")) {
    return "null";
  }

  if (fieldStatuses.every((status) => status === "duplicate")) {
    return "duplicate";
  }

  return "unique";
}

function deduplicateContacts(contacts) {
  const contactMap = new Map();

  for (const contact of contacts) {
    if (!contact) {
      continue;
    }

    const fallbackKey = `${contact.email || ""}:${contact.phone || contact.number || ""}`;
    const key = String(contact.id || fallbackKey);

    if (!contactMap.has(key)) {
      contactMap.set(key, contact);
    }
  }

  return Array.from(contactMap.values());
}

function resolveContextOrSendError(req, res) {
  const context = resolveAuthContextFromRequest(req, { allowBodyFallback: true });
  const authResult = validateRequestAuthContext(context);

  if (!authResult.valid) {
    res.status(authResult.statusCode).json({ message: authResult.message });
    return null;
  }

  return context;
}

async function runPhoneEmailDuplicateCheck(req) {
  const payload = normalizeCheckDuplicatePhoneEmailPayload(req.body || {});

  const context = resolveAuthContextFromRequest(req, { allowBodyFallback: true });
  const authResult = validateRequestAuthContext(context);

  if (!authResult.valid) {
    return {
      statusCode: authResult.statusCode,
      body: { message: authResult.message }
    };
  }

  if (!hasPhoneOrEmail(payload)) {
    return {
      statusCode: 200,
      body: {
        status: "null",
        count: 0,
        matches: []
      }
    };
  }

  const lookupResult = await searchDuplicateContactByPhoneEmail({
    apiKey: context.apiKey,
    locationId: context.locationId,
    phone: payload.phone,
    email: payload.email
  });

  const phoneStatus = payload.phone ? resolveFieldStatus(lookupResult.phoneContact, payload.id) : undefined;
  const emailStatus = payload.email ? resolveFieldStatus(lookupResult.emailContact, payload.id) : undefined;

  const evaluatedStatuses = [phoneStatus, emailStatus].filter(Boolean);
  const topStatus = computeAndTopStatus(evaluatedStatuses);

  const combinedMatches = deduplicateContacts(
    excludeCurrentContact(
      [lookupResult.phoneContact, lookupResult.emailContact].filter(Boolean),
      payload.id
    )
  );

  const finalMatches = topStatus === "duplicate" ? combinedMatches : [];

  return {
    statusCode: 200,
    body: {
      status: topStatus,
      count: finalMatches.length,
      matches: finalMatches,
      ...(payload.phone ? { phoneStatus } : {}),
      ...(payload.email ? { emailStatus } : {})
    }
  };
}

export async function checkDuplicateBusinessController(req, res) {
  const context = resolveContextOrSendError(req, res);
  if (!context) {
    return undefined;
  }

  const payload = normalizeCheckDuplicateBusinessPayload(req.body || {});

  if (!hasRequiredBusinessAddressFields(payload)) {
    return res.status(200).json({ status: "null" });
  }

  try {
    const matches = await searchContactsByBusinessAddress({
      ...payload,
      locationId: context.locationId,
      apiKey: context.apiKey
    });
    const filteredMatches = excludeCurrentContact(matches, payload.id);

    if (filteredMatches.length > 0) {
      return res.status(200).json({
        status: "duplicate",
        count: filteredMatches.length,
        matches: filteredMatches
      });
    }

    return res.status(200).json({
      status: "unique",
      count: 0,
      matches: []
    });
  } catch (error) {
    if (error instanceof GhlServiceError) {
      return res.status(error.statusCode).json({
        message: error.message
      });
    }

    console.error("Unexpected error in duplicate business controller:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function checkDuplicatePhoneEmailController(req, res) {
  try {
    const result = await runPhoneEmailDuplicateCheck(req);
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    if (error instanceof GhlServiceError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Unexpected error in duplicate contact controller:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function checkDuplicatePhoneEmailLegacyController(req, res) {
  try {
    const result = await runPhoneEmailDuplicateCheck(req);

    if (result.statusCode !== 200) {
      return res.status(result.statusCode).json(result.body);
    }

    return res.status(200).json({
      status: result.body.status,
      ...(Object.prototype.hasOwnProperty.call(result.body, "phoneStatus")
        ? { phoneStatus: result.body.phoneStatus }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(result.body, "emailStatus")
        ? { emailStatus: result.body.emailStatus }
        : {})
    });
  } catch (error) {
    if (error instanceof GhlServiceError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Unexpected error in legacy duplicate contact controller:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

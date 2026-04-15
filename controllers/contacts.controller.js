import {
  resolveAuthContextFromRequest,
  validateRequestAuthContext
} from "../middleware/auth.middleware.js";
import {
  hasBusinessName,
  hasFullBusinessAddress,
  hasPhoneOrEmail,
  normalizeCheckDuplicateBusinessPayload,
  normalizeCheckDuplicatePhoneEmailPayload
} from "../validations/contacts.validation.js";
import {
  GhlServiceError,
  searchContactsByAddress,
  searchContactsByBusinessName,
  searchDuplicateContactByPhoneEmail
} from "../services/ghl-contacts.service.js";

function excludeCurrentContact(matches, id) {
  if (!id) {
    return matches;
  }

  const normalizedId = String(id);
  return matches.filter((contact) => String(contact?.id) !== normalizedId);
}

function resolveFieldStatus(contact, id, requested) {
  if (!requested) {
    return null;
  }

  if (!contact) {
    return "null";
  }

  if (id && String(contact.id) === String(id)) {
    return "unique";
  }

  return "duplicate";
}

function computeTopStatus(statuses) {
  if (statuses.every((status) => status === null || status === "null")) {
    return "null";
  }

  if (statuses.includes("duplicate")) {
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
  const context = req.authContext || resolveAuthContextFromRequest(req, { allowBodyFallback: false });
  const authResult = validateRequestAuthContext(context);

  if (!authResult.valid) {
    res.status(authResult.statusCode).json({ message: authResult.message });
    return null;
  }

  return context;
}

async function runPhoneEmailDuplicateCheck(req) {
  const payload = normalizeCheckDuplicatePhoneEmailPayload(req.body || {});

  const context = req.authContext || resolveAuthContextFromRequest(req, { allowBodyFallback: false });
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
        count: 0
      }
    };
  }

  const lookupResult = await searchDuplicateContactByPhoneEmail({
    apiKey: context.apiKey,
    locationId: context.locationId,
    phone: payload.phone,
    email: payload.email
  });

  const phoneStatus = resolveFieldStatus(lookupResult.phoneContact, payload.id, Boolean(payload.phone));
  const emailStatus = resolveFieldStatus(lookupResult.emailContact, payload.id, Boolean(payload.email));

  const combinedMatches = deduplicateContacts(
    excludeCurrentContact(
      [lookupResult.phoneContact, lookupResult.emailContact].filter(Boolean),
      payload.id
    )
  );

  return {
    statusCode: 200,
    body: {
      status: computeTopStatus([phoneStatus, emailStatus]),
      count: combinedMatches.length,
      phoneStatus,
      emailStatus
    }
  };
}

export async function checkDuplicateBusinessController(req, res) {
  const context = resolveContextOrSendError(req, res);
  if (!context) {
    return undefined;
  }

  const payload = normalizeCheckDuplicateBusinessPayload(req.body || {});
  const shouldCheckBusinessName = hasBusinessName(payload);
  const shouldCheckAddress = hasFullBusinessAddress(payload);

  if (!shouldCheckBusinessName && !shouldCheckAddress) {
    return res.status(200).json({
      status: "null",
      count: 0,
      businessNameStatus: "null",
      addressStatus: "null"
    });
  }

  try {
    const [businessNameMatches, addressMatches] = await Promise.all([
      shouldCheckBusinessName
        ? searchContactsByBusinessName({
            ...payload,
            locationId: context.locationId,
            apiKey: context.apiKey
          })
        : Promise.resolve([]),
      shouldCheckAddress
        ? searchContactsByAddress({
            ...payload,
            locationId: context.locationId,
            apiKey: context.apiKey
          })
        : Promise.resolve([])
    ]);

    const filteredBusinessNameMatches = excludeCurrentContact(businessNameMatches, payload.id);
    const filteredAddressMatches = excludeCurrentContact(addressMatches, payload.id);
    const allMatches = deduplicateContacts([
      ...filteredBusinessNameMatches,
      ...filteredAddressMatches
    ]);

    const businessNameStatus = shouldCheckBusinessName
      ? (filteredBusinessNameMatches.length > 0 ? "duplicate" : "unique")
      : "null";
    const addressStatus = shouldCheckAddress
      ? (filteredAddressMatches.length > 0 ? "duplicate" : "unique")
      : "null";

    return res.status(200).json({
      status: computeTopStatus([businessNameStatus, addressStatus]),
      count: allMatches.length,
      businessNameStatus,
      addressStatus
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
      count: result.body.count,
      phoneStatus: result.body.phoneStatus,
      emailStatus: result.body.emailStatus
    });
  } catch (error) {
    if (error instanceof GhlServiceError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Unexpected error in legacy duplicate contact controller:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

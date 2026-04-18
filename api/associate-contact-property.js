import { randomUUID } from "crypto";
import { GhlServiceError } from "../services/ghl-contacts.service.js";
import { associateContactWithProperty } from "../services/ghl-objects.service.js";
import {
  resolveAuthContextFromRequest,
  validateRequestAuthContext
} from "../middleware/auth.middleware.js";
import {
  normalizeAssociatePropertyPayload,
  validateAssociatePropertyHeaders,
  validateAssociatePropertyPayload
} from "../validations/associate-property.validation.js";
import { logger } from "../utils/logger.js";

function resolveRequestId(req) {
  const requestIdHeader = req.headers?.["x-request-id"];
  const headerValue = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
  const normalized = String(headerValue || "").trim();

  return normalized || randomUUID();
}

export default async function associateContactPropertyHandler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const requestId = resolveRequestId(req);
  const headerValidation = validateAssociatePropertyHeaders(req.headers || {});

  if (!headerValidation.valid) {
    return res.status(400).json({ success: false, error: headerValidation.message });
  }

  const context = req.authContext || resolveAuthContextFromRequest(req, { allowBodyFallback: false });
  const authResult = validateRequestAuthContext(context);
  if (!authResult.valid) {
    return res.status(authResult.statusCode).json({ success: false, error: authResult.message });
  }

  const payload = normalizeAssociatePropertyPayload(req.body || {});
  const payloadValidation = validateAssociatePropertyPayload(payload);

  if (!payloadValidation.valid) {
    return res.status(400).json({
      success: false,
      error: `Missing required body fields: ${payloadValidation.missingFields.join(", ")}`
    });
  }

  logger.info("associate_contact_property.request", {
    requestId,
    locationId: context.locationId,
    objectId: headerValidation.objectId,
    contactId: payload.contactId,
    hasName: Boolean(payload.name),
    hasCity: Boolean(payload.city),
    hasState: Boolean(payload.state)
  });

  try {
    const result = await associateContactWithProperty({
      apiKey: context.apiKey,
      locationId: context.locationId,
      objectId: headerValidation.objectId,
      contactId: payload.contactId,
      name: payload.name,
      address: payload.address,
      city: payload.city,
      state: payload.state,
      requestId
    });

    logger.info("associate_contact_property.result", {
      requestId,
      locationId: context.locationId,
      objectId: headerValidation.objectId,
      propertyId: result.propertyId,
      existing: result.existing
    });

    return res.status(200).json({
      success: true,
      status: "associated",
      propertyId: result.propertyId,
      existing: result.existing
    });
  } catch (error) {
    const statusCode = error instanceof GhlServiceError ? error.statusCode : 500;
    const errorMessage = error?.message || "Internal server error";

    logger.error("associate_contact_property.error", {
      requestId,
      locationId: context.locationId,
      objectId: headerValidation.objectId,
      statusCode,
      message: errorMessage
    });

    return res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
}

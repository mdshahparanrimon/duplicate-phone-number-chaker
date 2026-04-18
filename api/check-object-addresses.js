import { GhlServiceError } from "../services/ghl-contacts.service.js";
import { checkObjectAddressExists } from "../services/ghl-objects.service.js";
import {
  normalizeCheckObjectAddressPayload,
  validateCheckObjectAddressPayload
} from "../validations/object-address.validation.js";

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }

  return String(value || "").trim();
}

export default async function checkObjectAddressesHandler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const objectId = normalizeHeaderValue(req.headers?.["x-object-id"]);
  if (!objectId) {
    return res.status(400).json({ message: "Missing required header: x-object-id" });
  }

  const payload = normalizeCheckObjectAddressPayload(req.body || {});
  const payloadValidation = validateCheckObjectAddressPayload(payload);

  if (!payloadValidation.valid) {
    return res.status(400).json({
      message: `Missing required body fields: ${payloadValidation.missingFields.join(", ")}`
    });
  }

  try {
    const status = await checkObjectAddressExists({
      apiKey: req.authContext.apiKey,
      locationId: req.authContext.locationId,
      objectId,
      id: payload.id,
      address: payload.address
    });

    return res.status(200).json({ status });
  } catch (error) {
    if (error instanceof GhlServiceError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Unexpected error in check-object-addresses handler:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

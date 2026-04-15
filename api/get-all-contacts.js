import {
  resolveAuthContextFromRequest,
  validateRequestAuthContext
} from "../middleware/auth.middleware.js";
import { GhlServiceError, getAllContacts } from "../services/ghl-contacts.service.js";

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export default async function getAllContactsHandler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const context = req.authContext || resolveAuthContextFromRequest(req, { allowBodyFallback: false });
  const authResult = validateRequestAuthContext(context);

  if (!authResult.valid) {
    return res.status(authResult.statusCode).json({ message: authResult.message });
  }

  const page = normalizePositiveInteger(req.body?.page, 1);
  const pageLimit = Math.min(normalizePositiveInteger(req.body?.pageLimit, 100), 100);
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";

  try {
    const result = await getAllContacts({
      locationId: context.locationId,
      apiKey: context.apiKey,
      page,
      pageLimit,
      query
    });

    return res.status(200).json({
      status: "success",
      count: result.contacts.length,
      contacts: result.contacts,
      page: result.meta.page,
      pageLimit: result.meta.pageLimit,
      total: result.meta.total
    });
  } catch (error) {
    if (error instanceof GhlServiceError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Unexpected error in get-all-contacts handler:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

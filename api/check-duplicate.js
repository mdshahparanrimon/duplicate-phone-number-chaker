function mapDuplicateStatus(data, id) {
  if (!data.contact) {
    return "null";
  }

  return data.contact.id === id ? "unique" : "duplicate";
}


async function searchDuplicateContact({ ghlApiKey, locationId, fieldKey, fieldValue }) {
  const params = new URLSearchParams({ locationId, [fieldKey]: fieldValue });
  const response = await fetch(
    `https://services.leadconnectorhq.com/contacts/search/duplicate?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${ghlApiKey}`,
        Version: "2021-07-28"
      }
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("GHL API error:", response.status, errorBody);
    throw new Error("Failed to fetch contacts from GHL");
  }

  return response.json();
}

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // x-api-key is your own custom key — validated against API_SECRET_KEY in .env
  const callerKey = req.headers["x-api-key"];
  if (!callerKey || callerKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ message: "Unauthorized: invalid x-api-key" });
  }

  const { id, email, phone } = req.body || {};

  if (!phone && !email) {
    return res.status(400).json({ message: "Missing required field: phone or email" });
  }

  // GHL API key passed by the caller in the x-ghl-api-key header
  const ghlApiKey = req.headers["x-ghl-api-key"];
  if (!ghlApiKey) {
    return res.status(401).json({ message: "Missing x-ghl-api-key header" });
  }

  const locationId = req.headers["x-location-id"];
  if (!locationId) {
    return res.status(400).json({ message: "Missing x-location-id header" });
  }

  const lookupTasks = [];
  if (phone) {
    lookupTasks.push(
      searchDuplicateContact({
        ghlApiKey,
        locationId,
        fieldKey: "number",
        fieldValue: phone
      }).then((data) => ({ field: "phone", data }))
    );
  }

  if (email) {
    lookupTasks.push(
      searchDuplicateContact({
        ghlApiKey,
        locationId,
        fieldKey: "email",
        fieldValue: email
      }).then((data) => ({ field: "email", data }))
    );
  }

  let lookupResults;
  try {
    lookupResults = await Promise.all(lookupTasks);
  } catch (err) {
    console.error("Error calling GHL API:", err);
    if (err.message === "Failed to fetch contacts from GHL") {
      return res.status(502).json({ message: err.message });
    }

    return res.status(502).json({ message: "Network error while contacting GHL API" });
  }

  let phoneStatus;
  let emailStatus;
  for (const result of lookupResults) {
    const fieldStatus = mapDuplicateStatus(result.data, id);
    if (result.field === "phone") {
      phoneStatus = fieldStatus;
    } else if (result.field === "email") {
      emailStatus = fieldStatus;
    }
  }

  const evaluatedStatuses = [phoneStatus, emailStatus].filter(Boolean);
  let status = "null";
  if (evaluatedStatuses.includes("duplicate")) {
    status = "duplicate";
  } else if (evaluatedStatuses.includes("unique")) {
    status = "unique";
  }

  return res.status(200).json({
    status,
    ...(phone ? { phoneStatus } : {}),
    ...(email ? { emailStatus } : {})
  });

}
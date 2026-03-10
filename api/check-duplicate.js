export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // x-api-key is your own custom key — validated against API_SECRET_KEY in .env
  const callerKey = req.headers["x-api-key"];
  if (!callerKey || callerKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ message: "Unauthorized: invalid x-api-key" });
  }

  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ message: "Missing required field: phone" });
  }

  const locationId = process.env.GHL_LOCATION_ID;

  // GHL API key passed by the caller in the x-ghl-api-key header
  const ghlApiKey = req.headers["x-ghl-api-key"];
  if (!ghlApiKey) {
    return res.status(401).json({ message: "Missing x-ghl-api-key header" });
  }

  const params = new URLSearchParams({ locationId, number: phone });

  let data;
  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/search?${params.toString()}`,
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
      return res.status(502).json({ message: "Failed to fetch contacts from GHL" });
    }

    data = await response.json();
  } catch (err) {
    console.error("Network error calling GHL API:", err);
    return res.status(502).json({ message: "Network error while contacting GHL API" });
  }

  // GHL returns the duplicate contact object if one exists, null otherwise
  const status = data.contact ? "duplicate" : "unique";

  return res.status(200).json({ status });

}
export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const callerKey = req.headers["x-api-key"];
  if (!callerKey || callerKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ message: "Phone is required" });
  }

  const locationId = process.env.GHL_LOCATION_ID;

  const ghlApiKey = req.headers["x-ghl-api-key"];
  if (!ghlApiKey) {
    return res.status(401).json({ message: "Missing x-ghl-api-key" });
  }

  const params = new URLSearchParams({
    locationId,
    query: phone
  });

  let data;

  try {

    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${ghlApiKey}`,
          Version: "2021-07-28"
        }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("GHL error:", error);
      return res.status(502).json({ message: "GHL API error" });
    }

    data = await response.json();

  } catch (err) {
    console.error("Network error:", err);
    return res.status(502).json({ message: "Network error" });
  }

  const status =
    data.contacts && data.contacts.length > 0
      ? "duplicate"
      : "unique";

  return res.status(200).json({ status });

}
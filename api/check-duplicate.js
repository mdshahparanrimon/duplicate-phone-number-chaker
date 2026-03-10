export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // GHL API key must be passed by the caller via the x-api-key header
  const ghlApiKey = req.headers["x-api-key"];
  if (!ghlApiKey) {
    return res.status(401).json({ message: "Missing x-api-key header" });
  }

  const { id, name, email, phone } = req.body;

  if (!phone) {
    return res.status(400).json({ message: "Missing required field: phone" });
  }

  // Build search URL — encode the phone number to prevent injection
  const params = new URLSearchParams({ phone });

  let data;
  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${ghlApiKey}`,
          Version: "2021-07-28",
          "Content-Type": "application/json"
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

  const contacts = data.contacts ?? [];

  // More than one contact sharing the same phone number means a duplicate exists.
  // (The contact itself counts as one hit, so > 1 means another contact also has this number.)
  const status = contacts.length > 1 ? "duplicate" : "unique";

  return res.status(200).json({
    status,
    id: id ?? null,
    name: name ?? null,
    email: email ?? null,
    phone,
    matchCount: contacts.length
  });

}
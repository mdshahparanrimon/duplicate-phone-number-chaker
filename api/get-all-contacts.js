export default async function getAllContactsHandler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  return res.status(501).json({ message: "Not implemented yet" });
}

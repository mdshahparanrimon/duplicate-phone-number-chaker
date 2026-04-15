import { checkDuplicatePhoneEmailController } from "../controllers/contacts.controller.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  return checkDuplicatePhoneEmailController(req, res);
}

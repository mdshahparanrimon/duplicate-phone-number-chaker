import express from "express";
import handler from "./api/check-duplicate.js";
import getAllContactsHandler from "./api/get-all-contacts.js";
import { requireAuthHeaders } from "./middleware/auth.middleware.js";
import {
  checkDuplicateBusinessController,
  checkDuplicatePhoneEmailController
} from "./controllers/contacts.controller.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

app.post("/api/check-duplicate", requireAuthHeaders, handler);
app.post("/api/check-duplicate-contact", requireAuthHeaders, checkDuplicatePhoneEmailController);
app.post("/api/check-duplicate-business", requireAuthHeaders, checkDuplicateBusinessController);
app.post("/api/get-all-contacts", requireAuthHeaders, getAllContactsHandler);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

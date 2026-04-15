import express from "express";
import {
	checkDuplicateBusinessController,
	checkDuplicatePhoneEmailController
} from "../controllers/contacts.controller.js";

const router = express.Router();

router.post("/check-duplicate-business", checkDuplicateBusinessController);
router.post("/check-duplicate-contact", checkDuplicatePhoneEmailController);

export default router;

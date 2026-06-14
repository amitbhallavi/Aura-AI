const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { createOrder, verifyPayment, getPlans } = require("../controllers/payment.controller");

router.use(authMiddleware);
router.get("/plans", getPlans);
router.post("/create-order", createOrder);
router.post("/verify", verifyPayment);

module.exports = router;
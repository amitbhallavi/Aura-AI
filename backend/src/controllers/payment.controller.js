const Razorpay = require("razorpay");
const crypto = require("crypto");
const { pgPool } = require("../config/database");

const PLANS = {
  pro: { name: "Pro", price: 99900, currency: "INR" },
  enterprise: { name: "Enterprise", price: 499900, currency: "INR" },
};

function getRazorpayConfig() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();

  return {
    keyId,
    keySecret,
    isConfigured: Boolean(keyId && keySecret),
  };
}

function createRazorpayClient() {
  const config = getRazorpayConfig();
  if (!config.isConfigured) {
    return { client: null, ...config };
  }

  return {
    ...config,
    client: new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    }),
  };
}

function isRazorpayAuthError(err) {
  const statusCode = err?.statusCode || err?.status;
  const code = String(err?.error?.code || err?.code || "").toLowerCase();
  const description = String(err?.error?.description || err?.message || "").toLowerCase();

  return (
    Number(statusCode) === 401 ||
    code.includes("auth") ||
    description.includes("authentication") ||
    description.includes("unauthorized") ||
    description.includes("key id") ||
    description.includes("key_id")
  );
}

function logSafeRazorpayError(label, err) {
  console.error(label, {
    statusCode: err?.statusCode || err?.status || null,
    code: err?.error?.code || err?.code || null,
    reason: isRazorpayAuthError(err) ? "authentication_failed" : "razorpay_api_failed",
  });
}

function paymentError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    code,
    error: message,
  });
}

async function getPlans(req, res) {
  res.json([
    { id: "free", name: "Free", price: 0, features: ["10 calls/month", "20 messages", "Basic AI chat"] },
    { id: "pro", name: "Pro", price: 999, features: ["Unlimited calls", "Unlimited messages", "Advanced AI", "Priority support"] },
    { id: "enterprise", name: "Enterprise", price: 4999, features: ["Everything in Pro", "Custom AI training", "Dedicated support", "Analytics"] },
  ]);
}

async function createOrder(req, res) {
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: "Invalid plan." });

  const { client, keyId, isConfigured } = createRazorpayClient();
  if (!isConfigured || !client) {
    return paymentError(
      res,
      503,
      "payment_config_missing",
      "Payment setup missing. Add Razorpay keys in backend .env."
    );
  }

  try {
    const order = await client.orders.create({
      amount: PLANS[plan].price,
      currency: PLANS[plan].currency,
      receipt: `r_${Date.now().toString().slice(-10)}`,
      notes: { userId: req.user.id, plan },
    });
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, plan, keyId });
  } catch (err) {
    logSafeRazorpayError("Razorpay order create failed:", err);
    if (isRazorpayAuthError(err)) {
      return paymentError(
        res,
        401,
        "razorpay_auth_failed",
        "Razorpay rejected the key pair. Check test/live key and secret."
      );
    }

    return paymentError(
      res,
      502,
      "razorpay_order_failed",
      "Razorpay order creation failed. Please try again."
    );
  }
}

async function verifyPayment(req, res) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: "Invalid plan." });

  const { keySecret, isConfigured } = getRazorpayConfig();
  if (!isConfigured) {
    return paymentError(
      res,
      503,
      "payment_config_missing",
      "Payment setup missing. Add Razorpay keys in backend .env."
    );
  }

  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expected = crypto.createHmac("sha256", keySecret).update(sign).digest("hex");

  if (expected !== razorpay_signature) {
    return res.status(400).json({ error: "Payment verification failed." });
  }

  try {
    await pgPool.query(
      "UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2",
      [plan, req.user.id]
    );
    res.json({ success: true, plan, message: `${plan} plan activated!` });
  } catch (err) {
    res.status(500).json({ error: "Failed to update plan." });
  }
}

module.exports = { createOrder, verifyPayment, getPlans };

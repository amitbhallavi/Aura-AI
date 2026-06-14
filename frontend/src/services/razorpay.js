import api from "./api";

let razorpayScriptPromise;

export function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) {
        resolve();
      } else {
        razorpayScriptPromise = null;
        reject(Object.assign(new Error("Razorpay checkout did not initialize."), { code: "checkout_load_failed" }));
      }
    };
    script.onerror = () => {
      razorpayScriptPromise = null;
      reject(Object.assign(new Error("Razorpay checkout failed to load."), { code: "checkout_load_failed" }));
    };
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

export function getPaymentNotice(err) {
  const code = err?.response?.data?.code || err?.code;
  const serverMessage = err?.response?.data?.error;

  if (code === "payment_config_missing") {
    return {
      type: "error",
      message: "Payment setup missing. Add Razorpay keys in backend .env.",
      detail: "Restart the backend after updating RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    };
  }

  if (code === "razorpay_auth_failed") {
    return {
      type: "error",
      message: "Razorpay rejected the key pair. Check test/live key and secret.",
      detail: "Do not mix a test key id with a live secret, or a live key id with a test secret.",
    };
  }

  if (code === "razorpay_order_failed") {
    return {
      type: "error",
      message: "Razorpay order creation failed.",
      detail: "Check Razorpay dashboard status and backend logs, then try again.",
    };
  }

  if (code === "checkout_load_failed") {
    return {
      type: "error",
      message: "Razorpay checkout could not load.",
      detail: "Disable blockers for checkout. The checkout script must load before payment can start.",
    };
  }

  return {
    type: "error",
    message: serverMessage || "Failed to initiate payment.",
    detail: "If Razorpay checkout did not open, check backend logs and browser blockers.",
  };
}

export async function startPlanCheckout({ planId, user, onNotice, onSuccess }) {
  if (planId === "free") return;

  await loadRazorpayCheckout();
  const res = await api.post("/payments/create-order", { plan: planId });
  const { orderId, amount, currency, keyId } = res.data;
  const checkoutKey = keyId || import.meta.env.VITE_RAZORPAY_KEY_ID;

  if (!checkoutKey) {
    onNotice?.({
      type: "error",
      message: "Razorpay public key missing.",
      detail: "Backend should return keyId. As a fallback, add VITE_RAZORPAY_KEY_ID in frontend .env.",
    });
    return;
  }

  const options = {
    key: checkoutKey,
    amount,
    currency,
    name: "AURA AI Platform",
    description: `${planId} Plan Subscription`,
    order_id: orderId,
    handler: async (response) => {
      try {
        const verify = await api.post("/payments/verify", {
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          plan: planId,
        });

        if (verify.data.success) {
          onNotice?.({
            type: "success",
            message: verify.data.message || `${planId} plan activated.`,
            detail: "Your dashboard plan will refresh automatically.",
          });
          await onSuccess?.(verify.data);
        }
      } catch (err) {
        onNotice?.({
          type: "error",
          message: "Payment verification failed.",
          detail: err?.response?.data?.error || "Check Razorpay dashboard before retrying.",
        });
      }
    },
    prefill: { name: user?.name, email: user?.email },
    theme: { color: "#6c63ff" },
    modal: {
      ondismiss: () => {
        onNotice?.({
          type: "info",
          message: "Payment checkout closed.",
          detail: "No plan change was made.",
        });
      },
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.on("payment.failed", (response) => {
    onNotice?.({
      type: "error",
      message: "Payment failed inside Razorpay checkout.",
      detail: response?.error?.description || "Try another payment method or check Razorpay test details.",
    });
  });
  rzp.open();
  onNotice?.({
    type: "info",
    message: "Razorpay checkout opened.",
    detail: "Complete the payment in the Razorpay window.",
  });
}

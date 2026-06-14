export const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    priceLabel: "Free",
    description: "For testing AURA with light personal usage.",
    features: ["10 calls/month", "20 messages", "Basic AI chat", "Email support"],
    accent: "#9196b5",
  },
  {
    id: "pro",
    name: "Pro",
    price: 999,
    priceLabel: "₹999",
    description: "For freelancers and small teams running daily workflows.",
    features: ["Unlimited calls", "Unlimited messages", "Advanced AI", "Priority support", "Analytics"],
    accent: "#6c63ff",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 4999,
    priceLabel: "₹4,999",
    description: "For teams that need higher support and custom workflows.",
    features: ["Everything in Pro", "Custom AI training", "Dedicated support", "Advanced analytics", "API access"],
    accent: "#10d9a0",
  },
];

export function getPlan(planId) {
  return PLANS.find((plan) => plan.id === planId) || PLANS[0];
}

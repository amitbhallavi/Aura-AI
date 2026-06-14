import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { loadProfile } from "../features/auth/authSlice";
import { PLANS } from "../constants/plans";
import { getPaymentNotice, startPlanCheckout } from "../services/razorpay";

function Notice({ notice, onClose }) {
  if (!notice) return null;
  const styles = {
    success: { border: "rgba(16,217,160,0.35)", bg: "rgba(16,217,160,0.08)" },
    error: { border: "rgba(239,68,68,0.28)", bg: "rgba(239,68,68,0.08)" },
    info: { border: "rgba(108,99,255,0.28)", bg: "rgba(108,99,255,0.08)" },
  };
  const tone = styles[notice.type] || styles.info;

  return (
    <div className="rounded-2xl p-4" style={{ background: tone.bg, border: `1px solid ${tone.border}` }} role={notice.type === "error" ? "alert" : "status"}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{notice.message}</div>
          {notice.detail && <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{notice.detail}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-xs"
          style={{ color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function Pricing() {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const [loading, setLoading] = useState("");
  const [selectedPlan] = useState(() => localStorage.getItem("aura_selected_plan") || "");
  const [notice, setNotice] = useState(null);

  async function handleUpgrade(planId) {
    if (planId === "free" || user?.plan === planId) return;
    setLoading(planId);
    setNotice(null);

    try {
      await startPlanCheckout({
        planId,
        user,
        onNotice: setNotice,
        onSuccess: async () => {
          localStorage.removeItem("aura_selected_plan");
          await dispatch(loadProfile()).unwrap();
        },
      });
    } catch (err) {
      setNotice(getPaymentNotice(err));
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="min-h-full p-4 md:p-6" style={{ background: "var(--bg-base)" }}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Choose your plan</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Current plan: <span className="font-semibold capitalize" style={{ color: "var(--accent)" }}>{user?.plan || "free"}</span>
          </p>
        </div>

        <div className="mb-5 space-y-3">
          <Notice notice={notice} onClose={() => setNotice(null)} />
          <div className="rounded-2xl px-4 py-3 text-xs" style={{ color: "var(--text-muted)", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            Payment is final only after backend signature verification. Browser blockers can create Razorpay console noise, but checkout must still open.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = user?.plan === plan.id;
            const highlighted = plan.popular || selectedPlan === plan.id;

            return (
              <div
                key={plan.id}
                className="rounded-2xl p-7 transition-transform hover:-translate-y-0.5"
                style={{
                  background: "var(--bg-card)",
                  border: highlighted ? "2px solid var(--accent)" : "1px solid var(--border)",
                }}
              >
                {selectedPlan === plan.id && (
                  <div className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-medium" style={{ background: "rgba(16,217,160,0.1)", color: "#10d9a0", border: "1px solid rgba(16,217,160,0.25)" }}>
                    Selected during signup
                  </div>
                )}
                {plan.popular && (
                  <div className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
                    Most popular
                  </div>
                )}

                <div className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{plan.name}</div>
                <div className="mt-2 font-display text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
                  {plan.priceLabel}
                  {plan.price > 0 && <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>/month</span>}
                </div>
                <p className="mt-2 min-h-10 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{plan.description}</p>

                <div className="my-6 space-y-2">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <span style={{ color: plan.accent }}>✓</span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrent || loading === plan.id || plan.id === "free"}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    background: isCurrent ? "var(--bg-elevated)" : plan.popular ? "var(--accent)" : "var(--bg-elevated)",
                    color: isCurrent ? "var(--text-muted)" : plan.popular ? "white" : "var(--text-primary)",
                    border: `1px solid ${isCurrent ? "var(--border)" : plan.popular ? "var(--accent)" : "var(--border-hover)"}`,
                  }}
                >
                  {loading === plan.id ? "Opening Razorpay..." : isCurrent ? "Current plan" : plan.id === "free" ? "Free forever" : `Upgrade to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { loadProfile } from "../features/auth/authSlice";
import { PLANS } from "../constants/plans";
import { getPaymentNotice, startPlanCheckout } from "../services/razorpay";

const FEATURES = [
  {
    title: "Voice calls",
    body: "Schedule AI calls, route through Twilio, and track completion from one dashboard.",
  },
  {
    title: "Messages",
    body: "Send SMS and WhatsApp messages with AI-written content and delivery history.",
  },
  {
    title: "Workflows",
    body: "Create tasks, reminders, Gmail drafts, calendar events, and location actions through chat.",
  },
  {
    title: "Fallback AI",
    body: "Gemini is primary. Groq LLaMA keeps core AI responses alive when the main provider fails.",
  },
];

function getInitialTheme() {
  if (typeof document !== "undefined") {
    const documentTheme = document.documentElement.getAttribute("data-theme");
    if (documentTheme) return documentTheme;
  }
  if (typeof localStorage !== "undefined") return localStorage.getItem("aura_theme") || "dark";
  return "dark";
}

function getColors(theme) {
  const light = theme === "light";

  return {
    light,
    page: light ? "#f5f7fb" : "#080b10",
    pageAlt: light ? "#ffffff" : "#0c1017",
    header: light ? "rgba(255,255,255,0.88)" : "rgba(8,11,16,0.88)",
    surface: light ? "#ffffff" : "#10141d",
    surfaceSoft: light ? "#f8fafc" : "rgba(255,255,255,0.04)",
    card: light ? "#ffffff" : "#171b24",
    cardStrong: light ? "#f6f7ff" : "#141826",
    border: light ? "rgba(25,32,44,0.12)" : "rgba(255,255,255,0.10)",
    borderStrong: light ? "rgba(108,99,255,0.30)" : "rgba(108,99,255,0.55)",
    text: light ? "#141824" : "#ffffff",
    muted: light ? "#5d6678" : "rgba(255,255,255,0.62)",
    faint: light ? "#858ea1" : "rgba(255,255,255,0.42)",
    accent: "#6c63ff",
    accentHover: "#7b73ff",
    accentSoft: light ? "rgba(108,99,255,0.10)" : "rgba(108,99,255,0.15)",
    green: "#10d9a0",
    shadow: light ? "0 24px 70px rgba(31,41,55,0.12)" : "0 28px 80px rgba(0,0,0,0.45)",
    heroGlow: light
      ? "radial-gradient(circle at 18% 12%, rgba(108,99,255,0.16), transparent 30%), radial-gradient(circle at 86% 18%, rgba(16,217,160,0.16), transparent 28%)"
      : "radial-gradient(circle at 20% 15%, rgba(108,99,255,0.22), transparent 28%), radial-gradient(circle at 82% 20%, rgba(16,217,160,0.16), transparent 26%)",
    previewShell: light ? "#ffffff" : "#202430",
    previewInner: light ? "#f8fafc" : "#07090d",
    previewCard: light ? "#ffffff" : "rgba(255,255,255,0.04)",
    previewAi: light ? "rgba(108,99,255,0.08)" : "rgba(108,99,255,0.10)",
    previewText: light ? "#171b24" : "#ffffff",
    previewMuted: light ? "#6b7280" : "rgba(255,255,255,0.42)",
    previewBorder: light ? "rgba(31,41,55,0.12)" : "rgba(255,255,255,0.10)",
    previewShadow: light ? "0 28px 80px rgba(31,41,55,0.14)" : "0 28px 80px rgba(0,0,0,0.45)",
  };
}

function Notice({ notice, onClose, colors }) {
  if (!notice) return null;
  const isError = notice.type === "error";
  const isSuccess = notice.type === "success";

  return (
    <div
      className="mx-auto mb-8 flex max-w-4xl items-start justify-between gap-4 rounded-2xl border p-4"
      style={{
        borderColor: isError ? "rgba(248,113,113,0.38)" : isSuccess ? "rgba(16,217,160,0.38)" : colors.borderStrong,
        background: isError ? "rgba(248,113,113,0.10)" : isSuccess ? "rgba(16,217,160,0.10)" : colors.accentSoft,
      }}
    >
      <div>
        <div className="text-sm font-semibold" style={{ color: colors.text }}>{notice.message}</div>
        {notice.detail && <div className="mt-1 text-xs leading-relaxed" style={{ color: colors.muted }}>{notice.detail}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border px-2 py-1 text-xs"
        style={{ color: colors.muted, borderColor: colors.border, background: colors.surfaceSoft }}
      >
        Dismiss
      </button>
    </div>
  );
}

function PlanCard({ plan, currentPlan, loading, onSelect, colors }) {
  const isCurrent = currentPlan === plan.id;
  const disabled = loading === plan.id || isCurrent;
  const highlighted = plan.popular;

  return (
    <div
      className="relative rounded-2xl border p-6"
      style={{
        background: highlighted ? colors.cardStrong : colors.card,
        borderColor: highlighted ? colors.borderStrong : colors.border,
        boxShadow: highlighted ? "0 18px 55px rgba(108,99,255,0.16)" : "none",
      }}
    >
      {plan.popular && (
        <div
          className="mb-4 inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ borderColor: colors.borderStrong, background: colors.accentSoft, color: colors.accent }}
        >
          Most used
        </div>
      )}
      <div className="text-sm" style={{ color: colors.faint }}>{plan.name}</div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-3xl font-semibold" style={{ color: colors.text }}>{plan.priceLabel}</span>
        {plan.price > 0 && <span className="pb-1 text-sm" style={{ color: colors.faint }}>/month</span>}
      </div>
      <p className="mt-3 min-h-12 text-sm leading-relaxed" style={{ color: colors.muted }}>{plan.description}</p>
      <div className="mt-5 space-y-2">
        {plan.features.map((feature) => (
          <div key={feature} className="flex gap-2 text-sm" style={{ color: colors.muted }}>
            <span style={{ color: plan.accent }}>✓</span>
            <span>{feature}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSelect(plan.id)}
        disabled={disabled}
        className="mt-6 w-full rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          borderColor: plan.popular ? colors.accent : colors.border,
          background: plan.popular && !isCurrent ? colors.accent : colors.surfaceSoft,
          color: plan.popular && !isCurrent ? "#ffffff" : colors.text,
        }}
      >
        {loading === plan.id ? "Opening Razorpay..." : isCurrent ? "Current plan" : plan.id === "free" ? "Start free" : `Choose ${plan.name}`}
      </button>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, token } = useSelector((s) => s.auth);
  const [theme, setTheme] = useState(getInitialTheme);
  const [loading, setLoading] = useState("");
  const [notice, setNotice] = useState(null);
  const colors = getColors(theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("aura_theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((value) => (value === "dark" ? "light" : "dark"));
  }

  async function handlePlan(planId) {
    if (planId === "free") {
      navigate(token ? "/dashboard" : "/register");
      return;
    }

    if (!token) {
      localStorage.setItem("aura_selected_plan", planId);
      navigate("/register");
      return;
    }

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
    <div style={{ minHeight: "100vh", background: colors.page, color: colors.text }}>
      <header className="sticky top-0 z-40 border-b backdrop-blur-xl" style={{ background: colors.header, borderColor: colors.border }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
          <Link to="/" className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-bold"
              style={{ borderColor: colors.borderStrong, background: colors.accentSoft, color: colors.accent }}
            >
              A
            </span>
            <div>
              <div className="text-sm font-bold tracking-[0.18em]" style={{ color: colors.text }}>AURA</div>
              <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: colors.faint }}>AI Platform</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-sm md:flex" style={{ color: colors.muted }}>
            <a href="#features" className="transition hover:opacity-75">Features</a>
            <a href="#pricing" className="transition hover:opacity-75">Pricing</a>
            <a href="#payments" className="transition hover:opacity-75">Razorpay</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="flex h-10 w-10 items-center justify-center rounded-xl border transition"
              style={{ borderColor: colors.border, background: colors.surfaceSoft, color: colors.text }}
            >
              {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3a6 6 0 0 0 9 7.5A9 9 0 1 1 12 3Z" />
                </svg>
              )}
            </button>
            {token ? (
              <Link
                to="/dashboard"
                className="rounded-xl border px-4 py-2 text-sm font-medium"
                style={{ borderColor: colors.border, background: colors.surfaceSoft, color: colors.text }}
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden rounded-xl px-4 py-2 text-sm font-medium sm:block" style={{ color: colors.muted }}>
                  Login
                </Link>
                <Link to="/register" className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: colors.accent }}>
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div>
        <section className="relative overflow-hidden border-b" style={{ borderColor: colors.border }}>
          <div className="absolute inset-0" style={{ background: colors.heroGlow }} />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-[1.02fr_0.98fr] md:px-6 md:py-24">
            <div className="flex flex-col justify-center">
              <div
                className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs"
                style={{ borderColor: colors.border, background: colors.surfaceSoft, color: colors.muted }}
              >
                Gemini primary | Groq fallback | Twilio workflows
              </div>
              <h1 className="max-w-3xl text-5xl font-semibold leading-[0.95] tracking-normal md:text-7xl" style={{ color: colors.text }}>
                AURA
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 md:text-xl" style={{ color: colors.muted }}>
                An AI assistant platform for calls, WhatsApp, SMS, Gmail, Calendar, Maps, tasks, and dashboard workflows.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => navigate(token ? "/dashboard" : "/register")}
                  className="rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(108,99,255,0.28)]"
                  style={{ background: colors.accent }}
                >
                  {token ? "Open dashboard" : "Start free"}
                </button>
                <a
                  href="#pricing"
                  className="rounded-2xl border px-6 py-3 text-center text-sm font-semibold"
                  style={{ borderColor: colors.border, background: colors.surface, color: colors.text }}
                >
                  View pricing
                </a>
              </div>
            </div>

            <div className="rounded-[2rem] border p-4" style={{ borderColor: colors.border, background: colors.previewShell, boxShadow: colors.previewShadow }}>
              <div className="rounded-[1.5rem] border p-4" style={{ borderColor: colors.previewBorder, background: colors.previewInner, color: colors.previewText }}>
                <div className="mb-4 flex items-center justify-between border-b pb-4" style={{ borderColor: colors.previewBorder }}>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: colors.previewText }}>Command Center</div>
                    <div className="text-xs" style={{ color: colors.previewMuted }}>Live workflow preview</div>
                  </div>
                  <div className="rounded-full border border-[#10d9a0]/30 bg-[#10d9a0]/10 px-3 py-1 text-xs text-[#10d9a0]">Online</div>
                </div>

                <div className="space-y-3">
                  {[
                    ["Call", "Follow up with Rahul at 4:30 PM", "#10d9a0"],
                    ["Message", "WhatsApp campaign draft ready", "#60a5fa"],
                    ["Task", "Invoice reminder due today", "#f59e0b"],
                    ["Map", "3 nearby client locations found", "#6c63ff"],
                  ].map(([label, body, color]) => (
                    <div key={label} className="rounded-2xl border p-4" style={{ borderColor: colors.previewBorder, background: colors.previewCard }}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color }}>{label}</span>
                        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                      </div>
                      <div className="mt-2 text-sm" style={{ color: colors.previewText }}>{body}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: colors.borderStrong, background: colors.previewAi }}>
                  <div className="text-xs uppercase tracking-[0.16em]" style={{ color: colors.accent }}>AI response</div>
                  <div className="mt-2 text-sm leading-6" style={{ color: colors.previewText }}>
                    "I scheduled the call, created a task, and will notify you when the call completes."
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-4 py-16 md:px-6">
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.green }}>Features</div>
              <h2 className="mt-3 text-3xl font-semibold md:text-4xl" style={{ color: colors.text }}>Built for real actions, not only chat.</h2>
            </div>
            <p className="max-w-xl text-sm leading-7" style={{ color: colors.muted }}>
              The weak version of an AI product is a chat box. AURA needs tools, confirmations, logs, payment state, and notifications. This page points users to those workflows.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-2xl border p-5" style={{ borderColor: colors.border, background: colors.card }}>
                <div className="text-lg font-semibold" style={{ color: colors.text }}>{feature.title}</div>
                <p className="mt-3 text-sm leading-7" style={{ color: colors.muted }}>{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="border-y px-4 py-16 md:px-6" style={{ borderColor: colors.border, background: colors.pageAlt }}>
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 text-center">
              <div className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.accent }}>Pricing</div>
              <h2 className="mt-3 text-3xl font-semibold md:text-4xl" style={{ color: colors.text }}>Choose a plan</h2>
              <p className="mt-3 text-sm" style={{ color: colors.muted }}>Paid plans use Razorpay checkout. Your plan updates after backend signature verification.</p>
            </div>

            <Notice notice={notice} onClose={() => setNotice(null)} colors={colors} />

            <div className="grid gap-5 lg:grid-cols-3">
              {PLANS.map((plan) => (
                <PlanCard key={plan.id} plan={plan} currentPlan={user?.plan || "free"} loading={loading} onSelect={handlePlan} colors={colors} />
              ))}
            </div>
          </div>
        </section>

        <section id="payments" className="mx-auto grid max-w-7xl gap-6 px-4 py-16 md:grid-cols-3 md:px-6">
          {[
            ["Secure checkout", "Razorpay order is created on the backend. The secret key never touches the browser."],
            ["Verified upgrade", "The backend verifies payment signature before updating PostgreSQL user plan."],
            ["Dashboard state", "The frontend refreshes the profile after payment so the current plan is visible immediately."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border p-5" style={{ borderColor: colors.border, background: colors.card }}>
              <div className="text-lg font-semibold" style={{ color: colors.text }}>{title}</div>
              <p className="mt-3 text-sm leading-7" style={{ color: colors.muted }}>{body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

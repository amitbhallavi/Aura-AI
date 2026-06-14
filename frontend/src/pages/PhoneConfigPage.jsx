import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  addCallerNumber,
  checkVerificationStatus,
  clearPhoneConfigStatus,
  fetchConfig,
  removeCallerNumber,
  saveConfig,
  setActiveCallerId,
  setActiveMode,
  testConnection,
} from "../features/phoneConfig/phoneConfigSlice";

const MODES = [
  { id: "personal", title: "Personal Number", description: "Use this for personal calling and messaging." },
  { id: "business", title: "Business Number", description: "Use this for business calling and messaging." },
];

const emptyCredentials = { twilioSid: "", twilioToken: "", twilioPhone: "" };

function maskForDisplay(value) {
  const clean = String(value || "");
  if (!clean) return "";
  if (clean.length <= 4) return "****";
  return `${"•".repeat(6)}${clean.slice(-4)}`;
}

function StatusBadge({ status }) {
  const verified = status === "verified" || status === true;
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
      verified ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-300"
    }`}>
      {verified ? "Verified" : "Pending"}
    </span>
  );
}

function ConfigBadge({ configured }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
      configured ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-300"
    }`}>
      {configured ? "Configured" : "Not Set"}
    </span>
  );
}

function TextField({ label, value, onChange, placeholder, type = "text", rightAction = null }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] focus-within:border-[var(--accent)]">
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
        {rightAction}
      </div>
    </label>
  );
}

function InfoBox({ tone = "neutral", children }) {
  const styles = {
    neutral: "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]",
    warn: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    ok: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    danger: "border-red-400/25 bg-red-400/10 text-red-300",
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles[tone]}`}>{children}</div>;
}

function NumberCard({
  mode,
  title,
  description,
  form,
  savedSlot,
  active,
  showToken,
  loading,
  testing,
  testResult,
  onFieldChange,
  onSave,
  onTest,
  onToggleToken,
}) {
  return (
    <section className={`rounded-lg border p-5 transition ${
      active ? "border-emerald-400/50 bg-emerald-400/10" : "border-[var(--border)] bg-[var(--bg-card)]"
    }`}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
        </div>
        <ConfigBadge configured={savedSlot.configured} />
      </div>

      <div className="space-y-4">
        <TextField
          label="Twilio Account SID"
          value={form.twilioSid}
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          onChange={(value) => onFieldChange(mode, "twilioSid", value)}
        />
        <TextField
          label="Twilio Auth Token"
          type={showToken ? "text" : "password"}
          value={form.twilioToken}
          placeholder={savedSlot.twilioTokenMasked ? `Saved: ${maskForDisplay(savedSlot.twilioTokenMasked)}` : "Enter auth token"}
          onChange={(value) => onFieldChange(mode, "twilioToken", value)}
          rightAction={(
            <button
              type="button"
              onClick={() => onToggleToken(mode)}
              className="px-3 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            >
              {showToken ? "Hide" : "Show"}
            </button>
          )}
        />
        {savedSlot.twilioTokenMasked ? (
          <p className="text-xs text-[var(--text-muted)]">Saved token: {maskForDisplay(savedSlot.twilioTokenMasked)}</p>
        ) : null}
        <TextField
          label="Twilio Phone Number"
          value={form.twilioPhone}
          placeholder="+1XXXXXXXXXX"
          onChange={(value) => onFieldChange(mode, "twilioPhone", value)}
        />
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => onSave(mode)}
          disabled={loading}
          className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => onTest(mode)}
          disabled={testing}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {testing ? "Testing..." : "Test Connection"}
        </button>
      </div>

      {testResult?.mode === mode ? (
        <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
          Connection verified. Account status: {testResult.accountStatus || "active"}.
        </div>
      ) : null}
    </section>
  );
}

export default function PhoneConfigPage() {
  const dispatch = useDispatch();
  const {
    personalNumber,
    businessNumber,
    activeMode,
    verifiedCallerIds,
    activeCallerId,
    activeCallerIdMasked,
    loading,
    testing,
    error,
    notice,
    pendingNumber,
    lastTestResult,
    credentialWarning,
  } = useSelector((state) => state.phoneConfig);

  const [forms, setForms] = useState({ personal: emptyCredentials, business: emptyCredentials });
  const [showTokens, setShowTokens] = useState({ personal: false, business: false });
  const [callerForm, setCallerForm] = useState({ phoneNumber: "", friendlyName: "" });

  useEffect(() => {
    dispatch(fetchConfig());
  }, [dispatch]);

  useEffect(() => {
    setForms({
      personal: {
        twilioSid: personalNumber.twilioSid || "",
        twilioToken: "",
        twilioPhone: personalNumber.twilioPhone || "",
      },
      business: {
        twilioSid: businessNumber.twilioSid || "",
        twilioToken: "",
        twilioPhone: businessNumber.twilioPhone || "",
      },
    });
  }, [personalNumber.twilioSid, personalNumber.twilioPhone, businessNumber.twilioSid, businessNumber.twilioPhone]);

  const activeSlot = activeMode === "business" ? businessNumber : personalNumber;
  const activeCaller = useMemo(
    () => verifiedCallerIds.find((item) => item.number === activeCallerId),
    [activeCallerId, verifiedCallerIds]
  );

  function handleFieldChange(mode, field, value) {
    setForms((current) => ({
      ...current,
      [mode]: { ...current[mode], [field]: value },
    }));
  }

  function handleCallerField(field, value) {
    setCallerForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSave(mode) {
    dispatch(clearPhoneConfigStatus());
    const payload = { type: mode, ...forms[mode] };
    await dispatch(saveConfig(payload)).unwrap().catch(() => {});
  }

  async function handleTest(mode) {
    dispatch(clearPhoneConfigStatus());
    const form = forms[mode];
    const hasRawCredentials = Boolean(form.twilioSid && form.twilioToken && form.twilioPhone);
    await dispatch(testConnection({
      type: mode,
      credentials: hasRawCredentials ? form : undefined,
    })).unwrap().catch(() => {});
  }

  async function handleModeChange(mode) {
    dispatch(clearPhoneConfigStatus());
    await dispatch(setActiveMode(mode)).unwrap().catch(() => {});
  }

  async function handleAddCaller(e) {
    e.preventDefault();
    dispatch(clearPhoneConfigStatus());
    await dispatch(addCallerNumber(callerForm)).unwrap().catch(() => {});
  }

  async function handleCheckCaller(phoneNumber) {
    dispatch(clearPhoneConfigStatus());
    await dispatch(checkVerificationStatus(phoneNumber)).unwrap().catch(() => {});
  }

  async function handleRemoveCaller(item) {
    dispatch(clearPhoneConfigStatus());
    await dispatch(removeCallerNumber({ sid: item.sid, phoneNumber: item.number })).unwrap().catch(() => {});
  }

  async function handleSetActiveCaller(item) {
    if (item.status !== "verified") return;
    dispatch(clearPhoneConfigStatus());
    await dispatch(setActiveCallerId(item.number)).unwrap().catch(() => {});
  }

  return (
    <div className="min-h-full bg-[var(--bg-base)] p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Phone Config</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Configure Twilio credentials and choose which verified caller ID appears on outbound calls.
        </p>
      </div>

      {error ? <div className="mb-4"><InfoBox tone="danger">{error}</InfoBox></div> : null}
      {credentialWarning ? <div className="mb-4"><InfoBox tone="warn">{credentialWarning}</InfoBox></div> : null}
      {notice ? <div className="mb-4"><InfoBox tone="ok">{notice}</InfoBox></div> : null}

      <section>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Twilio Credentials</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Personal and Business slots are stored encrypted in MongoDB.</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                disabled={loading || !(mode.id === "personal" ? personalNumber.configured : businessNumber.configured)}
                onClick={() => handleModeChange(mode.id)}
                className={`rounded-md px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  activeMode === mode.id ? "bg-emerald-500 text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Use {mode.id === "personal" ? "Personal" : "Business"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {MODES.map((mode) => (
            <NumberCard
              key={mode.id}
              mode={mode.id}
              title={mode.title}
              description={mode.description}
              form={forms[mode.id]}
              savedSlot={mode.id === "personal" ? personalNumber : businessNumber}
              active={activeMode === mode.id}
              showToken={showTokens[mode.id]}
              loading={loading}
              testing={testing}
              testResult={lastTestResult}
              onFieldChange={handleFieldChange}
              onSave={handleSave}
              onTest={handleTest}
              onToggleToken={(selectedMode) => setShowTokens((current) => ({ ...current, [selectedMode]: !current[selectedMode] }))}
            />
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          Active route: <span className="font-medium text-[var(--text-primary)]">{activeMode === "personal" ? "Personal Number" : "Business Number"}</span>
          <span className="ml-2 text-[var(--text-muted)]">{activeSlot.twilioPhoneMasked || "not configured"}</span>
        </div>

        <div className="mt-4 grid gap-3">
          <InfoBox tone="warn">
            WhatsApp requires Twilio sandbox setup.
            <a href="https://www.twilio.com/console/sms/whatsapp/sandbox" target="_blank" rel="noreferrer" className="ml-1 underline underline-offset-4">
              Approve here
            </a>
            .
          </InfoBox>
          <InfoBox tone="neutral">
            Twilio trial accounts cannot use Verified Caller ID for normal outbound calling. Upgrade required:
            <a href="https://twilio.com/console/billing" target="_blank" rel="noreferrer" className="ml-1 underline underline-offset-4">
              Twilio billing
            </a>
            . India calling cost is roughly Rs 0.85/min, but Twilio pricing can change.
          </InfoBox>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Show Your Personal Number on Outbound Calls</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Works for calls only. SMS and WhatsApp will still show your Twilio number.
          </p>
        </div>

        <div className="mb-5">
          {activeCallerId ? (
            <InfoBox tone="ok">
              Outbound calls will show: <span className="font-semibold">{activeCallerIdMasked || activeCaller?.numberMasked}</span>
            </InfoBox>
          ) : (
            <InfoBox tone="warn">No verified number set. Calls will show the active Twilio number.</InfoBox>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Add Number</h3>
            <form onSubmit={handleAddCaller} className="mt-4 space-y-4">
              <TextField
                label="Personal number"
                value={callerForm.phoneNumber}
                placeholder="+91XXXXXXXXXX"
                onChange={(value) => handleCallerField("phoneNumber", value)}
              />
              <TextField
                label="Friendly name"
                value={callerForm.friendlyName}
                placeholder="My Airtel Number"
                onChange={(value) => handleCallerField("friendlyName", value)}
              />
              <button
                type="submit"
                disabled={loading || !callerForm.phoneNumber}
                className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Starting..." : "Verify This Number"}
              </button>
            </form>

            {pendingNumber ? (
              <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="text-sm font-medium text-[var(--text-primary)]">Verification started</div>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                  Twilio will call this number. During the call, enter this validation code:
                </p>
                <div className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-center text-2xl font-semibold tracking-[0.2em] text-emerald-300">
                  {pendingNumber.validationCode || "------"}
                </div>
                <button
                  type="button"
                  onClick={() => handleCheckCaller(pendingNumber.number)}
                  disabled={loading}
                  className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:opacity-60"
                >
                  Check Verification Status
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Verified Numbers</h3>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Pending numbers cannot be set active.</p>
              </div>
              <button
                type="button"
                onClick={() => handleCheckCaller()}
                disabled={loading}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:opacity-60"
              >
                Refresh
              </button>
            </div>

            {verifiedCallerIds.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                No verified caller IDs yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {verifiedCallerIds.map((item) => {
                  const isActive = activeCallerId === item.number;
                  const isVerified = item.status === "verified";

                  return (
                    <article
                      key={`${item.twilioAccountSid || "account"}-${item.number}-${item.sid || "pending"}`}
                      className={`rounded-lg border p-4 transition ${
                        isActive ? "border-emerald-400/60 bg-emerald-400/10" : "border-[var(--border)] bg-[var(--bg-elevated)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text-primary)]">{item.numberMasked}</div>
                          <div className="mt-1 text-xs text-[var(--text-muted)]">{item.friendlyName || "Personal Number"}</div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <StatusBadge status={item.status} />
                          {isActive ? <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white">Active</span> : null}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => handleSetActiveCaller(item)}
                          disabled={loading || !isVerified || isActive}
                          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isActive ? "Active" : "Set as Active Caller ID"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveCaller(item)}
                          disabled={loading}
                          className="rounded-lg border border-red-400/20 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-400/10 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

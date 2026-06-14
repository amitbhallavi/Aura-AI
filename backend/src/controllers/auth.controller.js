const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");
const { pgPool } = require("../config/database");
const { findOrCreateOAuthUser, sanitizeUser: serviceSanitizeUser } = require("../services/authUser.service");
const { sendOTP: twilioSendOTP, verifyOTP: twilioVerifyOTP } = require("../services/twilio.service");

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function getBackendUrl() {
  return (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8080}`).replace(/\/$/, "");
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

function envValue(name) {
  return String(process.env[name] || "").trim();
}

function sanitizeUser(user) {
  return serviceSanitizeUser(user);
}

function redirectWithAuth(res, user, token) {
  const params = new URLSearchParams({
    token,
    user: JSON.stringify(sanitizeUser(user)),
  });
  return res.redirect(`${getFrontendUrl()}/login?${params.toString()}`);
}

function redirectWithAuthError(res, message = "Social login failed.") {
  const params = new URLSearchParams({ auth_error: message });
  return res.redirect(`${getFrontendUrl()}/login?${params.toString()}`);
}

function getGoogleAuthErrorMessage(err) {
  const error = err?.response?.data?.error || err?.code || "";
  const description = err?.response?.data?.error_description || err?.message || "";

  if (error === "invalid_client" || /client secret is invalid/i.test(description)) {
    return "Google login is misconfigured. Check GOOGLE_AUTH_CLIENT_ID, GOOGLE_AUTH_CLIENT_SECRET, and the callback URL.";
  }

  if (/redirect_uri/i.test(description) || error === "redirect_uri_mismatch") {
    return "Google callback URL mismatch. Add http://localhost:8080/api/auth/google/callback in Google Cloud OAuth redirect URIs.";
  }

  return "Google login failed.";
}

function logOAuthError(label, err) {
  console.error(label, {
    status: err?.status || err?.response?.status || null,
    code: err?.response?.data?.error || err?.code || null,
    description: err?.response?.data?.error_description || err?.message || null,
  });
}



function getGoogleOAuthClient() {
  const clientId = envValue("GOOGLE_AUTH_CLIENT_ID") || envValue("GOOGLE_CLIENT_ID");
  const clientSecret = envValue("GOOGLE_AUTH_CLIENT_SECRET") || envValue("GOOGLE_CLIENT_SECRET");
  const redirectUri = envValue("GOOGLE_AUTH_REDIRECT_URI")
    || envValue("GOOGLE_CALLBACK_URL")
    || `${getBackendUrl()}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Google auth is not configured.");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function startGoogleAuth(req, res) {
  try {
    const client = getGoogleOAuthClient();
    const url = client.generateAuthUrl({
      access_type: "online",
      prompt: "select_account",
      scope: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
    });
    res.redirect(url);
  } catch (err) {
    logOAuthError("Google auth start error:", err);
    redirectWithAuthError(res, err.message);
  }
}

async function handleGoogleAuthCallback(req, res) {
  const { code } = req.query;
  if (!code) return redirectWithAuthError(res, "Google auth code missing.");

  try {
    const client = getGoogleOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    if (!data.email) return redirectWithAuthError(res, "Google account email missing.");

    const user = await findOrCreateOAuthUser({ name: data.name, email: data.email });
    const token = createToken(user);
    redirectWithAuth(res, user, token);
  } catch (err) {
    logOAuthError("Google auth callback error:", err);
    redirectWithAuthError(res, getGoogleAuthErrorMessage(err));
  }
}

function getGithubConfig() {
  const clientId = envValue("GITHUB_CLIENT_ID");
  const clientSecret = envValue("GITHUB_CLIENT_SECRET");
  const redirectUri = envValue("GITHUB_AUTH_REDIRECT_URI")
    || envValue("GITHUB_CALLBACK_URL")
    || `${getBackendUrl()}/api/auth/github/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("GitHub auth is not configured.");
  }

  return { clientId, clientSecret, redirectUri };
}

function startGithubAuth(req, res) {
  try {
    const { clientId, redirectUri } = getGithubConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "read:user user:email",
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  } catch (err) {
    logOAuthError("GitHub auth start error:", err);
    redirectWithAuthError(res, err.message);
  }
}

async function githubFetch(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "aura-ai-platform",
    },
  });

  if (!response.ok) throw new Error(`GitHub request failed: ${response.status}`);
  return response.json();
}

async function handleGithubAuthCallback(req, res) {
  const { code } = req.query;
  if (!code) return redirectWithAuthError(res, "GitHub auth code missing.");

  try {
    const { clientId, clientSecret, redirectUri } = getGithubConfig();
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || "GitHub token exchange failed.");
    }

    const profile = await githubFetch("https://api.github.com/user", tokenData.access_token);
    const emails = await githubFetch("https://api.github.com/user/emails", tokenData.access_token);
    const verifiedEmail = emails.find((item) => item.primary && item.verified)?.email
      || emails.find((item) => item.verified)?.email;

    if (!verifiedEmail) return redirectWithAuthError(res, "Verified GitHub email missing.");

    const user = await findOrCreateOAuthUser({
      name: profile.name || profile.login,
      email: verifiedEmail,
    });
    const token = createToken(user);
    redirectWithAuth(res, user, token);
  } catch (err) {
    logOAuthError("GitHub auth callback error:", err);
    redirectWithAuthError(res, err.message || "GitHub login failed.");
  }
}

async function register(req, res) {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "Name, email and password are required." });
  if (password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters." });

  try {
    const existing = await pgPool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0)
      return res.status(400).json({ error: "Email already registered. Please login." });

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pgPool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, language, plan, created_at`,
      [name, email.toLowerCase(), passwordHash, role || "individual"]
    );

    const user = result.rows[0];
    const token = createToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed. Try again." });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required." });

  try {
    const result = await pgPool.query(
      "SELECT * FROM users WHERE email = $1 AND is_active = TRUE",
      [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Invalid email or password." });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: "Invalid email or password." });

    const token = createToken(user);
    const { password_hash, google_tokens, gmail_tokens, ...safeUser } = user;
    res.json({ user: safeUser, token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed. Try again." });
  }
}

async function getProfile(req, res) {
  try {
    const result = await pgPool.query(
      "SELECT id, name, email, role, language, plan, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "User not found." });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile." });
  }
}

async function updateLanguage(req, res) {
  const { language } = req.body;
  if (!language) return res.status(400).json({ error: "Language is required." });
  try {
    await pgPool.query(
      "UPDATE users SET language = $1, updated_at = NOW() WHERE id = $2",
      [language, req.user.id]
    );
    res.json({ message: "Language updated.", language });
  } catch (err) {
    res.status(500).json({ error: "Failed to update language." });
  }
}

async function sendOTP(req, res) {
  const { phone, channel = "sms" } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone/email required." });
  try {
    await twilioSendOTP(phone, channel);
    res.json({ message: "OTP sent!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function verifyOTP(req, res) {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: "Phone/email and code required." });
  try {
    const approved = await twilioVerifyOTP(phone, code);
    if (!approved) return res.status(400).json({ error: "Invalid or expired OTP." });
    res.json({ message: "Verified!", verified: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  register,
  login,
  getProfile,
  updateLanguage,
  sendOTP,
  verifyOTP,
  startGoogleAuth,
  handleGoogleAuthCallback,
  startGithubAuth,
  handleGithubAuthCallback,
};

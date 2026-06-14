// ============================================================
// Google Service — Translate + Gmail + Maps
// ============================================================
const axios = require("axios");
const { google } = require("googleapis");
const { preserveMultilineBody, safeTrimSingleLine } = require("../utils/textFormat");

const GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
];

// ---------------------------------------------------------------
// Google Translate
// ---------------------------------------------------------------
async function translateText(text, targetLang = "en") {
    if (!process.env.GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY missing");
    const res = await axios.post(
        `https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_API_KEY}`,
        { q: text, target: targetLang, format: "text" }
    );
    return res.data.data.translations[0].translatedText;
}

async function detectLanguage(text) {
    if (!process.env.GOOGLE_API_KEY) return "en";
    const res = await axios.post(
        `https://translation.googleapis.com/language/translate/v2/detect?key=${process.env.GOOGLE_API_KEY}`,
        { q: text }
    );
    return res.data.data.detections[0][0].language;
}

// ---------------------------------------------------------------
// Gmail API — send email using user's OAuth tokens
// ---------------------------------------------------------------
function getGoogleOAuthClient(area = "google") {
    const clientId = area === "gmail"
        ? (process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)
        : process.env.GOOGLE_CLIENT_ID;
    const clientSecret = area === "gmail"
        ? (process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)
        : process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = area === "gmail"
        ? (process.env.GMAIL_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI)
        : process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        const service = area === "gmail" ? "Gmail" : "Google";
        const vars = area === "gmail"
            ? "GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REDIRECT_URI"
            : "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI";
        const err = new Error(`${service} OAuth is not configured. Missing ${vars}.`);
        err.code = area === "gmail" ? "GMAIL_OAUTH_CONFIG_MISSING" : "GOOGLE_OAUTH_CONFIG_MISSING";
        err.statusCode = 500;
        throw err;
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getGmailAuthUrl(userId) {
    const auth = getGoogleOAuthClient("gmail");
    return auth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent select_account",
        state: userId,
        scope: GMAIL_SCOPES,
    });
}

async function getGmailTokens(code) {
    const auth = getGoogleOAuthClient("gmail");
    const { tokens } = await auth.getToken(code);
    return tokens;
}

async function getGoogleAccountEmail(tokens, area = "gmail") {
    if (!tokens) return "";
    const auth = getGoogleOAuthClient(area);
    auth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth });
    const { data } = await oauth2.userinfo.get();
    return safeTrimSingleLine(data.email || "").toLowerCase();
}

function draftGmailEmail({ to = "", subject = "", body = "", tone = "professional" }) {
    return {
        to: safeTrimSingleLine(to),
        subject: safeTrimSingleLine(subject),
        body: preserveMultilineBody(body),
        tone: safeTrimSingleLine(tone || "professional"),
        preview: {
            to: safeTrimSingleLine(to),
            subject: safeTrimSingleLine(subject),
            body: preserveMultilineBody(body),
            tone: safeTrimSingleLine(tone || "professional"),
        },
    };
}

function isValidEmailAddress(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function gmailError(message, code, statusCode = 500) {
    const err = new Error(message);
    err.code = code;
    err.statusCode = statusCode;
    return err;
}

function normalizeGmailError(err) {
    if (err?.code === "GMAIL_OAUTH_CONFIG_MISSING" || err?.code === "INVALID_GMAIL_RECIPIENT") return err;

    const status = err?.response?.status || err?.statusCode || err?.code;
    const raw = [
        err?.message,
        err?.response?.data?.error,
        err?.response?.data?.error_description,
        err?.errors?.map((item) => `${item.reason || ""} ${item.message || ""}`).join(" "),
    ].filter(Boolean).join(" ");

    if (/invalid_grant|expired|revoked/i.test(raw)) {
        return gmailError("Gmail authorization expired. Reconnect Gmail and try again.", "GMAIL_AUTH_EXPIRED", 401);
    }
    if (/insufficient|insufficientPermissions|scope|forbidden|permission/i.test(raw) || Number(status) === 403) {
        return gmailError("Gmail permission is not enough to send email. Reconnect Gmail and approve Gmail send access.", "GMAIL_PERMISSION_MISSING", 403);
    }
    if (/invalid.*recipient|recipient.*invalid|bad request/i.test(raw) || Number(status) === 400) {
        return gmailError("Recipient email address is invalid. Check the address and try again.", "INVALID_GMAIL_RECIPIENT", 400);
    }
    if (/unauthorized|login required/i.test(raw) || Number(status) === 401) {
        return gmailError("Gmail authorization failed. Reconnect Gmail and try again.", "GMAIL_AUTH_FAILED", 401);
    }

    return gmailError("Gmail send failed. Check Gmail connection and try again.", "GMAIL_SEND_FAILED", 500);
}

async function sendGmail(tokens, { to, subject, body }, options = {}) {
    if (!tokens) throw gmailError("Gmail is not connected. Connect Gmail first.", "GMAIL_NOT_CONNECTED", 401);
    if (!isValidEmailAddress(to)) throw gmailError("Recipient email address is invalid. Check the address and try again.", "INVALID_GMAIL_RECIPIENT", 400);

    try {
        const auth = getGoogleOAuthClient("gmail");
        let refreshedTokens = null;
        auth.on("tokens", (nextTokens) => {
            refreshedTokens = { ...tokens, ...nextTokens };
        });
        auth.setCredentials(tokens);
        const gmail = google.gmail({ version: "v1", auth });

        const rawMessage = [
            `To: ${safeTrimSingleLine(to)}`,
            `Subject: ${safeTrimSingleLine(subject)}`,
            "MIME-Version: 1.0",
            "Content-Type: text/plain; charset=utf-8",
            "",
            preserveMultilineBody(body),
        ].join("\r\n");

        const encoded = Buffer.from(rawMessage)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        const result = await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw: encoded },
        });

        if (refreshedTokens && typeof options.onTokens === "function") {
            try {
                await options.onTokens(refreshedTokens);
            } catch (persistErr) {
                console.warn("Gmail token refresh persist failed:", persistErr.message);
            }
        }

        return result.data;
    } catch (err) {
        throw normalizeGmailError(err);
    }
}

// ---------------------------------------------------------------
// Gmail — get recent unread emails
// ---------------------------------------------------------------
async function getUnreadEmails(tokens, maxResults = 5) {
    const auth = getGoogleOAuthClient("gmail");
    auth.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth });

    const list = await gmail.users.messages.list({
        userId: "me",
        q: "is:unread",
        maxResults,
    });

    if (!list.data.messages?.length) return [];

    const messages = await Promise.all(
        list.data.messages.map(async (m) => {
            const msg = await gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata" });
            const headers = msg.data.payload.headers;
            const from = headers.find((h) => h.name === "From")?.value || "";
            const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)";
            const date = headers.find((h) => h.name === "Date")?.value || "";
            return { id: m.id, from, subject, date };
        })
    );
    return messages;
}

// ---------------------------------------------------------------
// Google Maps — static map image URL
// ---------------------------------------------------------------
function getStaticMapUrl(lat, lng, zoom = 13) {
    if (!process.env.GOOGLE_MAPS_API_KEY) return null;
    return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=600x300&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
}

function getMapsEmbedUrl(query) {
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
    const toRad = (value) => (Number(value) * Math.PI) / 180;
    const radius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatPlace(place) {
    const lat = place.geometry?.location?.lat;
    const lng = place.geometry?.location?.lng;
    return {
        placeId: place.place_id,
        name: place.name,
        category: place.types?.[0]?.replace(/_/g, " ") || "",
        types: place.types || [],
        address: place.vicinity || place.formatted_address || "",
        rating: place.rating || null,
        totalReviews: place.user_ratings_total || null,
        priceLevel: typeof place.price_level === "number" ? place.price_level : null,
        openNow: typeof place.opening_hours?.open_now === "boolean" ? place.opening_hours.open_now : null,
        mapsUrl: place.place_id
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || "")}&query_place_id=${place.place_id}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || "")}`,
        phoneNumber: place.formatted_phone_number || place.international_phone_number || "",
        website: place.website || "",
        latitude: lat || null,
        longitude: lng || null,
    };
}

async function searchNearbyPlaces({ query, latitude, longitude, radius = 3000 }) {
    if (!process.env.GOOGLE_MAPS_API_KEY) throw new Error("GOOGLE_MAPS_API_KEY missing");
    if (!query || latitude == null || longitude == null) {
        throw new Error("query, latitude and longitude are required");
    }

    const res = await axios.get("https://maps.googleapis.com/maps/api/place/nearbysearch/json", {
        params: {
            key: process.env.GOOGLE_MAPS_API_KEY,
            keyword: query,
            location: `${latitude},${longitude}`,
            radius,
        },
        timeout: 12000,
    });

    if (res.data.status !== "OK" && res.data.status !== "ZERO_RESULTS") {
        throw new Error(res.data.error_message || `Google Places error: ${res.data.status}`);
    }

    return (res.data.results || []).slice(0, 8).map((place) => {
        const formatted = formatPlace(place);
        if (formatted.latitude && formatted.longitude) {
            formatted.distanceMeters = Math.round(distanceMeters(latitude, longitude, formatted.latitude, formatted.longitude));
        }
        return formatted;
    });
}

async function searchPlacesByText({ query, locationText }) {
    if (!process.env.GOOGLE_MAPS_API_KEY) throw new Error("GOOGLE_MAPS_API_KEY missing");
    if (!query) throw new Error("query is required");

    const res = await axios.get("https://maps.googleapis.com/maps/api/place/textsearch/json", {
        params: {
            key: process.env.GOOGLE_MAPS_API_KEY,
            query: locationText ? `${query} near ${locationText}` : query,
        },
        timeout: 12000,
    });

    if (res.data.status !== "OK" && res.data.status !== "ZERO_RESULTS") {
        throw new Error(res.data.error_message || `Google Places error: ${res.data.status}`);
    }

    return (res.data.results || []).slice(0, 8).map(formatPlace);
}

async function getPlaceDetails(placeId) {
    if (!process.env.GOOGLE_MAPS_API_KEY) throw new Error("GOOGLE_MAPS_API_KEY missing");
    if (!placeId) throw new Error("placeId is required");

    const res = await axios.get("https://maps.googleapis.com/maps/api/place/details/json", {
        params: {
            key: process.env.GOOGLE_MAPS_API_KEY,
            place_id: placeId,
            fields: "place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,rating,opening_hours,geometry,url",
        },
        timeout: 12000,
    });

    if (res.data.status !== "OK") {
        throw new Error(res.data.error_message || `Google Place details error: ${res.data.status}`);
    }

    const formatted = formatPlace(res.data.result);
    return {
        ...formatted,
        address: res.data.result.formatted_address || formatted.address,
        mapsUrl: res.data.result.url || formatted.mapsUrl,
    };
}

module.exports = {
    translateText,
    detectLanguage,
    getGmailAuthUrl,
    getGmailTokens,
    getGoogleAccountEmail,
    draftGmailEmail,
    sendGmail,
    getUnreadEmails,
    getStaticMapUrl,
    getMapsEmbedUrl,
    searchNearbyPlaces,
    searchPlacesByText,
    getPlaceDetails,
};

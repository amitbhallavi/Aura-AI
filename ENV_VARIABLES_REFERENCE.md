# Environment Variables Reference

> This document specifies EXACTLY which environment variables go where and their values for each deployment stage.

---

## 📊 Environment Variables Matrix

| Variable | Backend .env | Frontend .env | Render Dashboard | Vercel Dashboard | Value Type | Notes |
|----------|:------------:|:-------------:|:----------------:|:----------------:|------------|-------|
| NODE_ENV | ✅ prod | ❌ | ✅ prod | ❌ | Text | Development vs Production |
| PORT | ✅ 8080 | ❌ | ✅ 8080 | ❌ | Number | Server port |
| FRONTEND_URL | ✅ | ❌ | ✅ | ❌ | URL | Your Vercel frontend URL |
| PG_HOST | ✅ | ❌ | ✅ | ❌ | Host | Supabase/Render/Railway host |
| PG_PORT | ✅ 5432 | ❌ | ✅ 5432 | ❌ | Number | PostgreSQL port |
| PG_USER | ✅ | ❌ | ✅ | ❌ | Text | Database user |
| PG_PASSWORD | ✅ | ❌ | ✅ | ❌ | Password | Database password |
| PG_DATABASE | ✅ | ❌ | ✅ | ❌ | Text | Database name |
| MONGO_URI | ✅ | ❌ | ✅ | ❌ | Connection | MongoDB Atlas URI |
| JWT_SECRET | ✅ | ❌ | ✅ | ❌ | Secret | Random 32+ chars |
| ENCRYPTION_KEY | ✅ | ❌ | ✅ | ❌ | Secret | Random 32+ chars |
| GEMINI_API_KEY | ✅ | ❌ | ✅ | ❌ | Secret | Google Gemini API |
| GEMINI_MODEL | ✅ model | ❌ | ✅ model | ❌ | Text | Model name |
| GROQ_API_KEY | ✅ | ❌ | ✅ | ❌ | Secret | Groq API key |
| GROQ_MODEL | ✅ model | ❌ | ✅ model | ❌ | Text | Model name |
| GOOGLE_CLOUD_PROJECT_ID | ✅ | ❌ | ✅ | ❌ | Text | Google Cloud Project ID |
| GOOGLE_APPLICATION_CREDENTIALS | ✅ path | ❌ | ✅ path | ❌ | Path | Path to service account JSON |
| GOOGLE_STT_ENABLED | ✅ true | ❌ | ✅ true | ❌ | Boolean | Enable speech-to-text |
| GOOGLE_TTS_ENABLED | ✅ true | ❌ | ✅ true | ❌ | Boolean | Enable text-to-speech |
| GOOGLE_API_KEY | ✅ | ❌ | ✅ | ❌ | Secret | Google APIs key |
| GOOGLE_MAPS_API_KEY | ✅ | ❌ | ✅ | ❌ | Secret | Google Maps API key |
| GOOGLE_CLIENT_ID | ✅ | ❌ | ✅ | ❌ | Text | OAuth client ID |
| GOOGLE_CLIENT_SECRET | ✅ | ❌ | ✅ | ❌ | Secret | OAuth client secret |
| GOOGLE_REDIRECT_URI | ✅ URI | ❌ | ✅ URI | ❌ | URL | Redirect after OAuth |
| GOOGLE_AUTH_REDIRECT_URI | ✅ URI | ❌ | ✅ URI | ❌ | URL | Auth redirect URI |
| CALENDAR_REDIRECT_URI | ✅ URI | ❌ | ✅ URI | ❌ | URL | Calendar redirect |
| TWILIO_ACCOUNT_SID | ✅ | ❌ | ✅ | ❌ | Text | Twilio Account SID |
| TWILIO_AUTH_TOKEN | ✅ | ❌ | ✅ | ❌ | Secret | Twilio Auth Token |
| TWILIO_PHONE_NUMBER | ✅ | ❌ | ✅ | ❌ | Phone | Twilio number |
| TWILIO_WHATSAPP_NUMBER | ✅ | ❌ | ✅ | ❌ | Phone | WhatsApp number |
| TWILIO_VERIFY_SID | ✅ | ❌ | ✅ | ❌ | Text | Verify service ID |
| SENDGRID_API_KEY | ✅ | ❌ | ✅ | ❌ | Secret | SendGrid API key |
| SENDGRID_FROM_EMAIL | ✅ | ❌ | ✅ | ❌ | Email | From email address |
| RAZORPAY_KEY_ID | ✅ | ❌ | ✅ | ✅ pub | Text | Razorpay public key |
| RAZORPAY_KEY_SECRET | ✅ | ❌ | ✅ | ❌ | Secret | Razorpay secret (NEVER frontend) |
| API_URL | ✅ | ❌ | ✅ | ❌ | URL | Backend URL for callbacks |
| TWIML_URL | ✅ | ❌ | ✅ | ❌ | URL | Twilio callback URL |
| VOICE_PROVIDER | ✅ google | ❌ | ✅ google | ❌ | Text | Voice service provider |
| VOICE_FALLBACK_PROVIDER | ✅ browser | ❌ | ✅ browser | ❌ | Text | Fallback provider |
| VOICE_MAX_AUDIO_SECONDS | ✅ 60 | ❌ | ✅ 60 | ❌ | Number | Max audio duration |
| VOICE_TRANSCRIPT_RETENTION_DAYS | ✅ 7 | ❌ | ✅ 7 | ❌ | Number | Retention days |
| VITE_API_URL | ❌ | ✅ | ❌ | ✅ | URL | Frontend API endpoint |
| VITE_RAZORPAY_KEY_ID | ❌ | ✅ pub | ❌ | ✅ pub | Text | Razorpay public key for frontend |

---

## 🔐 Secret Types - What to Generate

### Type 1: Random 32-Char Secrets (for JWT & Encryption)

**Generate:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Output example:** `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0`

**Use for:**
- `JWT_SECRET` - sign and verify authentication tokens
- `ENCRYPTION_KEY` - encrypt sensitive phone configurations

⚠️ **IMPORTANT:**
- Generate NEW secrets for each environment (dev, prod)
- Store securely - don't write on paper, don't email
- Never share or show to anyone
- Cannot be recovered if lost - you'll need to regenerate

### Type 2: API Keys (from external providers)

These are provided BY the external service when you register:

**Gemini (Google AI)**
- Get from: https://aistudio.google.com/app/apikey
- Format: Long string starting with `AIza...`
- Public but tied to your account

**Groq**
- Get from: https://console.groq.com/keys
- Format: `gsk_...`
- Secret - keep private

**Google Cloud (Maps, Translate, Speech)**
- Get from: Google Cloud Console → APIs
- Format: Varies
- Some are public (Maps), some are secret

**Google OAuth**
- Get from: Google Cloud Console → Credentials
- Client ID: Public, safe to expose
- Client Secret: NEVER expose, only in backend .env

**Twilio**
- Get from: Twilio Console → Settings
- Account SID: Safe to expose (identifies account)
- Auth Token: Secret - keep private

**SendGrid**
- Get from: https://app.sendgrid.com/settings/api_keys
- Format: `SG.xxx...`
- Secret - keep private

**Razorpay** (Payment - CRITICAL)
- Get from: https://dashboard.razorpay.com/app/keys
- Key ID: Safe to expose (public)
- Key Secret: NEVER expose, only in backend .env and Render

---

## 🚀 Deployment-Specific Configuration

### Development (Local Machine)

**File:** `backend/.env`
```
NODE_ENV=development
PORT=8080
FRONTEND_URL=http://localhost:5173
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=localpass
MONGO_URI=mongodb://localhost:27017/aura_ai
JWT_SECRET=dev_secret_any_32_plus_chars_works
... all other keys with test values
```

**File:** `frontend/.env`
```
VITE_API_URL=http://localhost:8080/api
VITE_RAZORPAY_KEY_ID=rzp_test_xxx
```

### Staging/QA (Optional)

**Setup:** Render staging web service + MongoDB test instance

**Render Environment Variables:**
```
NODE_ENV=staging
FRONTEND_URL=https://staging-aura.vercel.app
PG_HOST=staging-db.onrender.com
... all other staging credentials
```

### Production (Render + Vercel)

**Backend - Render Dashboard Environment:**
```
NODE_ENV=production
PORT=8080
FRONTEND_URL=https://aura.vercel.app
PG_HOST=aws-postgres.xxx.com
PG_USER=prod_user
PG_PASSWORD=STRONG_RANDOM_PASSWORD_MIN_20_CHARS
... all other PRODUCTION credentials
RAZORPAY_KEY_ID=rzp_live_xxx (NOT rzp_test)
RAZORPAY_KEY_SECRET=live_secret_xxx
```

**Frontend - Vercel Dashboard Environment:**
```
VITE_API_URL=https://aura-backend.onrender.com/api
VITE_RAZORPAY_KEY_ID=rzp_live_xxx
```

---

## ✅ Verification Checklist

Before deploying to production:

```bash
# 1. Check no .env files are staged
git status | grep ".env"
# Should output NOTHING

# 2. Check no secrets in code
grep -r "RAZORPAY_KEY_SECRET\|GOOGLE_CLIENT_SECRET\|JWT_SECRET" --include="*.js" src/
# Should show NOTHING (only references to process.env.XXXXX)

# 3. Check .env.example has NO real values
grep -E "[a-zA-Z0-9]{32,}" backend/.env.example
# Should output NOTHING (only instructions)

# 4. Verify all required vars are in Render dashboard
# (Can't check via CLI, manual verification needed)
```

---

## 🆘 Common Mistakes & How to Avoid

| Mistake | Result | Prevention |
|---------|--------|-----------|
| Committing .env to git | All secrets exposed | Add `.env` to `.gitignore` |
| Using test keys in production | Payment failures | Use `rzp_live_xxx` not `rzp_test_xxx` |
| Hardcoding backend URL in frontend | Frontend breaks when backend moves | Use `import.meta.env.VITE_API_URL` |
| Weak JWT_SECRET | Tokens easily forged | Generate 32+ random characters |
| Sharing secrets via email/chat | Secrets compromised | Only set in secure places (Render, Vercel) |
| Missing VITE_ prefix in frontend | Variable not available in browser | Use `VITE_` prefix for all frontend vars |
| Exposing secrets in error messages | Information leak | Use generic error messages in production |
| Not rotating keys after exposure | Attacker keeps access | Immediately generate new keys |

---

## 🔄 Rotating Keys (After Exposure)

If a key is accidentally committed or exposed:

1. **Immediately deactivate the exposed key** (if possible)
2. **Generate new key** from the provider
3. **Update Render environment variables** with new key
4. **Update Vercel environment variables** (if frontend key)
5. **Test the application**
6. **Remove old key from provider** (after confirming new one works)
7. **Force push commit** removing the exposed key from git history
8. **Notify team** of the incident

**Example: Razorpay Key Rotation**
```bash
# 1. Go to Razorpay dashboard
# 2. Deactivate old key
# 3. Generate new key
# 4. Copy new secret
# 5. Update Render: RAZORPAY_KEY_SECRET = new_secret
# 6. Test payment flow
# 7. Verify Vercel VITE_RAZORPAY_KEY_ID is still correct (this is public, doesn't need rotation)
```

---

## 📋 Pre-Deploy Environment Verification Script

Save as `verify-env.sh`:

```bash
#!/bin/bash

echo "🔍 Verifying environment setup..."

# Check backend
echo ""
echo "Backend:"
[ -f backend/.env.example ] && echo "✅ .env.example exists" || echo "❌ .env.example missing"
[ ! -f backend/.env ] || echo "⚠️  WARNING: .env file exists locally (should not commit)"
grep -q "aura-service.json" backend/.gitignore && echo "✅ aura-service.json in .gitignore" || echo "❌ aura-service.json NOT in .gitignore"

# Check frontend
echo ""
echo "Frontend:"
[ -f frontend/.env.example ] && echo "✅ .env.example exists" || echo "❌ .env.example missing"
[ ! -f frontend/.env ] || echo "⚠️  WARNING: .env file exists locally (should not commit)"

# Check git
echo ""
echo "Git:"
git ls-files | grep -q ".env" && echo "❌ ERROR: .env is tracked by git!" || echo "✅ .env files not tracked"
git log --all --full-history --name-only | grep -q ".env" && echo "❌ ERROR: .env found in git history!" || echo "✅ No .env in history"

echo ""
echo "✅ Verification complete!"
```

Run with:
```bash
chmod +x verify-env.sh
./verify-env.sh
```


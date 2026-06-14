# 🔐 SECURITY & DEPLOYMENT CHECKLIST

> **CRITICAL:** Do NOT deploy until all items are ✅ checked and verified.

---

## PHASE 1: LOCAL SECURITY CHECKS

### 1.1 Environment Files

- [ ] Backend `.env` file exists locally (not committed)
- [ ] Backend `.env` is listed in `.gitignore`
- [ ] Frontend `.env` file exists locally (not committed)
- [ ] Frontend `.env` is listed in `.gitignore`
- [ ] `backend/aura-service.json` is NOT committed (not in git)
- [ ] `backend/aura-service.json` is listed in `.gitignore`
- [ ] `.env.example` files are committed (safe, no secrets)

### 1.2 Secret Generation

- [ ] **JWT_SECRET** generated (32+ random chars)
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] **ENCRYPTION_KEY** generated (32+ random chars)
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] JWT_SECRET is NOT personal info (names, dates, etc.)
- [ ] Encryption key is unique (different from JWT_SECRET)

### 1.3 Backend Environment Variables

- [ ] `NODE_ENV=production` set for production
- [ ] `PORT=8080` (or deployment port)
- [ ] `FRONTEND_URL=https://your-frontend-domain.vercel.app`
- [ ] `PG_HOST` = valid PostgreSQL host (Supabase/Render/Railway)
- [ ] `PG_PORT` = 5432
- [ ] `PG_USER` = valid username (NOT 'postgres' if possible)
- [ ] `PG_PASSWORD` = strong password (20+ chars, mixed case, numbers, symbols)
- [ ] `PG_DATABASE` = database name
- [ ] `MONGO_URI` = valid MongoDB Atlas connection string with password encoded
- [ ] `JWT_SECRET` = newly generated secret (NOT old value)
- [ ] `ENCRYPTION_KEY` = newly generated key (NOT old value)

### 1.4 API Keys & Credentials

**Gemini (Google AI)**
- [ ] `GEMINI_API_KEY` = valid, non-expired
- [ ] `GEMINI_MODEL` = supported model name
- [ ] Key is NOT publicly visible anywhere

**Groq**
- [ ] `GROQ_API_KEY` = valid Groq API key
- [ ] `GROQ_MODEL` = supported model
- [ ] Key rotated if previously exposed

**Google Cloud & APIs**
- [ ] `GOOGLE_CLOUD_PROJECT_ID` = valid project ID
- [ ] `GOOGLE_APPLICATION_CREDENTIALS=./aura-service.json` (file must be protected)
- [ ] `GOOGLE_API_KEY` = non-restricted key for public APIs
- [ ] `GOOGLE_MAPS_API_KEY` = non-restricted key for maps
- [ ] `GOOGLE_CLIENT_ID` = valid OAuth client ID
- [ ] `GOOGLE_CLIENT_SECRET` = valid OAuth secret (NOT exposed)
- [ ] `GOOGLE_REDIRECT_URI` = https://your-render-url/api/auth/google/callback
- [ ] All Google keys are fresh (newly generated)

**Twilio**
- [ ] `TWILIO_ACCOUNT_SID` = valid SID
- [ ] `TWILIO_AUTH_TOKEN` = valid token (rotated if exposed)
- [ ] `TWILIO_PHONE_NUMBER` = valid Twilio number
- [ ] `TWILIO_WHATSAPP_NUMBER` = valid WhatsApp number
- [ ] `TWILIO_VERIFY_SID` = valid verify service ID

**SendGrid**
- [ ] `SENDGRID_API_KEY` = valid API key
- [ ] `SENDGRID_FROM_EMAIL` = verified email
- [ ] Key rotated if previously exposed

**Razorpay** (Payment)
- [ ] `RAZORPAY_KEY_ID` = correct for environment (test vs live)
- [ ] `RAZORPAY_KEY_SECRET` = correct secret (NOT exposed anywhere)
- [ ] Test key used for development
- [ ] Live key ONLY in production Render env vars

### 1.5 Frontend Environment Variables

- [ ] `VITE_API_URL` = https://your-render-backend-url/api (production)
- [ ] `VITE_RAZORPAY_KEY_ID` = public key ID (safe to expose)
- [ ] NO secret keys in frontend .env
- [ ] NO backend API keys visible anywhere in frontend code

### 1.6 Git Status Check

```bash
# From project root, verify:
git status
# Should show:
# - NO .env files
# - NO aura-service.json
# - NO *.pem, *.key files
# - .env.example files ARE listed as untracked/changed
```

- [ ] Run `git status` and verify no secrets are listed
- [ ] Run `git log --all --full-history -- ".env"` → should be empty
- [ ] Run `git log --all --full-history -- "aura-service.json"` → should be empty

---

## PHASE 2: CODE QUALITY CHECKS

### 2.1 No Secrets in Code

- [ ] Backend code does NOT hardcode any API keys
- [ ] Frontend code does NOT hardcode any API keys
- [ ] Frontend uses `import.meta.env.VITE_*` for public vars only
- [ ] No passwords in comments
- [ ] No example credentials with real values in code

### 2.2 Error Handling

- [ ] Stack traces are NOT logged in production
- [ ] Error messages are generic (not exposing internal details)
- [ ] Sensitive error info is only in logs, not in API responses
- [ ] Backend catches all unhandled promise rejections

### 2.3 Authentication & Authorization

- [ ] JWT tokens expire (7d configured)
- [ ] Protected routes require authentication
- [ ] Authorization checks admin roles where needed
- [ ] Passwords are hashed with bcrypt (10+ rounds)
- [ ] JWT_SECRET is never used for anything else

### 2.4 Database Security

- [ ] PostgreSQL connections use SSL in production
- [ ] MongoDB connections are encrypted
- [ ] Database credentials are ONLY in env vars
- [ ] No SQL injection possible (using parameterized queries)
- [ ] No MongoDB injection possible (using mongoose)

### 2.5 CORS Configuration

- [ ] CORS only allows your specific frontend domain
- [ ] CORS does NOT allow `*` (wildcard)
- [ ] Credentials are true (for cookies if used)
- [ ] Methods are restricted (no DELETE/PUT from public)

### 2.6 Rate Limiting

- [ ] Rate limiting is enabled on auth endpoints
- [ ] Rate limiting is enabled on payment endpoints
- [ ] Rate limiting is enabled on AI/chat endpoints
- [ ] Rate limits have reasonable values (not too low)

### 2.7 Input Validation

- [ ] All user inputs are validated
- [ ] File uploads are restricted (type, size)
- [ ] Email addresses are validated
- [ ] Phone numbers are validated format

---

## PHASE 3: DEPLOYMENT CONFIGURATION

### 3.1 Backend Configuration

- [ ] `backend/package.json` has:
  - [ ] `"start": "node src/app.js"` (no --env-file for production)
  - [ ] `"build": "echo 'No build needed'"` (or similar)
  - [ ] All dependencies are in `dependencies` (not devDependencies)
- [ ] `backend/.gitignore` includes:
  - [ ] `.env` files
  - [ ] `aura-service.json`
  - [ ] `*.pem, *.key, *.crt` files
  - [ ] `node_modules/`
  - [ ] `dist/`, `build/` folders

### 3.2 Frontend Configuration

- [ ] `frontend/package.json` has:
  - [ ] `"build": "vite build"` (correct)
  - [ ] All dependencies in `dependencies`
  - [ ] No hardcoded API URLs (uses env vars)
- [ ] `frontend/vite.config.js`:
  - [ ] Does NOT have hardcoded backend URL
  - [ ] Proxy is removed for production
  - [ ] Build output is `dist/`
- [ ] `frontend/.gitignore` includes:
  - [ ] `.env` files
  - [ ] `node_modules/`
  - [ ] `dist/` folder (optional, for preview)

### 3.3 Render Deployment

- [ ] Render PostgreSQL instance created (if needed)
- [ ] Render web service created with correct settings:
  - [ ] Runtime: Node
  - [ ] Build: `npm install`
  - [ ] Start: `npm start`
  - [ ] Region: Appropriate for users
- [ ] ALL environment variables added in Render dashboard
- [ ] `aura-service.json` uploaded to Render (via SSH or file editor)
- [ ] Health check endpoint responds: `/health`

### 3.4 Vercel Deployment

- [ ] GitHub repository connected
- [ ] Frontend folder selected
- [ ] Environment variables set:
  - [ ] `VITE_API_URL` = Render backend URL
  - [ ] `VITE_RAZORPAY_KEY_ID` = public key
- [ ] Build command: `npm run build`
- [ ] Start command: `npm run preview` (Vercel auto-handles)

---

## PHASE 4: PRODUCTION TESTING

### 4.1 Backend Testing

```bash
# Test health endpoint
curl https://your-backend.onrender.com/health
# Response: {"status":"ok","service":"AURA Backend","version":"1.0.0"}
```
- [ ] Health endpoint returns 200 OK
- [ ] Backend logs show successful start
- [ ] PostgreSQL connection successful
- [ ] MongoDB connection successful

### 4.2 Frontend Testing

```bash
# Visit frontend URL in browser
https://your-frontend.vercel.app
```
- [ ] Page loads without errors
- [ ] Network tab shows API calls to correct backend
- [ ] No console errors
- [ ] Responsive design works on mobile

### 4.3 Authentication Flow

- [ ] Register endpoint works
- [ ] Login endpoint works
- [ ] JWT token is generated and stored
- [ ] Protected routes require token
- [ ] Expired token triggers redirect to login

### 4.4 External Services

- [ ] Razorpay integration works (payment flow)
- [ ] Twilio SMS/WhatsApp can be sent
- [ ] Google OAuth login works
- [ ] Gmail integration works
- [ ] Google Maps integration works

### 4.5 Database Operations

- [ ] User data persists in PostgreSQL
- [ ] Chat history persists in MongoDB
- [ ] No database errors in logs
- [ ] Backup mechanism is in place (if needed)

---

## PHASE 5: SECURITY HARDENING

### 5.1 Headers & Security

- [ ] Helmet.js is enabled (security headers)
- [ ] HTTPS is enforced (Render/Vercel auto-handle)
- [ ] HSTS header is set
- [ ] X-Frame-Options is set to DENY
- [ ] X-Content-Type-Options is set to nosniff

### 5.2 Secrets Management

- [ ] No credentials in code (0 matches for grep)
- [ ] No credentials in git history
- [ ] All secrets are in production environment only
- [ ] Backup of all API keys stored securely elsewhere
- [ ] Key rotation plan documented

### 5.3 Monitoring & Logging

- [ ] Render logs are being collected
- [ ] Vercel logs show deployment status
- [ ] Error monitoring is configured (if using Sentry/etc)
- [ ] Database backups are configured
- [ ] No logs contain sensitive data

### 5.4 Access Control

- [ ] Database user has minimum required permissions
- [ ] API rate limits prevent brute force
- [ ] Admin routes are protected
- [ ] Payment routes are protected
- [ ] Sensitive data endpoints verify ownership

---

## FINAL PRE-DEPLOYMENT SIGN-OFF

**Backend Ready:**
- [ ] All checks above are ✅
- [ ] Local testing passed
- [ ] No hardcoded secrets remain
- [ ] Error handling is production-ready

**Frontend Ready:**
- [ ] All checks above are ✅
- [ ] Build succeeds: `npm run build`
- [ ] No API keys hardcoded
- [ ] Responsive on mobile/tablet/desktop

**Deployment Ready:**
- [ ] Render environment variables are all set
- [ ] Vercel environment variables are set
- [ ] GitHub repository is clean (secrets removed)
- [ ] `.gitignore` properly excludes secrets

**Security Ready:**
- [ ] All API keys are fresh/rotated
- [ ] Database credentials are strong
- [ ] JWT_SECRET is 32+ random characters
- [ ] CORS is properly restricted
- [ ] HTTPS is enforced

---

## 🚀 GO/NO-GO DECISION

**✅ GO FOR DEPLOYMENT** if:
- All items in PHASE 1-5 are checked
- No red flags or exceptions
- Testing in all sections passed
- Security team approves

**❌ DO NOT DEPLOY** if:
- Any secrets are in git history
- Tests failed
- Security checks not completed
- Environment variables missing

---

## 📋 Deployment Day Checklist

1. [ ] Final git commit: `git log --oneline | head -1`
2. [ ] Push to GitHub: `git push origin main`
3. [ ] Render deployment triggered: Check dashboard
4. [ ] Vercel deployment triggered: Check dashboard
5. [ ] Wait for deployments to complete (~5 min)
6. [ ] Test production endpoints
7. [ ] Monitor logs for first hour
8. [ ] Set up monitoring alerts (Sentry, UptimeRobot, etc.)
9. [ ] Document any issues encountered
10. [ ] Schedule post-deployment review meeting

---

## 🆘 Emergency Rollback

If critical issues found after deployment:

```bash
# Stop deployment
# Go to Render dashboard → Manual redeploy previous version
# Go to Vercel dashboard → Rollback to previous deployment

# If secrets are exposed:
# 1. Immediately rotate ALL API keys
# 2. Force push new commit removing secret
# 3. Notify users of any exposed data
# 4. Update incident report
```


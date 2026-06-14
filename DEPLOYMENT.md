# ============================================================
# DEPLOYMENT GUIDE — GITHUB → RENDER → VERCEL
# ============================================================

## ⚠️ CRITICAL: Pre-Deployment Security Checklist

### 1. **Local Setup Before Any Commit**

```bash
# Navigate to backend
cd backend

# STEP 1: Generate secure JWT_SECRET
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# STEP 2: Generate secure ENCRYPTION_KEY
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"

# Copy these values to your .env file
```

### 2. **Check if .env is Already Committed** (CRITICAL)

```bash
# Check if .env exists in git history
git log --all --full-history -- ".env"

# Check if .env is tracked
git ls-files | grep "\.env"

# If committed, see what secrets are exposed
git show HEAD:.env
```

**If .env is already committed:**
```bash
# Remove from git history (⚠️ WARNING: This rewrites history)
git filter-branch --tree-filter 'rm -f .env' -- --all

# Force push to remote
git push --force-all

# Rotate ALL keys immediately (see section K)
```

### 3. **Verify .gitignore**

```bash
# Check if .env is properly ignored
git check-ignore -v .env

# Should output:
# .env .gitignore

# Check for aura-service.json
git check-ignore -v aura-service.json
```

---

## 🔄 STEP-BY-STEP DEPLOYMENT FLOW

### Phase 1: Local Preparation (30 minutes)

#### 1.1 Backend Setup

```bash
cd backend

# Remove old .env if it exists
rm -f .env

# Copy template
cp .env.example .env

# Edit .env with PRODUCTION values
nano .env  # or use your editor

# CRITICAL VALUES TO UPDATE:
# - JWT_SECRET (generate new: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
# - PG_HOST, PG_USER, PG_PASSWORD (Render PostgreSQL)
# - MONGO_URI (MongoDB Atlas)
# - All API keys (Groq, SendGrid, Twilio, Google, Razorpay)
# - FRONTEND_URL (your Vercel URL)
# - API_URL (your Render backend URL)
# - TWIML_URL (your Render backend URL)
```

#### 1.2 Frontend Setup

```bash
cd frontend

# Remove old .env if it exists
rm -f .env

# Copy template
cp .env.example .env

# Edit .env with PRODUCTION values
nano .env

# VALUES TO UPDATE:
# - VITE_API_URL (your Render backend URL)
# - VITE_RAZORPAY_KEY_ID (get from Razorpay dashboard)
```

#### 1.3 Verify Files Are Proper

```bash
# Backend - verify .env exists and is in .gitignore
cd backend
git check-ignore .env || echo "❌ ERROR: .env is NOT in .gitignore"
git check-ignore aura-service.json || echo "❌ ERROR: aura-service.json is NOT in .gitignore"

# Frontend - verify .env exists and is in .gitignore
cd ../frontend
git check-ignore .env || echo "❌ ERROR: .env is NOT in .gitignore"
```

#### 1.4 Test Production Build Locally

```bash
# Backend - test with production-like NODE_ENV
cd backend
NODE_ENV=production npm start

# Test health endpoint
curl http://localhost:8080/health
# Should return: {"status":"ok","service":"AURA Backend","version":"1.0.0"}

# Press Ctrl+C to stop

# Frontend - test production build
cd ../frontend
npm run build

# Should show no errors and create "dist/" folder
ls -la dist/
```

---

### Phase 2: GitHub - Safe Push

#### 2.1 Verify Before Push

```bash
# From project root
git status

# Should show:
# - backend/.env NOT listed (✅ .gitignore working)
# - frontend/.env NOT listed (✅ .gitignore working)
# - .env.example files SHOULD be listed (✅ OK to commit)

# Check for any sensitive files
git status | grep -E "\.pem|\.key|aura-service\.json|\.env"
# Should show NOTHING
```

#### 2.2 Commit Safe Files

```bash
# Add .env.example files, .gitignore, and code fixes
git add backend/.env.example
git add backend/.gitignore
git add frontend/.env.example
git add frontend/.gitignore
git add backend/src/app.js
git add backend/src/config/database.js
git add backend/package.json

# Commit with message
git commit -m "fix: security hardening and production config

- Add .env.example templates for safe onboarding
- Improve .gitignore to protect secrets
- Fix CORS and Morgan logging for production
- Enable strict SSL validation in production
- Improve error handling to not expose stack traces
- Update package.json start command for Render"

# Push to GitHub
git push origin main
```

---

### Phase 3: Backend Deployment to Render

#### 3.1 Create Render PostgreSQL (Optional if not using Supabase)

1. Go to https://render.com/dashboard
2. Click **New +** → **Database** → **PostgreSQL**
3. Name: `aura-db`
4. Region: Same as backend (e.g., `us-east`)
5. Click **Create**
6. Wait ~2 minutes
7. Copy connection string: `postgresql://user:password@host:5432/db`

#### 3.2 Create Backend Web Service on Render

1. Go to https://render.com/dashboard
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Settings:
   - **Name:** `aura-backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Region:** `us-east` (or closest to users)
   - **Plan:** Starter ($7/month)

#### 3.3 Add Environment Variables to Render

1. In Render dashboard, go to your service
2. Click **Environment**
3. Add ALL variables from your `backend/.env` (but with PRODUCTION values):

```
PORT=8080
NODE_ENV=production
FRONTEND_URL=https://your-frontend-url.vercel.app

# Database
PG_HOST=your-render-db-host
PG_PORT=5432
PG_DATABASE=your_db
PG_USER=your_user
PG_PASSWORD=your_password

# MongoDB
MONGO_URI=mongodb+srv://...

# JWT & Encryption
JWT_SECRET=your-generated-secret
ENCRYPTION_KEY=your-generated-key

# AI Providers
GEMINI_API_KEY=...
GROQ_API_KEY=...
GOOGLE_API_KEY=...
GOOGLE_MAPS_API_KEY=...

# Google Auth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-render-url/api/auth/google/callback
GOOGLE_CLOUD_PROJECT_ID=...

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
TWILIO_WHATSAPP_NUMBER=...
TWILIO_VERIFY_SID=...

# SendGrid
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=...

# Razorpay
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...

# External URLs (UPDATE with your Render URL)
API_URL=https://your-backend-url.onrender.com/api
TWIML_URL=https://your-backend-url.onrender.com/twiml

# Others
GOOGLE_APPLICATION_CREDENTIALS=./aura-service.json
VOICE_PROVIDER=google
VOICE_FALLBACK_PROVIDER=browser
VOICE_MAX_AUDIO_SECONDS=60
```

4. Click **Save Changes**
5. Render will auto-deploy

#### 3.4 Upload aura-service.json to Render

```bash
# After deployment is live, SSH into Render
# Via Render dashboard: Shell → Connect

# Create the file
cat > aura-service.json << 'EOF'
{
  "type": "service_account",
  "project_id": "your-project-id",
  ...
}
EOF
```

**OR use Render's file editor in dashboard**

#### 3.5 Test Backend

```bash
# Get your Render URL from dashboard (e.g., https://aura-backend.onrender.com)

# Test health endpoint
curl https://aura-backend.onrender.com/health

# Should respond with JSON
```

---

### Phase 4: Frontend Deployment to Vercel

#### 4.1 Create Vercel Project

1. Go to https://vercel.com/dashboard
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. Select `frontend` folder

#### 4.2 Configure Environment Variables

1. Click **Settings** → **Environment Variables**
2. Add:

```
VITE_API_URL=https://your-render-backend-url.onrender.com/api
VITE_RAZORPAY_KEY_ID=rzp_live_xxxx  (if production) or rzp_test_xxxx (if test)
```

#### 4.3 Deploy

1. Click **Deploy**
2. Wait ~2-3 minutes
3. Vercel will give you a URL: `https://your-project.vercel.app`

#### 4.4 Update Backend CORS

Now that you have the Vercel URL, update backend on Render:

1. Go to Render dashboard
2. Edit environment variables
3. Update: `FRONTEND_URL=https://your-project.vercel.app`
4. Save (auto-redeploy)

---

### Phase 5: Post-Deployment Validation

#### 5.1 Test Frontend

```bash
# Visit your Vercel URL
https://your-project.vercel.app

# Test:
1. Register new account
2. Login
3. Send a chat message
4. Check if it connects to your backend
```

#### 5.2 Test Backend APIs

```bash
# Register endpoint
curl -X POST https://your-render-backend-url.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Should respond with success or error (not 500)
```

#### 5.3 Check Logs

**Render Backend:**
- Go to Render dashboard → Service → Logs
- Should see no errors

**Vercel Frontend:**
- Go to Vercel dashboard → Deployments → Logs
- Should see build success

---

## ✅ FINAL SECURITY CHECKLIST

- [ ] `.env` is NOT committed to GitHub
- [ ] `.env.example` IS committed to GitHub
- [ ] `aura-service.json` is NOT in git history
- [ ] `aura-service.json` IS uploaded to Render
- [ ] JWT_SECRET is 32+ random characters
- [ ] ENCRYPTION_KEY is 32+ random characters
- [ ] All API keys are rotated/new
- [ ] No API key appears in JavaScript code
- [ ] Frontend only has VITE_* public variables
- [ ] Backend NODE_ENV=production on Render
- [ ] PostgreSQL has SSL=true in production
- [ ] CORS only allows your Vercel domain
- [ ] Rate limiting is enabled
- [ ] Error messages don't expose stack traces
- [ ] Health endpoint works
- [ ] Login/Register endpoints work
- [ ] Database connections work
- [ ] External APIs (Twilio, Google, etc.) respond
- [ ] No console.log of secrets in production
- [ ] Morgan logging is minimal in production

---

## 🆘 If Something Goes Wrong

### Backend won't start
```bash
# Check Render logs for errors
# Common issues:
# 1. Database credentials wrong → Update env vars
# 2. Missing .env variable → Add to Render dashboard
# 3. npm install failed → Check package.json
# 4. Port already in use → Not possible on Render
```

### Frontend can't connect to backend
```bash
# Check:
# 1. VITE_API_URL is correct in Vercel env
# 2. Backend health endpoint works (curl it)
# 3. CORS is allowing Vercel domain (check backend logs)
# 4. Network tab in browser shows the request
```

### Secrets exposed in GitHub
```bash
# Immediately:
# 1. Rotate ALL keys (generate new ones everywhere)
# 2. Remove the commit from history (see section 2)
# 3. Force push to GitHub
# 4. Update all services with new keys
```


# 🔒 GITHUB SAFE PUSH - EXACT COMMANDS

> Run these commands EXACTLY as shown to safely push your code to GitHub without exposing secrets.

---

## ⚠️ BEFORE YOU START

**These are CRITICAL checks:**

```bash
# Navigate to project root
cd /Users/amitthakur/Documents/aura.ai-platform

# STEP 1: Verify no .env files are in git
git status
```

**Should show NOTHING about .env files. If you see:**
```
Untracked files:
  (use "git add <file>..." to include in what will be committed)
        backend/.env
        frontend/.env
```

Then `.env` is NOT in `.gitignore`. Fix first:
```bash
echo ".env" >> backend/.gitignore
echo ".env" >> frontend/.gitignore
```

---

## 🔍 VERIFY NO SECRETS IN GIT HISTORY

```bash
# Check if .env was ever committed
git log --all --full-history -- "backend/.env" 2>/dev/null | head -5

# Check if aura-service.json was ever committed
git log --all --full-history -- "backend/aura-service.json" 2>/dev/null | head -5
```

**If output is empty:** ✅ Good, proceed to next step  
**If output shows commits:** ⚠️ CRITICAL - See "If .env is Already Committed" section below

---

## ✅ SAFE PUSH SEQUENCE

### Step 1: Add Specific Files Only

```bash
# Navigate to project root
cd /Users/amitthakur/Documents/aura.ai-platform

# Add ONLY safe files (.env.example, .gitignore, code fixes)
git add backend/.env.example
git add frontend/.env.example
git add backend/.gitignore
git add frontend/.gitignore
git add backend/src/app.js
git add backend/src/config/database.js
git add backend/package.json
git add backend/render.yaml
git add DEPLOYMENT.md
git add PRE_DEPLOYMENT_CHECKLIST.md
git add ENV_VARIABLES_REFERENCE.md
git add AUDIT_REPORT.md
```

### Step 2: Verify Staging Area

```bash
# Check what's staged (should NOT include .env files)
git diff --cached --name-only

# Output should be:
# backend/.env.example
# backend/.gitignore
# backend/package.json
# backend/render.yaml
# backend/src/app.js
# backend/src/config/database.js
# frontend/.env.example
# frontend/.gitignore
# AUDIT_REPORT.md
# DEPLOYMENT.md
# ENV_VARIABLES_REFERENCE.md
# PRE_DEPLOYMENT_CHECKLIST.md
```

**If you see `.env` or any `.pem`/`.key` files: STOP and unstage them**
```bash
git reset backend/.env
git reset frontend/.env
```

### Step 3: Review Diffs

```bash
# Review each changed file
git diff --cached backend/src/app.js

# Should show the CORS and error handling improvements
# NO secrets should be visible

git diff --cached backend/src/config/database.js

# Should show SSL validation changes
# NO database credentials should be visible
```

### Step 4: Commit with Clear Message

```bash
git commit -m "feat(security): hardening and deployment preparation

- Create .env.example templates for secure configuration
- Improve .gitignore to protect all secrets
- Fix CORS to handle development vs production
- Fix error handling to not expose stack traces in production
- Enable strict SSL validation for PostgreSQL in production
- Disable Morgan logging in production
- Update package.json start command for Render deployment
- Add comprehensive deployment documentation (DEPLOYMENT.md)
- Add pre-deployment security checklist (PRE_DEPLOYMENT_CHECKLIST.md)
- Add environment variables reference guide (ENV_VARIABLES_REFERENCE.md)
- Add complete audit report (AUDIT_REPORT.md)

BREAKING CHANGES: None
SECURITY: Critical fixes before deployment
DEPLOYMENT: Ready for Render and Vercel"
```

### Step 5: Push to GitHub

```bash
# Push to your main branch
git push origin main

# If you get an error like "non-fast-forward", do:
git pull origin main --rebase
git push origin main
```

### Step 6: Verify on GitHub Website

1. Go to https://github.com/your-username/aura-platform
2. Click **Code** tab
3. Verify:
   - ✅ New files are visible (.env.example, DEPLOYMENT.md, etc.)
   - ✅ No `.env` files visible
   - ✅ No `aura-service.json` visible
   - ✅ No error in git history

4. Click on `backend/.env.example` to verify it has no real secrets
5. Click on `DEPLOYMENT.md` to verify documentation is there

---

## ⚠️ IF .ENV IS ALREADY COMMITTED

**This is an emergency situation. Follow these steps:**

### Step 1: Verify the Problem

```bash
# Check if .env exists in git history
git log --all --full-history -- "backend/.env" | head -20

# Check when it was added
git log --oneline --all -- "backend/.env"

# See what's in the old .env
git show HEAD:backend/.env | head -20
```

If you see output with actual secrets, PROCEED TO STEP 2.

### Step 2: Stop Everything

- ⛔ DO NOT PUSH YET
- ⛔ DO NOT DEPLOY YET
- 🔴 ROTATE ALL KEYS IMMEDIATELY

See "ROTATE ALL KEYS" section in AUDIT_REPORT.md

### Step 3: Remove from Git History

**WARNING: This rewrites git history. All developers must re-sync.**

```bash
# Remove backend/.env from entire history
git filter-branch --tree-filter 'rm -f backend/.env' -- --all

# Remove frontend/.env from entire history
git filter-branch --tree-filter 'rm -f frontend/.env' -- --all

# Remove aura-service.json from entire history
git filter-branch --tree-filter 'rm -f backend/aura-service.json' -- --all

# Verify they're removed
git log --all --full-history -- "backend/.env" | wc -l
# Should output: 0

git log --all --full-history -- "frontend/.env" | wc -l
# Should output: 0
```

### Step 4: Force Push to GitHub

**⚠️ WARNING: This affects all team members**

```bash
# Force push all branches and tags
git push --force-all

# Verify on GitHub: Delete the old commits are gone
# Go to https://github.com/your-username/aura-platform
# Should NOT see old .env files in history
```

### Step 5: Notify Team

Send message to team:
> 🔴 EMERGENCY: Git history was cleaned due to exposed secrets.
> - Everyone must: `git pull --rebase && git reset --hard origin/main`
> - All API keys have been rotated
> - New .env.example template is available
> - See PRE_DEPLOYMENT_CHECKLIST.md for next steps

### Step 6: Rotate All Keys (Again)

- Generate new JWT_SECRET
- Change PostgreSQL password
- Change MongoDB password
- Rotate all API keys
- See AUDIT_REPORT.md for full list

---

## 🔍 VERIFICATION CHECKLIST

After pushing, run these commands to verify everything is safe:

```bash
# 1. Verify no .env files on GitHub
git ls-remote --heads origin
# Should NOT show any .env files

# 2. Verify no secrets in recent commits
git log --oneline -10
# Should show your new commits, not old ones with secrets

# 3. Verify specific files don't exist
git ls-files | grep -E "\.env$|aura-service\.json|\.pem|\.key"
# Should output NOTHING

# 4. Verify .gitignore is working
git check-ignore -v .env backend/aura-service.json
# Should output paths followed by ".gitignore"

# 5. Verify deployment files exist
git ls-files | grep -E "\.env\.example|DEPLOYMENT\.md|AUDIT_REPORT\.md"
# Should show all these files
```

---

## ✅ FINAL CHECKLIST

Before considering yourself safe to deploy:

- [ ] `git status` shows NO .env files
- [ ] `git log --all --full-history -- ".env"` is empty
- [ ] GitHub website shows NO .env files in any commits
- [ ] `backend/.env.example` is visible on GitHub (with placeholder values)
- [ ] `frontend/.env.example` is visible on GitHub (with placeholder values)
- [ ] `DEPLOYMENT.md` is visible on GitHub
- [ ] `PRE_DEPLOYMENT_CHECKLIST.md` is visible on GitHub
- [ ] `AUDIT_REPORT.md` is visible on GitHub
- [ ] All API keys have been rotated (see AUDIT_REPORT.md)
- [ ] New JWT_SECRET and ENCRYPTION_KEY generated
- [ ] PostgreSQL password changed
- [ ] MongoDB password changed

---

## 📋 DEPLOYMENT FLOW AFTER PUSH

Once GitHub is clean and safe:

1. ✅ GitHub - Safe (completed above)
2. → **Next: Deploy Backend to Render** (see DEPLOYMENT.md)
3. → **Then: Deploy Frontend to Vercel** (see DEPLOYMENT.md)
4. → **Finally: Run PRE_DEPLOYMENT_CHECKLIST.md**

---

## 🆘 TROUBLESHOOTING

### "git push rejected - non-fast-forward"

```bash
# This means remote has newer commits
git pull origin main --rebase
git push origin main
```

### "fatal: not a git repository"

```bash
# Make sure you're in the project root
cd /Users/amitthakur/Documents/aura.ai-platform
git status
```

### ".env is still showing in git status"

```bash
# .gitignore might not be updated
cat backend/.gitignore | grep "\.env"
# Should show: .env

# If not, add it:
echo ".env" >> backend/.gitignore

# Then unstage and re-add
git reset backend/.env
git add backend/.gitignore
```

### "I see secrets in staged diff"

```bash
# DO NOT COMMIT
# Unstage everything
git reset

# Check .gitignore
git check-ignore -v backend/.env
# Must be listed

# Verify your .env files are NOT staged
git status
# Should NOT show backend/.env or frontend/.env

# Re-add only safe files
git add backend/.env.example
git add backend/.gitignore
# ... rest of safe files
```

---

## 🎯 SUCCESS INDICATORS

You're good to go when:

✅ GitHub repository is clean (no .env files)  
✅ All API keys are rotated  
✅ `.env.example` files are on GitHub with placeholder values  
✅ Deployment documentation is on GitHub  
✅ No secrets appear in any commit history  
✅ You can generate new `.env` files from `.env.example`  
✅ All 42 backend variables are ready to add to Render  
✅ All 2 frontend variables are ready to add to Vercel  

**NOW YOU CAN DEPLOY SAFELY! 🚀**


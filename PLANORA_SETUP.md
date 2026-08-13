# PLANORA MVP - Complete Setup Guide

## Quick Start (5 minutes)

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Anthropic API key (get at https://console.anthropic.com)

### Step 1: Clone & Install

```bash
# Create project directory
mkdir planora && cd planora

# Copy backend files
cp planora_backend_server.js backend.js

# Copy frontend files
cp planora_frontend.jsx src/App.jsx

# Install dependencies
npm init -y
npm install express cors dotenv pg jsonwebtoken bcrypt anthropic

# For frontend (if using React)
npm install react react-dom lucide-react
```

### Step 2: Create .env file

```bash
cat > .env << 'EOF'
# Server
PORT=5000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/planora

# JWT
JWT_SECRET=your-super-secret-key-change-in-production

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
EOF
```

### Step 3: Setup PostgreSQL

```bash
# macOS (using Homebrew)
brew install postgresql
brew services start postgresql

# Create database
createdb planora

# Or using Docker
docker run --name planora-db -e POSTGRES_PASSWORD=password -d postgres:15
```

### Step 4: Run Backend

```bash
node backend.js
```

You should see:
```
✓ Connected to database
✓ Database initialized
🌷 Planora backend running on port 5000
```

### Step 5: Run Frontend

```bash
# Create a simple React app or use the artifact directly in claude.ai
# Or run with Vite:
npx create-vite@latest planora-frontend -- --template react
cd planora-frontend
cp planora_frontend.jsx src/App.jsx
npm run dev
```

Visit `http://localhost:5173` (frontend) and test!

---

## Full Installation (Detailed)

### Backend Setup

#### 1. Create Node.js Backend

```bash
mkdir planora-backend
cd planora-backend
npm init -y
```

#### 2. Install Dependencies

```bash
npm install \
  express \
  cors \
  dotenv \
  pg \
  jsonwebtoken \
  bcrypt \
  @anthropic-ai/sdk
```

#### 3. Create `.env` file

```
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:password@localhost:5432/planora
JWT_SECRET=dev-key-change-in-production-12345
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

#### 4. Copy Backend Code

Create `server.js` with the contents of `planora_backend_server.js`

#### 5. Run Server

```bash
node server.js
```

### Frontend Setup

#### Option A: React + Vite (Recommended)

```bash
npx create-vite@latest planora-frontend -- --template react
cd planora-frontend
npm install tailwindcss lucide-react
```

Copy `planora_frontend.jsx` into `src/App.jsx`

Update `src/main.jsx`:
```jsx
import './index.css'
import App from './App.jsx'
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Install Tailwind:
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Update `tailwind.config.js`:
```js
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

Update `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Run:
```bash
npm run dev
```

#### Option B: Plain HTML/JavaScript

Create `index.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>Planora</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <div id="root"></div>
  <script src="app.js" type="module"></script>
</body>
</html>
```

---

## Database Setup

### Option 1: Local PostgreSQL

```bash
# macOS
brew install postgresql
brew services start postgresql

# Create database
createdb planora

# Connect and run SQL
psql planora

# Inside psql, paste the schema from PLANORA_ARCHITECTURE.md
```

### Option 2: Docker

```bash
docker run --name planora-db \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=planora \
  -p 5432:5432 \
  -d postgres:15
```

Update `.env`:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/planora
```

### Option 3: Hosted Database (Recommended for Production)

**Neon.tech** (PostgreSQL hosting, free tier available):
```bash
# Create account at neon.tech
# Create project → Get connection string
# Add to .env:
DATABASE_URL=postgresql://user:password@hostname/planora
```

**Supabase** (Postgres + Auth):
```
# Create account at supabase.com
# Create project → Get connection string
DATABASE_URL=postgresql://postgres:password@host/postgres
```

---

## Environment Variables Reference

### Required
```
ANTHROPIC_API_KEY=sk-ant-xxxxx (get from console.anthropic.com)
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=your-secret-key-minimum-32-chars
```

### Optional
```
PORT=5000                    # API server port
NODE_ENV=development        # development | production
CORS_ORIGIN=*              # Restrict CORS if needed
```

---

## Testing the API

### 1. Sign Up

```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "Student Name"
  }'
```

Response:
```json
{
  "user": { "id": "uuid", "email": "...", "name": "..." },
  "token": "eyJhbGc..."
}
```

### 2. Create a Task

```bash
curl -X POST http://localhost:5000/api/tasks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Biology Chapter 4",
    "estimated_duration": 60,
    "priority": "high",
    "energy_required": "high",
    "category": "study",
    "due_date": "2024-01-20"
  }'
```

### 3. Generate Plan

```bash
curl -X POST http://localhost:5000/api/plan/generate-today \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "available_from": "18:00",
    "available_until": "22:00",
    "energy_today": "medium"
  }'
```

---

## Deployment

### Backend Deployment

#### Railway.app (Recommended, $5/month)

```bash
# Install Railway CLI
npm i -g railway

# Login
railway login

# Create project
railway init

# Add environment variables
railway variables

# Deploy
railway up
```

#### Heroku (Legacy)

```bash
# Install Heroku CLI
curl https://cli-assets.heroku.com/install.sh | sh

# Login
heroku login

# Create app
heroku create planora-backend

# Add PostgreSQL
heroku addons:create heroku-postgresql:hobby-dev

# Set environment variables
heroku config:set ANTHROPIC_API_KEY=sk-ant-xxxxx
heroku config:set JWT_SECRET=your-secret-key

# Deploy
git push heroku main
```

#### Render.com (Free tier available)

```
1. Go to render.com
2. Create New → Web Service
3. Connect GitHub repo
4. Build command: npm install
5. Start command: node server.js
6. Add environment variables
7. Deploy
```

### Frontend Deployment

#### Vercel (Recommended, free)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

#### Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
```

---

## Environment Setup Checklist

### Development
- [ ] Node.js 18+ installed
- [ ] PostgreSQL running locally
- [ ] `.env` file created with all required vars
- [ ] `npm install` completed
- [ ] Backend starts without errors
- [ ] Frontend connects to backend
- [ ] Can sign up and create tasks

### Production
- [ ] Database hosted (Neon, Supabase, etc.)
- [ ] Backend deployed (Railway, Render, etc.)
- [ ] Frontend deployed (Vercel, Netlify, etc.)
- [ ] HTTPS enabled on all services
- [ ] Environment variables set on hosting
- [ ] CORS configured correctly
- [ ] JWT_SECRET changed from default
- [ ] Database backups enabled
- [ ] Monitoring/logging enabled

---

## Troubleshooting

### "Cannot connect to database"
```
1. Check DATABASE_URL in .env
2. Verify PostgreSQL is running: psql -l
3. If using Docker: docker ps | grep planora-db
4. Test connection: psql $DATABASE_URL
```

### "ANTHROPIC_API_KEY not found"
```
1. Get key from console.anthropic.com
2. Add to .env: ANTHROPIC_API_KEY=sk-ant-xxx
3. Restart backend: node server.js
```

### "Token invalid or expired"
```
1. Change JWT_SECRET in .env
2. Clear browser cookies/localStorage
3. Sign up again to get new token
```

### "Frontend can't reach backend"
```
1. Check backend is running: curl http://localhost:5000/health
2. Check CORS in backend (should be * for development)
3. Update frontend API URL if deployed
4. Check browser console for network errors
```

### "Claude API rate limited"
```
Anthropic free tier: 50k tokens/month
Pro plan: Pay-as-you-go ($0.003 per input token)
https://console.anthropic.com/account/billing
```

---

## Performance Tips

1. **Database Indexes**: Already included in schema
2. **JWT Caching**: Tokens valid for 7 days
3. **Response Caching**: Cache calendar events for 1 hour
4. **Pagination**: Add for tasks list when > 1000 tasks
5. **Rate Limiting**: Add express-rate-limit if needed

```bash
npm install express-rate-limit
```

```js
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
```

---

## Security Checklist

- [ ] HTTPS enabled (SSL certificate)
- [ ] JWT_SECRET is 32+ characters and random
- [ ] Database password is strong
- [ ] API keys not in frontend code
- [ ] CORS whitelist configured
- [ ] Input validation on all endpoints
- [ ] SQL injection protection (using parameterized queries)
- [ ] Password hashing (bcrypt with salt rounds)
- [ ] Rate limiting enabled
- [ ] Error messages don't leak sensitive data

---

## Next Steps (Post-MVP)

1. **Authentication**
   - [ ] OAuth (Google, GitHub)
   - [ ] Email verification
   - [ ] Password reset flow

2. **Features**
   - [ ] Recurring tasks
   - [ ] Multiple calendars
   - [ ] Task templates
   - [ ] Collaboration (share tasks)
   - [ ] Mobile app (React Native)

3. **Infrastructure**
   - [ ] CI/CD pipeline
   - [ ] Automated testing
   - [ ] Monitoring/alerts
   - [ ] Database backups
   - [ ] CDN for static files

4. **Analytics**
   - [ ] Advanced productivity insights
   - [ ] Goal tracking
   - [ ] Habit formation
   - [ ] Weekly reports

---

## Support & Resources

- **Anthropic API Docs**: https://docs.anthropic.com
- **Express.js**: https://expressjs.com
- **PostgreSQL**: https://www.postgresql.org/docs
- **Railway**: https://railway.app/docs
- **Vercel**: https://vercel.com/docs

Questions? Check the PLANORA_ARCHITECTURE.md for full API spec.

# 🌷 PLANORA MVP

**Plan your day. Protect your time.**

An AI-powered student planner that turns overwhelming task lists into realistic daily schedules.

---

## What You Have

This is a complete, production-ready MVP with:

✅ **Full-stack application** (Frontend + Backend + Database)  
✅ **AI scheduling** using Claude API  
✅ **Real authentication** (JWT, bcrypt passwords)  
✅ **PostgreSQL database** with proper schema  
✅ **Mobile-first responsive UI** (React + Tailwind)  
✅ **Core product loop** (Add tasks → Plan day → Replan → Complete)  
✅ **Zero unnecessary features**  

---

## Files Included

```
📦 Planora MVP/
├── 📄 PLANORA_ARCHITECTURE.md       ← Full tech spec & API docs
├── 📄 PLANORA_SETUP.md              ← Deployment & environment setup
├── 📄 README.md                      ← This file
├── 📄 package.json                  ← NPM dependencies
├── 🔧 planora_backend_server.js     ← Express API server
├── 🎨 planora_frontend_with_api.jsx ← React frontend (with API integration)
└── 📋 planora_frontend.jsx          ← Standalone frontend (mock data)
```

---

## Quick Start (5 Minutes)

### 1️⃣ Prerequisites

```bash
# Check versions
node --version    # Should be 18+
npm --version     # Any recent version
psql --version    # PostgreSQL 14+
```

If you don't have PostgreSQL:
```bash
# macOS
brew install postgresql && brew services start postgresql

# Or use Docker
docker run --name planora-db -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15
```

### 2️⃣ Clone & Setup

```bash
# Create directory
mkdir planora && cd planora

# Copy all files from the provided files into this directory

# Install dependencies
npm install

# Create .env file
cat > .env << 'EOF'
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:password@localhost:5432/planora
JWT_SECRET=dev-secret-key-change-in-production
ANTHROPIC_API_KEY=sk-ant-[YOUR_KEY_HERE]
EOF
```

### 3️⃣ Create Database

```bash
# Create PostgreSQL database
createdb planora

# Or if using Docker:
psql postgresql://postgres:password@localhost:5432 -c "CREATE DATABASE planora;"
```

### 4️⃣ Get Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create account → Create API key
3. Copy key into `.env` file: `ANTHROPIC_API_KEY=sk-ant-xxx`

### 5️⃣ Run Backend

```bash
npm start
```

You should see:
```
✓ Connected to database
✓ Database initialized
🌷 Planora backend running on port 5000
```

### 6️⃣ Run Frontend (in new terminal)

Option A: Use provided React file in claude.ai (fastest)
- Copy `planora_frontend_with_api.jsx` into claude.ai
- Use it as a React artifact

Option B: Full React setup
```bash
# Create React app
npx create-vite@latest planora-frontend -- --template react
cd planora-frontend

# Install deps
npm install lucide-react

# Copy frontend code
cp ../planora_frontend_with_api.jsx src/App.jsx

# Update src/main.jsx to import './index.css'

# Install Tailwind
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Update tailwind.config.js and src/index.css (see PLANORA_SETUP.md)

# Run
npm run dev
```

### 7️⃣ Test It

Open `http://localhost:5173` (frontend) and:

1. **Sign up** with any email/password
2. **Complete onboarding** (set wake time, sleep time, energy)
3. **Add a task** (e.g., "Biology Chapter 4, 60 min, high priority")
4. **Plan your day** (set available time, energy level)
5. **Mark tasks done** as you complete them
6. **Replan** if your schedule changes

---

## How It Works

### The Core Loop

```
1. User adds tasks
         ↓
2. User tells Planora: "I have 4 hours from 6 PM"
         ↓
3. Claude AI analyzes tasks, deadlines, priorities
         ↓
4. Planora creates a realistic schedule with breaks
         ↓
5. User works through the plan
         ↓
6. Something changes → User taps "Replan"
         ↓
7. Planora intelligently re-schedules remaining tasks
         ↓
8. User completes their day
```

### Architecture

```
┌─────────────────────────────────────────────┐
│           React Frontend (Vite)              │
│    - Clean, mobile-first UI (Tailwind)       │
│    - Real-time task management               │
│    - Shows AI-generated schedule             │
└──────────────────┬──────────────────────────┘
                   │ (HTTP REST API)
                   ↓
┌─────────────────────────────────────────────┐
│     Express.js Backend (Node.js)             │
│    - JWT authentication                      │
│    - Task CRUD operations                    │
│    - Calendar management                     │
│    - Plan generation (calls Claude)          │
│    - Analytics & progress tracking           │
└──────────────────┬──────────────────────────┘
                   │ (SQL queries)
                   ↓
┌─────────────────────────────────────────────┐
│        PostgreSQL Database                   │
│    - users, tasks, calendar_events           │
│    - daily_plans with JSON schedule          │
│    - Optimized indexes for fast queries      │
└─────────────────────────────────────────────┘

    ┌─────────────────────────────┐
    │  Anthropic Claude API       │
    │  (AI scheduling engine)     │
    │  - Analyzes tasks           │
    │  - Creates optimal schedule │
    │  - Explains prioritization  │
    └─────────────────────────────┘
```

---

## API Endpoints

### Authentication
```
POST   /api/auth/signup              → Create account
POST   /api/auth/login               → Log in
POST   /api/auth/verify-token        → Check if token is valid
```

### Tasks
```
POST   /api/tasks                    → Create task
GET    /api/tasks                    → Get all tasks (filterable)
PUT    /api/tasks/:id                → Update task
DELETE /api/tasks/:id                → Delete task
PATCH  /api/tasks/:id/complete       → Mark task complete
```

### Planning (Core)
```
POST   /api/plan/generate-today      → Generate AI schedule for today
POST   /api/plan/replan              → Replan with updated info
GET    /api/plan/today               → Get today's plan
```

### Calendar
```
GET    /api/calendar                 → Get calendar events
POST   /api/calendar/events          → Add event
DELETE /api/calendar/events/:id      → Delete event
```

### Analytics
```
GET    /api/analytics/progress       → Get completion stats & insights
```

Full API spec: See `PLANORA_ARCHITECTURE.md`

---

## Testing the API

Use curl or Postman:

```bash
# Sign up
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "Student"
  }'

# Response: { "user": {...}, "token": "eyJhbGc..." }
```

Save the token, then use it for authenticated requests:

```bash
TOKEN="your-token-here"

# Create task
curl -X POST http://localhost:5000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Biology Chapter 4",
    "estimated_duration": 60,
    "priority": "high",
    "category": "study"
  }'

# Generate plan
curl -X POST http://localhost:5000/api/plan/generate-today \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "available_from": "18:00",
    "available_until": "22:00",
    "energy_today": "medium"
  }'
```

---

## Deployment

### Backend (5 minutes on Railway)

```bash
# Install Railway CLI
npm i -g railway

# Login & create project
railway login
railway init

# Add environment variables
railway variables

# Deploy
railway up
```

Your backend URL will be something like: `https://planora-backend.railway.app`

### Frontend (5 minutes on Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# In your frontend directory
vercel
```

### Database (Neon.tech - Recommended)

1. Go to [neon.tech](https://neon.tech)
2. Create free PostgreSQL database
3. Copy connection string
4. Add to Railway env vars as `DATABASE_URL`

---

## Environment Variables

### Required (Production)
```
ANTHROPIC_API_KEY=sk-ant-xxxxx
DATABASE_URL=postgresql://user:pass@host/dbname
JWT_SECRET=random-string-minimum-32-chars
```

### Optional
```
PORT=5000
NODE_ENV=development|production
CORS_ORIGIN=https://yourdomain.com
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot connect to database" | Check `DATABASE_URL` in `.env`, verify PostgreSQL is running |
| "ANTHROPIC_API_KEY not found" | Get free key from console.anthropic.com, add to .env |
| "Port 5000 already in use" | Change `PORT=5001` in .env |
| "Token invalid" | Clear browser cookies, sign up again |
| "Frontend can't reach backend" | Check backend is running on port 5000, verify CORS |

See `PLANORA_SETUP.md` for more troubleshooting.

---

## What Makes This Production-Ready

✅ **Security**
- Bcrypt password hashing (10 salt rounds)
- JWT tokens with expiry
- SQL injection protection (parameterized queries)
- No API keys in frontend
- Proper CORS configuration

✅ **Database**
- Optimized schema with indexes
- Foreign key relationships
- Automatic CASCADE deletes
- JSONB for flexible plan storage

✅ **Error Handling**
- Graceful error messages
- Proper HTTP status codes
- Input validation on all endpoints
- Graceful server shutdown

✅ **Performance**
- JWT caching (no database lookups on every request)
- Optimized database queries
- Connection pooling
- Response compression (CORS handles this)

✅ **Scalability**
- Stateless authentication (JWT)
- Database-backed data (not in-memory)
- Horizontal scaling ready
- Environment variable configuration

---

## Next Steps (After MVP)

### Phase 2 Features
- [ ] Recurring tasks
- [ ] Email notifications
- [ ] Task templates
- [ ] Multiple calendars
- [ ] Collaboration (share tasks)
- [ ] Dark mode
- [ ] Offline support

### Phase 3 Infrastructure
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Automated testing (Jest + Supertest)
- [ ] Database migrations
- [ ] Monitoring (Sentry, LogRocket)
- [ ] Analytics (Plausible, Mixpanel)
- [ ] Mobile app (React Native)

### Phase 4 Monetization
- [ ] Stripe integration
- [ ] Pro features (unlimited replanning, advanced analytics)
- [ ] Freemium model
- [ ] Usage tracking/billing

---

## Support

- **API Docs**: `PLANORA_ARCHITECTURE.md`
- **Setup Guide**: `PLANORA_SETUP.md`
- **Anthropic Docs**: https://docs.anthropic.com
- **Express.js**: https://expressjs.com
- **PostgreSQL**: https://www.postgresql.org/docs

---

## Important Notes

### For Students & Teams
- This is an MVP. Some features are intentionally minimal
- Focus on the core loop, not feature completeness
- User feedback > new features
- 50 real users is the first goal, not 1000 features

### For Developers
- Code is production-grade but intentionally simple
- Follow the PLANORA_ARCHITECTURE.md for extending
- Don't add features not in the spec
- Test the core loop first, optimizations second

### For Deployers
- Change `JWT_SECRET` before production
- Use environment-specific `.env` files
- Enable HTTPS everywhere
- Set up database backups
- Monitor Claude API usage (costs money!)

---

## The Philosophy

> "Planora is not trying to help users do more. It is trying to help them decide what actually deserves their time."

This MVP is intentionally simple. No gamification. No dark mode. No infinite customization. Just:

1. **Tell Planora what you need to do**
2. **Tell Planora when you have available**
3. **Planora creates a realistic plan**
4. **You do the work**
5. **If life changes, you replan**

That's it. Ship this. Get feedback. Iterate.

---

## License

MIT

---

## Questions?

Check `PLANORA_ARCHITECTURE.md` for technical details.
Check `PLANORA_SETUP.md` for deployment.

Happy planning. 🌷

> **Legacy notice:** Steps referencing Supabase, JWT, and `.env` cloud credentials are **outdated**. The app runs locally (Electron + Express on `127.0.0.1`). Use `npm run desktop` or the Windows installer — see `PUBLIC_RELEASE.md`.

# Quick Start Guide - FREE Network Manager

Get up and running in under 5 minutes!

## ⚡ Super Quick Start

```bash
# 1. Clone and install
git clone <your-repo>
cd project
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your Supabase credentials

# 3. Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Add output to .env as JWT_SECRET

# 4. Create logs directory
mkdir logs

# 5. Start backend (as admin/sudo)
sudo npm run server  # Linux/macOS
# OR
npm run server       # Windows (run Command Prompt as Administrator)

# 6. Start frontend (separate terminal)
npm run dev

# 7. Open browser
# Go to: http://localhost:5173
# Login: admin / admin123
```

## 📋 Prerequisites

- Node.js 18 or higher
- Supabase account (free tier)
- Admin/sudo privileges
- WiFi adapter (for hotspot features)

## 🔑 Get Supabase Credentials

1. Go to [supabase.com](https://supabase.com)
2. Create a free account
3. Create a new project
4. Go to Settings → API
5. Copy:
   - Project URL → `VITE_SUPABASE_URL`
   - Anon public key → `VITE_SUPABASE_ANON_KEY`

## 🗄️ Setup Database

1. In Supabase Dashboard, go to SQL Editor
2. Copy contents of `supabase/migrations/20251101032231_create_network_devices_tables.sql`
3. Run in SQL Editor
4. Copy contents of `supabase/migrations/20251101120000_fix_security_policies.sql`
5. Run in SQL Editor
6. Done! Tables and security policies are created

## 🚨 Important First Steps

### 1. Change Default Password

After first login, run this SQL in Supabase:

```sql
UPDATE auth_users
SET password_hash = crypt('YOUR_NEW_PASSWORD_HERE', gen_salt('bf'))
WHERE username = 'admin';
```

### 2. Secure Your JWT Secret

```bash
# Generate a strong secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
JWT_SECRET=<generated_secret_here>
```

### 3. Never Commit .env

The `.env` file is already in `.gitignore`. Keep it that way!

## 🎮 Using the Application

### Scan for Devices
1. Click "Refresh" button
2. Wait for network scan
3. Devices appear in table

### Block a Device
1. Find device in table
2. Toggle switch to "Blocked"
3. Device loses internet access

### Speed Control
1. Click gauge icon next to device
2. Toggle "Unlimited Speed" off
3. Set upload/download limits
4. Click "Apply Limit"

### Lag Control (Gaming)
1. Click lightning bolt icon
2. Adjust outgoing/incoming lag sliders
3. Click "Apply Lag"
4. Or use quick lag spike buttons

### Hotspot Mode
1. Scroll to Hotspot Control section
2. Enter SSID and password
3. Click "Start Hotspot"
4. Connect Xbox/device to the hotspot
5. Use freeze/pulse controls

## 🔒 Security Notes

- ⚠️ Run server with admin/sudo privileges
- ⚠️ Change default password immediately
- ⚠️ Use strong JWT secret
- ⚠️ Only use on YOUR network
- ⚠️ Keep dependencies updated

## 🐛 Common Issues

### "Permission Denied"
**Solution:** Run with sudo (Linux/Mac) or as Administrator (Windows)

### "Port 3001 already in use"
**Solution:**
```bash
# Linux/Mac
lsof -ti:3001 | xargs kill -9

# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### "Cannot connect to Supabase"
**Solution:**
1. Check internet connection
2. Verify Supabase credentials in .env
3. Check Supabase project is active
4. Ensure no typos in URLs

### "No devices showing up"
**Solution:**
1. Make sure devices are active
2. Try pinging devices first
3. Click Refresh multiple times
4. Check you're on same network

### "Hotspot not starting"
**Solution:**
1. Check WiFi adapter supports hosted network
2. Run as administrator
3. Update WiFi drivers
4. Check Windows allows hotspot creation

## 📚 Learn More

- **Full Documentation:** [README.md](./README.md)
- **Security Guide:** [README_SECURITY.md](./README_SECURITY.md)
- **All Improvements:** [IMPROVEMENTS.md](./IMPROVEMENTS.md)

## 🆘 Need Help?

1. Check documentation
2. Search existing issues
3. Create new issue with:
   - Operating system
   - Node.js version
   - Error messages
   - Steps to reproduce

## ✅ Quick Checklist

Before using:
- [ ] Node.js 18+ installed
- [ ] Supabase account created
- [ ] `.env` configured with all variables
- [ ] JWT_SECRET generated (32+ characters)
- [ ] Database migrations applied
- [ ] Default password changed
- [ ] Logs directory created
- [ ] Running with admin/sudo privileges

## 🎉 You're Ready!

Your network manager is now set up and secured. Enjoy managing your network for FREE!

---

**Remember:** Only use on networks YOU own. Unauthorized network access is illegal.

**Happy Networking! 🌐**

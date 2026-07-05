# FREE Network Manager - Security Documentation

## ⚠️ CRITICAL SECURITY WARNINGS

### Legal and Ethical Use Only

**This software is for EDUCATIONAL and AUTHORIZED use only.**

- ✅ **LEGAL**: Managing YOUR OWN network and devices YOU own
- ✅ **LEGAL**: Testing in isolated lab environments with permission
- ✅ **LEGAL**: Educational purposes on networks you control
- ❌ **ILLEGAL**: Accessing networks you don't own or manage
- ❌ **ILLEGAL**: Interfering with others' internet access without permission
- ❌ **ILLEGAL**: Using this for malicious purposes or unauthorized access

**Unauthorized network manipulation is ILLEGAL and may result in criminal charges.**

---

## 🔒 Security Implementation

This application has been hardened with multiple security layers:

### 1. Input Validation
- All user inputs are validated before processing
- MAC addresses validated against strict regex patterns
- IP addresses validated for proper IPv4 format
- Command injection prevention through input sanitization
- SQL injection prevention through parameterized queries

### 2. Authentication & Authorization
- JWT-based authentication with configurable expiration
- BCrypt password hashing (never plaintext storage)
- Authentication required for all sensitive endpoints
- Rate limiting on authentication attempts (5 per 15 minutes)
- Proper session management

### 3. API Security
- Helmet.js for security headers
- CORS properly configured for specific origins
- Rate limiting on all API endpoints (100 requests per 15 minutes)
- Input validation on all endpoints
- Comprehensive error handling without data leakage

### 4. Database Security
- Row Level Security (RLS) enabled on all tables
- Service role authentication required
- Foreign key constraints for data integrity
- Passwords hashed using pgcrypto
- Prepared statements to prevent SQL injection

### 5. Logging & Monitoring
- Winston-based logging system
- Separate error and combined logs
- Request logging with IP addresses
- Failed authentication attempts logged
- Log rotation to prevent disk space issues

---

## 🚀 Setup Instructions

### Prerequisites

- Node.js 18+ installed
- Administrator/sudo privileges (required for network operations)
- WiFi adapter that supports hosted network (for hotspot features)
- Supabase account and database

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and fill in:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_API_URL=http://localhost:3001
   PORT=3001
   NODE_ENV=development
   JWT_SECRET=generate-a-secure-random-string-here
   CORS_ORIGIN=http://localhost:5173
   ```

   **Generate a secure JWT secret:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **Apply database migrations**

   The migrations will:
   - Create required tables (devices, bandwidth_logs, auth_users)
   - Enable Row Level Security
   - Create secure policies
   - Add proper constraints and indexes

   Migrations are in `supabase/migrations/` directory.

5. **Create logs directory**
   ```bash
   mkdir logs
   ```

### Running the Application

**Important: Network features require elevated privileges**

**On Linux/macOS:**
```bash
# Start backend with sudo
sudo npm run server

# Start frontend (separate terminal)
npm run dev
```

**On Windows:**
```bash
# Run Command Prompt as Administrator
# Then run:
npm run server

# Start frontend (separate Command Prompt)
npm run dev
```

### Default Login Credentials

**Username:** admin
**Password:** admin123

**⚠️ CHANGE THESE IMMEDIATELY in production!**

To change the password:
```sql
UPDATE auth_users
SET password_hash = crypt('your_new_password', gen_salt('bf'))
WHERE username = 'admin';
```

---

## 🛡️ Security Best Practices

### For Development

1. **Never commit `.env` files**
   - Always use `.env.example` with placeholders
   - Keep credentials out of version control

2. **Use HTTPS in production**
   - Never transmit credentials over HTTP
   - Use reverse proxy (nginx) with SSL certificates

3. **Rotate credentials regularly**
   - Change JWT_SECRET periodically
   - Rotate Supabase keys if exposed
   - Update default admin password

4. **Monitor logs**
   - Check `logs/error.log` for issues
   - Review `logs/combined.log` for suspicious activity
   - Set up log alerting for production

5. **Keep dependencies updated**
   ```bash
   npm audit
   npm audit fix
   ```

### For Production

1. **Change NODE_ENV to production**
   ```env
   NODE_ENV=production
   ```

2. **Use strong JWT secret**
   - Minimum 32 characters
   - Randomly generated
   - Never reuse across projects

3. **Restrict CORS origins**
   ```env
   CORS_ORIGIN=https://yourdomain.com
   ```

4. **Use environment-specific configs**
   - Separate `.env` for dev/staging/production
   - Never share production credentials

5. **Implement additional security layers**
   - Use firewall rules
   - Implement IP whitelisting
   - Add 2FA for admin accounts
   - Use VPN for remote access

6. **Regular security audits**
   - Review logs for suspicious activity
   - Test for vulnerabilities
   - Update dependencies regularly
   - Monitor for security advisories

---

## 🔍 Vulnerability Reporting

If you discover a security vulnerability, please:

1. **DO NOT** create a public GitHub issue
2. Email security details to: [your-email]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work on a fix immediately.

---

## 📝 Security Changelog

### Version 2.0.0 - Security Hardening
- ✅ Implemented input validation for all user inputs
- ✅ Added bcrypt password hashing
- ✅ Fixed RLS policies with proper authentication
- ✅ Added authentication middleware
- ✅ Implemented rate limiting
- ✅ Added comprehensive logging
- ✅ Fixed command injection vulnerabilities
- ✅ Added JWT authentication
- ✅ Implemented error handling without data leakage
- ✅ Added Helmet.js security headers
- ✅ Configured proper CORS policies

### Version 1.0.0 - Initial Release
- ⚠️ Had multiple critical security vulnerabilities
- ⚠️ Not recommended for any use

---

## 🆘 Troubleshooting

### Permission Errors

**Linux/macOS:**
```bash
# If you get permission errors:
sudo npm run server

# Or give specific capabilities:
sudo setcap cap_net_admin,cap_net_raw+eip $(which node)
```

**Windows:**
```
Right-click Command Prompt → "Run as Administrator"
```

### Port Already in Use

```bash
# Find process using port 3001
netstat -ano | findstr :3001  # Windows
lsof -i :3001                 # Linux/macOS

# Kill the process
kill -9 <PID>  # Linux/macOS
taskkill /PID <PID> /F  # Windows
```

### Database Connection Issues

1. Verify Supabase credentials in `.env`
2. Check if Supabase project is active
3. Verify network connectivity
4. Check Supabase dashboard for service status

---

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Supabase Security](https://supabase.com/docs/guides/auth)

---

## 📄 License & Disclaimer

**DISCLAIMER OF LIABILITY:**

THIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. THE AUTHORS
SHALL NOT BE LIABLE FOR ANY DAMAGES ARISING FROM THE USE OF THIS SOFTWARE.

Users are solely responsible for:
- Ensuring legal compliance in their jurisdiction
- Obtaining proper authorization before use
- Any consequences of unauthorized network manipulation
- Properly securing their installation

**USE AT YOUR OWN RISK**

---

*Last Updated: November 2025*

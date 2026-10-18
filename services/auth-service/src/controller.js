// ============================================================
// Auth Service — Controller (Hardened + User Management)
// bcrypt salt 12 · JWT access 15m / refresh 7d
// Account lockout · Password strength · Audit logging
// ============================================================
'use strict';

const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const mysql   = require('mysql2/promise');
const { validationResult } = require('express-validator');
const crypto  = require('crypto');

// ── Guard: crash loudly on missing secrets ─────────────────────
if (!process.env.JWT_SECRET)         throw new Error('[auth-service] JWT_SECRET env var is required');
if (!process.env.JWT_REFRESH_SECRET) throw new Error('[auth-service] JWT_REFRESH_SECRET env var is required');

const JWT_SECRET         = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES     = '15m';
const REFRESH_EXPIRES    = '7d';
const BCRYPT_ROUNDS      = 12;
const BCRYPT_ROUNDS_FAST = 10; // for refresh token hashing (hot path)
const LOCKOUT_THRESHOLD  = parseInt(process.env.ACCOUNT_LOCKOUT_THRESHOLD) || 5;
const LOCKOUT_DURATION   = parseInt(process.env.ACCOUNT_LOCKOUT_DURATION_MS) || 30 * 60 * 1000;

// ── DB pool (lazy singleton) ──────────────────────────────────
let pool;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host:            process.env.DB_HOST     || 'localhost',
      port:            parseInt(process.env.DB_PORT) || 3306,
      user:            process.env.DB_USER     || 'root',
      password:        process.env.DB_PASSWORD || '',
      database:        process.env.DB_NAME     || 'sfprs_db',
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

// ── Token generators ──────────────────────────────────────────
function generateAccessToken(user) {
  return jwt.sign(
    {
      id:        user.id,
      email:     user.email,
      role:      user.role_name,
      firstName: user.first_name,
      lastName:  user.last_name,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

function generateRefreshToken(userId) {
  return jwt.sign({ id: userId }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   maxAgeMs,
  };
}

// ── Password strength validator ───────────────────────────────
function validatePasswordStrength(password) {
  const errors = [];
  if (password.length < 8)            errors.push('At least 8 characters');
  if (!/[A-Z]/.test(password))        errors.push('At least one uppercase letter');
  if (!/[a-z]/.test(password))        errors.push('At least one lowercase letter');
  if (!/\d/.test(password))           errors.push('At least one digit');
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('At least one special character');
  return errors;
}

// ── Audit helper ──────────────────────────────────────────────
async function writeAuditLog(db, actorId, role, action, entityType, entityId, req, oldVal, newVal) {
  try {
    await db.execute(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [actorId, role, action, entityType, entityId,
       oldVal ? JSON.stringify(oldVal) : null,
       newVal ? JSON.stringify(newVal) : null,
       req.ip || req.connection?.remoteAddress,
       req.headers['user-agent'] || null]
    );
  } catch (e) {
    console.error('[audit-log error]', e.message);
  }
}

// ============================================================
// POST /auth/login  (with account lockout)
// ============================================================
async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'ValidationError', fields: errors.array() });
  }

  const { email, password } = req.body;
  const db = getPool();

  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.phone,
              u.is_active, u.failed_login_attempts, u.locked_until, r.name AS role_name
       FROM   users u
       JOIN   roles r ON r.id = u.role_id
       WHERE  u.email = ? AND u.deleted_at IS NULL`,
      [email]
    );

    if (rows.length === 0) {
      await writeAuditLog(db, null, null, 'LOGIN_FAILED_UNKNOWN_EMAIL', 'users', null, req, null, { email });
      return res.status(401).json({ error: 'InvalidCredentials', message: 'Email or password is incorrect.' });
    }

    const user = rows[0];

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minsLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      await writeAuditLog(db, user.id, user.role_name, 'LOGIN_BLOCKED_LOCKED', 'users', user.id, req);
      return res.status(423).json({
        error: 'AccountLocked',
        message: `Account is locked due to too many failed attempts. Try again in ${minsLeft} minute(s).`,
        lockedUntil: user.locked_until,
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'AccountDisabled', message: 'Your account has been deactivated. Contact the administrator.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      // Increment failed attempts
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      const lockUntil   = newAttempts >= LOCKOUT_THRESHOLD
        ? new Date(Date.now() + LOCKOUT_DURATION).toISOString().slice(0, 19).replace('T', ' ')
        : null;

      await db.execute(
        `UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`,
        [newAttempts, lockUntil, user.id]
      );

      await writeAuditLog(db, user.id, user.role_name, 'LOGIN_FAILED_BAD_PASSWORD', 'users', user.id, req, null, {
        attempt: newAttempts,
        locked: !!lockUntil,
      });

      const remaining = LOCKOUT_THRESHOLD - newAttempts;
      const msg = remaining > 0
        ? `Email or password is incorrect. ${remaining} attempt(s) remaining.`
        : 'Account locked due to too many failed attempts. Please wait 30 minutes.';

      return res.status(401).json({ error: 'InvalidCredentials', message: msg });
    }

    // Successful login — reset lockout counters
    const accessToken  = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user.id);
    const refreshHash  = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS_FAST);

    await db.execute(
      `UPDATE users SET refresh_token = ?, failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?`,
      [refreshHash, user.id]
    );

    res.cookie('access_token',  accessToken,  cookieOptions(15 * 60 * 1000));
    res.cookie('refresh_token', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

    await writeAuditLog(db, user.id, user.role_name, 'USER_LOGIN', 'users', user.id, req);

    return res.json({
      message: 'Login successful',
      user: {
        id:        user.id,
        email:     user.email,
        role:      user.role_name,
        firstName: user.first_name,
        lastName:  user.last_name,
      },
      accessToken,
    });
  } catch (err) {
    console.error('[login error]', err);
    return res.status(500).json({ error: 'InternalError', message: 'Login failed. Please try again.' });
  }
}

// ============================================================
// POST /auth/refresh
// ============================================================
async function refresh(req, res) {
  const token = req.cookies?.refresh_token || req.body?.refreshToken;
  if (!token) {
    return res.status(401).json({ error: 'NoRefreshToken', message: 'Refresh token required.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'InvalidRefreshToken', message: 'Refresh token is invalid or expired.' });
  }

  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.email, u.refresh_token, u.first_name, u.last_name, u.is_active,
              r.name AS role_name
       FROM   users u JOIN roles r ON r.id = u.role_id
       WHERE  u.id = ? AND u.deleted_at IS NULL`,
      [payload.id]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(401).json({ error: 'UserNotFound' });
    }

    const user  = rows[0];
    const valid = await bcrypt.compare(token, user.refresh_token || '');
    if (!valid) {
      return res.status(401).json({ error: 'RefreshTokenMismatch', message: 'Token reuse detected. Please log in again.' });
    }

    const newAccessToken  = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user.id);
    const newHash         = await bcrypt.hash(newRefreshToken, BCRYPT_ROUNDS_FAST);

    await db.execute(`UPDATE users SET refresh_token = ? WHERE id = ?`, [newHash, user.id]);

    res.cookie('access_token',  newAccessToken,  cookieOptions(15 * 60 * 1000));
    res.cookie('refresh_token', newRefreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

    return res.json({ message: 'Token refreshed', accessToken: newAccessToken });
  } catch (err) {
    console.error('[refresh error]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// POST /auth/logout
// ============================================================
async function logout(req, res) {
  const db = getPool();
  try {
    await db.execute(`UPDATE users SET refresh_token = NULL WHERE id = ?`, [req.user.id]);
    await writeAuditLog(db, req.user.id, req.user.role, 'USER_LOGOUT', 'users', req.user.id, req);
  } catch (e) {
    console.error('[logout db error]', e.message);
  }

  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  return res.json({ message: 'Logged out successfully.' });
}

// ============================================================
// GET /auth/me
// ============================================================
async function me(req, res) {
  return res.json({
    id:        req.user.id,
    email:     req.user.email,
    role:      req.user.role,
    firstName: req.user.firstName,
    lastName:  req.user.lastName,
  });
}

// ============================================================
// POST /auth/change-password
// ============================================================
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'MissingFields', message: 'Current and new password are required.' });
  }

  // Validate strength
  const strengthErrors = validatePasswordStrength(newPassword);
  if (strengthErrors.length > 0) {
    return res.status(422).json({
      error: 'WeakPassword',
      message: 'Password does not meet requirements.',
      requirements: strengthErrors,
    });
  }

  const db = getPool();
  try {
    const [rows] = await db.execute(`SELECT password_hash FROM users WHERE id = ?`, [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'UserNotFound' });

    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ error: 'InvalidPassword', message: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.execute(
      `UPDATE users SET password_hash = ?, password_changed_at = NOW(), refresh_token = NULL WHERE id = ?`,
      [newHash, req.user.id]
    );

    await writeAuditLog(db, req.user.id, req.user.role, 'PASSWORD_CHANGED', 'users', req.user.id, req);

    res.clearCookie('refresh_token');
    return res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (err) {
    console.error('[changePassword]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /auth/users  — super_admin only
// ============================================================
async function listUsers(req, res) {
  const { page = 1, limit = 20, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const db = getPool();
  try {
    let where = 'u.deleted_at IS NULL';
    const params = [];
    if (search) {
      where += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const safeLimit  = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);

    const [rows] = await db.execute(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.is_active,
              u.last_login_at, u.created_at, u.failed_login_attempts, u.locked_until,
              r.name AS role_name, r.display_name AS role_display
       FROM   users u
       JOIN   roles r ON r.id = u.role_id
       WHERE  ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, safeOffset]
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM users u WHERE ${where}`, params
    );

    return res.json({ data: rows, total, page: parseInt(page) });
  } catch (err) {
    console.error('[listUsers]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// POST /auth/users  — super_admin only
// ============================================================
async function createUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'ValidationError', fields: errors.array() });
  }

  const { email, password, roleId, firstName, lastName, phone } = req.body;

  const strengthErrors = validatePasswordStrength(password);
  if (strengthErrors.length > 0) {
    return res.status(422).json({ error: 'WeakPassword', requirements: strengthErrors });
  }

  const db = getPool();
  try {
    // Check duplicate email
    const [existing] = await db.execute(`SELECT id FROM users WHERE email = ?`, [email]);
    if (existing.length) {
      return res.status(409).json({ error: 'EmailExists', message: 'A user with this email already exists.' });
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [result] = await db.execute(
      `INSERT INTO users (id, email, password_hash, role_id, first_name, last_name, phone)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
      [email, hash, roleId, firstName, lastName, phone || null]
    );

    await writeAuditLog(db, req.user.id, req.user.role, 'USER_CREATED', 'users', null, req, null, { email, roleId });

    return res.status(201).json({ message: 'User created successfully.' });
  } catch (err) {
    console.error('[createUser]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// PATCH /auth/users/:id  — super_admin only
// ============================================================
async function updateUser(req, res) {
  const { firstName, lastName, phone, roleId, email } = req.body;
  const db = getPool();
  try {
    const sets = [];
    const params = [];
    if (firstName) { sets.push('first_name = ?'); params.push(firstName); }
    if (lastName)  { sets.push('last_name = ?');  params.push(lastName); }
    if (phone !== undefined) { sets.push('phone = ?'); params.push(phone || null); }
    if (roleId)    { sets.push('role_id = ?');    params.push(roleId); }
    if (email)     { sets.push('email = ?');      params.push(email); }
    if (!sets.length) return res.status(400).json({ error: 'NoFieldsProvided' });

    params.push(req.params.id);
    await db.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);

    await writeAuditLog(db, req.user.id, req.user.role, 'USER_UPDATED', 'users', req.params.id, req, null, req.body);

    return res.json({ message: 'User updated.' });
  } catch (err) {
    console.error('[updateUser]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// PATCH /auth/users/:id/toggle-active  — super_admin only
// ============================================================
async function toggleUserActive(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(`SELECT is_active FROM users WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'UserNotFound' });

    const newStatus = rows[0].is_active ? 0 : 1;
    await db.execute(`UPDATE users SET is_active = ? WHERE id = ?`, [newStatus, req.params.id]);

    await writeAuditLog(db, req.user.id, req.user.role,
      newStatus ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      'users', req.params.id, req, { is_active: rows[0].is_active }, { is_active: newStatus });

    return res.json({ message: newStatus ? 'User activated.' : 'User deactivated.', isActive: !!newStatus });
  } catch (err) {
    console.error('[toggleUserActive]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// PATCH /auth/users/:id/unlock  — super_admin only
// ============================================================
async function unlockUser(req, res) {
  const db = getPool();
  try {
    await db.execute(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`,
      [req.params.id]
    );
    await writeAuditLog(db, req.user.id, req.user.role, 'USER_UNLOCKED', 'users', req.params.id, req);
    return res.json({ message: 'User account unlocked.' });
  } catch (err) {
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /auth/roles  — for admin dropdowns
// ============================================================
async function listRoles(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(`SELECT id, name, display_name, description FROM roles ORDER BY name`);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: 'InternalError' });
  }
}

module.exports = {
  login, refresh, logout, me, changePassword,
  listUsers, createUser, updateUser, toggleUserActive, unlockUser,
  listRoles,
};

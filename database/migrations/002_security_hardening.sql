-- ============================================================
-- SFPRS Migration 002 — Security Hardening
-- Microlink IT College · 2025
-- ============================================================

USE sfprs_db;

-- Add account lockout columns to users (skip IF NOT EXISTS to avoid parse errors)
-- If columns exist, this will error, but that's fine.
ALTER TABLE users
  ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0 AFTER refresh_token,
  ADD COLUMN locked_until DATETIME NULL AFTER failed_login_attempts,
  ADD COLUMN password_changed_at DATETIME NULL AFTER locked_until;

-- Index for faster audit log queries
CREATE INDEX idx_audit_logs_created_at_action
  ON audit_logs (created_at, action);

SELECT 'Migration 002 — Security hardening applied.' AS status;

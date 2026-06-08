-- ============================================================
-- SFPRS — Student Fee Payment & Registration System
-- Microlink IT College · Mekelle, Tigray
-- Schema Version: 1.0.0
-- Director: Asmeret · 2025
-- ============================================================

CREATE DATABASE IF NOT EXISTS sfprs_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sfprs_db;

-- ============================================================
-- Table 1: roles
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id            CHAR(36)      NOT NULL DEFAULT (UUID()),
  name          VARCHAR(50)   NOT NULL UNIQUE,
  display_name  VARCHAR(100)  NOT NULL,
  description   TEXT,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME      NULL,
  PRIMARY KEY (id),
  INDEX idx_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table 2: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              CHAR(36)      NOT NULL DEFAULT (UUID()),
  email           VARCHAR(255)  NOT NULL UNIQUE,
  password_hash   VARCHAR(255)  NOT NULL,
  role_id         CHAR(36)      NOT NULL,
  first_name      VARCHAR(100)  NOT NULL,
  last_name       VARCHAR(100)  NOT NULL,
  phone           VARCHAR(20)   NULL,
  is_active       TINYINT(1)    NOT NULL DEFAULT 1,
  last_login_at   DATETIME      NULL,
  refresh_token   TEXT          NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME      NULL,
  PRIMARY KEY (id),
  INDEX idx_users_email (email),
  INDEX idx_users_role_id (role_id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table 3: departments
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id            CHAR(36)      NOT NULL DEFAULT (UUID()),
  code          VARCHAR(10)   NOT NULL UNIQUE,
  name          VARCHAR(150)  NOT NULL,
  name_am       VARCHAR(150)  NULL COMMENT 'Amharic name',
  head_user_id  CHAR(36)      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME      NULL,
  PRIMARY KEY (id),
  INDEX idx_departments_code (code),
  CONSTRAINT fk_departments_head FOREIGN KEY (head_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table 4: academic_years
-- ============================================================
CREATE TABLE IF NOT EXISTS academic_years (
  id          CHAR(36)      NOT NULL DEFAULT (UUID()),
  label       VARCHAR(20)   NOT NULL UNIQUE COMMENT '2024/2025',
  start_date  DATE          NOT NULL,
  end_date    DATE          NOT NULL,
  is_current  TINYINT(1)    NOT NULL DEFAULT 0,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME      NULL,
  PRIMARY KEY (id),
  INDEX idx_academic_years_label (label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table 5: courses
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id              CHAR(36)      NOT NULL DEFAULT (UUID()),
  code            VARCHAR(20)   NOT NULL UNIQUE,
  name            VARCHAR(200)  NOT NULL,
  name_am         VARCHAR(200)  NULL,
  department_id   CHAR(36)      NOT NULL,
  duration_years  INT           NOT NULL DEFAULT 4,
  level           ENUM('certificate','diploma','degree','masters') NOT NULL DEFAULT 'degree',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME      NULL,
  PRIMARY KEY (id),
  INDEX idx_courses_code (code),
  INDEX idx_courses_department_id (department_id),
  CONSTRAINT fk_courses_department FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table 6: students
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
  student_id_number   VARCHAR(20)     NOT NULL UNIQUE COMMENT 'e.g. MLK-2025-001',
  user_id             CHAR(36)        NULL COMMENT 'Linked portal account',
  first_name          VARCHAR(100)    NOT NULL,
  last_name           VARCHAR(100)    NOT NULL,
  first_name_am       VARCHAR(100)    NULL,
  last_name_am        VARCHAR(100)    NULL,
  date_of_birth       DATE            NOT NULL,
  gender              ENUM('male','female','other') NOT NULL,
  nationality         VARCHAR(100)    NOT NULL DEFAULT 'Ethiopian',
  national_id         VARCHAR(50)     NULL,
  phone               VARCHAR(20)     NOT NULL,
  email               VARCHAR(255)    NULL,
  address             TEXT            NULL,
  emergency_contact   VARCHAR(200)    NULL,
  photo_url           VARCHAR(500)    NULL,
  department_id       CHAR(36)        NOT NULL,
  course_id           CHAR(36)        NOT NULL,
  academic_year_id    CHAR(36)        NOT NULL,
  current_semester    INT             NOT NULL DEFAULT 1,
  enrollment_status   ENUM('pending','active','suspended','graduated','withdrawn') NOT NULL DEFAULT 'pending',
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          DATETIME        NULL,
  PRIMARY KEY (id),
  INDEX idx_students_student_id_number (student_id_number),
  INDEX idx_students_department_id (department_id),
  INDEX idx_students_course_id (course_id),
  INDEX idx_students_academic_year_id (academic_year_id),
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_students_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_students_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_students_academic_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table 7: registrations
-- ============================================================
CREATE TABLE IF NOT EXISTS registrations (
  id                  CHAR(36)      NOT NULL DEFAULT (UUID()),
  reference_number    VARCHAR(30)   NOT NULL UNIQUE COMMENT 'e.g. MLK-REG-2025-0001',
  student_id          CHAR(36)      NULL COMMENT 'Set after approval',
  applicant_first_name VARCHAR(100) NOT NULL,
  applicant_last_name  VARCHAR(100) NOT NULL,
  applicant_phone     VARCHAR(20)   NOT NULL,
  applicant_email     VARCHAR(255)  NULL,
  department_id       CHAR(36)      NOT NULL,
  course_id           CHAR(36)      NOT NULL,
  academic_year_id    CHAR(36)      NOT NULL,
  status              ENUM('submitted','under_review','approved','rejected','waitlisted') NOT NULL DEFAULT 'submitted',
  document_id_url     VARCHAR(500)  NULL,
  document_cert_url   VARCHAR(500)  NULL,
  document_photo_url  VARCHAR(500)  NULL,
  rejection_reason    TEXT          NULL,
  reviewed_by         CHAR(36)      NULL COMMENT 'registrar user_id',
  reviewed_at         DATETIME      NULL,
  email_sent          TINYINT(1)    NOT NULL DEFAULT 0,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          DATETIME      NULL,
  PRIMARY KEY (id),
  INDEX idx_registrations_reference (reference_number),
  INDEX idx_registrations_student_id (student_id),
  INDEX idx_registrations_status (status),
  CONSTRAINT fk_registrations_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_registrations_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_registrations_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_registrations_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
  CONSTRAINT fk_registrations_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table 8: fee_schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_schedules (
  id                CHAR(36)        NOT NULL DEFAULT (UUID()),
  name              VARCHAR(200)    NOT NULL,
  description       TEXT            NULL,
  department_id     CHAR(36)        NULL COMMENT 'NULL = applies to all departments',
  course_id         CHAR(36)        NULL COMMENT 'NULL = applies to all courses',
  academic_year_id  CHAR(36)        NOT NULL,
  semester          INT             NOT NULL COMMENT '1 or 2',
  fee_type          ENUM('tuition','registration','library','lab','id_card','other') NOT NULL DEFAULT 'tuition',
  amount            DECIMAL(12,2)   NOT NULL,
  currency          VARCHAR(3)      NOT NULL DEFAULT 'ETB',
  due_date          DATE            NOT NULL,
  is_mandatory      TINYINT(1)      NOT NULL DEFAULT 1,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at        DATETIME        NULL,
  PRIMARY KEY (id),
  INDEX idx_fee_schedules_academic_year (academic_year_id),
  INDEX idx_fee_schedules_semester (semester),
  CONSTRAINT fk_fee_schedules_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_fee_schedules_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_fee_schedules_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table 9: payments
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                  CHAR(36)        NOT NULL DEFAULT (UUID()),
  student_id          CHAR(36)        NOT NULL,
  fee_schedule_id     CHAR(36)        NOT NULL,
  amount_paid         DECIMAL(12,2)   NOT NULL,
  payment_method      ENUM('cash','bank_transfer','mobile_money','cheque') NOT NULL DEFAULT 'cash',
  bank_reference      VARCHAR(100)    NULL,
  payment_date        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  semester            INT             NOT NULL,
  academic_year_id    CHAR(36)        NOT NULL,
  officer_id          CHAR(36)        NOT NULL COMMENT 'finance officer who recorded payment',
  officer_ip          VARCHAR(45)     NULL,
  notes               TEXT            NULL,
  status              ENUM('completed','pending','reversed','failed') NOT NULL DEFAULT 'completed',
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          DATETIME        NULL,
  PRIMARY KEY (id),
  INDEX idx_payments_student_id (student_id),
  INDEX idx_payments_payment_date (payment_date),
  INDEX idx_payments_officer_id (officer_id),
  INDEX idx_payments_academic_year (academic_year_id),
  CONSTRAINT fk_payments_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_payments_fee_schedule FOREIGN KEY (fee_schedule_id) REFERENCES fee_schedules(id),
  CONSTRAINT fk_payments_officer FOREIGN KEY (officer_id) REFERENCES users(id),
  CONSTRAINT fk_payments_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table 10: receipts
-- ============================================================
CREATE TABLE IF NOT EXISTS receipts (
  id              CHAR(36)      NOT NULL DEFAULT (UUID()),
  receipt_number  VARCHAR(30)   NOT NULL UNIQUE COMMENT 'MLKFEE-YYYY-NNNN',
  payment_id      CHAR(36)      NOT NULL UNIQUE,
  student_id      CHAR(36)      NOT NULL,
  pdf_url         VARCHAR(500)  NULL,
  issued_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_by       CHAR(36)      NOT NULL,
  voided          TINYINT(1)    NOT NULL DEFAULT 0,
  void_reason     TEXT          NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME      NULL,
  PRIMARY KEY (id),
  INDEX idx_receipts_receipt_number (receipt_number),
  INDEX idx_receipts_payment_id (payment_id),
  INDEX idx_receipts_student_id (student_id),
  CONSTRAINT fk_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments(id),
  CONSTRAINT fk_receipts_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_receipts_issuer FOREIGN KEY (issued_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table 11: notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id            CHAR(36)      NOT NULL DEFAULT (UUID()),
  user_id       CHAR(36)      NULL,
  student_id    CHAR(36)      NULL,
  type          ENUM('email','sms','in_app') NOT NULL DEFAULT 'email',
  subject       VARCHAR(300)  NOT NULL,
  body          TEXT          NOT NULL,
  status        ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  sent_at       DATETIME      NULL,
  error_message TEXT          NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME      NULL,
  PRIMARY KEY (id),
  INDEX idx_notifications_user_id (user_id),
  INDEX idx_notifications_student_id (student_id),
  INDEX idx_notifications_status (status),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_notifications_student FOREIGN KEY (student_id) REFERENCES students(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table 12: audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          CHAR(36)      NOT NULL DEFAULT (UUID()),
  actor_id    CHAR(36)      NULL COMMENT 'user who performed action',
  actor_role  VARCHAR(50)   NULL,
  action      VARCHAR(100)  NOT NULL COMMENT 'e.g. PAYMENT_RECORDED, USER_CREATED',
  entity_type VARCHAR(100)  NOT NULL COMMENT 'e.g. payments, students',
  entity_id   CHAR(36)      NULL,
  old_values  JSON          NULL,
  new_values  JSON          NULL,
  ip_address  VARCHAR(45)   NULL,
  user_agent  VARCHAR(500)  NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_audit_logs_actor_id (actor_id),
  INDEX idx_audit_logs_entity (entity_type, entity_id),
  INDEX idx_audit_logs_action (action),
  INDEX idx_audit_logs_created_at (created_at)
  -- No deleted_at — audit logs are immutable
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

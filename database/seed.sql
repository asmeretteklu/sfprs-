-- ============================================================
-- SFPRS Seed Data
-- Microlink IT College · Mekelle, Tigray
-- Run: mysql -u root -p sfprs_db < database/seed.sql
-- ============================================================

USE sfprs_db;

-- ============================================================
-- Roles
-- ============================================================
INSERT INTO roles (id, name, display_name, description) VALUES
  ('role-0001-0000-0000-000000000001', 'super_admin',     'Super Administrator', 'Full system access including user management and audit logs'),
  ('role-0001-0000-0000-000000000002', 'finance_officer', 'Finance Officer',      'Record payments, generate receipts, view finance dashboard'),
  ('role-0001-0000-0000-000000000003', 'registrar',       'Registrar',            'Review and approve/reject student registrations'),
  ('role-0001-0000-0000-000000000004', 'student',         'Student',              'View own registration status, fees, and receipts')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- ============================================================
-- Academic Years
-- ============================================================
INSERT INTO academic_years (id, label, start_date, end_date, is_current) VALUES
  ('acyr-0001-0000-0000-000000000001', '2023/2024', '2023-09-01', '2024-07-31', 0),
  ('acyr-0001-0000-0000-000000000002', '2024/2025', '2024-09-01', '2025-07-31', 0),
  ('acyr-0001-0000-0000-000000000003', '2025/2026', '2025-09-01', '2026-07-31', 1)
ON DUPLICATE KEY UPDATE is_current = VALUES(is_current);

-- ============================================================
-- Departments
-- ============================================================
INSERT INTO departments (id, code, name, name_am) VALUES
  ('dept-0001-0000-0000-000000000001', 'ICT',  'Information & Communication Technology', 'ኢንፎርሜሽን እና ኮምዩኒኬሽን ቴክኖሎጂ'),
  ('dept-0001-0000-0000-000000000002', 'BUS',  'Business & Management',                 'ቢዝነስ እና አስተዳደር'),
  ('dept-0001-0000-0000-000000000003', 'ENG',  'Engineering Technology',                'ምህንድስና ቴክኖሎጂ'),
  ('dept-0001-0000-0000-000000000004', 'HLT',  'Health Sciences',                       'የጤና ሳይንስ'),
  ('dept-0001-0000-0000-000000000005', 'SOC',  'Social Sciences & Law',                 'ማህበራዊ ሳይንስ እና ህግ')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ============================================================
-- Courses
-- ============================================================
INSERT INTO courses (id, code, name, department_id, duration_years, level) VALUES
  ('crse-0001-0000-0000-000000000001', 'BSC-CS',   'BSc Computer Science',           'dept-0001-0000-0000-000000000001', 4, 'degree'),
  ('crse-0001-0000-0000-000000000002', 'BSC-IT',   'BSc Information Technology',     'dept-0001-0000-0000-000000000001', 4, 'degree'),
  ('crse-0001-0000-0000-000000000003', 'DIP-NET',  'Diploma Networking',             'dept-0001-0000-0000-000000000001', 2, 'diploma'),
  ('crse-0001-0000-0000-000000000004', 'BSC-BA',   'BSc Business Administration',    'dept-0001-0000-0000-000000000002', 4, 'degree'),
  ('crse-0001-0000-0000-000000000005', 'BSC-ACC',  'BSc Accounting & Finance',       'dept-0001-0000-0000-000000000002', 4, 'degree'),
  ('crse-0001-0000-0000-000000000006', 'BSC-CE',   'BSc Civil Engineering',          'dept-0001-0000-0000-000000000003', 5, 'degree'),
  ('crse-0001-0000-0000-000000000007', 'BSC-EE',   'BSc Electrical Engineering',     'dept-0001-0000-0000-000000000003', 5, 'degree'),
  ('crse-0001-0000-0000-000000000008', 'BSC-NUR',  'BSc Nursing',                    'dept-0001-0000-0000-000000000004', 4, 'degree'),
  ('crse-0001-0000-0000-000000000009', 'BSC-LAW',  'LLB Law',                        'dept-0001-0000-0000-000000000005', 5, 'degree')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ============================================================
-- Super Admin User
-- Password: Admin@Microlink2025  (bcrypt hash — CHANGE IN PRODUCTION)
-- Generate: node -e "const b=require('bcrypt');b.hash('Admin@Microlink2025',12).then(console.log)"
-- ============================================================
INSERT INTO users (id, email, password_hash, role_id, first_name, last_name, phone) VALUES
  (
    'user-0001-0000-0000-000000000001',
    'admin@microlink.edu.et',
    '$2b$12$REPLACE_THIS_WITH_BCRYPT_HASH_OF_Admin_Microlink2025_HERE',
    'role-0001-0000-0000-000000000001',
    'Asmeret',
    'Admin',
    '+251900000000'
  )
ON DUPLICATE KEY UPDATE email = VALUES(email);

-- Demo Finance Officer
INSERT INTO users (id, email, password_hash, role_id, first_name, last_name, phone) VALUES
  (
    'user-0001-0000-0000-000000000002',
    'finance@microlink.edu.et',
    '$2b$12$REPLACE_THIS_WITH_BCRYPT_HASH_OF_Admin_Microlink2025_HERE',
    'role-0001-0000-0000-000000000002',
    'Tigist',
    'Hailu',
    '+251911000001'
  )
ON DUPLICATE KEY UPDATE email = VALUES(email);

-- Demo Registrar
INSERT INTO users (id, email, password_hash, role_id, first_name, last_name, phone) VALUES
  (
    'user-0001-0000-0000-000000000003',
    'registrar@microlink.edu.et',
    '$2b$12$REPLACE_THIS_WITH_BCRYPT_HASH_OF_Admin_Microlink2025_HERE',
    'role-0001-0000-0000-000000000003',
    'Berhe',
    'Teklay',
    '+251911000002'
  )
ON DUPLICATE KEY UPDATE email = VALUES(email);

-- ============================================================
-- Fee Schedules (2025/2026 Academic Year)
-- ============================================================
INSERT INTO fee_schedules (id, name, department_id, course_id, academic_year_id, semester, fee_type, amount, due_date, is_mandatory) VALUES
  ('fsch-0001-0000-0000-000000000001', 'ICT Tuition — Sem 1 2025/26', 'dept-0001-0000-0000-000000000001', NULL, 'acyr-0001-0000-0000-000000000003', 1, 'tuition',      15000.00, '2025-10-31', 1),
  ('fsch-0001-0000-0000-000000000002', 'ICT Tuition — Sem 2 2025/26', 'dept-0001-0000-0000-000000000001', NULL, 'acyr-0001-0000-0000-000000000003', 2, 'tuition',      15000.00, '2026-03-31', 1),
  ('fsch-0001-0000-0000-000000000003', 'Registration Fee 2025/26',     NULL,                               NULL, 'acyr-0001-0000-0000-000000000003', 1, 'registration',   500.00, '2025-10-01', 1),
  ('fsch-0001-0000-0000-000000000004', 'Library Fee 2025/26',          NULL,                               NULL, 'acyr-0001-0000-0000-000000000003', 1, 'library',        200.00, '2025-10-31', 1),
  ('fsch-0001-0000-0000-000000000005', 'Lab Fee ICT 2025/26',          'dept-0001-0000-0000-000000000001', NULL, 'acyr-0001-0000-0000-000000000003', 1, 'lab',            800.00, '2025-10-31', 1),
  ('fsch-0001-0000-0000-000000000006', 'BUS Tuition — Sem 1 2025/26',  'dept-0001-0000-0000-000000000002', NULL, 'acyr-0001-0000-0000-000000000003', 1, 'tuition',      13000.00, '2025-10-31', 1),
  ('fsch-0001-0000-0000-000000000007', 'BUS Tuition — Sem 2 2025/26',  'dept-0001-0000-0000-000000000002', NULL, 'acyr-0001-0000-0000-000000000003', 2, 'tuition',      13000.00, '2026-03-31', 1),
  ('fsch-0001-0000-0000-000000000008', 'ENG Tuition — Sem 1 2025/26',  'dept-0001-0000-0000-000000000003', NULL, 'acyr-0001-0000-0000-000000000003', 1, 'tuition',      18000.00, '2025-10-31', 1),
  ('fsch-0001-0000-0000-000000000009', 'ID Card Fee 2025/26',          NULL,                               NULL, 'acyr-0001-0000-0000-000000000003', 1, 'id_card',        50.00, '2025-10-01', 0)
ON DUPLICATE KEY UPDATE amount = VALUES(amount);

SELECT 'SFPRS seed data loaded successfully.' AS status;

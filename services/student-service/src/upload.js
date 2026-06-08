// ============================================================
// Student Service — Multer Upload Config
// PDF/JPG only · 2MB max · MIME validated server-side
// ============================================================
'use strict';

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

// ── MIME whitelist (server-side validation) ───────────────────
const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/jpg'];
const ALLOWED_EXTS  = ['.pdf', '.jpg', '.jpeg'];

// Basic sanitization
function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
}

function fileFilter(_req, file, cb) {
  const ext  = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  // 1. Extension & Client MIME check
  if (!ALLOWED_MIMES.includes(mime) || !ALLOWED_EXTS.includes(ext)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE',
      `Only PDF and JPG files are allowed. Received: ${mime}`));
  }

  // 2. Magic byte validation (Placeholder)
  // TODO: Use 'file-type' package to read the first few bytes of the buffer
  // to ensure the file is actually a PDF/JPG and not a renamed executable.

  // 3. Virus scan (Placeholder)
  // TODO: Integrate with ClamAV or similar to scan the buffer before saving.

  file.originalname = sanitizeFilename(file.originalname);
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

module.exports = { upload };

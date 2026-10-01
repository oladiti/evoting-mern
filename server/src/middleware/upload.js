import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.resolve(__dirname, '../../uploads');
export const facesDir = path.join(uploadsDir, 'faces');

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(facesDir, { recursive: true });

const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX = 2 * 1024 * 1024; // 2MB

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

const faceStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, facesDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `face_${req.user?._id || 'anon'}_${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED.includes(file.mimetype)) return cb(new Error('Only JPG, PNG, GIF or WEBP images are allowed'));
  cb(null, true);
};

export const uploadCandidatePhoto = multer({
  storage,
  limits: { fileSize: MAX },
  fileFilter,
}).single('photo');

export const uploadFacePhoto = multer({
  storage: faceStorage,
  limits: { fileSize: MAX },
  fileFilter,
}).single('facePhoto');

export function staticUrl(pathname) {
  if (!pathname) return null;
  const p = String(pathname);
  if (/^https?:\/\//.test(p)) return p;
  return `/uploads/${p.replace(/^uploads\//, '').replace(/^\/+/, '')}`;
}

export function deleteUploadedFile(pathname) {
  if (!pathname || /^https?:\/\//.test(pathname)) return;
  const safe = pathname.replace(/^uploads\//, '').replace(/^\/+/, '');
  if (safe.includes('..')) return;
  const abs = path.join(uploadsDir, safe);
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

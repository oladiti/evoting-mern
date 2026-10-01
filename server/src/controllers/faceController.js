import User from '../models/User.js';
import { validators } from '../utils/index.js';
import { logActivity } from '../services/activityLog.js';
import { staticUrl, deleteUploadedFile } from '../middleware/upload.js';
import { getSetting } from '../services/settings.js';
import { euclidean, round4, remainingMinutes, resolveThreshold } from '../services/faceMatch.js';
import { FACE_THRESHOLD, FACE_MAX_ATTEMPTS, FACE_LOCKOUT_SECONDS } from '../config/constants.js';

const LOCKOUT_MS = FACE_LOCKOUT_SECONDS * 1000;

// The setting stores hundredths so the settings screen can use an integer input.
// resolveThreshold applies the MIN/MAX band and the not-a-number fallback.
async function matchThreshold() {
  const raw = await getSetting('face_match_threshold', Math.round(FACE_THRESHOLD * 100));
  return resolveThreshold(raw, FACE_THRESHOLD);
}

export async function faceStatus(req, res) {
  return res.json({
    face_enrolled: req.user.face_enrolled,
    face_verified: req.user.face_verified,
    face_photo: staticUrl(req.user.face_photo),
  });
}

export async function enrollFace(req, res, next) {
  try {
    const { descriptor } = req.body || {};
    const v = validators();
    let parsed = descriptor;
    if (typeof descriptor === 'string') {
      try {
        parsed = JSON.parse(descriptor);
      } catch {
        parsed = null;
      }
    }
    if (!v.is128Descriptor(parsed)) {
      return res.status(400).json({ error: 'Invalid face data. Expected a 128-value descriptor.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });

    // Refuse a face that already belongs to somebody else. Without this check the
    // one shared webcam in a hall was enough to roll every account onto the same
    // template, and because the match distance between two different people was
    // measured below the ceiling, nothing downstream would have caught it.
    //
    // A full scan of the enrolled voters is O(n) in descriptors, which is why
    // this lives on enrolment - which happens once per account, behind a login -
    // and not on verification.
    const threshold = await matchThreshold();
    const others = await User.find({ face_enrolled: true, _id: { $ne: user._id } })
      .select('username face_descriptor')
      .lean();
    const conflict = others
      .filter((o) => Array.isArray(o.face_descriptor) && o.face_descriptor.length === 128)
      .map((o) => ({ username: o.username, distance: euclidean(o.face_descriptor, parsed) }))
      .filter((m) => m.distance <= threshold)
      .sort((a, b) => a.distance - b.distance)[0];

    if (conflict) {
      // The upload already landed on disk, and a rejected enrolment must not leave
      // a stray copy of somebody's face lying around in the uploads directory.
      if (req.file) deleteUploadedFile(`uploads/faces/${req.file.filename}`);
      await logActivity({
        user,
        username: user.username,
        action: 'FACE_ENROLL_REJECTED',
        description: `Face enrolment rejected: matches account "${conflict.username}" (distance ${round4(conflict.distance)}, ceiling ${threshold})`,
        entity_type: 'User',
        entity_id: user._id,
        req,
      });
      return res.status(409).json({
        error: 'This face is already enrolled to another account. Only your own face can be enrolled here.',
      });
    }

    user.face_descriptor = parsed;
    user.face_photo = req.file ? `uploads/faces/${req.file.filename}` : user.face_photo;
    user.face_enrolled = true;
    user.face_verified = false;
    user.face_fail_count = 0;
    user.face_locked_until = null;
    await user.save();

    await logActivity({ user, username: user.username, action: 'FACE_ENROLL', description: 'Face enrolled for one-time verification', entity_type: 'User', entity_id: user._id, req });

    return res.json({ success: true, message: 'Face enrolled successfully.', face_photo: staticUrl(user.face_photo) });
  } catch (err) {
    next(err);
  }
}

export async function verifyFace(req, res, next) {
  try {
    const { descriptor } = req.body || {};
    const v = validators();
    let parsed = descriptor;
    if (typeof descriptor === 'string') {
      try {
        parsed = JSON.parse(descriptor);
      } catch {
        parsed = null;
      }
    }
    if (!v.is128Descriptor(parsed)) {
      return res.status(400).json({ error: 'Invalid face data. Expected a 128-value descriptor.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (!user.face_descriptor || user.face_descriptor.length !== 128) {
      return res.status(400).json({ error: 'You must enroll your face before verifying.' });
    }

    if (user.face_locked_until && new Date(user.face_locked_until).getTime() > Date.now()) {
      const mins = remainingMinutes(user.face_locked_until);
      return res.status(429).json({ error: `Too many face verification attempts. Please try again in ${mins} minute(s).` });
    }

    const distance = euclidean(user.face_descriptor, parsed);
    const threshold = await matchThreshold();

    if (distance <= threshold) {
      user.face_verified = true;
      user.face_fail_count = 0;
      user.face_locked_until = null;
      await user.save();
      await logActivity({ user, username: user.username, action: 'FACE_VERIFY', description: 'One-time face verification successful', entity_type: 'User', entity_id: user._id, req });
      return res.json({ success: true, distance: round4(distance) });
    }

    // Failed attempt — atomic increment so concurrent requests cannot lose count.
    const updated = await User.findByIdAndUpdate(user._id, { $inc: { face_fail_count: 1 } }, { new: true, select: 'face_fail_count' });

    if (updated.face_fail_count >= FACE_MAX_ATTEMPTS) {
      await User.findByIdAndUpdate(user._id, {
        $set: { face_locked_until: new Date(Date.now() + LOCKOUT_MS), face_fail_count: 0 },
      });
      await logActivity({
        user,
        username: user.username,
        action: 'FACE_VERIFY_FAILED',
        description: `Face verification failed (distance ${round4(distance)}, ceiling ${threshold}). Locked for ${FACE_LOCKOUT_SECONDS / 60} minutes.`,
        entity_type: 'User',
        entity_id: user._id,
        req,
      });
      return res.status(429).json({ error: `Too many face verification attempts. Please try again in ${FACE_LOCKOUT_SECONDS / 60} minute(s).` });
    }

    await logActivity({
      user,
      username: user.username,
      action: 'FACE_VERIFY_FAILED',
      description: `Face verification failed (distance ${round4(distance)}, ceiling ${threshold})`,
      entity_type: 'User',
      entity_id: user._id,
      req,
    });
    return res
      .status(400)
      .json({ error: `Face does not match. ${FACE_MAX_ATTEMPTS - updated.face_fail_count} attempt(s) remaining.`, distance: round4(distance), remaining: FACE_MAX_ATTEMPTS - updated.face_fail_count });
  } catch (err) {
    next(err);
  }
}

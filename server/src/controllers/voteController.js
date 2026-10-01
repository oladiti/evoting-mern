import mongoose from 'mongoose';
import Candidate from '../models/Candidate.js';
import Election from '../models/Election.js';
import Vote from '../models/Vote.js';
import Accreditation from '../models/Accreditation.js';
import { getSetting } from '../services/settings.js';
import { verifyRecaptcha, isRecaptchaEnabled } from '../services/captcha.js';
import { isWithinGeofence } from '../services/geofence.js';
import { logActivity } from '../services/activityLog.js';
import { sha256 } from '../utils/index.js';

export async function castVote(req, res, next) {
  try {
    const { election_id, votes = {}, geo_lat, geo_lng, 'g-recaptcha-response': captcha } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(election_id)) {
      return res.status(400).json({ error: 'Invalid election.' });
    }

    const votingEnabled = await getSetting('voting_enabled', true);
    if (!votingEnabled) return res.status(403).json({ error: 'Voting is currently disabled.' });

    const election = await Election.findById(election_id);
    if (!election) return res.status(404).json({ error: 'Election not found or has ended.' });
    const now = new Date();
    if (now < election.start_date || now > election.end_date) {
      return res.status(403).json({ error: 'Election not found or has ended.' });
    }

    // Accreditation gate
    if (election.requires_accreditation) {
      const acc = await Accreditation.findOne({ user: req.user._id, election: election._id });
      if (!acc) return res.status(403).json({ error: 'You are not accredited for this election. Contact the election administrator.' });
    }

    // Face verification gate
    const faceEnabled = await getSetting('face_verification_enabled', true);
    if (faceEnabled && !req.user.face_verified) {
      return res.status(403).json({ error: 'Please verify your face before voting.' });
    }

    // reCAPTCHA gate
    const captchaRequired = await isRecaptchaEnabled();
    if (captchaRequired && !(await verifyRecaptcha(captcha))) {
      return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
    }

    const entries = Object.entries(votes).filter(([, c]) => c);
    if (entries.length === 0) {
      return res.status(400).json({ error: 'Please select at least one candidate.' });
    }

    // Geofence gate. Skipped entirely when the admin toggle is off, and also when
    // the radius is unset / <= 0, so the fence can be disabled either way.
    const [geofenceEnabled, fLat, fLng, fRadius] = await Promise.all([
      getSetting('geofence_enabled', true),
      getSetting('geofence_lat', 0),
      getSetting('geofence_lng', 0),
      getSetting('geofence_radius', 0),
    ]);
    if (geofenceEnabled && Number(fRadius) > 0) {
      const within = await isWithinGeofence(Number(geo_lat), Number(geo_lng), Number(fLat), Number(fLng), Number(fRadius));
      if (!within) {
        return res.status(403).json({ error: 'You must be within the designated premises to vote.' });
      }
    }

    const ip = sha256(req.ip || req.socket?.remoteAddress || '');

    let votesCast = 0;

    try {
      await mongoose.connection.transaction(async (session) => {
        const User = (await import('../models/User.js')).default;
        const user = await User.findById(req.user._id).session(session);
        if (!user) throw Object.assign(new Error('Account not found.'), { code: 'NOT_FOUND' });

        // Double-vote guard (mirrors SELECT ... FOR UPDATE)
        const existing = await Vote.findOne({ user: user._id, election: election._id }).session(session);
        if (existing) {
          throw Object.assign(new Error('You have already voted in this election.'), { code: 'ALREADY_VOTED' });
        }

        for (const [position, candidateId] of entries) {
          const candidate = await Candidate.findOne({ _id: candidateId, election: election._id, position }).session(session);
          if (!candidate) {
            throw Object.assign(new Error('Invalid candidate selection detected.'), { code: 'INVALID_CANDIDATE' });
          }
          // Unique compound index {user, election, position_voted} is the final atomic guard
          const vote = new Vote({
            user: user._id,
            election: election._id,
            candidate: candidate._id,
            position_voted: position,
            ip_address: ip,
          });
          await vote.save({ session });
          votesCast++;
        }

        user.has_voted = true;
        await user.save({ session });
      });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ error: 'You have already voted in this election.' });
      }
      if (err?.code === 'ALREADY_VOTED') {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }

    await logActivity({
      user: req.user,
      username: req.user.username,
      action: 'VOTE_CAST',
      description: `Voted for ${votesCast} position(s) in election '${election.title}'`,
      entity_type: 'Election',
      entity_id: election._id,
      req,
    });

    return res.json({ success: true, message: 'Your votes have been cast successfully! Thank you for participating.', votes_cast: votesCast });
  } catch (err) {
    next(err);
  }
}

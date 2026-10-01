import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    // Every token issued from one login shares a family id. Rotation keeps the
    // family, which is what makes replay detection possible: presenting a token
    // that was already rotated means the caller is either an attacker replaying
    // a stolen token or a second legitimate client, and in both cases the safe
    // response is to revoke the whole family and force a fresh login.
    family: { type: String, required: true, index: true },
    session: { type: Boolean, default: false }, // true = browser-session scoped (cleared on browser close), false = remembered (30 days)
    // Set the moment this token is exchanged. A non-null used_at on a presented
    // token is the reuse signal.
    used_at: { type: Date, default: null },
    // The token that replaced this one, so a retry inside the grace window can
    // be answered idempotently instead of being treated as a replay.
    replaced_by: { type: String, default: null },
    expires_at: { type: Date, required: true },
  },
  { timestamps: { createdAt: 'created_at' } }
);

refreshTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RefreshToken', refreshTokenSchema);

import mongoose from 'mongoose';

const emailVerificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    verification_code: { type: String, required: true, maxlength: 6 },
    expires_at: { type: Date, required: true },
    verified: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at' } }
);

emailVerificationSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('EmailVerification', emailVerificationSchema);

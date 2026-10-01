import mongoose from 'mongoose';

const loginAttemptSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // username:<username> or ip:<ip>
    attempts: { type: Number, default: 0 },
    first_attempt_at: { type: Date, default: Date.now }, // start of the current failure streak
    last_attempt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: 'created_at' } }
);

export default mongoose.model('LoginAttempt', loginAttemptSchema);

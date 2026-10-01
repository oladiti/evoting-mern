import mongoose from 'mongoose';

const accreditationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true, index: true },
    accredited_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: 'accredited_at' } }
);

accreditationSchema.index({ user: 1, election: 1 }, { unique: true });

export default mongoose.model('Accreditation', accreditationSchema);

import mongoose from 'mongoose';

const candidateSchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true, index: true },
    position: { type: String, required: true, index: true },
    name: { type: String, required: true },
    bio: { type: String, default: '' },
    photo: { type: String, default: null },
  },
  { timestamps: { createdAt: 'created_at' } }
);

candidateSchema.index({ election: 1, position: 1 });
candidateSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.candidate_id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Candidate', candidateSchema);

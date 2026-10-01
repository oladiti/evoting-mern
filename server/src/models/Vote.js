import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true, index: true },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    position_voted: { type: String, required: true },
    ip_address: { type: String, default: null },
  },
  { timestamps: { createdAt: 'vote_time' } }
);

// Replaces MySQL UNIQUE key `unique_vote_per_position (user_id, election_id, position_voted)`
voteSchema.index({ user: 1, election: 1, position_voted: 1 }, { unique: true });

voteSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.vote_id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Vote', voteSchema);

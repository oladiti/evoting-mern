import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    username: { type: String, default: null },
    action: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    entity_type: { type: String, default: null },
    entity_id: { type: String, default: null },
    ip_address: { type: String, default: null },
    user_agent: { type: String, default: null },
  },
  { timestamps: { createdAt: 'created_at' } }
);

activityLogSchema.index({ action: 1, user: 1, entity_id: 1, created_at: -1 });

export default mongoose.model('ActivityLog', activityLogSchema);

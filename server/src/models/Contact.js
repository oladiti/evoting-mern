import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String, default: '' },
    message: { type: String, required: true },
    is_read: { type: Boolean, default: false },
    read_at: { type: Date, default: null },
    replied_at: { type: Date, default: null },
    ip_address: { type: String, default: null },
  },
  { timestamps: { createdAt: 'created_at' } }
);

contactSchema.index({ is_read: 1, created_at: -1 });

export default mongoose.model('Contact', contactSchema);

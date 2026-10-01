import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    setting_key: { type: String, required: true, unique: true },
    setting_value: { type: String, default: '' },
    setting_type: {
      type: String,
      enum: ['boolean', 'string', 'integer', 'json'],
      default: 'string',
    },
    category: { type: String, default: 'general' },
    description: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

export default mongoose.model('Setting', settingSchema);

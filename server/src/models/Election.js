import mongoose from 'mongoose';
import { slugify } from '../utils/index.js';

const electionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    slug: { type: String, lowercase: true, trim: true, maxlength: 120 },
    description: { type: String, default: '' },
    position: { type: String, default: 'General Election', maxlength: 100 },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    accreditation_start_date: { type: Date, default: null },
    accreditation_end_date: { type: Date, default: null },
    requires_accreditation: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at' } }
);

// sparse+unique, not plain unique: without "sparse" only one document would be
// allowed to have no slug, so a single generation failure would block every
// later create. Mongoose builds this index via autoIndex, which is often off in
// production — the app-level check in services/elections.js is the real guard,
// this index is the backstop. Confirm it exists after deploying.
electionSchema.index({ slug: 1 }, { unique: true, sparse: true });

// Last-resort backstop. Controllers normalise and de-duplicate explicitly so
// they can return a useful 400; this only guarantees the field is never empty.
// Uniqueness is intentionally not re-checked here — that needs the Election
// model, and importing it into its own definition would be circular.
electionSchema.pre('validate', function normaliseSlug(next) {
  if (!this.slug) this.slug = slugify(this.title);
  else this.slug = slugify(this.slug);
  next();
});

electionSchema.methods.isActive = function () {
  const now = new Date();
  return now >= this.start_date && now <= this.end_date;
};

electionSchema.methods.status = function () {
  const now = new Date();
  if (now < this.start_date) return 'upcoming';
  if (now > this.end_date) return 'completed';
  return 'active';
};

electionSchema.virtual('candidate_refs', { ref: 'Candidate', localField: '_id', foreignField: 'election' });

electionSchema.set('toJSON', {
  transform(_doc, ret) {
    // election_id deliberately stays the ObjectId. ~20 client sites feed it into
    // admin endpoints (accreditation, export, CRUD) that address elections by
    // id, so repointing it at the slug would break them. slug rides along on its
    // own because it is a real schema path — the public pages opt into it.
    ret.election_id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Election', electionSchema);

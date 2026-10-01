import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 30 },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    full_name: { type: String, default: '' },
    matric_no: { type: String, default: null },
    is_admin: { type: Boolean, default: false },
    email_verified: { type: Boolean, default: false },
    has_voted: { type: Boolean, default: false },
    face_descriptor: { type: [Number], default: undefined }, // 128 floats
    face_photo: { type: String, default: null },
    face_enrolled: { type: Boolean, default: false },
    face_verified: { type: Boolean, default: false },
    face_fail_count: { type: Number, default: 0 }, // consecutive failed face verifications
    face_locked_until: { type: Date, default: null }, // null = not currently locked out
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Replaces the old `unique: true, sparse: true` on the field, which could not
// express "any number of voters may leave this blank". Sparse skips documents that
// omit the field; it does not skip documents that store null, and the register path
// writes `matric_no: matric_no || null`. So every voter who left the matric box
// empty was indexed under null, the unique index accepted exactly one of them, and
// every later blank-matric registration died on a bare E11000 that reached the user
// as "A record with that value already exists". Filtering on $type 'string' keeps
// null and missing values out of the index while still rejecting two voters who
// claim the same matric number.
//
// The database still holds the old sparse index until fix:matric-index runs;
// mongoose will not redefine an index that already exists under the same name.
userSchema.index({ matric_no: 1 }, { unique: true, partialFilterExpression: { matric_no: { $type: 'string' } } });

userSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.user_id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    delete ret.face_descriptor;
    return ret;
  },
});

export default mongoose.model('User', userSchema);

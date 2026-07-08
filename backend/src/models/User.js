import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 100000 },
  ownedProperties: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Property' }],
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  banned: { type: Boolean, default: false },
  preferredLanguage: { type: String, enum: ['en', 'he'], default: 'en' },
  theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
  onboarding: {
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '', maxlength: 500 },
  displayName: { type: String, default: '', maxlength: 50 },
  achievements: [{ type: String }],
  profileVisibility: {
    portfolio: { type: Boolean, default: true },
    activity: { type: Boolean, default: true },
  },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

userSchema.virtual('joinedAt').get(function () {
  return this.createdAt;
});

userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export default mongoose.model('User', userSchema);

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    normalizedUsername: { type: String, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, default: null },
    oauthProviders: [
      {
        provider: { type: String, enum: ['google', 'github', 'discord'] },
        providerId: { type: String },
      },
    ],
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
    lastLoginAt: { type: Date, default: null },
    achievements: [{ type: String }],
    profileVisibility: {
      portfolio: { type: Boolean, default: true },
      activity: { type: Boolean, default: true },
    },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    acceptedTerms: { type: Boolean, default: false },
    acceptedTermsAt: { type: Date, default: null },
    acceptedPrivacy: { type: Boolean, default: false },
    acceptedPrivacyAt: { type: Date, default: null },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    verificationToken: { type: String, default: null },
    verificationExpires: { type: Date, default: null },
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
    lastPeriodBonusClaim: { type: Date, default: null },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    xpToNextLevel: { type: Number, default: 100 },
    lifetimeStats: {
      totalTransactions: { type: Number, default: 0 },
      totalPropertiesOwned: { type: Number, default: 0 },
      totalMoneyEarned: { type: Number, default: 0 },
      totalMoneySpent: { type: Number, default: 0 },
      totalLoansTaken: { type: Number, default: 0 },
      totalFriendsAdded: { type: Number, default: 0 },
      totalUpgrades: { type: Number, default: 0 },
      totalConstructionStarted: { type: Number, default: 0 },
      totalSeasonsCompleted: { type: Number, default: 0 },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

userSchema.virtual('joinedAt').get(function () {
  return this.createdAt;
});

userSchema.pre('save', async function (next) {
  if (this.isModified('username')) {
    this.normalizedUsername = this.username.toLowerCase().trim();
  }
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.createVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.verificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return token;
};

userSchema.methods.createPasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  return token;
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.verificationToken;
  delete obj.verificationExpires;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  if (obj.oauthProviders) {
    obj.oauthProviders = obj.oauthProviders.map((p) => ({ provider: p.provider }));
  }
  obj.hasPassword = !!this.password;
  return obj;
};

export default mongoose.model('User', userSchema);

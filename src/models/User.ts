import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcrypt';

// Role enum for type safety
export enum Role {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  SUPERVISOR = 'supervisor',
  CLIENT = 'client'
}

// User interface extending Document
export interface IUser extends Document {
  email: string;
  password: string;
  roles: Role[];
  profile: {
    firstName: string;
    lastName: string;
    phone?: string;
    avatar?: string;
  };
  preferences: {
    language: string;
    timezone: string;
    notifications: {
      email: boolean;
      push: boolean;
      sms: boolean;
    };
  };
  isActive: boolean;
  isEmailVerified: boolean;
  loginAttempts: number;
  lockUntil?: Date;
  lastLogin?: Date;
  createdBy?: mongoose.Types.ObjectId;
  lastModifiedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  incLoginAttempts(): Promise<void>;
  resetLoginAttempts(): Promise<void>;
  toJSON(): any;
  
  // Virtual properties (read-only)
  readonly isLocked: boolean;
}

// User schema definition
const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please provide a valid email address'
    ],
    index: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    select: false // Don't include password in queries by default
  },
  roles: {
    type: [String],
    enum: Object.values(Role),
    default: [Role.CLIENT],
    validate: {
      validator: function(roles: Role[]) {
        return roles && roles.length > 0;
      },
      message: 'User must have at least one role'
    }
  },
  profile: {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    phone: {
      type: String,
      trim: true,
      match: [
        /^[\+]?[1-9][\d]{0,15}$/,
        'Please provide a valid phone number'
      ]
    },
    avatar: {
      type: String,
      trim: true
    }
  },
  preferences: {
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt'],
      trim: true
    },
    timezone: {
      type: String,
      default: 'UTC',
      trim: true
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(_doc, ret) {
      delete ret['password'];
      delete ret['loginAttempts'];
      delete ret['lockUntil'];
      return ret;
    }
  }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ roles: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > new Date());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Hash password with cost of 12
    const saltRounds = parseInt(process.env['BCRYPT_ROUNDS'] || '12', 10);
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Instance method to compare password
userSchema.methods['comparePassword'] = async function(candidatePassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this['password']);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Instance method to increment login attempts
userSchema.methods['incLoginAttempts'] = async function(): Promise<void> {
  // If we have a previous lock that has expired, restart at 1
  if (this['lockUntil'] && this['lockUntil'] < new Date()) {
    return this['updateOne']({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates: any = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 30 minutes
  if (this['loginAttempts'] + 1 >= 5 && !this['isLocked']) {
    updates.$set = { lockUntil: new Date(Date.now() + 30 * 60 * 1000) }; // 30 minutes
  }
  
  return this['updateOne'](updates);
};

// Instance method to reset login attempts
userSchema.methods['resetLoginAttempts'] = async function(): Promise<void> {
  return this['updateOne']({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() }
  });
};

// Static method to find user by email with password
userSchema.statics['findByEmailWithPassword'] = function(email: string) {
  return this.findOne({ email }).select('+password');
};

// Static method to find active users
userSchema.statics['findActiveUsers'] = function() {
  return this.find({ isActive: true });
};

// Create and export the model
const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);

export default User;
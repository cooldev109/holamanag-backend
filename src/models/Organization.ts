import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Organization Type
 */
export enum OrganizationType {
  HOTEL_CHAIN = 'hotel_chain',
  PROPERTY_MANAGEMENT = 'property_management',
  VACATION_RENTAL = 'vacation_rental',
  BOUTIQUE = 'boutique',
  INDEPENDENT = 'independent',
  FRANCHISE = 'franchise',
  OTHER = 'other'
}

/**
 * Organization Status
 */
export enum OrganizationStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  TRIAL = 'trial',
  INACTIVE = 'inactive'
}

/**
 * Subscription Plan
 */
export enum SubscriptionPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
  CUSTOM = 'custom'
}

/**
 * Organization Interface
 */
export interface IOrganization extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  legalName?: string;
  type: OrganizationType;
  status: OrganizationStatus;

  // Contact Information
  contactInfo: {
    email: string;
    phone?: string;
    website?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      country: string;
      postalCode?: string;
    };
  };

  // Business Information
  businessInfo: {
    registrationNumber?: string;
    taxId?: string;
    industry?: string;
    foundedYear?: number;
  };

  // Subscription
  subscription: {
    plan: SubscriptionPlan;
    startDate: Date;
    endDate?: Date;
    trialEndDate?: Date;
    isActive: boolean;
    features: string[]; // List of enabled features
  };

  // Limits based on subscription
  limits: {
    maxProperties: number;
    maxUsers: number;
    maxBookingsPerMonth: number;
    maxAPICallsPerDay: number;
    customBranding: boolean;
    whiteLabel: boolean;
  };

  // Organization Structure
  owner: mongoose.Types.ObjectId; // Primary account owner
  admins: mongoose.Types.ObjectId[]; // Organization administrators
  members: mongoose.Types.ObjectId[]; // All members

  // Settings
  settings: {
    timezone: string;
    currency: string;
    language: string;
    dateFormat: string;
    weekStartsOn: number; // 0 = Sunday, 1 = Monday
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
    };
    branding: {
      logo?: string;
      primaryColor?: string;
      secondaryColor?: string;
    };
  };

  // Statistics
  stats: {
    totalProperties: number;
    totalUsers: number;
    totalBookings: number;
    totalRevenue: number;
  };

  // Metadata
  tags: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Organization Schema
 */
const OrganizationSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      minlength: [2, 'Organization name must be at least 2 characters'],
      maxlength: [200, 'Organization name cannot exceed 200 characters'],
      index: true
    },
    legalName: {
      type: String,
      trim: true,
      maxlength: [200, 'Legal name cannot exceed 200 characters']
    },
    type: {
      type: String,
      enum: Object.values(OrganizationType),
      required: [true, 'Organization type is required'],
      index: true
    },
    status: {
      type: String,
      enum: Object.values(OrganizationStatus),
      default: OrganizationStatus.TRIAL,
      index: true
    },
    contactInfo: {
      email: {
        type: String,
        required: [true, 'Contact email is required'],
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
      },
      phone: {
        type: String,
        trim: true
      },
      website: {
        type: String,
        trim: true
      },
      address: {
        street: String,
        city: String,
        state: String,
        country: {
          type: String,
          required: [true, 'Country is required']
        },
        postalCode: String
      }
    },
    businessInfo: {
      registrationNumber: String,
      taxId: String,
      industry: String,
      foundedYear: {
        type: Number,
        min: [1800, 'Founded year must be 1800 or later'],
        max: [new Date().getFullYear(), 'Founded year cannot be in the future']
      }
    },
    subscription: {
      plan: {
        type: String,
        enum: Object.values(SubscriptionPlan),
        default: SubscriptionPlan.FREE
      },
      startDate: {
        type: Date,
        default: Date.now
      },
      endDate: Date,
      trialEndDate: Date,
      isActive: {
        type: Boolean,
        default: true
      },
      features: [
        {
          type: String,
          trim: true
        }
      ]
    },
    limits: {
      maxProperties: {
        type: Number,
        default: 1,
        min: [1, 'Must allow at least 1 property']
      },
      maxUsers: {
        type: Number,
        default: 5,
        min: [1, 'Must allow at least 1 user']
      },
      maxBookingsPerMonth: {
        type: Number,
        default: 100,
        min: [0, 'Cannot have negative booking limit']
      },
      maxAPICallsPerDay: {
        type: Number,
        default: 1000,
        min: [0, 'Cannot have negative API call limit']
      },
      customBranding: {
        type: Boolean,
        default: false
      },
      whiteLabel: {
        type: Boolean,
        default: false
      }
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Organization owner is required'],
      index: true
    },
    admins: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    settings: {
      timezone: {
        type: String,
        default: 'America/New_York'
      },
      currency: {
        type: String,
        default: 'USD',
        uppercase: true,
        minlength: 3,
        maxlength: 3
      },
      language: {
        type: String,
        default: 'en',
        lowercase: true
      },
      dateFormat: {
        type: String,
        default: 'MM/DD/YYYY'
      },
      weekStartsOn: {
        type: Number,
        default: 0,
        min: 0,
        max: 6
      },
      notifications: {
        email: {
          type: Boolean,
          default: true
        },
        sms: {
          type: Boolean,
          default: false
        },
        push: {
          type: Boolean,
          default: true
        }
      },
      branding: {
        logo: String,
        primaryColor: {
          type: String,
          match: [/^#[0-9A-Fa-f]{6}$/, 'Primary color must be a valid hex color']
        },
        secondaryColor: {
          type: String,
          match: [/^#[0-9A-Fa-f]{6}$/, 'Secondary color must be a valid hex color']
        }
      }
    },
    stats: {
      totalProperties: {
        type: Number,
        default: 0,
        min: 0
      },
      totalUsers: {
        type: Number,
        default: 0,
        min: 0
      },
      totalBookings: {
        type: Number,
        default: 0,
        min: 0
      },
      totalRevenue: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true
      }
    ],
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for efficient queries
OrganizationSchema.index({ name: 'text', legalName: 'text' });
OrganizationSchema.index({ status: 1, 'subscription.plan': 1 });
OrganizationSchema.index({ owner: 1, status: 1 });
OrganizationSchema.index({ 'contactInfo.email': 1 });
OrganizationSchema.index({ type: 1, status: 1 });
OrganizationSchema.index({ tags: 1 });

// Virtual for active member count
OrganizationSchema.virtual('activeMemberCount').get(function (this: IOrganization) {
  return this.members.length;
});

// Virtual for is trial expired
OrganizationSchema.virtual('isTrialExpired').get(function (this: IOrganization) {
  if (!this.subscription.trialEndDate) return false;
  return new Date() > this.subscription.trialEndDate;
});

// Pre-save middleware
OrganizationSchema.pre('save', function (this: IOrganization, next) {
  // Ensure owner is in admins
  if (!this.admins.some(admin => admin.toString() === this.owner.toString())) {
    this.admins.push(this.owner);
  }

  // Ensure all admins are in members
  this.admins.forEach(admin => {
    if (!this.members.some(member => member.toString() === admin.toString())) {
      this.members.push(admin);
    }
  });

  // Remove duplicates
  this.admins = [...new Set(this.admins.map(a => a.toString()))].map(
    id => new mongoose.Types.ObjectId(id)
  );
  this.members = [...new Set(this.members.map(m => m.toString()))].map(
    id => new mongoose.Types.ObjectId(id)
  );

  next();
});

// Methods

/**
 * Add member to organization
 */
OrganizationSchema.methods.addMember = async function (
  this: IOrganization,
  userId: mongoose.Types.ObjectId,
  isAdmin: boolean = false
): Promise<void> {
  if (!this.members.some(m => m.toString() === userId.toString())) {
    this.members.push(userId);
    this.stats.totalUsers = this.members.length;
  }

  if (isAdmin && !this.admins.some(a => a.toString() === userId.toString())) {
    this.admins.push(userId);
  }

  await this.save();
};

/**
 * Remove member from organization
 */
OrganizationSchema.methods.removeMember = async function (
  this: IOrganization,
  userId: mongoose.Types.ObjectId
): Promise<void> {
  // Cannot remove owner
  if (userId.toString() === this.owner.toString()) {
    throw new Error('Cannot remove organization owner');
  }

  this.members = this.members.filter(m => m.toString() !== userId.toString());
  this.admins = this.admins.filter(a => a.toString() !== userId.toString());
  this.stats.totalUsers = this.members.length;

  await this.save();
};

/**
 * Check if user is admin
 */
OrganizationSchema.methods.isAdmin = function (
  this: IOrganization,
  userId: mongoose.Types.ObjectId
): boolean {
  return this.admins.some(a => a.toString() === userId.toString());
};

/**
 * Check if user is member
 */
OrganizationSchema.methods.isMember = function (
  this: IOrganization,
  userId: mongoose.Types.ObjectId
): boolean {
  return this.members.some(m => m.toString() === userId.toString());
};

/**
 * Check if subscription is active and not expired
 */
OrganizationSchema.methods.hasActiveSubscription = function (
  this: IOrganization
): boolean {
  if (!this.subscription.isActive) return false;
  if (this.subscription.endDate && new Date() > this.subscription.endDate) return false;
  return true;
};

// Static methods

/**
 * Find organizations by owner
 */
OrganizationSchema.statics.findByOwner = function (
  this: Model<IOrganization>,
  ownerId: mongoose.Types.ObjectId,
  status?: OrganizationStatus
) {
  const query: any = { owner: ownerId };
  if (status) {
    query.status = status;
  }
  return this.find(query).sort({ name: 1 });
};

/**
 * Find organizations where user is member
 */
OrganizationSchema.statics.findByMember = function (
  this: Model<IOrganization>,
  memberId: mongoose.Types.ObjectId,
  status?: OrganizationStatus
) {
  const query: any = { members: memberId };
  if (status) {
    query.status = status;
  }
  return this.find(query).sort({ name: 1 });
};

/**
 * Find organizations by subscription plan
 */
OrganizationSchema.statics.findByPlan = function (
  this: Model<IOrganization>,
  plan: SubscriptionPlan,
  status?: OrganizationStatus
) {
  const query: any = { 'subscription.plan': plan };
  if (status) {
    query.status = status;
  }
  return this.find(query).sort({ name: 1 });
};

const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);

export default Organization;

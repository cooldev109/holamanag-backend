import mongoose, { Document, Schema, Model } from 'mongoose';

// Channel type enum
export enum ChannelType {
  AIRBNB = 'airbnb',
  BOOKING = 'booking',
  EXPEDIA = 'expedia',
  AGODA = 'agoda',
  VRBO = 'vrbo',
  DIRECT = 'direct',
  OTHER = 'other'
}

// Channel status enum
export enum ChannelStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  SUSPENDED = 'suspended',
  PENDING = 'pending'
}

// Sync status enum
export enum SyncStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  IN_PROGRESS = 'in_progress',
  PENDING = 'pending'
}

// API credentials interface
export interface IApiCredentials {
  apiKey: string;
  apiSecret: string;
  webhookUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: Date;
  sandboxMode?: boolean;
  additionalConfig?: Record<string, any>;
}

// Sync settings interface
export interface ISyncSettings {
  autoSync: boolean;
  syncInterval: number; // minutes
  lastSync?: Date;
  nextSync?: Date;
  syncDirection: 'inbound' | 'outbound' | 'bidirectional';
  syncTypes: {
    bookings: boolean;
    rates: boolean;
    availability: boolean;
    propertyInfo: boolean;
  };
  retryAttempts: number;
  retryDelay: number; // minutes
}

// Performance metrics interface
export interface IPerformanceMetrics {
  totalBookings: number;
  totalRevenue: number;
  averageRating: number;
  responseTime: number; // milliseconds
  successRate: number; // percentage
  lastUpdated: Date;
  monthlyStats?: {
    bookings: number;
    revenue: number;
    averageRating: number;
    month: string; // YYYY-MM format
  }[];
}

// Rate parity settings interface
export interface IRateParitySettings {
  enabled: boolean;
  tolerance: number; // percentage
  checkInterval: number; // minutes
  autoAdjust: boolean;
  excludedRatePlans?: string[];
  lastChecked?: Date;
}

// Channel interface extending Document
export interface IChannel extends Document {
  name: string;
  type: ChannelType;
  displayName: string;
  description?: string;
  isActive: boolean;
  status: ChannelStatus;
  apiCredentials: IApiCredentials;
  syncSettings: ISyncSettings;
  performance: IPerformanceMetrics;
  rateParity: IRateParitySettings;
  properties: mongoose.Types.ObjectId[]; // Property references
  settings: {
    currency: string;
    timezone: string;
    language: string;
    commissionRate?: number; // percentage
    paymentTerms?: string;
    cancellationPolicy?: string;
    houseRules?: string[];
  };
  lastError?: {
    message: string;
    code?: string;
    timestamp: Date;
    resolved: boolean;
  };
  createdBy: mongoose.Types.ObjectId; // User reference
  lastModifiedBy?: mongoose.Types.ObjectId; // User reference
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  isConnected(): boolean;
  canSync(): boolean;
  updateSyncStatus(status: SyncStatus, message?: string): Promise<void>;
  updatePerformance(bookings: number, revenue: number, rating: number): Promise<void>;
  addProperty(propertyId: string): Promise<void>;
  removeProperty(propertyId: string): Promise<void>;
  toJSON(): any;
}

// API credentials schema
const apiCredentialsSchema = new Schema<IApiCredentials>({
  apiKey: {
    type: String,
    required: [true, 'API key is required'],
    trim: true
  },
  apiSecret: {
    type: String,
    required: [true, 'API secret is required'],
    trim: true
  },
  webhookUrl: {
    type: String,
    trim: true,
    match: [/^https?:\/\/.+/, 'Please provide a valid webhook URL']
  },
  accessToken: {
    type: String,
    trim: true
  },
  refreshToken: {
    type: String,
    trim: true
  },
  tokenExpiry: {
    type: Date
  },
  sandboxMode: {
    type: Boolean,
    default: false
  },
  additionalConfig: {
    type: Schema.Types.Mixed
  }
}, { _id: false });

// Sync settings schema
const syncSettingsSchema = new Schema<ISyncSettings>({
  autoSync: {
    type: Boolean,
    default: true
  },
  syncInterval: {
    type: Number,
    default: 60, // 60 minutes
    min: [5, 'Sync interval must be at least 5 minutes'],
    max: [1440, 'Sync interval cannot exceed 24 hours']
  },
  lastSync: {
    type: Date
  },
  nextSync: {
    type: Date
  },
  syncDirection: {
    type: String,
    enum: ['inbound', 'outbound', 'bidirectional'],
    default: 'bidirectional'
  },
  syncTypes: {
    bookings: {
      type: Boolean,
      default: true
    },
    rates: {
      type: Boolean,
      default: true
    },
    availability: {
      type: Boolean,
      default: true
    },
    propertyInfo: {
      type: Boolean,
      default: true
    }
  },
  retryAttempts: {
    type: Number,
    default: 3,
    min: [0, 'Retry attempts cannot be negative'],
    max: [10, 'Retry attempts cannot exceed 10']
  },
  retryDelay: {
    type: Number,
    default: 5, // 5 minutes
    min: [1, 'Retry delay must be at least 1 minute'],
    max: [60, 'Retry delay cannot exceed 60 minutes']
  }
}, { _id: false });

// Performance metrics schema
const performanceMetricsSchema = new Schema<IPerformanceMetrics>({
  totalBookings: {
    type: Number,
    default: 0,
    min: [0, 'Total bookings cannot be negative']
  },
  totalRevenue: {
    type: Number,
    default: 0,
    min: [0, 'Total revenue cannot be negative']
  },
  averageRating: {
    type: Number,
    default: 0,
    min: [0, 'Average rating cannot be negative'],
    max: [5, 'Average rating cannot exceed 5']
  },
  responseTime: {
    type: Number,
    default: 0,
    min: [0, 'Response time cannot be negative']
  },
  successRate: {
    type: Number,
    default: 0,
    min: [0, 'Success rate cannot be negative'],
    max: [100, 'Success rate cannot exceed 100']
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  monthlyStats: [{
    bookings: {
      type: Number,
      min: [0, 'Monthly bookings cannot be negative']
    },
    revenue: {
      type: Number,
      min: [0, 'Monthly revenue cannot be negative']
    },
    averageRating: {
      type: Number,
      min: [0, 'Monthly rating cannot be negative'],
      max: [5, 'Monthly rating cannot exceed 5']
    },
    month: {
      type: String,
      match: [/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format']
    }
  }]
}, { _id: false });

// Rate parity settings schema
const rateParitySchema = new Schema<IRateParitySettings>({
  enabled: {
    type: Boolean,
    default: false
  },
  tolerance: {
    type: Number,
    default: 5, // 5%
    min: [0, 'Tolerance cannot be negative'],
    max: [50, 'Tolerance cannot exceed 50%']
  },
  checkInterval: {
    type: Number,
    default: 30, // 30 minutes
    min: [5, 'Check interval must be at least 5 minutes'],
    max: [1440, 'Check interval cannot exceed 24 hours']
  },
  autoAdjust: {
    type: Boolean,
    default: false
  },
  excludedRatePlans: [{
    type: String,
    trim: true
  }],
  lastChecked: {
    type: Date
  }
}, { _id: false });

// Channel schema definition
const channelSchema = new Schema<IChannel>({
  name: {
    type: String,
    required: [true, 'Channel name is required'],
    trim: true,
    maxlength: [100, 'Channel name cannot exceed 100 characters'],
    index: true
  },
  type: {
    type: String,
    enum: Object.values(ChannelType),
    required: [true, 'Channel type is required'],
    index: true
  },
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true,
    maxlength: [100, 'Display name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  status: {
    type: String,
    enum: Object.values(ChannelStatus),
    default: ChannelStatus.PENDING,
    index: true
  },
  apiCredentials: {
    type: apiCredentialsSchema,
    required: [true, 'API credentials are required']
  },
  syncSettings: {
    type: syncSettingsSchema,
    required: [true, 'Sync settings are required']
  },
  performance: {
    type: performanceMetricsSchema,
    required: [true, 'Performance metrics are required']
  },
  rateParity: {
    type: rateParitySchema,
    required: [true, 'Rate parity settings are required']
  },
  properties: [{
    type: Schema.Types.ObjectId,
    ref: 'Property',
    index: true
  }],
  settings: {
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'USD',
      uppercase: true,
      length: [3, 'Currency must be 3 characters']
    },
    timezone: {
      type: String,
      required: [true, 'Timezone is required'],
      default: 'UTC',
      trim: true
    },
    language: {
      type: String,
      required: [true, 'Language is required'],
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt'],
      trim: true
    },
    commissionRate: {
      type: Number,
      min: [0, 'Commission rate cannot be negative'],
      max: [100, 'Commission rate cannot exceed 100%']
    },
    paymentTerms: {
      type: String,
      trim: true,
      maxlength: [200, 'Payment terms cannot exceed 200 characters']
    },
    cancellationPolicy: {
      type: String,
      trim: true,
      maxlength: [500, 'Cancellation policy cannot exceed 500 characters']
    },
    houseRules: [{
      type: String,
      trim: true,
      maxlength: [200, 'House rule cannot exceed 200 characters']
    }]
  },
  lastError: {
    message: {
      type: String,
      trim: true,
      maxlength: [500, 'Error message cannot exceed 500 characters']
    },
    code: {
      type: String,
      trim: true
    },
    timestamp: {
      type: Date
    },
    resolved: {
      type: Boolean,
      default: false
    }
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by user is required'],
    index: true
  },
  lastModifiedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(_doc, ret) {
      delete ret['__v'];
      // Don't expose sensitive API credentials
      if (ret.apiCredentials) {
        delete ret.apiCredentials.apiSecret;
        delete ret.apiCredentials.accessToken;
        delete ret.apiCredentials.refreshToken;
      }
      return ret;
    }
  }
});

// Indexes for performance
channelSchema.index({ type: 1, status: 1 }); // Type and status
channelSchema.index({ isActive: 1, status: 1 }); // Active channels
channelSchema.index({ 'syncSettings.autoSync': 1, 'syncSettings.nextSync': 1 }); // Auto sync
channelSchema.index({ createdBy: 1, createdAt: -1 }); // User channels
channelSchema.index({ name: 'text', displayName: 'text', description: 'text' }); // Text search

// Virtual for is connected
channelSchema.virtual('isConnected').get(function() {
  return this.status === ChannelStatus.ACTIVE && this.isActive;
});

// Virtual for can sync
channelSchema.virtual('canSync').get(function() {
  return this.isActive && 
         this.status === ChannelStatus.ACTIVE && 
         this.syncSettings.autoSync;
});

// Virtual for next sync time
channelSchema.virtual('nextSyncTime').get(function() {
  if (!this.syncSettings.lastSync) {
    return new Date();
  }
  return new Date(this.syncSettings.lastSync.getTime() + this.syncSettings.syncInterval * 60000);
});

// Instance method to update sync status
channelSchema.methods.updateSyncStatus = async function(status: SyncStatus, message?: string): Promise<void> {
  this.syncSettings.lastSync = new Date();
  
  if (status === SyncStatus.SUCCESS) {
    this.status = ChannelStatus.ACTIVE;
    this.lastError = undefined;
  } else if (status === SyncStatus.FAILED) {
    this.status = ChannelStatus.ERROR;
    this.lastError = {
      message: message || 'Sync failed',
      timestamp: new Date(),
      resolved: false
    };
  }
  
  // Calculate next sync time
  this.syncSettings.nextSync = new Date(
    this.syncSettings.lastSync.getTime() + this.syncSettings.syncInterval * 60000
  );
  
  await this.save();
};

// Instance method to update performance
channelSchema.methods.updatePerformance = async function(
  bookings: number, 
  revenue: number, 
  rating: number
): Promise<void> {
  this.performance.totalBookings += bookings;
  this.performance.totalRevenue += revenue;
  
  // Update average rating (simple moving average)
  const currentRating = this.performance.averageRating;
  const totalBookings = this.performance.totalBookings;
  this.performance.averageRating = ((currentRating * (totalBookings - bookings)) + (rating * bookings)) / totalBookings;
  
  this.performance.lastUpdated = new Date();
  
  await this.save();
};

// Instance method to add property
channelSchema.methods.addProperty = async function(propertyId: string): Promise<void> {
  if (!this.properties.includes(propertyId)) {
    this.properties.push(propertyId);
    await this.save();
  }
};

// Instance method to remove property
channelSchema.methods.removeProperty = async function(propertyId: string): Promise<void> {
  this.properties = this.properties.filter((id: mongoose.Types.ObjectId) => id.toString() !== propertyId);
  await this.save();
};

// Static method to find active channels
channelSchema.statics.findActive = function() {
  return this.find({ isActive: true, status: ChannelStatus.ACTIVE });
};

// Static method to find channels by type
channelSchema.statics.findByType = function(type: ChannelType) {
  return this.find({ type, isActive: true });
};

// Static method to find channels ready for sync
channelSchema.statics.findReadyForSync = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    status: ChannelStatus.ACTIVE,
    'syncSettings.autoSync': true,
    $or: [
      { 'syncSettings.nextSync': { $lte: now } },
      { 'syncSettings.nextSync': { $exists: false } }
    ]
  });
};

// Static method to find channels by property
channelSchema.statics.findByProperty = function(propertyId: string) {
  return this.find({ properties: propertyId, isActive: true });
};

// Static method to find channels with errors
channelSchema.statics.findWithErrors = function() {
  return this.find({ 
    status: ChannelStatus.ERROR,
    'lastError.resolved': false 
  });
};

// Pre-save middleware to set next sync time
channelSchema.pre('save', function(next) {
  if (this.isModified('syncSettings') && this.syncSettings.autoSync) {
    if (!this.syncSettings.nextSync) {
      this.syncSettings.nextSync = new Date(Date.now() + this.syncSettings.syncInterval * 60000);
    }
  }
  next();
});

// Create and export the model
const Channel: Model<IChannel> = mongoose.model<IChannel>('Channel', channelSchema);

export default Channel;

import { Schema, model, Document } from 'mongoose';

export interface ISystemSettings extends Document {
  application: {
    appName: string;
    defaultLanguage: 'en' | 'es';
    defaultTimezone: string;
  };
  email: {
    smtpHost: string;
    smtpPort: number;
    smtpEmail: string;
    smtpPassword: string;
  };
  security: {
    jwtExpirationHours: number;
    maxLoginAttempts: number;
    lockDurationMinutes: number;
  };
  lastModifiedBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const systemSettingsSchema = new Schema<ISystemSettings>({
  application: {
    appName: {
      type: String,
      required: [true, 'Application name is required'],
      default: 'Reservario Channel Manager',
      trim: true
    },
    defaultLanguage: {
      type: String,
      enum: ['en', 'es'],
      default: 'en'
    },
    defaultTimezone: {
      type: String,
      default: 'UTC',
      trim: true
    }
  },
  email: {
    smtpHost: {
      type: String,
      default: '',
      trim: true
    },
    smtpPort: {
      type: Number,
      default: 587
    },
    smtpEmail: {
      type: String,
      default: '',
      trim: true
    },
    smtpPassword: {
      type: String,
      default: '',
      trim: true
    }
  },
  security: {
    jwtExpirationHours: {
      type: Number,
      default: 24,
      min: [1, 'JWT expiration must be at least 1 hour'],
      max: [720, 'JWT expiration cannot exceed 720 hours (30 days)']
    },
    maxLoginAttempts: {
      type: Number,
      default: 5,
      min: [1, 'Max login attempts must be at least 1'],
      max: [10, 'Max login attempts cannot exceed 10']
    },
    lockDurationMinutes: {
      type: Number,
      default: 30,
      min: [1, 'Lock duration must be at least 1 minute'],
      max: [1440, 'Lock duration cannot exceed 1440 minutes (24 hours)']
    }
  },
  lastModifiedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const SystemSettings = model<ISystemSettings>('SystemSettings', systemSettingsSchema);

export default SystemSettings;




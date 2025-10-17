import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Email Template Type
 */
export enum EmailTemplateType {
  BOOKING_CONFIRMATION = 'booking_confirmation',
  BOOKING_MODIFICATION = 'booking_modification',
  BOOKING_CANCELLATION = 'booking_cancellation',
  PRE_ARRIVAL = 'pre_arrival',
  CHECK_IN_REMINDER = 'check_in_reminder',
  WELCOME = 'welcome',
  CHECK_OUT_REMINDER = 'check_out_reminder',
  POST_CHECKOUT = 'post_checkout',
  REVIEW_REQUEST = 'review_request',
  PAYMENT_REMINDER = 'payment_reminder',
  PAYMENT_CONFIRMATION = 'payment_confirmation',
  SPECIAL_OFFER = 'special_offer',
  CUSTOM = 'custom'
}

/**
 * Email Template Status
 */
export enum EmailTemplateStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DRAFT = 'draft'
}

/**
 * Email Template Interface
 */
export interface IEmailTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  type: EmailTemplateType;
  subject: string;
  body: string; // HTML content
  plainTextBody?: string; // Plain text version
  status: EmailTemplateStatus;

  // Template variables available
  variables: string[]; // e.g., ['guestName', 'checkInDate', 'propertyName']

  // Targeting
  organization?: mongoose.Types.ObjectId;
  property?: mongoose.Types.ObjectId;
  language: string; // ISO language code (e.g., 'en', 'es', 'fr')

  // Automation settings
  automation: {
    enabled: boolean;
    trigger: string; // Event that triggers this email
    delayDays?: number; // Days before/after trigger event (negative = before)
    delayHours?: number; // Additional hours
    conditions?: string[]; // Conditions for sending (e.g., 'bookingValue > 500')
  };

  // Tracking
  stats: {
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
  };

  // Metadata
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

  // Methods
  renderTemplate(variables: Record<string, any>): { subject: string; body: string };
  clone(): Promise<IEmailTemplate>;
}

/**
 * Email Template Schema
 */
const EmailTemplateSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: [200, 'Template name cannot exceed 200 characters']
    },
    type: {
      type: String,
      enum: Object.values(EmailTemplateType),
      required: [true, 'Template type is required'],
      index: true
    },
    subject: {
      type: String,
      required: [true, 'Email subject is required'],
      trim: true,
      maxlength: [500, 'Subject cannot exceed 500 characters']
    },
    body: {
      type: String,
      required: [true, 'Email body is required']
    },
    plainTextBody: {
      type: String
    },
    status: {
      type: String,
      enum: Object.values(EmailTemplateStatus),
      default: EmailTemplateStatus.DRAFT,
      index: true
    },
    variables: [
      {
        type: String,
        trim: true
      }
    ],
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      index: true
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      index: true
    },
    language: {
      type: String,
      required: [true, 'Language is required'],
      default: 'en',
      lowercase: true,
      minlength: 2,
      maxlength: 5,
      index: true
    },
    automation: {
      enabled: {
        type: Boolean,
        default: false
      },
      trigger: {
        type: String,
        trim: true
      },
      delayDays: {
        type: Number,
        default: 0
      },
      delayHours: {
        type: Number,
        default: 0,
        min: 0,
        max: 23
      },
      conditions: [
        {
          type: String,
          trim: true
        }
      ]
    },
    stats: {
      sent: {
        type: Number,
        default: 0,
        min: 0
      },
      opened: {
        type: Number,
        default: 0,
        min: 0
      },
      clicked: {
        type: Number,
        default: 0,
        min: 0
      },
      bounced: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
EmailTemplateSchema.index({ type: 1, status: 1, language: 1 });
EmailTemplateSchema.index({ organization: 1, type: 1 });
EmailTemplateSchema.index({ property: 1, type: 1 });
EmailTemplateSchema.index({ 'automation.enabled': 1, 'automation.trigger': 1 });
EmailTemplateSchema.index({ name: 'text' });

// Virtual for open rate
EmailTemplateSchema.virtual('openRate').get(function (this: IEmailTemplate) {
  if (this.stats.sent === 0) return 0;
  return (this.stats.opened / this.stats.sent) * 100;
});

// Virtual for click rate
EmailTemplateSchema.virtual('clickRate').get(function (this: IEmailTemplate) {
  if (this.stats.sent === 0) return 0;
  return (this.stats.clicked / this.stats.sent) * 100;
});

// Methods

/**
 * Render template with variables
 */
EmailTemplateSchema.methods.renderTemplate = function (
  this: IEmailTemplate,
  variables: Record<string, any>
): { subject: string; body: string } {
  let renderedSubject = this.subject;
  let renderedBody = this.body;

  // Replace all variables in format {{variableName}}
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    const stringValue = value !== null && value !== undefined ? String(value) : '';

    renderedSubject = renderedSubject.replace(regex, stringValue);
    renderedBody = renderedBody.replace(regex, stringValue);
  });

  return {
    subject: renderedSubject,
    body: renderedBody
  };
};

/**
 * Clone template
 */
EmailTemplateSchema.methods.clone = async function (this: IEmailTemplate): Promise<IEmailTemplate> {
  const cloned = new EmailTemplate({
    name: `${this.name} (Copy)`,
    type: this.type,
    subject: this.subject,
    body: this.body,
    plainTextBody: this.plainTextBody,
    status: EmailTemplateStatus.DRAFT,
    variables: [...this.variables],
    organization: this.organization,
    property: this.property,
    language: this.language,
    automation: { ...this.automation, enabled: false }, // Disable automation for clones
    createdBy: this.createdBy
  });

  await cloned.save();
  return cloned;
};

// Static methods

/**
 * Find active templates by type
 */
EmailTemplateSchema.statics.findActiveByType = function (
  this: Model<IEmailTemplate>,
  type: EmailTemplateType,
  language: string = 'en',
  propertyId?: mongoose.Types.ObjectId,
  organizationId?: mongoose.Types.ObjectId
) {
  const query: any = {
    type,
    status: EmailTemplateStatus.ACTIVE,
    language
  };

  // Priority: Property-specific > Organization-specific > Global
  if (propertyId) {
    query.$or = [
      { property: propertyId },
      { property: { $exists: false }, organization: organizationId },
      { property: { $exists: false }, organization: { $exists: false } }
    ];
  } else if (organizationId) {
    query.$or = [
      { organization: organizationId },
      { organization: { $exists: false } }
    ];
  } else {
    query.property = { $exists: false };
    query.organization = { $exists: false };
  }

  return this.findOne(query).sort({ property: -1, organization: -1 }); // Prioritize most specific
};

/**
 * Find automated templates
 */
EmailTemplateSchema.statics.findAutomated = function (
  this: Model<IEmailTemplate>,
  trigger: string
) {
  return this.find({
    'automation.enabled': true,
    'automation.trigger': trigger,
    status: EmailTemplateStatus.ACTIVE
  });
};

const EmailTemplate = mongoose.model<IEmailTemplate>('EmailTemplate', EmailTemplateSchema);

export default EmailTemplate;

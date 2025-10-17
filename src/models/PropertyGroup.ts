import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Property Group Status
 */
export enum PropertyGroupStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived'
}

/**
 * Property Group Interface
 */
export interface IPropertyGroup extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  organization: mongoose.Types.ObjectId; // Reference to Organization (will create next)
  properties: mongoose.Types.ObjectId[]; // Array of property references
  status: PropertyGroupStatus;

  // Group settings
  settings: {
    allowCrossPropertyBooking: boolean; // Allow guests to book across properties
    sharedInventory: boolean; // Share room inventory across properties
    centralizedRateManagement: boolean; // Manage rates centrally
    autoSync: boolean; // Auto-sync changes across properties
  };

  // Metadata
  manager: mongoose.Types.ObjectId; // User managing this group
  tags: string[]; // Tags for categorization (e.g., "luxury", "budget", "urban")
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

  // Methods
  addProperty(propertyId: mongoose.Types.ObjectId): Promise<void>;
  removeProperty(propertyId: mongoose.Types.ObjectId): Promise<void>;
  hasProperty(propertyId: mongoose.Types.ObjectId): boolean;
}

/**
 * Property Group Schema
 */
const PropertyGroupSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Property group name is required'],
      trim: true,
      minlength: [2, 'Group name must be at least 2 characters'],
      maxlength: [100, 'Group name cannot exceed 100 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
      index: true
    },
    properties: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Property'
      }
    ],
    status: {
      type: String,
      enum: Object.values(PropertyGroupStatus),
      default: PropertyGroupStatus.ACTIVE,
      index: true
    },
    settings: {
      allowCrossPropertyBooking: {
        type: Boolean,
        default: false
      },
      sharedInventory: {
        type: Boolean,
        default: false
      },
      centralizedRateManagement: {
        type: Boolean,
        default: false
      },
      autoSync: {
        type: Boolean,
        default: true
      }
    },
    manager: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Group manager is required'],
      index: true
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true
      }
    ],
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

// Indexes for efficient queries
PropertyGroupSchema.index({ organization: 1, status: 1 });
PropertyGroupSchema.index({ manager: 1, status: 1 });
PropertyGroupSchema.index({ name: 'text', description: 'text' });
PropertyGroupSchema.index({ tags: 1 });

// Virtual for property count
PropertyGroupSchema.virtual('propertyCount').get(function (this: IPropertyGroup) {
  return this.properties.length;
});

// Pre-save middleware
PropertyGroupSchema.pre('save', function (this: IPropertyGroup, next) {
  // Ensure unique property IDs
  this.properties = [...new Set(this.properties.map(p => p.toString()))].map(
    id => new mongoose.Types.ObjectId(id)
  );
  next();
});

// Methods

/**
 * Add property to group
 */
PropertyGroupSchema.methods.addProperty = async function (
  this: IPropertyGroup,
  propertyId: mongoose.Types.ObjectId
): Promise<void> {
  if (!this.properties.some(p => p.toString() === propertyId.toString())) {
    this.properties.push(propertyId);
    await this.save();
  }
};

/**
 * Remove property from group
 */
PropertyGroupSchema.methods.removeProperty = async function (
  this: IPropertyGroup,
  propertyId: mongoose.Types.ObjectId
): Promise<void> {
  this.properties = this.properties.filter(
    p => p.toString() !== propertyId.toString()
  );
  await this.save();
};

/**
 * Check if property is in group
 */
PropertyGroupSchema.methods.hasProperty = function (
  this: IPropertyGroup,
  propertyId: mongoose.Types.ObjectId
): boolean {
  return this.properties.some(p => p.toString() === propertyId.toString());
};

// Static methods

/**
 * Find groups by organization
 */
PropertyGroupSchema.statics.findByOrganization = function (
  this: Model<IPropertyGroup>,
  organizationId: mongoose.Types.ObjectId,
  status?: PropertyGroupStatus
) {
  const query: any = { organization: organizationId };
  if (status) {
    query.status = status;
  }
  return this.find(query).populate('properties', 'name status').sort({ name: 1 });
};

/**
 * Find groups managed by user
 */
PropertyGroupSchema.statics.findByManager = function (
  this: Model<IPropertyGroup>,
  managerId: mongoose.Types.ObjectId,
  status?: PropertyGroupStatus
) {
  const query: any = { manager: managerId };
  if (status) {
    query.status = status;
  }
  return this.find(query).populate('properties', 'name status').sort({ name: 1 });
};

/**
 * Find groups containing property
 */
PropertyGroupSchema.statics.findByProperty = function (
  this: Model<IPropertyGroup>,
  propertyId: mongoose.Types.ObjectId
) {
  return this.find({ properties: propertyId }).populate('organization', 'name');
};

const PropertyGroup = mongoose.model<IPropertyGroup>('PropertyGroup', PropertyGroupSchema);

export default PropertyGroup;

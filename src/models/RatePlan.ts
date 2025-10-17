import mongoose, { Document, Schema, Model } from 'mongoose';

// Rate plan type enum
export enum RatePlanType {
  STANDARD = 'standard',
  SEASONAL = 'seasonal',
  PROMOTIONAL = 'promotional',
  CORPORATE = 'corporate',
  GROUP = 'group',
  LAST_MINUTE = 'last_minute',
  ADVANCE_PURCHASE = 'advance_purchase'
}

// Rate plan status enum
export enum RatePlanStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired',
  SUSPENDED = 'suspended'
}

// Cancellation policy enum
export enum CancellationPolicy {
  FREE_CANCELLATION = 'free_cancellation',
  NON_REFUNDABLE = 'non_refundable',
  PARTIAL_REFUND = 'partial_refund',
  CUSTOM = 'custom'
}

// Rate adjustment interface
export interface IRateAdjustment {
  type: 'percentage' | 'fixed';
  value: number;
  condition?: string;
  minStay?: number;
  maxStay?: number;
  advanceBookingDays?: number;
}

// Seasonal rate interface
export interface ISeasonalRate {
  startDate: Date;
  endDate: Date;
  rate: number;
  adjustment?: IRateAdjustment;
}

// Length of stay discount interface
export interface ILengthOfStayDiscount {
  minNights: number;
  maxNights?: number;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
}

// Advance booking discount interface
export interface IAdvanceBookingDiscount {
  minDaysAdvance: number;
  maxDaysAdvance?: number;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
}

// Rate plan interface extending Document
export interface IRatePlan extends Document {
  property: mongoose.Types.ObjectId; // Property reference
  room: mongoose.Types.ObjectId; // Room reference
  name: string;
  description: string;
  type: RatePlanType;
  baseRate: number;
  currency: string;
  isRefundable: boolean;
  cancellationPolicy: CancellationPolicy;
  customCancellationPolicy?: string;
  minStay: number;
  maxStay?: number;
  includesBreakfast: boolean;
  includesTaxes: boolean;
  includesFees: boolean;
  validFrom: Date;
  validTo: Date;
  status: RatePlanStatus;
  priority: number; // Higher number = higher priority
  seasonalRates?: ISeasonalRate[];
  lengthOfStayDiscounts?: ILengthOfStayDiscount[];
  advanceBookingDiscounts?: IAdvanceBookingDiscount[];
  restrictions: {
    blackoutDates?: Date[];
    minAdvanceBooking?: number; // days
    maxAdvanceBooking?: number; // days
    restrictedChannels?: string[];
    guestTypeRestrictions?: string[];
  };
  createdBy: mongoose.Types.ObjectId; // User reference
  lastModifiedBy?: mongoose.Types.ObjectId; // User reference
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  calculateRate(checkIn: Date, checkOut: Date, guests: number, advanceBookingDays?: number): number;
  isActive(): boolean;
  isValidForDates(checkIn: Date, checkOut: Date): boolean;
  canBeApplied(channel: string, guestType?: string): boolean;
  toJSON(): any;
}

// Rate adjustment schema
const rateAdjustmentSchema = new Schema<IRateAdjustment>({
  type: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  value: {
    type: Number,
    required: true
  },
  condition: {
    type: String,
    trim: true
  },
  minStay: {
    type: Number,
    min: [1, 'Minimum stay must be at least 1 night']
  },
  maxStay: {
    type: Number,
    min: [1, 'Maximum stay must be at least 1 night']
  },
  advanceBookingDays: {
    type: Number,
    min: [0, 'Advance booking days cannot be negative']
  }
}, { _id: false });

// Seasonal rate schema
const seasonalRateSchema = new Schema<ISeasonalRate>({
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(this: ISeasonalRate, value: Date) {
        return value > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  rate: {
    type: Number,
    required: true,
    min: [0, 'Rate cannot be negative']
  },
  adjustment: rateAdjustmentSchema
}, { _id: false });

// Length of stay discount schema
const lengthOfStayDiscountSchema = new Schema<ILengthOfStayDiscount>({
  minNights: {
    type: Number,
    required: true,
    min: [1, 'Minimum nights must be at least 1']
  },
  maxNights: {
    type: Number,
    min: [1, 'Maximum nights must be at least 1']
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: [0, 'Discount value cannot be negative']
  }
}, { _id: false });

// Advance booking discount schema
const advanceBookingDiscountSchema = new Schema<IAdvanceBookingDiscount>({
  minDaysAdvance: {
    type: Number,
    required: true,
    min: [0, 'Minimum advance days cannot be negative']
  },
  maxDaysAdvance: {
    type: Number,
    min: [0, 'Maximum advance days cannot be negative']
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: [0, 'Discount value cannot be negative']
  }
}, { _id: false });

// Rate plan schema definition
const ratePlanSchema = new Schema<IRatePlan>({
  property: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property reference is required'],
    index: true
  },
  room: {
    type: Schema.Types.ObjectId,
    ref: 'Property.rooms',
    required: [true, 'Room reference is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Rate plan name is required'],
    trim: true,
    maxlength: [100, 'Rate plan name cannot exceed 100 characters'],
    index: true
  },
  description: {
    type: String,
    required: [true, 'Rate plan description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  type: {
    type: String,
    enum: Object.values(RatePlanType),
    required: [true, 'Rate plan type is required'],
    index: true
  },
  baseRate: {
    type: Number,
    required: [true, 'Base rate is required'],
    min: [0, 'Base rate cannot be negative']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    default: 'USD',
    uppercase: true,
    length: [3, 'Currency must be 3 characters']
  },
  isRefundable: {
    type: Boolean,
    default: true
  },
  cancellationPolicy: {
    type: String,
    enum: Object.values(CancellationPolicy),
    required: [true, 'Cancellation policy is required'],
    default: CancellationPolicy.FREE_CANCELLATION
  },
  customCancellationPolicy: {
    type: String,
    trim: true,
    maxlength: [1000, 'Custom cancellation policy cannot exceed 1000 characters']
  },
  minStay: {
    type: Number,
    required: [true, 'Minimum stay is required'],
    min: [1, 'Minimum stay must be at least 1 night'],
    default: 1
  },
  maxStay: {
    type: Number,
    min: [1, 'Maximum stay must be at least 1 night']
  },
  includesBreakfast: {
    type: Boolean,
    default: false
  },
  includesTaxes: {
    type: Boolean,
    default: false
  },
  includesFees: {
    type: Boolean,
    default: false
  },
  validFrom: {
    type: Date,
    required: [true, 'Valid from date is required'],
    index: true
  },
  validTo: {
    type: Date,
    required: [true, 'Valid to date is required'],
    index: true,
    validate: {
      validator: function(this: IRatePlan, value: Date) {
        return value > this.validFrom;
      },
      message: 'Valid to date must be after valid from date'
    }
  },
  status: {
    type: String,
    enum: Object.values(RatePlanStatus),
    default: RatePlanStatus.ACTIVE,
    index: true
  },
  priority: {
    type: Number,
    default: 0,
    min: [0, 'Priority cannot be negative']
  },
  seasonalRates: [seasonalRateSchema],
  lengthOfStayDiscounts: [lengthOfStayDiscountSchema],
  advanceBookingDiscounts: [advanceBookingDiscountSchema],
  restrictions: {
    blackoutDates: [{
      type: Date
    }],
    minAdvanceBooking: {
      type: Number,
      min: [0, 'Minimum advance booking cannot be negative']
    },
    maxAdvanceBooking: {
      type: Number,
      min: [0, 'Maximum advance booking cannot be negative']
    },
    restrictedChannels: [{
      type: String,
      trim: true
    }],
    guestTypeRestrictions: [{
      type: String,
      trim: true
    }]
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
      return ret;
    }
  }
});

// Indexes for performance
ratePlanSchema.index({ property: 1, room: 1, status: 1 }); // Property room rate plans
ratePlanSchema.index({ validFrom: 1, validTo: 1, status: 1 }); // Date range
ratePlanSchema.index({ type: 1, status: 1 }); // Type and status
ratePlanSchema.index({ priority: -1, status: 1 }); // Priority order
ratePlanSchema.index({ createdBy: 1, createdAt: -1 }); // User rate plans
ratePlanSchema.index({ name: 'text', description: 'text' }); // Text search

// Virtual for is currently valid
ratePlanSchema.virtual('isCurrentlyValid').get(function() {
  const now = new Date();
  return this.status === RatePlanStatus.ACTIVE && 
         this.validFrom <= now && 
         this.validTo >= now;
});

// Virtual for duration in days
ratePlanSchema.virtual('duration').get(function() {
  const diffTime = Math.abs(this.validTo.getTime() - this.validFrom.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Instance method to calculate rate
ratePlanSchema.methods.calculateRate = function(
  checkIn: Date,
  checkOut: Date,
  _guests: number,
  advanceBookingDays?: number
): number {
  let rate = this.baseRate;
  
  // Check if rate plan is valid for the dates
  if (!this.isValidForDates(checkIn, checkOut)) {
    return 0;
  }
  
  // Apply seasonal rates
  if (this.seasonalRates && this.seasonalRates.length > 0) {
    for (const seasonalRate of this.seasonalRates) {
      if (checkIn >= seasonalRate.startDate && checkOut <= seasonalRate.endDate) {
        rate = seasonalRate.rate;
        break;
      }
    }
  }
  
  // Apply length of stay discounts
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
  if (this.lengthOfStayDiscounts && this.lengthOfStayDiscounts.length > 0) {
    for (const discount of this.lengthOfStayDiscounts) {
      if (nights >= discount.minNights && 
          (!discount.maxNights || nights <= discount.maxNights)) {
        if (discount.discountType === 'percentage') {
          rate = rate * (1 - discount.discountValue / 100);
        } else {
          rate = rate - discount.discountValue;
        }
        break;
      }
    }
  }
  
  // Apply advance booking discounts
  if (advanceBookingDays && this.advanceBookingDiscounts && this.advanceBookingDiscounts.length > 0) {
    for (const discount of this.advanceBookingDiscounts) {
      if (advanceBookingDays >= discount.minDaysAdvance && 
          (!discount.maxDaysAdvance || advanceBookingDays <= discount.maxDaysAdvance)) {
        if (discount.discountType === 'percentage') {
          rate = rate * (1 - discount.discountValue / 100);
        } else {
          rate = rate - discount.discountValue;
        }
        break;
      }
    }
  }
  
  return Math.max(0, rate);
};

// Instance method to check if rate plan is active
ratePlanSchema.methods.isActive = function(): boolean {
  const now = new Date();
  return this.status === RatePlanStatus.ACTIVE && 
         this.validFrom <= now && 
         this.validTo >= now;
};

// Instance method to check if rate plan is valid for dates
ratePlanSchema.methods.isValidForDates = function(checkIn: Date, checkOut: Date): boolean {
  if (!this.isActive()) {
    return false;
  }
  
  // Check if dates are within valid range
  if (checkIn < this.validFrom || checkOut > this.validTo) {
    return false;
  }
  
  // Check blackout dates
  if (this.restrictions.blackoutDates && this.restrictions.blackoutDates.length > 0) {
    for (const blackoutDate of this.restrictions.blackoutDates) {
      if (checkIn <= blackoutDate && checkOut > blackoutDate) {
        return false;
      }
    }
  }
  
  // Check minimum stay
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
  if (nights < this.minStay) {
    return false;
  }
  
  // Check maximum stay
  if (this.maxStay && nights > this.maxStay) {
    return false;
  }
  
  return true;
};

// Instance method to check if rate plan can be applied
ratePlanSchema.methods.canBeApplied = function(channel: string, guestType?: string): boolean {
  // Check restricted channels
  if (this.restrictions.restrictedChannels && 
      this.restrictions.restrictedChannels.includes(channel)) {
    return false;
  }
  
  // Check guest type restrictions
  if (guestType && this.restrictions.guestTypeRestrictions && 
      this.restrictions.guestTypeRestrictions.includes(guestType)) {
    return false;
  }
  
  return true;
};

// Static method to find active rate plans
ratePlanSchema.statics.findActive = function() {
  const now = new Date();
  return this.find({
    status: RatePlanStatus.ACTIVE,
    validFrom: { $lte: now },
    validTo: { $gte: now }
  });
};

// Static method to find rate plans by property
ratePlanSchema.statics.findByProperty = function(propertyId: string) {
  return this.find({ property: propertyId }).populate('property room');
};

// Static method to find rate plans by room
ratePlanSchema.statics.findByRoom = function(roomId: string) {
  return this.find({ room: roomId }).populate('property room');
};

// Static method to find rate plans by type
ratePlanSchema.statics.findByType = function(type: RatePlanType) {
  return this.find({ type, status: RatePlanStatus.ACTIVE });
};

// Pre-save middleware to validate dates
ratePlanSchema.pre('save', function(next) {
  if (this.validTo <= this.validFrom) {
    next(new Error('Valid to date must be after valid from date'));
  } else {
    next();
  }
});

// Create and export the model
const RatePlan: Model<IRatePlan> = mongoose.model<IRatePlan>('RatePlan', ratePlanSchema);

export default RatePlan;



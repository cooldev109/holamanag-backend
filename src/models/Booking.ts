import mongoose, { Document, Schema, Model } from 'mongoose';

// Booking status enum
export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CHECKED_IN = 'checked-in',
  CHECKED_OUT = 'checked-out',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no-show',
  MODIFIED = 'modified'
}

// Channel enum
export enum BookingChannel {
  AIRBNB = 'airbnb',
  BOOKING = 'booking',
  EXPEDIA = 'expedia',
  AGODA = 'agoda',
  VRBO = 'vrbo',
  DIRECT = 'direct',
  OTHER = 'other'
}

// Document type enum
export enum DocumentType {
  PASSPORT = 'passport',
  ID_CARD = 'id_card',
  DRIVER_LICENSE = 'driver_license',
  OTHER = 'other'
}

// Guest information interface
export interface IGuestInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationality: string;
  documentType: DocumentType;
  documentNumber: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  address?: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
}

// Guest count interface
export interface IGuestCount {
  adults: number;
  children: number;
  infants: number;
}

// Pricing breakdown interface
export interface IPricing {
  baseRate: number;
  taxes: number;
  fees: number;
  discounts: number;
  total: number;
  currency: string;
  breakdown?: {
    roomRate: number;
    cleaningFee?: number;
    serviceFee?: number;
    cityTax?: number;
    tourismTax?: number;
    otherFees?: Array<{
      name: string;
      amount: number;
    }>;
  };
}

// Booking interface extending Document
export interface IBooking extends Document {
  property: mongoose.Types.ObjectId; // Property reference
  room: mongoose.Types.ObjectId; // Room reference
  guestInfo: IGuestInfo;
  checkIn: Date;
  checkOut: Date;
  guests: IGuestCount;
  status: BookingStatus;
  channel: BookingChannel;
  channelBookingId?: string;
  channelConfirmationCode?: string;
  pricing: IPricing;
  notes?: string;
  specialRequests: string[];
  cancellationReason?: string;
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId; // User reference
  checkedInAt?: Date;
  checkedOutAt?: Date;
  createdBy?: mongoose.Types.ObjectId; // User reference
  lastModifiedBy?: mongoose.Types.ObjectId; // User reference
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  calculateTotal(): number;
  updateStatus(newStatus: BookingStatus, userId?: string): Promise<void>;
  canBeCancelled(): boolean;
  getNights(): number;
  toJSON(): any;
}

// Guest info schema
const guestInfoSchema = new Schema<IGuestInfo>({
  firstName: {
    type: String,
    required: [true, 'Guest first name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Guest last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Guest email is required'],
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
  },
  phone: {
    type: String,
    required: [true, 'Guest phone is required'],
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number']
  },
  nationality: {
    type: String,
    required: [true, 'Guest nationality is required'],
    trim: true,
    maxlength: [100, 'Nationality cannot exceed 100 characters']
  },
  documentType: {
    type: String,
    enum: Object.values(DocumentType),
    required: [true, 'Document type is required']
  },
  documentNumber: {
    type: String,
    required: [true, 'Document number is required'],
    trim: true,
    maxlength: [50, 'Document number cannot exceed 50 characters']
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  address: {
    street: {
      type: String,
      trim: true,
      maxlength: [200, 'Street address cannot exceed 200 characters']
    },
    city: {
      type: String,
      trim: true,
      maxlength: [100, 'City name cannot exceed 100 characters']
    },
    state: {
      type: String,
      trim: true,
      maxlength: [100, 'State name cannot exceed 100 characters']
    },
    country: {
      type: String,
      trim: true,
      maxlength: [100, 'Country name cannot exceed 100 characters']
    },
    postalCode: {
      type: String,
      trim: true,
      maxlength: [20, 'Postal code cannot exceed 20 characters']
    }
  }
}, { _id: false });

// Guest count schema
const guestCountSchema = new Schema<IGuestCount>({
  adults: {
    type: Number,
    required: [true, 'Number of adults is required'],
    min: [1, 'At least one adult is required'],
    max: [20, 'Cannot exceed 20 adults']
  },
  children: {
    type: Number,
    default: 0,
    min: [0, 'Children count cannot be negative'],
    max: [10, 'Cannot exceed 10 children']
  },
  infants: {
    type: Number,
    default: 0,
    min: [0, 'Infants count cannot be negative'],
    max: [5, 'Cannot exceed 5 infants']
  }
}, { _id: false });

// Pricing schema
const pricingSchema = new Schema<IPricing>({
  baseRate: {
    type: Number,
    required: [true, 'Base rate is required'],
    min: [0, 'Base rate cannot be negative']
  },
  taxes: {
    type: Number,
    default: 0,
    min: [0, 'Taxes cannot be negative']
  },
  fees: {
    type: Number,
    default: 0,
    min: [0, 'Fees cannot be negative']
  },
  discounts: {
    type: Number,
    default: 0,
    min: [0, 'Discounts cannot be negative']
  },
  total: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount cannot be negative']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    default: 'USD',
    uppercase: true,
    length: [3, 'Currency must be 3 characters']
  },
  breakdown: {
    roomRate: {
      type: Number,
      min: [0, 'Room rate cannot be negative']
    },
    cleaningFee: {
      type: Number,
      min: [0, 'Cleaning fee cannot be negative']
    },
    serviceFee: {
      type: Number,
      min: [0, 'Service fee cannot be negative']
    },
    cityTax: {
      type: Number,
      min: [0, 'City tax cannot be negative']
    },
    tourismTax: {
      type: Number,
      min: [0, 'Tourism tax cannot be negative']
    },
    otherFees: [{
      name: {
        type: String,
        required: true,
        trim: true
      },
      amount: {
        type: Number,
        required: true,
        min: [0, 'Fee amount cannot be negative']
      }
    }]
  }
}, { _id: false });

// Booking schema definition
const bookingSchema = new Schema<IBooking>({
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
  guestInfo: {
    type: guestInfoSchema,
    required: [true, 'Guest information is required']
  },
  checkIn: {
    type: Date,
    required: [true, 'Check-in date is required'],
    index: true
  },
  checkOut: {
    type: Date,
    required: [true, 'Check-out date is required'],
    index: true,
    validate: {
      validator: function(this: IBooking, value: Date) {
        return value > this.checkIn;
      },
      message: 'Check-out date must be after check-in date'
    }
  },
  guests: {
    type: guestCountSchema,
    required: [true, 'Guest count is required']
  },
  status: {
    type: String,
    enum: Object.values(BookingStatus),
    default: BookingStatus.PENDING,
    index: true
  },
  channel: {
    type: String,
    enum: Object.values(BookingChannel),
    required: [true, 'Booking channel is required'],
    index: true
  },
  channelBookingId: {
    type: String,
    trim: true,
    index: true
  },
  channelConfirmationCode: {
    type: String,
    trim: true
  },
  pricing: {
    type: pricingSchema,
    required: [true, 'Pricing information is required']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  specialRequests: [{
    type: String,
    trim: true,
    maxlength: [200, 'Special request cannot exceed 200 characters']
  }],
  cancellationReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Cancellation reason cannot exceed 500 characters']
  },
  cancelledAt: {
    type: Date
  },
  cancelledBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  checkedInAt: {
    type: Date
  },
  checkedOutAt: {
    type: Date
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
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
bookingSchema.index({ property: 1, checkIn: 1, checkOut: 1 }); // Property bookings
bookingSchema.index({ room: 1, checkIn: 1, checkOut: 1 }); // Room availability
bookingSchema.index({ status: 1, createdAt: -1 }); // Status and date
bookingSchema.index({ channel: 1, status: 1 }); // Channel bookings
bookingSchema.index({ 'guestInfo.email': 1 }); // Guest search
bookingSchema.index({ channelBookingId: 1 }); // Channel booking lookup
bookingSchema.index({ createdAt: -1 }); // Recent bookings
bookingSchema.index({ checkIn: 1, status: 1 }); // Upcoming bookings

// Virtual for total nights
bookingSchema.virtual('nights').get(function() {
  const diffTime = Math.abs(this.checkOut.getTime() - this.checkIn.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for total guests
bookingSchema.virtual('totalGuests').get(function() {
  return this.guests.adults + this.guests.children + this.guests.infants;
});

// Virtual for is active
bookingSchema.virtual('isActive').get(function() {
  return [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN].includes(this.status);
});

// Virtual for can be modified
bookingSchema.virtual('canBeModified').get(function() {
  return [BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(this.status);
});

// Instance method to calculate total
bookingSchema.methods.calculateTotal = function(): number {
  const total = this.pricing.baseRate + this.pricing.taxes + this.pricing.fees - this.pricing.discounts;
  this.pricing.total = Math.max(0, total);
  return this.pricing.total;
};

// Instance method to update status
bookingSchema.methods.updateStatus = async function(newStatus: BookingStatus, userId?: string): Promise<void> {
  this.status = newStatus;
  this.lastModifiedBy = userId;

  // Set timestamps based on status
  switch (newStatus) {
    case BookingStatus.CANCELLED:
      this.cancelledAt = new Date();
      this.cancelledBy = userId;
      break;
    case BookingStatus.CHECKED_IN:
      this.checkedInAt = new Date();
      break;
    case BookingStatus.CHECKED_OUT:
      this.checkedOutAt = new Date();
      break;
  }

  await this.save();
};

// Instance method to check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function(): boolean {
  const now = new Date();
  const checkInDate = new Date(this.checkIn);
  const hoursUntilCheckIn = (checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  return [BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(this.status) && hoursUntilCheckIn > 24;
};

// Instance method to get number of nights
bookingSchema.methods.getNights = function(): number {
  const diffTime = Math.abs(this.checkOut.getTime() - this.checkIn.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Static method to find bookings by property
bookingSchema.statics.findByProperty = function(propertyId: string) {
  return this.find({ property: propertyId }).populate('property room');
};

// Static method to find bookings by date range
bookingSchema.statics.findByDateRange = function(startDate: Date, endDate: Date) {
  return this.find({
    $or: [
      { checkIn: { $gte: startDate, $lte: endDate } },
      { checkOut: { $gte: startDate, $lte: endDate } },
      { checkIn: { $lte: startDate }, checkOut: { $gte: endDate } }
    ]
  });
};

// Static method to find bookings by status
bookingSchema.statics.findByStatus = function(status: BookingStatus) {
  return this.find({ status }).populate('property room');
};

// Static method to find bookings by channel
bookingSchema.statics.findByChannel = function(channel: BookingChannel) {
  return this.find({ channel }).populate('property room');
};

// Pre-save middleware to calculate total
bookingSchema.pre('save', function(next) {
  if (this.isModified('pricing')) {
    this.calculateTotal();
  }
  next();
});

// Create and export the model
const Booking: Model<IBooking> = mongoose.model<IBooking>('Booking', bookingSchema);

export default Booking;



import mongoose, { Document, Schema, Model } from 'mongoose';

// Calendar status enum
export enum CalendarStatus {
  AVAILABLE = 'available',
  BLOCKED = 'blocked',
  BOOKED = 'booked',
  MAINTENANCE = 'maintenance',
  OUT_OF_ORDER = 'out_of_order'
}

// Block reason enum
export enum BlockReason {
  MAINTENANCE = 'maintenance',
  RENOVATION = 'renovation',
  OWNER_USE = 'owner_use',
  SEASONAL_CLOSURE = 'seasonal_closure',
  EMERGENCY = 'emergency',
  OTHER = 'other'
}

// Channel enum
export enum CalendarChannel {
  ALL = 'all',
  AIRBNB = 'airbnb',
  BOOKING = 'booking',
  EXPEDIA = 'expedia',
  AGODA = 'agoda',
  VRBO = 'vrbo',
  DIRECT = 'direct'
}

// Rate override interface
export interface IRateOverride {
  rate: number;
  currency: string;
  reason?: string;
  validFrom?: Date;
  validTo?: Date;
}

// Calendar interface extending Document
export interface ICalendar extends Document {
  property: mongoose.Types.ObjectId; // Property reference
  room: mongoose.Types.ObjectId; // Room reference
  date: Date;
  status: CalendarStatus;
  rate?: number;
  currency?: string;
  minStay?: number;
  maxStay?: number;
  blockReason?: BlockReason;
  blockDescription?: string;
  channel: CalendarChannel;
  rateOverride?: IRateOverride;
  booking?: mongoose.Types.ObjectId; // Booking reference
  lastUpdatedBy?: mongoose.Types.ObjectId; // User reference
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  isAvailable(): boolean;
  canBeBooked(): boolean;
  getEffectiveRate(): number;
  updateStatus(newStatus: CalendarStatus, userId?: string): Promise<void>;
  toJSON(): any;
}

// Rate override schema
const rateOverrideSchema = new Schema<IRateOverride>({
  rate: {
    type: Number,
    required: true,
    min: [0, 'Rate cannot be negative']
  },
  currency: {
    type: String,
    required: true,
    uppercase: true,
    length: [3, 'Currency must be 3 characters']
  },
  reason: {
    type: String,
    trim: true,
    maxlength: [200, 'Rate override reason cannot exceed 200 characters']
  },
  validFrom: {
    type: Date
  },
  validTo: {
    type: Date
  }
}, { _id: false });

// Calendar schema definition
const calendarSchema = new Schema<ICalendar>({
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
  date: {
    type: Date,
    required: [true, 'Date is required'],
    index: true
  },
  status: {
    type: String,
    enum: Object.values(CalendarStatus),
    required: [true, 'Calendar status is required'],
    default: CalendarStatus.AVAILABLE,
    index: true
  },
  rate: {
    type: Number,
    min: [0, 'Rate cannot be negative']
  },
  currency: {
    type: String,
    uppercase: true,
    length: [3, 'Currency must be 3 characters']
  },
  minStay: {
    type: Number,
    min: [1, 'Minimum stay must be at least 1 night'],
    default: 1
  },
  maxStay: {
    type: Number,
    min: [1, 'Maximum stay must be at least 1 night']
  },
  blockReason: {
    type: String,
    enum: Object.values(BlockReason)
  },
  blockDescription: {
    type: String,
    trim: true,
    maxlength: [500, 'Block description cannot exceed 500 characters']
  },
  channel: {
    type: String,
    enum: Object.values(CalendarChannel),
    required: [true, 'Channel is required'],
    default: CalendarChannel.ALL,
    index: true
  },
  rateOverride: rateOverrideSchema,
  booking: {
    type: Schema.Types.ObjectId,
    ref: 'Booking',
    index: true
  },
  lastUpdatedBy: {
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

// Compound indexes for performance
calendarSchema.index({ property: 1, room: 1, date: 1 }, { unique: true }); // Unique constraint
calendarSchema.index({ property: 1, date: 1, status: 1 }); // Property availability
calendarSchema.index({ room: 1, date: 1, status: 1 }); // Room availability
calendarSchema.index({ date: 1, status: 1 }); // Date-based queries
calendarSchema.index({ channel: 1, status: 1 }); // Channel availability
calendarSchema.index({ booking: 1 }); // Booking reference
calendarSchema.index({ createdAt: -1 }); // Recent updates

// Virtual for is available
calendarSchema.virtual('isAvailable').get(function() {
  return this.status === CalendarStatus.AVAILABLE;
});

// Virtual for is blocked
calendarSchema.virtual('isBlocked').get(function() {
  return [CalendarStatus.BLOCKED, CalendarStatus.MAINTENANCE, CalendarStatus.OUT_OF_ORDER].includes(this.status);
});

// Virtual for is booked
calendarSchema.virtual('isBooked').get(function() {
  return this.status === CalendarStatus.BOOKED;
});

// Instance method to check if can be booked
calendarSchema.methods.canBeBooked = function(): boolean {
  return this.status === CalendarStatus.AVAILABLE;
};

// Instance method to get effective rate
calendarSchema.methods.getEffectiveRate = function(): number {
  // Check for rate override first
  if (this.rateOverride && this.rateOverride.rate) {
    return this.rateOverride.rate;
  }
  
  // Return default rate
  return this.rate || 0;
};

// Instance method to update status
calendarSchema.methods.updateStatus = async function(newStatus: CalendarStatus, userId?: string): Promise<void> {
  this.status = newStatus;
  this.lastUpdatedBy = userId;
  
  // Clear booking reference if not booked
  if (newStatus !== CalendarStatus.BOOKED) {
    this.booking = undefined;
  }
  
  // Set block reason for blocked statuses
  if ([CalendarStatus.BLOCKED, CalendarStatus.MAINTENANCE, CalendarStatus.OUT_OF_ORDER].includes(newStatus)) {
    if (!this.blockReason) {
      this.blockReason = BlockReason.OTHER;
    }
  } else {
    this.blockReason = undefined;
    this.blockDescription = undefined;
  }
  
  await this.save();
};

// Static method to find availability by date range
calendarSchema.statics.findAvailability = function(
  propertyId: string, 
  roomId: string, 
  startDate: Date, 
  endDate: Date
) {
  return this.find({
    property: propertyId,
    room: roomId,
    date: { $gte: startDate, $lte: endDate },
    status: CalendarStatus.AVAILABLE
  }).sort({ date: 1 });
};

// Static method to find blocked dates
calendarSchema.statics.findBlockedDates = function(
  propertyId: string, 
  roomId: string, 
  startDate: Date, 
  endDate: Date
) {
  return this.find({
    property: propertyId,
    room: roomId,
    date: { $gte: startDate, $lte: endDate },
    status: { $in: [CalendarStatus.BLOCKED, CalendarStatus.MAINTENANCE, CalendarStatus.OUT_OF_ORDER] }
  }).sort({ date: 1 });
};

// Static method to find booked dates
calendarSchema.statics.findBookedDates = function(
  propertyId: string, 
  roomId: string, 
  startDate: Date, 
  endDate: Date
) {
  return this.find({
    property: propertyId,
    room: roomId,
    date: { $gte: startDate, $lte: endDate },
    status: CalendarStatus.BOOKED
  }).populate('booking').sort({ date: 1 });
};

// Static method to bulk update availability
calendarSchema.statics.bulkUpdateAvailability = async function(
  propertyId: string,
  roomId: string,
  dates: Date[],
  status: CalendarStatus,
  userId?: string
) {
  const updates = dates.map(date => ({
    updateOne: {
      filter: { property: propertyId, room: roomId, date },
      update: { 
        status, 
        lastUpdatedBy: userId,
        ...(status === CalendarStatus.BOOKED ? {} : { booking: undefined })
      },
      upsert: true
    }
  }));
  
  return this.bulkWrite(updates);
};

// Static method to bulk block dates
calendarSchema.statics.bulkBlockDates = async function(
  propertyId: string,
  roomId: string,
  dates: Date[],
  reason: BlockReason,
  description?: string,
  userId?: string
) {
  const updates = dates.map(date => ({
    updateOne: {
      filter: { property: propertyId, room: roomId, date },
      update: { 
        status: CalendarStatus.BLOCKED,
        blockReason: reason,
        blockDescription: description,
        lastUpdatedBy: userId,
        booking: undefined
      },
      upsert: true
    }
  }));
  
  return this.bulkWrite(updates);
};

// Static method to find calendar by property
calendarSchema.statics.findByProperty = function(propertyId: string) {
  return this.find({ property: propertyId }).populate('property room booking');
};

// Static method to find calendar by room
calendarSchema.statics.findByRoom = function(roomId: string) {
  return this.find({ room: roomId }).populate('property room booking');
};

// Static method to find calendar by date range
calendarSchema.statics.findByDateRange = function(startDate: Date, endDate: Date) {
  return this.find({
    date: { $gte: startDate, $lte: endDate }
  }).populate('property room booking');
};

// Static method to find calendar by status
calendarSchema.statics.findByStatus = function(status: CalendarStatus) {
  return this.find({ status }).populate('property room booking');
};

// Static method to find calendar by channel
calendarSchema.statics.findByChannel = function(channel: CalendarChannel) {
  return this.find({ channel }).populate('property room booking');
};

// Pre-save middleware to validate date
calendarSchema.pre('save', function(next) {
  // Ensure date is at start of day
  if (this.date) {
    this.date = new Date(this.date.getFullYear(), this.date.getMonth(), this.date.getDate());
  }
  next();
});

// Pre-save middleware to set block reason for blocked statuses
calendarSchema.pre('save', function(next) {
  if ([CalendarStatus.BLOCKED, CalendarStatus.MAINTENANCE, CalendarStatus.OUT_OF_ORDER].includes(this.status)) {
    if (!this.blockReason) {
      this.blockReason = BlockReason.OTHER;
    }
  }
  next();
});

// Create and export the model
const Calendar: Model<ICalendar> = mongoose.model<ICalendar>('Calendar', calendarSchema);

export default Calendar;

import mongoose, { Document, Schema } from 'mongoose';

/**
 * RoomAvailability Model
 * 
 * This model tracks the TOTAL availability for a room type on a specific date.
 * The same physical rooms are listed across multiple OTA channels (Airbnb, Booking.com, etc.)
 * 
 * Key Concept:
 * - A property has 4 Ocean View Suites
 * - These same 4 rooms are listed on Airbnb, Booking.com, Expedia, etc.
 * - When 1 room is booked on Airbnb, availability drops to 3 on ALL channels
 * - This prevents overbooking (the core purpose of a Channel Manager)
 */

export enum AvailabilityStatus {
  OPEN = 'open',           // Available for booking
  CLOSED = 'closed',       // Closed for booking (stop-sell)
  MAINTENANCE = 'maintenance'  // Under maintenance
}

export interface IChannelBooking {
  channel: string;         // 'airbnb', 'booking', 'expedia', etc.
  bookingId: mongoose.Types.ObjectId;
  guestName?: string;
  bookedAt: Date;
}

export interface IChannelRate {
  channel: string;
  rate: number;
  currency: string;
}

export interface IRoomAvailability extends Document {
  property: mongoose.Types.ObjectId;
  room: mongoose.Types.ObjectId;      // Room type reference
  date: Date;
  
  // Shared inventory across all channels
  totalRooms: number;                 // Total physical rooms (e.g., 4)
  bookedRooms: IChannelBooking[];     // Array of bookings from any channel
  blockedRooms: number;               // Rooms blocked for maintenance, etc.
  
  // Calculated availability
  availableRooms: number;             // totalRooms - bookedRooms.length - blockedRooms
  
  // Channel-specific rates (same inventory, different prices)
  rates: IChannelRate[];
  
  // Restrictions
  minStay: number;
  maxStay: number;
  status: AvailabilityStatus;
  
  // Close-out settings
  closedChannels: string[];           // Channels where booking is closed
  
  // Metadata
  lastUpdatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  
  // Virtual
  id: string;
}

const channelBookingSchema = new Schema<IChannelBooking>({
  channel: {
    type: String,
    required: true,
    lowercase: true,
    enum: ['airbnb', 'booking', 'expedia', 'agoda', 'vrbo', 'direct']
  },
  bookingId: {
    type: Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  guestName: {
    type: String,
    trim: true
  },
  bookedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const channelRateSchema = new Schema<IChannelRate>({
  channel: {
    type: String,
    required: true,
    lowercase: true
  },
  rate: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    uppercase: true,
    default: 'USD',
    length: 3
  }
}, { _id: false });

const roomAvailabilitySchema = new Schema<IRoomAvailability>({
  property: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
    index: true
  },
  room: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  totalRooms: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  bookedRooms: {
    type: [channelBookingSchema],
    default: []
  },
  blockedRooms: {
    type: Number,
    default: 0,
    min: 0
  },
  availableRooms: {
    type: Number,
    required: true,
    default: function(this: any) {
      return this.totalRooms - (this.bookedRooms?.length || 0) - (this.blockedRooms || 0);
    }
  },
  rates: {
    type: [channelRateSchema],
    default: []
  },
  minStay: {
    type: Number,
    default: 1,
    min: 1
  },
  maxStay: {
    type: Number,
    default: 30,
    min: 1
  },
  status: {
    type: String,
    enum: Object.values(AvailabilityStatus),
    default: AvailabilityStatus.OPEN
  },
  closedChannels: {
    type: [String],
    default: []
  },
  lastUpdatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound unique index: one record per property + room + date
roomAvailabilitySchema.index(
  { property: 1, room: 1, date: 1 },
  { unique: true }
);

// Index for efficient queries
roomAvailabilitySchema.index({ property: 1, date: 1 });
roomAvailabilitySchema.index({ date: 1, status: 1 });

// Virtual for id
roomAvailabilitySchema.virtual('id').get(function(this: IRoomAvailability) {
  return this._id.toHexString();
});

// Pre-save middleware to calculate availableRooms
roomAvailabilitySchema.pre('save', function(next) {
  this.availableRooms = this.totalRooms - this.bookedRooms.length - this.blockedRooms;
  
  // Ensure availableRooms doesn't go negative
  if (this.availableRooms < 0) {
    this.availableRooms = 0;
  }
  
  next();
});

// Add methods to interface
declare module './RoomAvailability' {
  interface IRoomAvailability {
    isAvailable(): boolean;
    getRateForChannel(channel: string): number | undefined;
    addBooking(channel: string, bookingId: mongoose.Types.ObjectId, guestName?: string): Promise<void>;
    removeBooking(bookingId: mongoose.Types.ObjectId): Promise<void>;
    getBookingsByChannel(channel: string): IChannelBooking[];
  }
}

// Instance methods
roomAvailabilitySchema.methods.isAvailable = function(this: IRoomAvailability): boolean {
  return this.availableRooms > 0 && this.status === AvailabilityStatus.OPEN;
};

roomAvailabilitySchema.methods.getRateForChannel = function(this: IRoomAvailability, channel: string): number | undefined {
  const channelRate = this.rates.find(r => r.channel === channel);
  return channelRate?.rate;
};

roomAvailabilitySchema.methods.addBooking = async function(
  this: IRoomAvailability,
  channel: string,
  bookingId: mongoose.Types.ObjectId,
  guestName?: string
): Promise<void> {
  // Check if there's availability
  if (this.availableRooms <= 0) {
    throw new Error('No availability for this date');
  }
  
  // Check if channel is closed
  if (this.closedChannels.includes(channel)) {
    throw new Error(`Booking is closed on ${channel}`);
  }
  
  // Add booking
  this.bookedRooms.push({
    channel,
    bookingId,
    guestName,
    bookedAt: new Date()
  });
  
  // Save will trigger pre-save to recalculate availableRooms
  await this.save();
};

roomAvailabilitySchema.methods.removeBooking = async function(
  this: IRoomAvailability,
  bookingId: mongoose.Types.ObjectId
): Promise<void> {
  const index = this.bookedRooms.findIndex(
    b => b.bookingId.toString() === bookingId.toString()
  );
  
  if (index !== -1) {
    this.bookedRooms.splice(index, 1);
    await this.save();
  }
};

roomAvailabilitySchema.methods.getBookingsByChannel = function(this: IRoomAvailability, channel: string): IChannelBooking[] {
  return this.bookedRooms.filter(b => b.channel === channel);
};

// Static methods
roomAvailabilitySchema.statics.getAvailabilityForDateRange = async function(
  propertyId: string,
  roomId: string,
  startDate: Date,
  endDate: Date
) {
  return this.find({
    property: propertyId,
    room: roomId,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 });
};

const RoomAvailability = mongoose.model<IRoomAvailability>('RoomAvailability', roomAvailabilitySchema);

export default RoomAvailability;


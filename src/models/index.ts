// Import all models
import User, { IUser, Role } from './User';
import Property, { IProperty, PropertyType, PropertyStatus, IRoom, RoomType } from './Property';
import Booking, { IBooking, BookingStatus, BookingChannel, IGuestInfo, IGuestCount, IPricing } from './Booking';
import RatePlan, { IRatePlan, RatePlanType, RatePlanStatus, CancellationPolicy } from './RatePlan';
import Calendar, { ICalendar, CalendarStatus, CalendarChannel, BlockReason } from './Calendar';
import Channel, { IChannel, ChannelType, ChannelStatus, IApiCredentials, ISyncSettings, IPerformanceMetrics, IRateParitySettings } from './Channel';

// Export all models
export {
  User,
  Property,
  Booking,
  RatePlan,
  Calendar,
  Channel
};

// Export all interfaces
export type {
  IUser,
  IProperty,
  IRoom,
  IBooking,
  IGuestInfo,
  IGuestCount,
  IPricing,
  IRatePlan,
  ICalendar,
  IChannel,
  IApiCredentials,
  ISyncSettings,
  IPerformanceMetrics,
  IRateParitySettings
};

// Export all enums
export {
  Role,
  PropertyType,
  PropertyStatus,
  RoomType,
  BookingStatus,
  BookingChannel,
  RatePlanType,
  RatePlanStatus,
  CancellationPolicy,
  CalendarStatus,
  CalendarChannel,
  BlockReason,
  ChannelType,
  ChannelStatus
};

/**
 * Model relationships and virtual population setup
 */
export class ModelRelationships {
  /**
   * Setup all model relationships
   */
  static setupRelationships(): void {
    this.setupUserRelationships();
    this.setupPropertyRelationships();
    this.setupBookingRelationships();
    this.setupRatePlanRelationships();
    this.setupCalendarRelationships();
    this.setupChannelRelationships();
  }

  /**
   * Setup User model relationships
   */
  private static setupUserRelationships(): void {
    const userSchema = User.schema;

    // Virtual for owned properties
    userSchema.virtual('ownedProperties', {
      ref: 'Property',
      localField: '_id',
      foreignField: 'owner',
      justOne: false
    });

    // Virtual for managed properties
    userSchema.virtual('managedProperties', {
      ref: 'Property',
      localField: '_id',
      foreignField: 'manager',
      justOne: false
    });

    // Virtual for created bookings
    userSchema.virtual('createdBookings', {
      ref: 'Booking',
      localField: '_id',
      foreignField: 'createdBy',
      justOne: false
    });

    // Virtual for created rate plans
    userSchema.virtual('createdRatePlans', {
      ref: 'RatePlan',
      localField: '_id',
      foreignField: 'createdBy',
      justOne: false
    });

    // Virtual for created channels
    userSchema.virtual('createdChannels', {
      ref: 'Channel',
      localField: '_id',
      foreignField: 'createdBy',
      justOne: false
    });

    // Ensure virtual fields are included in JSON output
    userSchema.set('toJSON', { virtuals: true });
    userSchema.set('toObject', { virtuals: true });
  }

  /**
   * Setup Property model relationships
   */
  private static setupPropertyRelationships(): void {
    const propertySchema = Property.schema;

    // Virtual for bookings
    propertySchema.virtual('bookings', {
      ref: 'Booking',
      localField: '_id',
      foreignField: 'property',
      justOne: false
    });

    // Virtual for rate plans
    propertySchema.virtual('ratePlans', {
      ref: 'RatePlan',
      localField: '_id',
      foreignField: 'property',
      justOne: false
    });

    // Virtual for calendar entries
    propertySchema.virtual('calendarEntries', {
      ref: 'Calendar',
      localField: '_id',
      foreignField: 'property',
      justOne: false
    });

    // Virtual for channels
    propertySchema.virtual('channels', {
      ref: 'Channel',
      localField: '_id',
      foreignField: 'properties',
      justOne: false
    });

    // Virtual for owner details
    propertySchema.virtual('ownerDetails', {
      ref: 'User',
      localField: 'owner',
      foreignField: '_id',
      justOne: true
    });

    // Virtual for manager details
    propertySchema.virtual('managerDetails', {
      ref: 'User',
      localField: 'manager',
      foreignField: '_id',
      justOne: true
    });

    // Ensure virtual fields are included in JSON output
    propertySchema.set('toJSON', { virtuals: true });
    propertySchema.set('toObject', { virtuals: true });
  }

  /**
   * Setup Booking model relationships
   */
  private static setupBookingRelationships(): void {
    const bookingSchema = Booking.schema;

    // Virtual for property details
    bookingSchema.virtual('propertyDetails', {
      ref: 'Property',
      localField: 'property',
      foreignField: '_id',
      justOne: true
    });

    // Virtual for room details
    bookingSchema.virtual('roomDetails', {
      ref: 'Property',
      localField: 'room',
      foreignField: 'rooms._id',
      justOne: true
    });

    // Virtual for calendar entries
    bookingSchema.virtual('calendarEntries', {
      ref: 'Calendar',
      localField: '_id',
      foreignField: 'booking',
      justOne: false
    });

    // Virtual for created by user
    bookingSchema.virtual('createdByUser', {
      ref: 'User',
      localField: 'createdBy',
      foreignField: '_id',
      justOne: true
    });

    // Virtual for last modified by user
    bookingSchema.virtual('lastModifiedByUser', {
      ref: 'User',
      localField: 'lastModifiedBy',
      foreignField: '_id',
      justOne: true
    });

    // Virtual for cancelled by user
    bookingSchema.virtual('cancelledByUser', {
      ref: 'User',
      localField: 'cancelledBy',
      foreignField: '_id',
      justOne: true
    });

    // Ensure virtual fields are included in JSON output
    bookingSchema.set('toJSON', { virtuals: true });
    bookingSchema.set('toObject', { virtuals: true });
  }

  /**
   * Setup RatePlan model relationships
   */
  private static setupRatePlanRelationships(): void {
    const ratePlanSchema = RatePlan.schema;

    // Virtual for property details
    ratePlanSchema.virtual('propertyDetails', {
      ref: 'Property',
      localField: 'property',
      foreignField: '_id',
      justOne: true
    });

    // Virtual for room details
    ratePlanSchema.virtual('roomDetails', {
      ref: 'Property',
      localField: 'room',
      foreignField: 'rooms._id',
      justOne: true
    });

    // Virtual for created by user
    ratePlanSchema.virtual('createdByUser', {
      ref: 'User',
      localField: 'createdBy',
      foreignField: '_id',
      justOne: true
    });

    // Virtual for last modified by user
    ratePlanSchema.virtual('lastModifiedByUser', {
      ref: 'User',
      localField: 'lastModifiedBy',
      foreignField: '_id',
      justOne: true
    });

    // Ensure virtual fields are included in JSON output
    ratePlanSchema.set('toJSON', { virtuals: true });
    ratePlanSchema.set('toObject', { virtuals: true });
  }

  /**
   * Setup Calendar model relationships
   */
  private static setupCalendarRelationships(): void {
    const calendarSchema = Calendar.schema;

    // Virtual for property details
    calendarSchema.virtual('propertyDetails', {
      ref: 'Property',
      localField: 'property',
      foreignField: '_id',
      justOne: true
    });

    // Virtual for room details
    calendarSchema.virtual('roomDetails', {
      ref: 'Property',
      localField: 'room',
      foreignField: 'rooms._id',
      justOne: true
    });

    // Virtual for booking details
    calendarSchema.virtual('bookingDetails', {
      ref: 'Booking',
      localField: 'booking',
      foreignField: '_id',
      justOne: true
    });

    // Virtual for last updated by user
    calendarSchema.virtual('lastUpdatedByUser', {
      ref: 'User',
      localField: 'lastUpdatedBy',
      foreignField: '_id',
      justOne: true
    });

    // Ensure virtual fields are included in JSON output
    calendarSchema.set('toJSON', { virtuals: true });
    calendarSchema.set('toObject', { virtuals: true });
  }

  /**
   * Setup Channel model relationships
   */
  private static setupChannelRelationships(): void {
    const channelSchema = Channel.schema;

    // Virtual for properties
    channelSchema.virtual('propertyDetails', {
      ref: 'Property',
      localField: 'properties',
      foreignField: '_id',
      justOne: false
    });

    // Virtual for created by user
    channelSchema.virtual('createdByUser', {
      ref: 'User',
      localField: 'createdBy',
      foreignField: '_id',
      justOne: true
    });

    // Virtual for last modified by user
    channelSchema.virtual('lastModifiedByUser', {
      ref: 'User',
      localField: 'lastModifiedBy',
      foreignField: '_id',
      justOne: true
    });

    // Ensure virtual fields are included in JSON output
    channelSchema.set('toJSON', { virtuals: true });
    channelSchema.set('toObject', { virtuals: true });
  }
}

/**
 * Model validation and constraints
 */
export class ModelValidation {
  /**
   * Setup all model validations
   */
  static setupValidations(): void {
    this.setupUserValidations();
    this.setupPropertyValidations();
    this.setupBookingValidations();
    this.setupRatePlanValidations();
    this.setupCalendarValidations();
    this.setupChannelValidations();
  }

  /**
   * Setup User model validations
   */
  private static setupUserValidations(): void {
    const userSchema = User.schema;

    // Custom validation for roles
    userSchema.path('roles').validate(function(roles: Role[]) {
      if (!roles || roles.length === 0) {
        return false;
      }
      
      // Check for valid role combinations
      if (roles.includes(Role.SUPERADMIN) && roles.length > 1) {
        return false; // Superadmin should be the only role
      }
      
      return true;
    }, 'Invalid role combination');

    // Custom validation for email uniqueness
    userSchema.path('email').validate(async function(email: string) {
      if (!this.isNew && !this.isModified('email')) {
        return true;
      }
      
      const user = await User.findOne({ email });
      return !user;
    }, 'Email already exists');
  }

  /**
   * Setup Property model validations
   */
  private static setupPropertyValidations(): void {
    const propertySchema = Property.schema;

    // Custom validation for rooms
    propertySchema.path('rooms').validate(function(rooms: IRoom[]) {
      if (!rooms || rooms.length === 0) {
        return false;
      }
      
      // Check for unique room names within property
      const roomNames = rooms.map(room => room.name);
      const uniqueNames = new Set(roomNames);
      
      return roomNames.length === uniqueNames.size;
    }, 'Room names must be unique within property');
  }

  /**
   * Setup Booking model validations
   */
  private static setupBookingValidations(): void {
    const bookingSchema = Booking.schema;

    // Custom validation for date range
    bookingSchema.path('checkOut').validate(function(checkOut: Date) {
      if (!this.checkIn || !checkOut) {
        return true;
      }
      
      return checkOut > this.checkIn;
    }, 'Check-out date must be after check-in date');

    // Custom validation for guest count
    bookingSchema.path('guests').validate(function(guests: IGuestCount) {
      if (!guests) {
        return false;
      }
      
      return guests.adults > 0 && guests.adults <= 20 &&
             guests.children >= 0 && guests.children <= 10 &&
             guests.infants >= 0 && guests.infants <= 5;
    }, 'Invalid guest count');
  }

  /**
   * Setup RatePlan model validations
   */
  private static setupRatePlanValidations(): void {
    const ratePlanSchema = RatePlan.schema;

    // Custom validation for date range
    ratePlanSchema.path('validTo').validate(function(validTo: Date) {
      if (!this.validFrom || !validTo) {
        return true;
      }
      
      return validTo > this.validFrom;
    }, 'Valid to date must be after valid from date');

    // Custom validation for stay limits
    ratePlanSchema.path('maxStay').validate(function(maxStay: number) {
      if (!this.minStay || !maxStay) {
        return true;
      }
      
      return maxStay >= this.minStay;
    }, 'Maximum stay must be greater than or equal to minimum stay');
  }

  /**
   * Setup Calendar model validations
   */
  private static setupCalendarValidations(): void {
    const calendarSchema = Calendar.schema;

    // Custom validation for rate
    calendarSchema.path('rate').validate(function(rate: number) {
      if (rate === undefined || rate === null) {
        return true; // Rate is optional
      }
      
      return rate >= 0;
    }, 'Rate cannot be negative');

    // Custom validation for stay limits
    calendarSchema.path('maxStay').validate(function(maxStay: number) {
      if (!this.minStay || !maxStay) {
        return true;
      }
      
      return maxStay >= this.minStay;
    }, 'Maximum stay must be greater than or equal to minimum stay');
  }

  /**
   * Setup Channel model validations
   */
  private static setupChannelValidations(): void {
    const channelSchema = Channel.schema;

    // Custom validation for sync interval
    channelSchema.path('syncSettings.syncInterval').validate(function(syncInterval: number) {
      return syncInterval >= 5 && syncInterval <= 1440; // 5 minutes to 24 hours
    }, 'Sync interval must be between 5 minutes and 24 hours');

    // Custom validation for retry attempts
    channelSchema.path('syncSettings.retryAttempts').validate(function(retryAttempts: number) {
      return retryAttempts >= 0 && retryAttempts <= 10;
    }, 'Retry attempts must be between 0 and 10');
  }
}

/**
 * Initialize all model relationships and validations
 */
export function initializeModels(): void {
  ModelRelationships.setupRelationships();
  ModelValidation.setupValidations();
}

// Auto-initialize when this module is imported
initializeModels();

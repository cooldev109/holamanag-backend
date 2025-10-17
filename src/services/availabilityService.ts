import Calendar, { ICalendar, CalendarStatus, CalendarChannel, BlockReason } from '../models/Calendar';
import Property, { IProperty } from '../models/Property';
import { logger } from '../config/logger';
import { createError } from '../utils/errors';
import mongoose from 'mongoose';

// Availability query options
export interface IAvailabilityQuery {
  propertyId: string;
  roomId?: string;
  startDate: Date;
  endDate: Date;
  channel?: CalendarChannel;
  minStay?: number;
  maxStay?: number;
  guests?: number;
}

// Availability result
export interface IAvailabilityResult {
  available: boolean;
  property: IProperty;
  rooms: Array<{
    roomId: string;
    roomName: string;
    available: boolean;
    dates: Array<{
      date: Date;
      status: CalendarStatus;
      rate: number;
      currency: string;
      minStay: number;
      maxStay?: number;
    }>;
    totalRate: number;
    nights: number;
  }>;
  restrictions: {
    minStay: number;
    maxStay?: number;
    blackoutDates: Date[];
  };
}

// Bulk availability update
export interface IBulkAvailabilityUpdate {
  propertyId: string;
  roomId: string;
  dates: Date[];
  status: CalendarStatus;
  rate?: number;
  currency?: string;
  minStay?: number;
  maxStay?: number;
  channel: CalendarChannel;
  userId?: string;
}

class AvailabilityService {
  /**
   * Check availability for property/room across date range
   */
  public async checkAvailability(query: IAvailabilityQuery): Promise<IAvailabilityResult> {
    try {
      logger.info(`Checking availability for property ${query.propertyId}`);

      // Get property
      const property = await Property.findById(query.propertyId);
      if (!property) {
        throw createError.notFound('Property not found');
      }

      // Calculate nights
      const nights = Math.ceil(
        (query.endDate.getTime() - query.startDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Get rooms to check
      const rooms = query.roomId
        ? property.rooms.filter(r => r._id?.toString() === query.roomId)
        : property.rooms;

      const roomResults = await Promise.all(
        rooms.map(room => this.checkRoomAvailability(
          property._id.toString(),
          room._id!.toString(),
          query.startDate,
          query.endDate,
          query.channel,
          nights
        ))
      );

      // Check overall availability
      const available = roomResults.some(r => r.available);

      return {
        available,
        property,
        rooms: roomResults,
        restrictions: {
          minStay: Math.min(...roomResults.map(r => r.dates[0]?.minStay || 1)),
          blackoutDates: []
        }
      };
    } catch (error) {
      logger.error('Error checking availability:', error);
      throw createError.calendar(`Availability check failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check room availability
   */
  private async checkRoomAvailability(
    propertyId: string,
    roomId: string,
    startDate: Date,
    endDate: Date,
    channel?: CalendarChannel,
    nights?: number
  ): Promise<{
    roomId: string;
    roomName: string;
    available: boolean;
    dates: Array<{
      date: Date;
      status: CalendarStatus;
      rate: number;
      currency: string;
      minStay: number;
      maxStay?: number;
    }>;
    totalRate: number;
    nights: number;
  }> {
    // Get calendar entries for date range
    const calendars = await Calendar.find({
      property: propertyId,
      room: roomId,
      date: { $gte: startDate, $lt: endDate },
      ...(channel && channel !== CalendarChannel.ALL ? { channel: { $in: [channel, CalendarChannel.ALL] } } : {})
    }).sort({ date: 1 });

    // Check if all dates are available
    const nightsCount = nights || Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const dates: Array<{
      date: Date;
      status: CalendarStatus;
      rate: number;
      currency: string;
      minStay: number;
      maxStay?: number;
    }> = [];

    let totalRate = 0;
    let available = true;

    // Generate all dates in range
    for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const calendar = calendars.find(
        c => c.date.toISOString().split('T')[0] === dateStr
      );

      if (calendar) {
        const effectiveRate = calendar.getEffectiveRate();

        dates.push({
          date: new Date(d),
          status: calendar.status,
          rate: effectiveRate,
          currency: calendar.currency || 'USD',
          minStay: calendar.minStay || 1,
          maxStay: calendar.maxStay
        });

        totalRate += effectiveRate;

        // Check if date is available
        if (!calendar.canBeBooked()) {
          available = false;
        }

        // Check min stay requirement
        if (calendar.minStay && nightsCount < calendar.minStay) {
          available = false;
        }

        // Check max stay requirement
        if (calendar.maxStay && nightsCount > calendar.maxStay) {
          available = false;
        }
      } else {
        // No calendar entry, assume available at base rate
        dates.push({
          date: new Date(d),
          status: CalendarStatus.AVAILABLE,
          rate: 0,
          currency: 'USD',
          minStay: 1
        });
      }
    }

    return {
      roomId,
      roomName: 'Room', // This should be fetched from property.rooms
      available,
      dates,
      totalRate,
      nights: nightsCount
    };
  }

  /**
   * Get availability across all channels
   */
  public async getMultiChannelAvailability(
    propertyId: string,
    roomId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Map<CalendarChannel, IAvailabilityResult>> {
    const channels = [
      CalendarChannel.AIRBNB,
      CalendarChannel.BOOKING,
      CalendarChannel.EXPEDIA,
      CalendarChannel.AGODA,
      CalendarChannel.VRBO,
      CalendarChannel.DIRECT
    ];

    const results = new Map<CalendarChannel, IAvailabilityResult>();

    for (const channel of channels) {
      try {
        const availability = await this.checkAvailability({
          propertyId,
          roomId,
          startDate,
          endDate,
          channel
        });

        results.set(channel, availability);
      } catch (error) {
        logger.error(`Error checking availability for channel ${channel}:`, error);
      }
    }

    return results;
  }

  /**
   * Update availability (single date)
   */
  public async updateAvailability(
    propertyId: string,
    roomId: string,
    date: Date,
    status: CalendarStatus,
    channel: CalendarChannel,
    userId?: string,
    additionalData?: Partial<ICalendar>
  ): Promise<ICalendar> {
    try {
      // Find existing calendar entry
      let calendar = await Calendar.findOne({
        property: propertyId,
        room: roomId,
        date
      });

      if (calendar) {
        // Update existing
        calendar.status = status;
        calendar.channel = channel;
        if (userId) calendar.lastUpdatedBy = new mongoose.Types.ObjectId(userId);

        // Update additional fields
        if (additionalData) {
          if (additionalData.rate !== undefined) calendar.rate = additionalData.rate;
          if (additionalData.currency !== undefined) calendar.currency = additionalData.currency;
          if (additionalData.minStay !== undefined) calendar.minStay = additionalData.minStay;
          if (additionalData.maxStay !== undefined) calendar.maxStay = additionalData.maxStay;
          if (additionalData.blockReason !== undefined) calendar.blockReason = additionalData.blockReason;
          if (additionalData.blockDescription !== undefined) calendar.blockDescription = additionalData.blockDescription;
        }

        await calendar.save();
        logger.info(`Updated availability for ${date} on channel ${channel}`);
      } else {
        // Create new
        calendar = new Calendar({
          property: propertyId,
          room: roomId,
          date,
          status,
          channel,
          lastUpdatedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
          ...additionalData
        });

        await calendar.save();
        logger.info(`Created availability for ${date} on channel ${channel}`);
      }

      return calendar;
    } catch (error) {
      logger.error('Error updating availability:', error);
      throw createError.calendar(`Availability update failed: ${(error as Error).message}`);
    }
  }

  /**
   * Bulk update availability
   */
  public async bulkUpdateAvailability(update: IBulkAvailabilityUpdate): Promise<{
    updated: number;
    created: number;
    errors: string[];
  }> {
    try {
      logger.info(`Bulk updating availability for property ${update.propertyId}, room ${update.roomId}`);

      let updated = 0;
      let created = 0;
      const errors: string[] = [];

      for (const date of update.dates) {
        try {
          let calendar = await Calendar.findOne({
            property: update.propertyId,
            room: update.roomId,
            date
          });

          if (calendar) {
            calendar.status = update.status;
            calendar.channel = update.channel;
            if (update.rate !== undefined) calendar.rate = update.rate;
            if (update.currency !== undefined) calendar.currency = update.currency;
            if (update.minStay !== undefined) calendar.minStay = update.minStay;
            if (update.maxStay !== undefined) calendar.maxStay = update.maxStay;
            if (update.userId) calendar.lastUpdatedBy = new mongoose.Types.ObjectId(update.userId);

            await calendar.save();
            updated++;
          } else {
            calendar = new Calendar({
              property: update.propertyId,
              room: update.roomId,
              date,
              status: update.status,
              rate: update.rate,
              currency: update.currency,
              minStay: update.minStay || 1,
              maxStay: update.maxStay,
              channel: update.channel,
              lastUpdatedBy: update.userId ? new mongoose.Types.ObjectId(update.userId) : undefined
            });

            await calendar.save();
            created++;
          }
        } catch (error) {
          errors.push(`Error updating ${date}: ${(error as Error).message}`);
        }
      }

      logger.info(`Bulk update completed: ${updated} updated, ${created} created, ${errors.length} errors`);

      return { updated, created, errors };
    } catch (error) {
      logger.error('Bulk availability update failed:', error);
      throw createError.calendar(`Bulk availability update failed: ${(error as Error).message}`);
    }
  }

  /**
   * Block dates
   */
  public async blockDates(
    propertyId: string,
    roomId: string,
    dates: Date[],
    reason: BlockReason,
    description?: string,
    channel: CalendarChannel = CalendarChannel.ALL,
    userId?: string
  ): Promise<{ blocked: number; errors: string[] }> {
    try {
      logger.info(`Blocking ${dates.length} dates for property ${propertyId}, room ${roomId}`);

      let blocked = 0;
      const errors: string[] = [];

      for (const date of dates) {
        try {
          await this.updateAvailability(
            propertyId,
            roomId,
            date,
            CalendarStatus.BLOCKED,
            channel,
            userId,
            { blockReason: reason, blockDescription: description }
          );
          blocked++;
        } catch (error) {
          errors.push(`Error blocking ${date}: ${(error as Error).message}`);
        }
      }

      logger.info(`Blocked ${blocked} dates with ${errors.length} errors`);

      return { blocked, errors };
    } catch (error) {
      logger.error('Error blocking dates:', error);
      throw createError.calendar(`Block dates failed: ${(error as Error).message}`);
    }
  }

  /**
   * Unblock dates
   */
  public async unblockDates(
    propertyId: string,
    roomId: string,
    dates: Date[],
    channel: CalendarChannel = CalendarChannel.ALL,
    userId?: string
  ): Promise<{ unblocked: number; errors: string[] }> {
    try {
      logger.info(`Unblocking ${dates.length} dates for property ${propertyId}, room ${roomId}`);

      let unblocked = 0;
      const errors: string[] = [];

      for (const date of dates) {
        try {
          await this.updateAvailability(
            propertyId,
            roomId,
            date,
            CalendarStatus.AVAILABLE,
            channel,
            userId,
            { blockReason: undefined, blockDescription: undefined }
          );
          unblocked++;
        } catch (error) {
          errors.push(`Error unblocking ${date}: ${(error as Error).message}`);
        }
      }

      logger.info(`Unblocked ${unblocked} dates with ${errors.length} errors`);

      return { unblocked, errors };
    } catch (error) {
      logger.error('Error unblocking dates:', error);
      throw createError.calendar(`Unblock dates failed: ${(error as Error).message}`);
    }
  }

  /**
   * Mark dates as booked
   */
  public async markAsBooked(
    propertyId: string,
    roomId: string,
    dates: Date[],
    bookingId: string,
    channel: CalendarChannel,
    userId?: string
  ): Promise<{ booked: number; errors: string[] }> {
    try {
      logger.info(`Marking ${dates.length} dates as booked for booking ${bookingId}`);

      let booked = 0;
      const errors: string[] = [];

      for (const date of dates) {
        try {
          await this.updateAvailability(
            propertyId,
            roomId,
            date,
            CalendarStatus.BOOKED,
            channel,
            userId,
            { booking: new mongoose.Types.ObjectId(bookingId) }
          );
          booked++;
        } catch (error) {
          errors.push(`Error booking ${date}: ${(error as Error).message}`);
        }
      }

      logger.info(`Marked ${booked} dates as booked with ${errors.length} errors`);

      return { booked, errors };
    } catch (error) {
      logger.error('Error marking dates as booked:', error);
      throw createError.calendar(`Mark as booked failed: ${(error as Error).message}`);
    }
  }

  /**
   * Release booked dates
   */
  public async releaseBookedDates(
    propertyId: string,
    roomId: string,
    dates: Date[],
    channel: CalendarChannel,
    userId?: string
  ): Promise<{ released: number; errors: string[] }> {
    try {
      logger.info(`Releasing ${dates.length} booked dates`);

      let released = 0;
      const errors: string[] = [];

      for (const date of dates) {
        try {
          await this.updateAvailability(
            propertyId,
            roomId,
            date,
            CalendarStatus.AVAILABLE,
            channel,
            userId,
            { booking: undefined }
          );
          released++;
        } catch (error) {
          errors.push(`Error releasing ${date}: ${(error as Error).message}`);
        }
      }

      logger.info(`Released ${released} dates with ${errors.length} errors`);

      return { released, errors };
    } catch (error) {
      logger.error('Error releasing booked dates:', error);
      throw createError.calendar(`Release dates failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get occupancy rate
   */
  public async getOccupancyRate(
    propertyId: string,
    roomId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalDays: number;
    bookedDays: number;
    availableDays: number;
    blockedDays: number;
    occupancyRate: number;
  }> {
    try {
      const calendars = await Calendar.find({
        property: propertyId,
        room: roomId,
        date: { $gte: startDate, $lte: endDate }
      });

      const totalDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const bookedDays = calendars.filter(c => c.status === CalendarStatus.BOOKED).length;
      const availableDays = calendars.filter(c => c.status === CalendarStatus.AVAILABLE).length;
      const blockedDays = calendars.filter(c =>
        [CalendarStatus.BLOCKED, CalendarStatus.MAINTENANCE, CalendarStatus.OUT_OF_ORDER].includes(c.status)
      ).length;

      const occupancyRate = totalDays > 0 ? (bookedDays / totalDays) * 100 : 0;

      return {
        totalDays,
        bookedDays,
        availableDays,
        blockedDays,
        occupancyRate
      };
    } catch (error) {
      logger.error('Error calculating occupancy rate:', error);
      throw createError.calendar(`Occupancy rate calculation failed: ${(error as Error).message}`);
    }
  }
}

// Singleton instance
export const availabilityService = new AvailabilityService();
export default availabilityService;

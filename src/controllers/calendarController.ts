import { Request, Response } from 'express';
import Calendar, { CalendarStatus, CalendarChannel, BlockReason } from '../models/Calendar';
import Property from '../models/Property';
import { logger } from '../config/logger';
import { z } from 'zod';

// Query validation schema
const querySchema = z.object({
  page: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1)).default('1'),
  limit: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1).max(100)).default('10'),
  property: z.string().optional(),
  room: z.string().optional(),
  status: z.nativeEnum(CalendarStatus).optional(),
  channel: z.nativeEnum(CalendarChannel).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z.enum(['date', 'status', 'rate', 'createdAt']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
});

// Availability query schema
const availabilitySchema = z.object({
  property: z.string().min(1, 'Property ID is required'),
  room: z.string().min(1, 'Room ID is required'),
  startDate: z.string().datetime('Invalid start date format'),
  endDate: z.string().datetime('Invalid end date format'),
  guests: z.object({
    adults: z.number().min(1, 'At least one adult is required').max(20, 'Cannot exceed 20 adults'),
    children: z.number().min(0, 'Children count cannot be negative').max(10, 'Cannot exceed 10 children').default(0),
    infants: z.number().min(0, 'Infants count cannot be negative').max(5, 'Cannot exceed 5 infants').default(0)
  }).optional()
});

/**
 * Calendar Controller
 * Handles all calendar and availability-related operations
 */
export class CalendarController {
  /**
   * Get calendar entries with filtering and pagination
   */
  static async getCalendarEntries(req: Request, res: Response): Promise<void> {
    try {
      const query = querySchema.parse(req.query);
      const { page, limit, property, room, status, channel, startDate, endDate, sortBy, sortOrder } = query;

      // Build filter object
      const filter: any = {};

      if (property) filter.property = property;
      if (room) filter.room = room;
      if (status) filter.status = status;
      if (channel) filter.channel = channel;

      // Date range filter
      if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) filter.date.$lte = new Date(endDate);
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Build sort object
      const sort: any = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [calendarEntries, total] = await Promise.all([
        Calendar.find(filter)
          .populate('property', 'name address.city address.country')
          .populate('room', 'name type baseRate')
          .populate('booking', 'guestInfo checkIn checkOut status')
          .populate('lastUpdatedBy', 'email profile.firstName profile.lastName')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Calendar.countDocuments(filter)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      res.status(200).json({
        success: true,
        data: {
          calendarEntries,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage,
            hasPrevPage
          }
        },
        message: 'Calendar entries retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting calendar entries:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid query parameters',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CALENDAR_ENTRIES_FETCH_ERROR'
      });
    }
  }

  /**
   * Check room availability
   */
  static async checkAvailability(req: Request, res: Response): Promise<void> {
    try {
      const query = availabilitySchema.parse(req.query);
      const { property, room, startDate, endDate, guests } = query;

      // Validate property and room exist
      const propertyDoc = await Property.findById(property);
      if (!propertyDoc) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      const roomDoc = propertyDoc.rooms.find((r: any) => r._id.toString() === room);
      if (!roomDoc) {
        res.status(404).json({
          success: false,
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }

      // Check room capacity
      if (guests) {
        const totalGuests = guests.adults + guests.children + guests.infants;
        const roomCapacity = roomDoc.capacity.adults + roomDoc.capacity.children + roomDoc.capacity.infants;
        
        if (totalGuests > roomCapacity) {
          res.status(400).json({
            success: false,
            message: 'Guest count exceeds room capacity',
            code: 'ROOM_CAPACITY_EXCEEDED'
          });
          return;
        }
      }

      // Check availability for the date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      const nights = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      const availabilityCheck = await Calendar.find({
        property,
        room,
        date: { $gte: start, $lt: end },
        status: { $in: [CalendarStatus.BOOKED, CalendarStatus.BLOCKED, CalendarStatus.MAINTENANCE] }
      }).sort({ date: 1 });

      const isAvailable = availabilityCheck.length === 0;
      const blockedDates = availabilityCheck.map(entry => ({
        date: entry.date,
        status: entry.status,
        reason: entry.blockReason,
        description: entry.blockDescription
      }));

      // Get rates for available dates
      const rateEntries = await Calendar.find({
        property,
        room,
        date: { $gte: start, $lt: end },
        status: CalendarStatus.AVAILABLE
      }).sort({ date: 1 });

      const rates = rateEntries.map(entry => ({
        date: entry.date,
        rate: entry.getEffectiveRate(),
        currency: entry.currency || 'USD',
        minStay: entry.minStay,
        maxStay: entry.maxStay
      }));

      const totalRate = rates.reduce((sum, rate) => sum + rate.rate, 0);

      res.status(200).json({
        success: true,
        data: {
          isAvailable,
          nights,
          totalRate,
          rates,
          blockedDates,
          room: {
            id: roomDoc._id,
            name: roomDoc.name,
            type: roomDoc.type,
            capacity: roomDoc.capacity,
            baseRate: roomDoc.baseRate,
            currency: roomDoc.currency
          },
          searchCriteria: {
            property,
            room,
            startDate,
            endDate,
            guests
          }
        },
        message: 'Availability check completed successfully'
      });

    } catch (error) {
      logger.error('Error checking availability:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid availability parameters',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'AVAILABILITY_CHECK_ERROR'
      });
    }
  }

  /**
   * Bulk update calendar availability
   */
  static async bulkUpdateAvailability(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId, roomId, dates, status, rate, currency, minStay, maxStay, channel } = req.body;
      const userId = req.user?.id;

      // Validate property and room exist
      const property = await Property.findById(propertyId);
      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      const room = property.rooms.find((r: any) => r._id.toString() === roomId);
      if (!room) {
        res.status(404).json({
          success: false,
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }

      // Validate dates
      const dateObjects = dates.map((dateStr: string) => new Date(dateStr));
      const invalidDates = dateObjects.filter((date: Date) => isNaN(date.getTime()));
      
      if (invalidDates.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid date format provided',
          code: 'INVALID_DATE_FORMAT'
        });
        return;
      }

      // Perform bulk update
      const CalendarModel = require('../models/Calendar').default;
      const result = await CalendarModel.bulkUpdateAvailability(
        propertyId,
        roomId,
        dateObjects,
        status,
        userId
      );

      // Update additional fields if provided
      if (rate !== undefined || currency || minStay !== undefined || maxStay !== undefined || channel) {
        const updateFields: any = {};
        if (rate !== undefined) updateFields.rate = rate;
        if (currency) updateFields.currency = currency;
        if (minStay !== undefined) updateFields.minStay = minStay;
        if (maxStay !== undefined) updateFields.maxStay = maxStay;
        if (channel) updateFields.channel = channel;

        await Calendar.updateMany(
          { property: propertyId, room: roomId, date: { $in: dateObjects } },
          { ...updateFields, lastUpdatedBy: userId }
        );
      }

      logger.info(`Calendar availability updated: ${dates.length} dates for property ${propertyId}, room ${roomId} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: {
          updatedCount: result.modifiedCount,
          upsertedCount: result.upsertedCount,
          dates: dateObjects,
          status
        },
        message: 'Calendar availability updated successfully'
      });

    } catch (error) {
      logger.error('Error bulk updating availability:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CALENDAR_BULK_UPDATE_ERROR'
      });
    }
  }

  /**
   * Block dates for maintenance or other reasons
   */
  static async blockDates(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId, roomId, dates, reason, description, channel } = req.body;
      const userId = req.user?.id;

      // Validate property and room exist
      const property = await Property.findById(propertyId);
      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      const room = property.rooms.find((r: any) => r._id.toString() === roomId);
      if (!room) {
        res.status(404).json({
          success: false,
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }

      // Validate reason
      if (!Object.values(BlockReason).includes(reason)) {
        res.status(400).json({
          success: false,
          message: 'Invalid block reason',
          code: 'INVALID_BLOCK_REASON'
        });
        return;
      }

      // Validate dates
      const dateObjects = dates.map((dateStr: string) => new Date(dateStr));
      const invalidDates = dateObjects.filter((date: Date) => isNaN(date.getTime()));
      
      if (invalidDates.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid date format provided',
          code: 'INVALID_DATE_FORMAT'
        });
        return;
      }

      // Perform bulk block
      const CalendarModel = require('../models/Calendar').default;
      const result = await CalendarModel.bulkBlockDates(
        propertyId,
        roomId,
        dateObjects,
        reason,
        description,
        userId
      );

      // Update channel if provided
      if (channel) {
        await Calendar.updateMany(
          { property: propertyId, room: roomId, date: { $in: dateObjects } },
          { channel, lastUpdatedBy: userId }
        );
      }

      logger.info(`Dates blocked: ${dates.length} dates for property ${propertyId}, room ${roomId} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: {
          updatedCount: result.modifiedCount,
          upsertedCount: result.upsertedCount,
          dates: dateObjects,
          reason,
          description
        },
        message: 'Dates blocked successfully'
      });

    } catch (error) {
      logger.error('Error blocking dates:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CALENDAR_BLOCK_ERROR'
      });
    }
  }

  /**
   * Get calendar by property
   */
  static async getCalendarByProperty(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId } = req.params;
      const { startDate, endDate, room } = req.query;

      const filter: any = { property: propertyId };
      
      if (room) filter.room = room;
      if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate as string);
        if (endDate) filter.date.$lte = new Date(endDate as string);
      }

      const calendarEntries = await Calendar.find(filter)
        .populate('room', 'name type baseRate')
        .populate('booking', 'guestInfo checkIn checkOut status')
        .sort({ date: 1, room: 1 })
        .lean();

      res.status(200).json({
        success: true,
        data: { calendarEntries },
        message: 'Calendar entries retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting calendar by property:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CALENDAR_PROPERTY_ERROR'
      });
    }
  }

  /**
   * Get calendar by room
   */
  static async getCalendarByRoom(req: Request, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { startDate, endDate } = req.query;

      const filter: any = { room: roomId };
      
      if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate as string);
        if (endDate) filter.date.$lte = new Date(endDate as string);
      }

      const calendarEntries = await Calendar.find(filter)
        .populate('property', 'name address.city address.country')
        .populate('booking', 'guestInfo checkIn checkOut status')
        .sort({ date: 1 })
        .lean();

      res.status(200).json({
        success: true,
        data: { calendarEntries },
        message: 'Calendar entries retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting calendar by room:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CALENDAR_ROOM_ERROR'
      });
    }
  }

  /**
   * Sync calendar with external channels
   */
  static async syncCalendar(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId, roomId, channel, startDate, endDate } = req.body;
      const userId = req.user?.id;

      // This would typically integrate with external channel APIs
      // For now, we'll simulate the sync process

      const filter: any = { property: propertyId };
      if (roomId) filter.room = roomId;
      if (channel) filter.channel = channel;
      if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) filter.date.$lte = new Date(endDate);
      }

      const calendarEntries = await Calendar.find(filter)
        .populate('property', 'name')
        .populate('room', 'name type')
        .sort({ date: 1 })
        .lean();

      // Simulate sync process
      const syncResults = {
        totalEntries: calendarEntries.length,
        syncedEntries: calendarEntries.length,
        failedEntries: 0,
        lastSync: new Date(),
        channel: channel || 'all'
      };

      logger.info(`Calendar sync completed: ${calendarEntries.length} entries for property ${propertyId} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { syncResults },
        message: 'Calendar sync completed successfully'
      });

    } catch (error) {
      logger.error('Error syncing calendar:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CALENDAR_SYNC_ERROR'
      });
    }
  }

  /**
   * Get calendar statistics
   */
  static async getCalendarStats(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId, startDate, endDate } = req.query;

      const filter: any = {};
      if (propertyId) filter.property = propertyId;
      if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate as string);
        if (endDate) filter.date.$lte = new Date(endDate as string);
      }

      const stats = await Calendar.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalRate: { $sum: '$rate' }
          }
        }
      ]);

      const statusCounts = {
        available: 0,
        booked: 0,
        blocked: 0,
        maintenance: 0,
        out_of_order: 0
      };

      let totalRevenue = 0;

      stats.forEach(stat => {
        statusCounts[stat._id as keyof typeof statusCounts] = stat.count;
        if (stat._id === 'booked') {
          totalRevenue += stat.totalRate || 0;
        }
      });

      const totalDays = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
      const occupancyRate = totalDays > 0 ? (statusCounts.booked / totalDays) * 100 : 0;

      res.status(200).json({
        success: true,
        data: {
          statusCounts,
          totalDays,
          occupancyRate: Math.round(occupancyRate * 100) / 100,
          totalRevenue
        },
        message: 'Calendar statistics retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting calendar stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CALENDAR_STATS_ERROR'
      });
    }
  }
}

export default CalendarController;

import { Request, Response } from 'express';
import Booking, { BookingStatus, BookingChannel } from '../models/Booking';
import Property from '../models/Property';
import Calendar from '../models/Calendar';
import { logger } from '../config/logger';
import { z } from 'zod';

// Query validation schema
const querySchema = z.object({
  page: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1)).default('1'),
  limit: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1).max(100)).default('10'),
  status: z.nativeEnum(BookingStatus).optional(),
  channel: z.nativeEnum(BookingChannel).optional(),
  property: z.string().optional(),
  room: z.string().optional(),
  checkIn: z.string().datetime().optional(),
  checkOut: z.string().datetime().optional(),
  guestEmail: z.string().email().optional(),
  sortBy: z.enum(['checkIn', 'checkOut', 'createdAt', 'total']).default('checkIn'),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
});

// Date range query schema
const dateRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  property: z.string().optional(),
  room: z.string().optional()
});

/**
 * Booking Controller
 * Handles all booking-related operations
 */
export class BookingController {
  /**
   * Get all bookings with filtering and pagination
   */
  static async getAllBookings(req: Request, res: Response): Promise<void> {
    try {
      const query = querySchema.parse(req.query);
      const { page, limit, status, channel, property, room, checkIn, checkOut, guestEmail, sortBy, sortOrder } = query;

      // Build filter object
      const filter: any = {};

      if (status) filter.status = status;
      if (channel) filter.channel = channel;
      if (property) filter.property = property;
      if (room) filter.room = room;
      if (guestEmail) filter['guestInfo.email'] = { $regex: guestEmail, $options: 'i' };

      // Date range filters
      if (checkIn || checkOut) {
        filter.$or = [];
        if (checkIn) {
          filter.$or.push({ checkIn: { $gte: new Date(checkIn) } });
        }
        if (checkOut) {
          filter.$or.push({ checkOut: { $lte: new Date(checkOut) } });
        }
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Build sort object
      const sort: any = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [bookings, total] = await Promise.all([
        Booking.find(filter)
          .populate('property', 'name address.city address.country')
          .populate('room', 'name type baseRate')
          .populate('createdBy', 'email profile.firstName profile.lastName')
          .populate('lastModifiedBy', 'email profile.firstName profile.lastName')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Booking.countDocuments(filter)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      res.status(200).json({
        success: true,
        data: {
          bookings,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage,
            hasPrevPage
          }
        },
        message: 'Bookings retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting bookings:', error);
      
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
        code: 'BOOKINGS_FETCH_ERROR'
      });
    }
  }

  /**
   * Get single booking by ID
   */
  static async getBookingById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const booking = await Booking.findById(id)
        .populate('property', 'name address contactInfo')
        .populate('room', 'name type capacity amenities baseRate')
        .populate('createdBy', 'email profile.firstName profile.lastName')
        .populate('lastModifiedBy', 'email profile.firstName profile.lastName')
        .populate('cancelledBy', 'email profile.firstName profile.lastName')
        .lean();

      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'Booking not found',
          code: 'BOOKING_NOT_FOUND'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: { booking },
        message: 'Booking retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting booking by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'BOOKING_FETCH_ERROR'
      });
    }
  }

  /**
   * Create new booking
   */
  static async createBooking(req: Request, res: Response): Promise<void> {
    try {
      const bookingData = req.body;
      const userId = req.user?.id;

      // Validate property and room exist
      const property = await Property.findById(bookingData.property);
      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      const room = property.rooms.find((r: any) => r._id.toString() === bookingData.room);
      if (!room) {
        res.status(404).json({
          success: false,
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }

      // Check availability
      const checkIn = new Date(bookingData.checkIn);
      const checkOut = new Date(bookingData.checkOut);
      
      const availabilityCheck = await Calendar.find({
        property: bookingData.property,
        room: bookingData.room,
        date: { $gte: checkIn, $lt: checkOut },
        status: { $in: ['booked', 'blocked', 'maintenance'] }
      });

      if (availabilityCheck.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Room not available for selected dates',
          code: 'ROOM_NOT_AVAILABLE'
        });
        return;
      }

      // Add created by user
      bookingData.createdBy = userId;

      const booking = new Booking(bookingData);
      await booking.save();

      // Update calendar entries
      const CalendarModel = require('../models/Calendar').default;
      await CalendarModel.bulkUpdateAvailability(
        bookingData.property,
        bookingData.room,
        Array.from({ length: Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)) }, (_, i) => {
          const date = new Date(checkIn);
          date.setDate(date.getDate() + i);
          return date;
        }),
        'booked',
        userId
      );

      // Populate the created booking
      await booking.populate([
        { path: 'property', select: 'name address contactInfo' },
        { path: 'room', select: 'name type capacity amenities baseRate' },
        { path: 'createdBy', select: 'email profile.firstName profile.lastName' }
      ]);

      logger.info(`Booking created: ${booking._id} by user: ${userId}`);

      res.status(201).json({
        success: true,
        data: { booking },
        message: 'Booking created successfully'
      });

    } catch (error) {
      logger.error('Error creating booking:', error);

      if (error instanceof Error && error.name === 'ValidationError') {
        const validationError = error as any;
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(validationError.errors).map((err: any) => ({
            field: err.path,
            message: err.message
          }))
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'BOOKING_CREATE_ERROR'
      });
    }
  }

  /**
   * Update booking
   */
  static async updateBooking(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user?.id;

      const existingBooking = await Booking.findById(id);
      if (!existingBooking) {
        res.status(404).json({
          success: false,
          message: 'Booking not found',
          code: 'BOOKING_NOT_FOUND'
        });
        return;
      }

      // Add last modified by user
      updateData.lastModifiedBy = userId;

      const booking = await Booking.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate([
        { path: 'property', select: 'name address contactInfo' },
        { path: 'room', select: 'name type capacity amenities baseRate' },
        { path: 'createdBy', select: 'email profile.firstName profile.lastName' },
        { path: 'lastModifiedBy', select: 'email profile.firstName profile.lastName' }
      ]);

      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'Booking not found after update',
          code: 'BOOKING_NOT_FOUND'
        });
        return;
      }

      logger.info(`Booking updated: ${booking._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { booking },
        message: 'Booking updated successfully'
      });

    } catch (error) {
      logger.error('Error updating booking:', error);

      if (error instanceof Error && error.name === 'ValidationError') {
        const validationError = error as any;
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(validationError.errors).map((err: any) => ({
            field: err.path,
            message: err.message
          }))
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'BOOKING_UPDATE_ERROR'
      });
    }
  }

  /**
   * Cancel booking
   */
  static async cancelBooking(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { cancellationReason } = req.body;
      const userId = req.user?.id;

      const booking = await Booking.findById(id);
      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'Booking not found',
          code: 'BOOKING_NOT_FOUND'
        });
        return;
      }

      // Check if booking can be cancelled
      if (!booking.canBeCancelled()) {
        res.status(400).json({
          success: false,
          message: 'Booking cannot be cancelled',
          code: 'BOOKING_CANNOT_CANCEL'
        });
        return;
      }

      // Update booking status
      await booking.updateStatus(BookingStatus.CANCELLED, userId);
      booking.cancellationReason = cancellationReason;
      await booking.save();

      // Update calendar entries to available
      const checkIn = new Date(booking.checkIn);
      const checkOut = new Date(booking.checkOut);
      
      const CalendarModel = require('../models/Calendar').default;
      await CalendarModel.bulkUpdateAvailability(
        booking.property.toString(),
        booking.room.toString(),
        Array.from({ length: Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)) }, (_, i) => {
          const date = new Date(checkIn);
          date.setDate(date.getDate() + i);
          return date;
        }),
        'available',
        userId
      );

      // Populate the updated booking
      await booking.populate([
        { path: 'property', select: 'name address contactInfo' },
        { path: 'room', select: 'name type capacity amenities baseRate' },
        { path: 'cancelledBy', select: 'email profile.firstName profile.lastName' }
      ]);

      logger.info(`Booking cancelled: ${booking._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { booking },
        message: 'Booking cancelled successfully'
      });

    } catch (error) {
      logger.error('Error cancelling booking:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'BOOKING_CANCEL_ERROR'
      });
    }
  }

  /**
   * Check in booking
   */
  static async checkInBooking(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const booking = await Booking.findById(id);
      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'Booking not found',
          code: 'BOOKING_NOT_FOUND'
        });
        return;
      }

      if (booking.status !== BookingStatus.CONFIRMED) {
        res.status(400).json({
          success: false,
          message: 'Only confirmed bookings can be checked in',
          code: 'INVALID_BOOKING_STATUS'
        });
        return;
      }

      await booking.updateStatus(BookingStatus.CHECKED_IN, userId);

      // Populate the updated booking
      await booking.populate([
        { path: 'property', select: 'name address contactInfo' },
        { path: 'room', select: 'name type capacity amenities baseRate' },
        { path: 'lastModifiedBy', select: 'email profile.firstName profile.lastName' }
      ]);

      logger.info(`Booking checked in: ${booking._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { booking },
        message: 'Booking checked in successfully'
      });

    } catch (error) {
      logger.error('Error checking in booking:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'BOOKING_CHECKIN_ERROR'
      });
    }
  }

  /**
   * Check out booking
   */
  static async checkOutBooking(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const booking = await Booking.findById(id);
      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'Booking not found',
          code: 'BOOKING_NOT_FOUND'
        });
        return;
      }

      if (booking.status !== BookingStatus.CHECKED_IN) {
        res.status(400).json({
          success: false,
          message: 'Only checked-in bookings can be checked out',
          code: 'INVALID_BOOKING_STATUS'
        });
        return;
      }

      await booking.updateStatus(BookingStatus.CHECKED_OUT, userId);

      // Populate the updated booking
      await booking.populate([
        { path: 'property', select: 'name address contactInfo' },
        { path: 'room', select: 'name type capacity amenities baseRate' },
        { path: 'lastModifiedBy', select: 'email profile.firstName profile.lastName' }
      ]);

      logger.info(`Booking checked out: ${booking._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { booking },
        message: 'Booking checked out successfully'
      });

    } catch (error) {
      logger.error('Error checking out booking:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'BOOKING_CHECKOUT_ERROR'
      });
    }
  }

  /**
   * Get bookings by date range
   */
  static async getBookingsByDateRange(req: Request, res: Response): Promise<void> {
    try {
      const query = dateRangeSchema.parse(req.query);
      const { startDate, endDate, property, room } = query;

      const filter: any = {
        $or: [
          { checkIn: { $gte: new Date(startDate), $lte: new Date(endDate) } },
          { checkOut: { $gte: new Date(startDate), $lte: new Date(endDate) } },
          { checkIn: { $lte: new Date(startDate) }, checkOut: { $gte: new Date(endDate) } }
        ]
      };

      if (property) filter.property = property;
      if (room) filter.room = room;

      const bookings = await Booking.find(filter)
        .populate('property', 'name address.city address.country')
        .populate('room', 'name type baseRate')
        .populate('createdBy', 'email profile.firstName profile.lastName')
        .sort({ checkIn: 1 })
        .lean();

      res.status(200).json({
        success: true,
        data: { bookings },
        message: 'Bookings retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting bookings by date range:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid date range parameters',
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
        code: 'BOOKINGS_DATE_RANGE_ERROR'
      });
    }
  }

  /**
   * Get booking statistics
   */
  static async getBookingStats(req: Request, res: Response): Promise<void> {
    try {
      const { property, startDate, endDate } = req.query;

      const filter: any = {};
      if (property) filter.property = property;
      if (startDate && endDate) {
        filter.createdAt = {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string)
        };
      }

      const stats = await Booking.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalBookings: { $sum: 1 },
            totalRevenue: { $sum: '$pricing.total' },
            averageBookingValue: { $avg: '$pricing.total' },
            confirmedBookings: {
              $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
            },
            cancelledBookings: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            },
            checkedInBookings: {
              $sum: { $cond: [{ $eq: ['$status', 'checked-in'] }, 1, 0] }
            },
            checkedOutBookings: {
              $sum: { $cond: [{ $eq: ['$status', 'checked-out'] }, 1, 0] }
            }
          }
        }
      ]);

      const result = stats[0] || {
        totalBookings: 0,
        totalRevenue: 0,
        averageBookingValue: 0,
        confirmedBookings: 0,
        cancelledBookings: 0,
        checkedInBookings: 0,
        checkedOutBookings: 0
      };

      res.status(200).json({
        success: true,
        data: { stats: result },
        message: 'Booking statistics retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting booking stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'BOOKING_STATS_ERROR'
      });
    }
  }
}

export default BookingController;

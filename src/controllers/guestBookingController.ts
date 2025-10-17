import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Booking, { BookingStatus, BookingChannel, DocumentType } from '../models/Booking';
import RoomAvailability from '../models/RoomAvailability';
import Property from '../models/Property';
import { logger } from '../config/logger';
import { websocketService } from '../services/websocketService';

/**
 * Guest Booking Controller
 * Handles bookings from guests without authentication
 */
export class GuestBookingController {
  /**
   * Check availability for a property and room
   */
  static async checkAvailability(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId, roomId, checkIn, checkOut } = req.body;

      // Validate required fields
      if (!propertyId || !roomId || !checkIn || !checkOut) {
        res.status(400).json({
          success: false,
          message: 'Property ID, room ID, check-in and check-out dates are required'
        });
        return;
      }

      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);

      // Validate dates
      if (checkInDate >= checkOutDate) {
        res.status(400).json({
          success: false,
          message: 'Check-out date must be after check-in date'
        });
        return;
      }

      if (checkInDate < new Date()) {
        res.status(400).json({
          success: false,
          message: 'Check-in date cannot be in the past'
        });
        return;
      }

      // Get property and room details
      const property = await Property.findById(propertyId);
      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found'
        });
        return;
      }

      const room = property.rooms.find(r => r._id.toString() === roomId.toString());
      if (!room) {
        res.status(404).json({
          success: false,
          message: 'Room not found'
        });
        return;
      }

      // Get all dates in range
      const dates = GuestBookingController.getDatesBetween(checkInDate, checkOutDate);

      // Check availability for each date
      const availabilityByDate = [];
      let isAvailable = true;
      let minAvailableRooms = Infinity;

      for (const date of dates) {
        const availability = await RoomAvailability.findOne({
          property: new mongoose.Types.ObjectId(propertyId),
          room: new mongoose.Types.ObjectId(roomId),
          date: date
        });

        if (!availability || availability.availableRooms <= 0) {
          isAvailable = false;
          minAvailableRooms = 0;
        } else {
          minAvailableRooms = Math.min(minAvailableRooms, availability.availableRooms);
        }

        availabilityByDate.push({
          date: date.toISOString().split('T')[0],
          available: availability?.availableRooms || 0,
          totalRooms: availability?.totalRooms || 0
        });
      }

      // Calculate pricing
      const nights = dates.length;
      const pricePerNight = room.baseRate || 0;
      const totalPrice = pricePerNight * nights;

      res.json({
        success: true,
        available: isAvailable,
        totalRooms: availabilityByDate[0]?.totalRooms || 0,
        availableRooms: minAvailableRooms === Infinity ? 0 : minAvailableRooms,
        pricePerNight,
        totalPrice,
        nights,
        dates: availabilityByDate,
        room: {
          id: room._id,
          name: room.name,
          type: room.type,
          description: room.description
        }
      });

    } catch (error) {
      logger.error('Error checking availability:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking availability',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }

  /**
   * Create a guest booking
   */
  static async createBooking(req: Request, res: Response): Promise<void> {
    try {
      const {
        propertyId,
        roomId,
        checkIn,
        checkOut,
        guestName,
        guestEmail,
        guestPhone,
        guests,
        specialRequests,
        channel
      } = req.body;

      // Validate required fields
      if (!propertyId || !roomId || !checkIn || !checkOut || !guestName || !guestEmail) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
        return;
      }

      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);

      // Validate dates
      if (checkInDate >= checkOutDate) {
        res.status(400).json({
          success: false,
          message: 'Check-out date must be after check-in date'
        });
        return;
      }

      if (checkInDate < new Date()) {
        res.status(400).json({
          success: false,
          message: 'Check-in date cannot be in the past'
        });
        return;
      }

      // Get property and room details
      const property = await Property.findById(propertyId);
      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found'
        });
        return;
      }

      const room = property.rooms.find(r => r._id.toString() === roomId.toString());
      if (!room) {
        res.status(404).json({
          success: false,
          message: 'Room not found'
        });
        return;
      }

      // Get all dates in range
      const dates = GuestBookingController.getDatesBetween(checkInDate, checkOutDate);

      // Check availability for ALL dates
      for (const date of dates) {
        const availability = await RoomAvailability.findOne({
          property: new mongoose.Types.ObjectId(propertyId),
          room: new mongoose.Types.ObjectId(roomId),
          date: date
        });

        if (!availability || availability.availableRooms <= 0) {
          res.status(400).json({
            success: false,
            message: `No availability on ${date.toISOString().split('T')[0]}`
          });
          return;
        }
      }

      // Calculate pricing
      const nights = dates.length;
      const pricePerNight = room.baseRate || 0;
      const totalPrice = pricePerNight * nights;

      // Split guest name into first and last name
      const nameParts = guestName.trim().split(' ');
      const firstName = nameParts[0] || guestName;
      const lastName = nameParts.slice(1).join(' ') || firstName;

      // Generate confirmation code
      const confirmationCode = GuestBookingController.generateConfirmationCode();

      // Create booking
      const booking = await Booking.create({
        property: new mongoose.Types.ObjectId(propertyId),
        room: new mongoose.Types.ObjectId(roomId),
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guestInfo: {
          firstName,
          lastName,
          email: guestEmail,
          phone: guestPhone || '+000000000',
          nationality: 'Unknown',
          documentType: DocumentType.PASSPORT,
          documentNumber: 'N/A'
        },
        guests: {
          adults: typeof guests === 'number' ? guests : 1,
          children: 0,
          infants: 0
        },
        status: BookingStatus.CONFIRMED,
        channel: (channel as BookingChannel) || BookingChannel.DIRECT,
        channelConfirmationCode: confirmationCode,
        pricing: {
          baseRate: totalPrice,
          taxes: 0,
          fees: 0,
          discounts: 0,
          total: totalPrice,
          currency: room.currency || 'USD'
        },
        specialRequests: specialRequests ? [specialRequests] : []
      });

      // Update inventory for each date
      for (const date of dates) {
        const availability = await RoomAvailability.findOne({
          property: new mongoose.Types.ObjectId(propertyId),
          room: new mongoose.Types.ObjectId(roomId),
          date: date
        });

        if (availability) {
          await availability.addBooking(
            (channel as string) || 'direct',
            booking._id as mongoose.Types.ObjectId,
            guestName
          );

          // Emit WebSocket event for inventory update
          websocketService.emitInventoryUpdated({
            propertyId: propertyId,
            roomId: roomId,
            date: date.toISOString().split('T')[0],
            totalRooms: availability.totalRooms,
            availableRooms: availability.availableRooms - 1,
            bookedRooms: availability.bookedRooms.length + 1
          });
        }
      }

      // Emit WebSocket event for booking created
      websocketService.emitBookingCreated({
        propertyId: propertyId,
        roomId: roomId,
        dates: dates.map(d => d.toISOString().split('T')[0]),
        channel: (channel as string) || 'direct',
        guestName: guestName
      });

      logger.info(`Guest booking created: ${booking._id}`, {
        property: property.name,
        room: room.name,
        guest: guestName,
        channel: channel || 'direct',
        dates: dates.length
      });

      res.status(201).json({
        success: true,
        booking: {
          id: booking._id,
          confirmationCode,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guestName,
          guestEmail,
          totalAmount: totalPrice,
          currency: room.currency || 'USD',
          status: booking.status,
          property: {
            id: property._id,
            name: property.name
          },
          room: {
            id: room._id,
            name: room.name,
            type: room.type
          }
        },
        message: 'Booking confirmed! Availability updated across all channels.'
      });

    } catch (error) {
      logger.error('Error creating guest booking:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating booking',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }

  /**
   * Get booking by confirmation code
   */
  static async getBooking(req: Request, res: Response): Promise<void> {
    try {
      const { confirmationCode } = req.params;

      const booking = await Booking.findOne({
        channelConfirmationCode: confirmationCode
      })
      .populate('property');

      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
        return;
      }

      // Get room from populated property
      const property = booking.property as any;
      const room = property.rooms?.find((r: any) => r._id.toString() === booking.room.toString());

      res.json({
        success: true,
        booking: {
          id: booking._id,
          confirmationCode: booking.channelConfirmationCode,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guestName: `${booking.guestInfo.firstName} ${booking.guestInfo.lastName}`,
          guestEmail: booking.guestInfo.email,
          guests: booking.guests.adults + booking.guests.children,
          totalAmount: booking.pricing.total,
          currency: booking.pricing.currency,
          status: booking.status,
          property: {
            id: property._id,
            name: property.name
          },
          room: room ? {
            id: room._id,
            name: room.name,
            type: room.type
          } : null,
          specialRequests: booking.specialRequests
        }
      });

    } catch (error) {
      logger.error('Error fetching booking:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching booking',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }

  /**
   * Helper: Get all dates between check-in and check-out (excluding check-out)
   */
  private static getDatesBetween(startDate: Date, endDate: Date): Date[] {
    const dates: Date[] = [];
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (currentDate < end) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  }

  /**
   * Helper: Generate unique confirmation code
   */
  private static generateConfirmationCode(): string {
    const prefix = 'BK';
    const timestamp = Date.now().toString().slice(-7);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}-${timestamp}${random}`;
  }
}

export default GuestBookingController;


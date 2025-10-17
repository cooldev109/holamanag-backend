import { Request, Response } from 'express';
import RoomAvailability, { AvailabilityStatus } from '../models/RoomAvailability';
import Property from '../models/Property';
import { logger } from '../config/logger';
import { z } from 'zod';
import mongoose from 'mongoose';

/**
 * Inventory Controller V2
 * 
 * Implements CORRECT Channel Manager logic:
 * - Same rooms listed across multiple OTA channels
 * - Bookings from any channel reduce availability on ALL channels
 * - Prevents overbooking
 */

// Query validation schema
const inventoryQuerySchema = z.object({
  propertyId: z.string().min(1, 'Property ID is required'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  channel: z.string().optional()
});

// Bulk update schema
const bulkUpdateSchema = z.object({
  cells: z.array(z.string()).min(1, 'At least one cell must be selected'),
  updates: z.object({
    rate: z.number().min(0).optional(),
    minStay: z.number().min(1).optional(),
    maxStay: z.number().min(1).optional(),
    stopSell: z.boolean().optional(),
    channel: z.string().optional()
  })
});

export class InventoryControllerV2 {
  /**
   * Get inventory data - CORRECT implementation
   * 
   * Key concept:
   * - Total rooms is CONSTANT across all channels (e.g., always 4)
   * - Available = Total - (bookings from ALL channels)
   * - When viewing Airbnb: shows total availability, highlights Airbnb bookings
   * - When viewing Total: shows all bookings from all channels
   */
  static async getInventory(req: Request, res: Response): Promise<void> {
    try {
      const query = inventoryQuerySchema.parse(req.query);
      const { propertyId, from, to, channel } = query;

      // Validate property exists
      const property = await Property.findById(propertyId).populate('rooms');
      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found'
        });
        return;
      }

      const startDate = new Date(from);
      const endDate = new Date(to);

      if (startDate >= endDate) {
        res.status(400).json({
          success: false,
          message: 'Start date must be before end date'
        });
        return;
      }

      logger.info(`Fetching inventory for property ${propertyId}, channel filter: ${channel || 'all'}`);

      // Get all room types for this property
      const roomIds = property.rooms.map(room => room._id);

      // Fetch availability records
      const availabilityRecords = await RoomAvailability.find({
        property: new mongoose.Types.ObjectId(propertyId),
        room: { $in: roomIds },
        date: { $gte: startDate, $lte: endDate }
      }).sort({ room: 1, date: 1 });

      // Group by room
      const roomMap = new Map<string, any>();

      for (const record of availabilityRecords) {
        const roomId = record.room.toString();
        
        if (!roomMap.has(roomId)) {
          // Find room details from property
          const roomDetails = property.rooms.find(r => r._id.toString() === roomId);
          
          // CRITICAL: Use the FIRST record's totalRooms as the canonical value
          // In shared inventory, this should be constant across all records for this room
          // We'll validate this is consistent
          roomMap.set(roomId, {
            roomId: roomId,
            roomCode: InventoryControllerV2.generateRoomCode(roomId),
            roomName: roomDetails?.name || 'Unknown Room',
            roomType: roomDetails?.type || 'standard',
            baseRate: roomDetails?.baseRate || 0,
            totalRooms: record.totalRooms, // This should be the same for all records of this room
            availability: []
          });
        }
        
        // VALIDATION: Ensure totalRooms is consistent across all records
        const roomData = roomMap.get(roomId)!;
        if (roomData.totalRooms !== record.totalRooms) {
          logger.warn(`Inconsistent totalRooms for room ${roomId}: expected ${roomData.totalRooms}, got ${record.totalRooms} on ${record.date}`);
          // Use the maximum to be safe
          roomData.totalRooms = Math.max(roomData.totalRooms, record.totalRooms);
        }
        
        // Filter bookings by channel if specified
        let channelBookedCount = 0;

        if (channel && channel !== 'total') {
          // When viewing specific channel, show which bookings are from this channel
          channelBookedCount = record.bookedRooms.filter(b => b.channel === channel).length;
        }

        // Get rate for requested channel or average
        let displayRate: number;
        if (channel && channel !== 'total') {
          displayRate = record.getRateForChannel(channel) || record.rates[0]?.rate || 0;
        } else {
          // Total view: average of all channel rates
          displayRate = record.rates.length > 0
            ? record.rates.reduce((sum, r) => sum + r.rate, 0) / record.rates.length
            : 0;
        }

        roomData.availability.push({
          date: record.date.toISOString().split('T')[0],
          
          // CRITICAL: These numbers are the same regardless of channel view
          allotment: record.totalRooms,        // Always the same (e.g., 4)
          booked: record.bookedRooms.length,   // Total booked across ALL channels
          blocked: record.blockedRooms,
          available: record.availableRooms,    // Total - booked - blocked
          
          rate: Math.round(displayRate * 100) / 100,
          minStay: record.minStay,
          maxStay: record.maxStay,
          stopSell: record.status !== 'open',
          
          // Additional info for channel-specific views
          channels: record.bookedRooms.map(b => ({
            channel: b.channel,
            status: 'booked',
            bookingId: b.bookingId.toString(),
            guestName: b.guestName
          })),
          
          // For channel-specific view: how many booked on THIS channel
          channelBooked: channel && channel !== 'total' ? channelBookedCount : undefined,
          
          // Channel-specific rates
          channelRates: record.rates.map(r => ({
            channel: r.channel,
            rate: r.rate,
            currency: r.currency
          }))
        });
      }

      const inventoryData = Array.from(roomMap.values());

      logger.info(`Retrieved inventory for ${inventoryData.length} rooms`);

      res.json({
        success: true,
        data: inventoryData,
        metadata: {
          property: {
            id: property._id,
            name: property.name
          },
          dateRange: {
            from,
            to,
            days: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
          },
          channel: channel || 'total',
          explanation: channel && channel !== 'total' 
            ? `Showing total rooms with bookings from ${channel} highlighted`
            : 'Showing total availability across all channels'
        }
      });

    } catch (error) {
      logger.error('Error getting inventory:', error);
      
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
        message: 'Error retrieving inventory',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }

  /**
   * Bulk update inventory
   */
  static async bulkUpdate(req: Request, res: Response): Promise<void> {
    try {
      const data = bulkUpdateSchema.parse(req.body);
      const { cells, updates } = data;
      const userId = req.user?.id;

      logger.info(`Bulk updating ${cells.length} cells`);

      const updatePromises = cells.map(async (cellId) => {
        const [roomId, dateStr] = cellId.split('-');
        const date = new Date(dateStr);

        // Find the availability record
        const availability = await RoomAvailability.findOne({
          room: new mongoose.Types.ObjectId(roomId),
          date: date
        });

        if (!availability) {
          return { success: false, cellId };
        }

        // Update rate for specific channel or all channels
        if (updates.rate !== undefined) {
          if (updates.channel) {
            // Update specific channel rate
            const rateIndex = availability.rates.findIndex(r => r.channel === updates.channel);
            if (rateIndex !== -1) {
              availability.rates[rateIndex].rate = updates.rate;
            } else {
              availability.rates.push({
                channel: updates.channel,
                rate: updates.rate,
                currency: 'USD'
              });
            }
          } else {
            // Update all channel rates
            availability.rates.forEach(r => r.rate = updates.rate!);
          }
        }

        if (updates.minStay !== undefined) availability.minStay = updates.minStay;
        if (updates.maxStay !== undefined) availability.maxStay = updates.maxStay;
        
        if (updates.stopSell !== undefined) {
          availability.status = updates.stopSell ? AvailabilityStatus.CLOSED : AvailabilityStatus.OPEN;
        }

        availability.lastUpdatedBy = userId ? new mongoose.Types.ObjectId(userId) : undefined;
        
        await availability.save();
        return { success: true, cellId };
      });

      const results = await Promise.all(updatePromises);
      const successCount = results.filter(r => r.success).length;

      logger.info(`Successfully updated ${successCount} of ${cells.length} cells`);

      res.json({
        success: true,
        updated: successCount,
        message: `Successfully updated ${successCount} entries`
      });

    } catch (error) {
      logger.error('Error in bulk update:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid update data',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Error updating inventory',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }

  /**
   * Handle booking webhook - CORRECT implementation
   * 
   * When a booking comes from ANY channel:
   * - Reduces availability on ALL channels
   * - Prevents overbooking
   */
  static async handleBookingUpdate(req: Request, res: Response): Promise<void> {
    try {
      const { bookingId, propertyId, roomId, checkIn, checkOut, channel, status, guestName } = req.body;

      logger.info(`Processing booking update: ${bookingId}, channel: ${channel}, status: ${status}`);

      const startDate = new Date(checkIn);
      const endDate = new Date(checkOut);

      // Calculate dates between check-in and check-out
      const dates: Date[] = [];
      const currentDate = new Date(startDate);
      while (currentDate < endDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (status === 'confirmed' || status === 'booked') {
        // Add booking to availability records
        for (const date of dates) {
          const availability = await RoomAvailability.findOne({
            property: new mongoose.Types.ObjectId(propertyId),
            room: new mongoose.Types.ObjectId(roomId),
            date: date
          });

          if (availability) {
            await availability.addBooking(
              channel,
              new mongoose.Types.ObjectId(bookingId),
              guestName
            );
          }
        }

        logger.info(`Added booking to ${dates.length} dates. Availability reduced on ALL channels.`);
        
      } else if (status === 'cancelled') {
        // Remove booking from availability records
        for (const date of dates) {
          const availability = await RoomAvailability.findOne({
            property: new mongoose.Types.ObjectId(propertyId),
            room: new mongoose.Types.ObjectId(roomId),
            date: date
          });

          if (availability) {
            await availability.removeBooking(new mongoose.Types.ObjectId(bookingId));
          }
        }

        logger.info(`Removed booking from ${dates.length} dates. Availability restored on ALL channels.`);
      }

      res.json({
        success: true,
        message: 'Inventory updated successfully',
        datesUpdated: dates.length,
        note: 'Availability updated across ALL channels to prevent overbooking'
      });

    } catch (error) {
      logger.error('Error handling booking update:', error);
      
      res.status(500).json({
        success: false,
        message: 'Error updating inventory from booking',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }

  /**
   * Helper: Generate room code
   */
  private static generateRoomCode(roomId: string): string {
    const lastThree = roomId.substring(roomId.length - 3);
    return `std-${lastThree}`;
  }
}

export default InventoryControllerV2;


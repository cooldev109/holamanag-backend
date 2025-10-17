import { Request, Response } from 'express';
import Calendar, { CalendarStatus } from '../models/Calendar';
import Property from '../models/Property';
import Channel from '../models/Channel';
import { logger } from '../config/logger';
import { z } from 'zod';
import mongoose from 'mongoose';

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
    allotment: z.number().min(0).optional(),
    minStay: z.number().min(1).optional(),
    maxStay: z.number().min(1).optional(),
    stopSell: z.boolean().optional(),
    rate: z.number().min(0).optional()
  })
});

/**
 * Inventory Controller
 * Handles inventory management with real database interaction
 */
export class InventoryController {
  /**
   * Get inventory data for a property
   * Aggregates calendar data by room and date
   */
  static async getInventory(req: Request, res: Response): Promise<void> {
    try {
      const query = inventoryQuerySchema.parse(req.query);
      const { propertyId, from, to, channel } = query;

      // Validate property exists
      const property = await Property.findById(propertyId);
      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found'
        });
        return;
      }

      // Parse dates
      const startDate = new Date(from);
      const endDate = new Date(to);

      // Validate date range
      if (startDate >= endDate) {
        res.status(400).json({
          success: false,
          message: 'Start date must be before end date'
        });
        return;
      }

      // Build match criteria
      const matchCriteria: any = {
        property: new mongoose.Types.ObjectId(propertyId),
        date: { $gte: startDate, $lte: endDate }
      };

      // Channel filter
      if (channel) {
        // Specific channel view
        matchCriteria.channel = channel;
      } else {
        // Total view - get active channels
        const activeChannels = await Channel.find({ isActive: true }).select('type');
        const channelTypes = activeChannels.map(ch => ch.type);
        
        if (channelTypes.length === 0) {
          // No active channels, return empty
          res.json({
            success: true,
            data: []
          });
          return;
        }
        
        matchCriteria.channel = { $in: channelTypes };
      }

      logger.info(`Fetching inventory for property ${propertyId}, channel: ${channel || 'total'}`);

      // Aggregate inventory data
      const inventoryData = await Calendar.aggregate([
        { $match: matchCriteria },
        {
          $lookup: {
            from: 'properties',
            let: { roomId: '$room' },
            pipeline: [
              { $unwind: '$rooms' },
              { 
                $match: { 
                  $expr: { $eq: ['$rooms._id', '$$roomId'] } 
                } 
              },
              {
                $project: {
                  roomName: '$rooms.name',
                  roomType: '$rooms.type',
                  baseRate: '$rooms.baseRate'
                }
              }
            ],
            as: 'roomInfo'
          }
        },
        { $unwind: { path: '$roomInfo', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { 
              room: '$room',
              date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }
            },
            allotment: { $sum: 1 }, // Count total units
            booked: {
              $sum: {
                $cond: [{ $eq: ['$status', CalendarStatus.BOOKED] }, 1, 0]
              }
            },
            blocked: {
              $sum: {
                $cond: [
                  { 
                    $in: ['$status', [
                      CalendarStatus.BLOCKED, 
                      CalendarStatus.MAINTENANCE,
                      CalendarStatus.OUT_OF_ORDER
                    ]]
                  },
                  1,
                  0
                ]
              }
            },
            rate: { $avg: '$rate' },
            minStay: { $min: '$minStay' },
            maxStay: { $max: '$maxStay' },
            stopSell: { 
              $max: { 
                $cond: [
                  { $eq: ['$status', CalendarStatus.BLOCKED] },
                  1,
                  0
                ]
              }
            },
            roomInfo: { $first: '$roomInfo' },
            channels: { 
              $push: {
                channel: '$channel',
                status: '$status',
                rate: '$rate'
              }
            }
          }
        },
        {
          $group: {
            _id: '$_id.room',
            roomId: { $first: '$_id.room' },
            roomName: { $first: '$roomInfo.roomName' },
            roomType: { $first: '$roomInfo.roomType' },
            baseRate: { $first: '$roomInfo.baseRate' },
            availability: {
              $push: {
                date: '$_id.date',
                allotment: '$allotment',
                booked: '$booked',
                blocked: '$blocked',
                available: { $subtract: ['$allotment', { $add: ['$booked', '$blocked'] }] },
                rate: { $round: ['$rate', 2] },
                minStay: '$minStay',
                maxStay: '$maxStay',
                stopSell: { $eq: ['$stopSell', 1] },
                channels: '$channels'
              }
            }
          }
        },
        { 
          $project: {
            _id: 0,
            roomId: { $toString: '$roomId' },
            roomCode: {
              $concat: [
                'std-',
                { $substr: [{ $toString: '$roomId' }, { $subtract: [{ $strLenCP: { $toString: '$roomId' } }, 3] }, 3] }
              ]
            },
            roomName: 1,
            roomType: 1,
            baseRate: 1,
            availability: {
              $sortArray: { input: '$availability', sortBy: { date: 1 } }
            }
          }
        },
        { $sort: { roomCode: 1 } }
      ]);

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
          channel: channel || 'total'
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

      // Parse cell IDs (format: roomId-date)
      const updatePromises = cells.map(async (cellId) => {
        const [roomId, dateStr] = cellId.split('-');
        const date = new Date(dateStr);

        // Build update object
        const updateFields: any = {
          lastUpdatedBy: userId
        };

        if (updates.rate !== undefined) updateFields.rate = updates.rate;
        if (updates.minStay !== undefined) updateFields.minStay = updates.minStay;
        if (updates.maxStay !== undefined) updateFields.maxStay = updates.maxStay;
        
        if (updates.stopSell !== undefined) {
          updateFields.status = updates.stopSell 
            ? CalendarStatus.BLOCKED 
            : CalendarStatus.AVAILABLE;
          if (updates.stopSell) {
            updateFields.blockReason = 'manual';
          }
        }

        // Update calendar entry
        return Calendar.updateMany(
          { 
            room: new mongoose.Types.ObjectId(roomId),
            date: date
          },
          { $set: updateFields }
        );
      });

      const results = await Promise.all(updatePromises);
      const totalUpdated = results.reduce((sum, result) => sum + result.modifiedCount, 0);

      logger.info(`Successfully updated ${totalUpdated} calendar entries`);

      res.json({
        success: true,
        updated: totalUpdated,
        message: `Successfully updated ${totalUpdated} entries`
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
   * Handle booking webhook - updates inventory when booking is created/updated
   */
  static async handleBookingUpdate(req: Request, res: Response): Promise<void> {
    try {
      const { bookingId, propertyId, roomId, checkIn, checkOut, channel, status } = req.body;

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
        // Mark dates as booked
        await Calendar.updateMany(
          {
            property: new mongoose.Types.ObjectId(propertyId),
            room: new mongoose.Types.ObjectId(roomId),
            date: { $in: dates },
            channel: channel
          },
          {
            $set: {
              status: CalendarStatus.BOOKED,
              booking: new mongoose.Types.ObjectId(bookingId)
            }
          }
        );

        logger.info(`Marked ${dates.length} dates as booked`);
      } else if (status === 'cancelled') {
        // Mark dates as available again
        await Calendar.updateMany(
          {
            property: new mongoose.Types.ObjectId(propertyId),
            room: new mongoose.Types.ObjectId(roomId),
            date: { $in: dates },
            channel: channel,
            booking: new mongoose.Types.ObjectId(bookingId)
          },
          {
            $set: {
              status: CalendarStatus.AVAILABLE,
              booking: undefined
            }
          }
        );

        logger.info(`Marked ${dates.length} dates as available (cancellation)`);
      }

      res.json({
        success: true,
        message: 'Inventory updated successfully',
        datesUpdated: dates.length
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
}

export default InventoryController;




import mongoose from 'mongoose';
import Property from '../models/Property';
import Organization from '../models/Organization';
import Booking, { BookingStatus } from '../models/Booking';
import Calendar, { CalendarStatus } from '../models/Calendar';
import { logger } from '../config/logger';
import analyticsService from './AnalyticsService';
import { TimeRange } from './AnalyticsService';

/**
 * Bulk Operation Result
 */
export interface BulkOperationResult {
  success: number;
  failed: number;
  total: number;
  errors: Array<{ propertyId: string; error: string }>;
}

/**
 * Cross-Property Analytics
 */
export interface CrossPropertyAnalytics {
  totalProperties: number;
  totalRooms: number;
  totalRevenue: number;
  averageOccupancy: number;
  properties: Array<{
    propertyId: string;
    propertyName: string;
    revenue: number;
    occupancy: number;
    bookings: number;
  }>;
}

/**
 * Multi-Property Management Service
 * Handles property groups, organizations, cross-property analytics, and bulk operations
 */
class MultiPropertyService {
  /**
   * Get cross-property analytics for an organization or group
   */
  async getCrossPropertyAnalytics(
    organizationId?: mongoose.Types.ObjectId,
    propertyGroupId?: mongoose.Types.ObjectId,
    range: TimeRange = TimeRange.LAST_30_DAYS,
    customStart?: Date,
    customEnd?: Date
  ): Promise<CrossPropertyAnalytics> {
    try {
      logger.info('[MultiProperty] Generating cross-property analytics');

      // Build property query
      const propertyQuery: any = { status: 'active' };
      if (organizationId) {
        propertyQuery.organization = organizationId;
      } else if (propertyGroupId) {
        propertyQuery.propertyGroup = propertyGroupId;
      }

      // Get all properties
      const properties = await Property.find(propertyQuery);

      if (properties.length === 0) {
        return {
          totalProperties: 0,
          totalRooms: 0,
          totalRevenue: 0,
          averageOccupancy: 0,
          properties: []
        };
      }

      // Get analytics for each property in parallel
      const propertyAnalytics = await Promise.all(
        properties.map(async (property) => {
          try {
            // Get revenue for this property
            const revenueData = await analyticsService.getRevenueBreakdown(
              range,
              property._id.toString(),
              customStart,
              customEnd
            );

            // Get occupancy for this property
            const occupancyData = await analyticsService.getOccupancyMetrics(
              range,
              property._id.toString(),
              customStart,
              customEnd
            );

            // Get booking statistics
            const bookingStats = await analyticsService.getBookingStatistics(
              range,
              property._id.toString(),
              customStart,
              customEnd
            );

            return {
              propertyId: property._id.toString(),
              propertyName: property.name,
              revenue: revenueData.total,
              occupancy: occupancyData.occupancyRate,
              bookings: bookingStats.totalBookings
            };
          } catch (error) {
            logger.error(`[MultiProperty] Error getting analytics for property ${property._id}:`, error);
            return {
              propertyId: property._id.toString(),
              propertyName: property.name,
              revenue: 0,
              occupancy: 0,
              bookings: 0
            };
          }
        })
      );

      // Calculate totals
      const totalRooms = properties.reduce((sum, p) => sum + p.rooms.length, 0);
      const totalRevenue = propertyAnalytics.reduce((sum, p) => sum + p.revenue, 0);
      const averageOccupancy = propertyAnalytics.length > 0
        ? propertyAnalytics.reduce((sum, p) => sum + p.occupancy, 0) / propertyAnalytics.length
        : 0;

      return {
        totalProperties: properties.length,
        totalRooms,
        totalRevenue,
        averageOccupancy: parseFloat(averageOccupancy.toFixed(2)),
        properties: propertyAnalytics.sort((a, b) => b.revenue - a.revenue)
      };
    } catch (error) {
      logger.error('[MultiProperty] Error generating cross-property analytics:', error);
      throw error;
    }
  }

  /**
   * Bulk update rates across multiple properties
   */
  async bulkUpdateRates(
    propertyIds: mongoose.Types.ObjectId[],
    rateAdjustment: {
      type: 'percentage' | 'fixed';
      value: number; // Percentage or fixed amount
      applyTo: 'all' | 'specific'; // All rooms or specific room types
      roomTypes?: string[];
    }
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: 0,
      failed: 0,
      total: propertyIds.length,
      errors: []
    };

    logger.info(`[MultiProperty] Bulk updating rates for ${propertyIds.length} properties`);

    for (const propertyId of propertyIds) {
      try {
        const property = await Property.findById(propertyId);
        if (!property) {
          result.failed++;
          result.errors.push({
            propertyId: propertyId.toString(),
            error: 'Property not found'
          });
          continue;
        }

        // Update room rates
        let updated = false;
        property.rooms.forEach(room => {
          // Check if we should update this room
          const shouldUpdate =
            rateAdjustment.applyTo === 'all' ||
            (rateAdjustment.roomTypes && rateAdjustment.roomTypes.includes(room.type));

          if (shouldUpdate) {
            if (rateAdjustment.type === 'percentage') {
              room.baseRate = room.baseRate * (1 + rateAdjustment.value / 100);
            } else {
              room.baseRate = room.baseRate + rateAdjustment.value;
            }
            // Ensure rate doesn't go negative
            room.baseRate = Math.max(0, room.baseRate);
            updated = true;
          }
        });

        if (updated) {
          await property.save();
          result.success++;
          logger.info(`[MultiProperty] Updated rates for property ${propertyId}`);
        } else {
          result.failed++;
          result.errors.push({
            propertyId: propertyId.toString(),
            error: 'No matching rooms found to update'
          });
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          propertyId: propertyId.toString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        logger.error(`[MultiProperty] Error updating rates for property ${propertyId}:`, error);
      }
    }

    logger.info(`[MultiProperty] Bulk rate update complete: ${result.success}/${result.total} successful`);
    return result;
  }

  /**
   * Bulk update availability across multiple properties
   */
  async bulkUpdateAvailability(
    propertyIds: mongoose.Types.ObjectId[],
    startDate: Date,
    endDate: Date,
    status: CalendarStatus
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: 0,
      failed: 0,
      total: propertyIds.length,
      errors: []
    };

    logger.info(`[MultiProperty] Bulk updating availability for ${propertyIds.length} properties`);

    for (const propertyId of propertyIds) {
      try {
        const property = await Property.findById(propertyId);
        if (!property) {
          result.failed++;
          result.errors.push({
            propertyId: propertyId.toString(),
            error: 'Property not found'
          });
          continue;
        }

        // Generate date array
        const dates: Date[] = [];
        const currentDate = new Date(startDate);
        const endDateCopy = new Date(endDate);

        while (currentDate <= endDateCopy) {
          dates.push(new Date(currentDate));
          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Update calendar for all rooms in this property
        const bulkOps = [];
        for (const room of property.rooms) {
          for (const date of dates) {
            bulkOps.push({
              updateOne: {
                filter: {
                  property: propertyId,
                  room: room._id,
                  date
                },
                update: {
                  status,
                  updatedAt: new Date()
                },
                upsert: true
              }
            });
          }
        }

        if (bulkOps.length > 0) {
          await Calendar.bulkWrite(bulkOps);
          result.success++;
          logger.info(`[MultiProperty] Updated availability for property ${propertyId}`);
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          propertyId: propertyId.toString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        logger.error(`[MultiProperty] Error updating availability for property ${propertyId}:`, error);
      }
    }

    logger.info(`[MultiProperty] Bulk availability update complete: ${result.success}/${result.total} successful`);
    return result;
  }

  /**
   * Bulk update property settings
   */
  async bulkUpdateSettings(
    propertyIds: mongoose.Types.ObjectId[],
    settings: {
      autoConfirmBookings?: boolean;
      requireGuestVerification?: boolean;
      checkInTime?: string;
      checkOutTime?: string;
    }
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: 0,
      failed: 0,
      total: propertyIds.length,
      errors: []
    };

    logger.info(`[MultiProperty] Bulk updating settings for ${propertyIds.length} properties`);

    for (const propertyId of propertyIds) {
      try {
        const property = await Property.findById(propertyId);
        if (!property) {
          result.failed++;
          result.errors.push({
            propertyId: propertyId.toString(),
            error: 'Property not found'
          });
          continue;
        }

        // Update settings
        if (settings.autoConfirmBookings !== undefined) {
          property.settings.autoConfirmBookings = settings.autoConfirmBookings;
        }
        if (settings.requireGuestVerification !== undefined) {
          property.settings.requireGuestVerification = settings.requireGuestVerification;
        }
        if (settings.checkInTime) {
          property.policies.checkInTime = settings.checkInTime;
        }
        if (settings.checkOutTime) {
          property.policies.checkOutTime = settings.checkOutTime;
        }

        await property.save();
        result.success++;
        logger.info(`[MultiProperty] Updated settings for property ${propertyId}`);
      } catch (error) {
        result.failed++;
        result.errors.push({
          propertyId: propertyId.toString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        logger.error(`[MultiProperty] Error updating settings for property ${propertyId}:`, error);
      }
    }

    logger.info(`[MultiProperty] Bulk settings update complete: ${result.success}/${result.total} successful`);
    return result;
  }

  /**
   * Compare properties within a group or organization
   */
  async compareProperties(
    propertyIds: mongoose.Types.ObjectId[],
    range: TimeRange = TimeRange.LAST_30_DAYS,
    customStart?: Date,
    customEnd?: Date
  ): Promise<Array<{
    propertyId: string;
    propertyName: string;
    metrics: {
      revenue: number;
      occupancy: number;
      averageBookingValue: number;
      totalBookings: number;
      cancellationRate: number;
    };
  }>> {
    logger.info(`[MultiProperty] Comparing ${propertyIds.length} properties`);

    const comparisons = await Promise.all(
      propertyIds.map(async (propertyId) => {
        try {
          const property = await Property.findById(propertyId);
          if (!property) {
            throw new Error('Property not found');
          }

          // Get analytics
          const revenueData = await analyticsService.getRevenueBreakdown(
            range,
            propertyId.toString(),
            customStart,
            customEnd
          );

          const occupancyData = await analyticsService.getOccupancyMetrics(
            range,
            propertyId.toString(),
            customStart,
            customEnd
          );

          const bookingStats = await analyticsService.getBookingStatistics(
            range,
            propertyId.toString(),
            customStart,
            customEnd
          );

          return {
            propertyId: propertyId.toString(),
            propertyName: property.name,
            metrics: {
              revenue: revenueData.total,
              occupancy: occupancyData.occupancyRate,
              averageBookingValue: bookingStats.averageBookingValue,
              totalBookings: bookingStats.totalBookings,
              cancellationRate: bookingStats.cancellationRate
            }
          };
        } catch (error) {
          logger.error(`[MultiProperty] Error comparing property ${propertyId}:`, error);
          return {
            propertyId: propertyId.toString(),
            propertyName: 'Unknown',
            metrics: {
              revenue: 0,
              occupancy: 0,
              averageBookingValue: 0,
              totalBookings: 0,
              cancellationRate: 0
            }
          };
        }
      })
    );

    return comparisons.sort((a, b) => b.metrics.revenue - a.metrics.revenue);
  }

  /**
   * Get organization summary statistics
   */
  async getOrganizationSummary(organizationId: mongoose.Types.ObjectId) {
    try {
      logger.info(`[MultiProperty] Getting summary for organization ${organizationId}`);

      const organization = await Organization.findById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      const properties = await Property.find({ organization: organizationId, status: 'active' });
      const propertyIds = properties.map(p => p._id);

      // Get cross-property analytics
      const analytics = await this.getCrossPropertyAnalytics(
        organizationId,
        undefined,
        TimeRange.THIS_MONTH
      );

      // Get upcoming bookings
      const upcomingBookings = await Booking.countDocuments({
        property: { $in: propertyIds },
        checkIn: { $gte: new Date() },
        status: { $in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] }
      });

      return {
        organization: {
          id: organization._id,
          name: organization.name,
          type: organization.type,
          subscription: organization.subscription.plan
        },
        properties: {
          total: properties.length,
          active: properties.filter(p => p.status === 'active').length
        },
        analytics: {
          totalRevenue: analytics.totalRevenue,
          averageOccupancy: analytics.averageOccupancy,
          totalRooms: analytics.totalRooms
        },
        upcomingBookings
      };
    } catch (error) {
      logger.error('[MultiProperty] Error getting organization summary:', error);
      throw error;
    }
  }
}

export default new MultiPropertyService();

import Booking, { BookingStatus, BookingChannel } from '../models/Booking';
import Property, { PropertyStatus } from '../models/Property';
import Calendar, { CalendarStatus } from '../models/Calendar';
import { logger } from '../config/logger';
import mongoose from 'mongoose';

/**
 * Analytics time range options
 */
export enum TimeRange {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_YEAR = 'this_year',
  CUSTOM = 'custom'
}

/**
 * Revenue breakdown interface
 */
export interface RevenueBreakdown {
  total: number;
  byChannel: Record<BookingChannel, number>;
  byStatus: Record<BookingStatus, number>;
  byProperty: Array<{ propertyId: string; propertyName: string; revenue: number }>;
  currency: string;
}

/**
 * Occupancy metrics interface
 */
export interface OccupancyMetrics {
  occupancyRate: number; // Percentage
  totalNights: number;
  bookedNights: number;
  availableNights: number;
  byProperty: Array<{
    propertyId: string;
    propertyName: string;
    occupancyRate: number;
    bookedNights: number;
    totalNights: number;
  }>;
}

/**
 * Booking statistics interface
 */
export interface BookingStatistics {
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  pendingBookings: number;
  cancellationRate: number; // Percentage
  averageBookingValue: number;
  averageStayDuration: number; // In nights
  byChannel: Record<BookingChannel, number>;
  currency: string;
}

/**
 * Trend data point interface
 */
export interface TrendDataPoint {
  date: string; // ISO date string
  value: number;
  label?: string;
}

/**
 * Analytics Service
 * Provides comprehensive analytics and reporting functionality
 */
class AnalyticsService {
  /**
   * Get date range based on TimeRange enum
   */
  private getDateRange(range: TimeRange, customStart?: Date, customEnd?: Date): { startDate: Date; endDate: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate: Date;
    let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (range) {
      case TimeRange.TODAY:
        startDate = today;
        break;

      case TimeRange.YESTERDAY:
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 1);
        endDate = new Date(today);
        endDate.setMilliseconds(endDate.getMilliseconds() - 1);
        break;

      case TimeRange.LAST_7_DAYS:
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 6);
        break;

      case TimeRange.LAST_30_DAYS:
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 29);
        break;

      case TimeRange.THIS_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;

      case TimeRange.LAST_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;

      case TimeRange.THIS_YEAR:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;

      case TimeRange.CUSTOM:
        if (!customStart || !customEnd) {
          throw new Error('Custom range requires start and end dates');
        }
        startDate = new Date(customStart);
        endDate = new Date(customEnd);
        break;

      default:
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 29);
    }

    return { startDate, endDate };
  }

  /**
   * Get revenue breakdown by various dimensions
   */
  async getRevenueBreakdown(
    range: TimeRange = TimeRange.LAST_30_DAYS,
    propertyId?: string,
    customStart?: Date,
    customEnd?: Date
  ): Promise<RevenueBreakdown> {
    try {
      const { startDate, endDate } = this.getDateRange(range, customStart, customEnd);

      logger.info(`[Analytics] Calculating revenue breakdown from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Build query
      const query: any = {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] }
      };

      if (propertyId) {
        query.property = new mongoose.Types.ObjectId(propertyId);
      }

      // Get all bookings in range
      const bookings = await Booking.find(query).populate('property', 'name');

      // Calculate total revenue
      const total = bookings.reduce((sum, booking) => sum + booking.pricing.total, 0);

      // Revenue by channel
      const byChannel: Record<BookingChannel, number> = {} as Record<BookingChannel, number>;
      Object.values(BookingChannel).forEach(channel => {
        byChannel[channel] = bookings
          .filter(b => b.channel === channel)
          .reduce((sum, b) => sum + b.pricing.total, 0);
      });

      // Revenue by status
      const byStatus: Record<BookingStatus, number> = {} as Record<BookingStatus, number>;
      Object.values(BookingStatus).forEach(status => {
        byStatus[status] = bookings
          .filter(b => b.status === status)
          .reduce((sum, b) => sum + b.pricing.total, 0);
      });

      // Revenue by property
      const propertyRevenue = new Map<string, { name: string; revenue: number }>();
      bookings.forEach(booking => {
        // Skip if property is null (deleted or not populated)
        if (!booking.property || !booking.property._id) {
          return;
        }

        const propId = booking.property._id.toString();
        const propName = (booking.property as any).name || 'Unknown Property';

        if (propertyRevenue.has(propId)) {
          propertyRevenue.get(propId)!.revenue += booking.pricing.total;
        } else {
          propertyRevenue.set(propId, { name: propName, revenue: booking.pricing.total });
        }
      });

      const byProperty = Array.from(propertyRevenue.entries())
        .map(([propertyId, data]) => ({
          propertyId,
          propertyName: data.name,
          revenue: data.revenue
        }))
        .sort((a, b) => b.revenue - a.revenue);

      // Determine currency (use most common or default to USD)
      const currency = bookings.length > 0 ? bookings[0].pricing.currency : 'USD';

      return {
        total,
        byChannel,
        byStatus,
        byProperty,
        currency
      };
    } catch (error) {
      logger.error('[Analytics] Error calculating revenue breakdown:', error);
      throw error;
    }
  }

  /**
   * Get occupancy metrics
   */
  async getOccupancyMetrics(
    range: TimeRange = TimeRange.LAST_30_DAYS,
    propertyId?: string,
    customStart?: Date,
    customEnd?: Date
  ): Promise<OccupancyMetrics> {
    try {
      const { startDate, endDate } = this.getDateRange(range, customStart, customEnd);

      logger.info(`[Analytics] Calculating occupancy metrics from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Build query
      const query: any = {
        date: { $gte: startDate, $lte: endDate }
      };

      if (propertyId) {
        query.property = new mongoose.Types.ObjectId(propertyId);
      }

      // Get all calendar entries in range
      const calendarEntries = await Calendar.find(query).populate('property', 'name');

      const totalNights = calendarEntries.length;
      const bookedNights = calendarEntries.filter(entry => entry.status === CalendarStatus.BOOKED).length;
      const availableNights = totalNights - bookedNights;
      const occupancyRate = totalNights > 0 ? (bookedNights / totalNights) * 100 : 0;

      // Occupancy by property
      const propertyOccupancy = new Map<string, { name: string; booked: number; total: number }>();

      calendarEntries.forEach(entry => {
        const propId = entry.property.toString();
        const propName = (entry.property as any).name || 'Unknown Property';

        if (propertyOccupancy.has(propId)) {
          const data = propertyOccupancy.get(propId)!;
          data.total++;
          if (entry.status === CalendarStatus.BOOKED) {
            data.booked++;
          }
        } else {
          propertyOccupancy.set(propId, {
            name: propName,
            booked: entry.status === CalendarStatus.BOOKED ? 1 : 0,
            total: 1
          });
        }
      });

      const byProperty = Array.from(propertyOccupancy.entries())
        .map(([propertyId, data]) => ({
          propertyId,
          propertyName: data.name,
          occupancyRate: data.total > 0 ? (data.booked / data.total) * 100 : 0,
          bookedNights: data.booked,
          totalNights: data.total
        }))
        .sort((a, b) => b.occupancyRate - a.occupancyRate);

      return {
        occupancyRate: parseFloat(occupancyRate.toFixed(2)),
        totalNights,
        bookedNights,
        availableNights,
        byProperty
      };
    } catch (error) {
      logger.error('[Analytics] Error calculating occupancy metrics:', error);
      throw error;
    }
  }

  /**
   * Get booking statistics
   */
  async getBookingStatistics(
    range: TimeRange = TimeRange.LAST_30_DAYS,
    propertyId?: string,
    customStart?: Date,
    customEnd?: Date
  ): Promise<BookingStatistics> {
    try {
      const { startDate, endDate } = this.getDateRange(range, customStart, customEnd);

      logger.info(`[Analytics] Calculating booking statistics from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Build query
      const query: any = {
        createdAt: { $gte: startDate, $lte: endDate }
      };

      if (propertyId) {
        query.property = new mongoose.Types.ObjectId(propertyId);
      }

      // Get all bookings in range
      const bookings = await Booking.find(query);

      const totalBookings = bookings.length;
      const confirmedBookings = bookings.filter(b => b.status === BookingStatus.CONFIRMED).length;
      const cancelledBookings = bookings.filter(b => b.status === BookingStatus.CANCELLED).length;
      const pendingBookings = bookings.filter(b => b.status === BookingStatus.PENDING).length;

      const cancellationRate = totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0;

      // Average booking value (only confirmed/checked-in/checked-out)
      const revenueBookings = bookings.filter(b =>
        [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT].includes(b.status)
      );
      const totalRevenue = revenueBookings.reduce((sum, b) => sum + b.pricing.total, 0);
      const averageBookingValue = revenueBookings.length > 0 ? totalRevenue / revenueBookings.length : 0;

      // Average stay duration
      const totalNights = bookings.reduce((sum, booking) => {
        const nights = Math.ceil((booking.checkOut.getTime() - booking.checkIn.getTime()) / (1000 * 60 * 60 * 24));
        return sum + nights;
      }, 0);
      const averageStayDuration = bookings.length > 0 ? totalNights / bookings.length : 0;

      // Bookings by channel
      const byChannel: Record<BookingChannel, number> = {} as Record<BookingChannel, number>;
      Object.values(BookingChannel).forEach(channel => {
        byChannel[channel] = bookings.filter(b => b.channel === channel).length;
      });

      const currency = bookings.length > 0 ? bookings[0].pricing.currency : 'USD';

      return {
        totalBookings,
        confirmedBookings,
        cancelledBookings,
        pendingBookings,
        cancellationRate: parseFloat(cancellationRate.toFixed(2)),
        averageBookingValue: parseFloat(averageBookingValue.toFixed(2)),
        averageStayDuration: parseFloat(averageStayDuration.toFixed(2)),
        byChannel,
        currency
      };
    } catch (error) {
      logger.error('[Analytics] Error calculating booking statistics:', error);
      throw error;
    }
  }

  /**
   * Get revenue trend (daily data points)
   */
  async getRevenueTrend(
    range: TimeRange = TimeRange.LAST_30_DAYS,
    propertyId?: string,
    customStart?: Date,
    customEnd?: Date
  ): Promise<TrendDataPoint[]> {
    try {
      const { startDate, endDate } = this.getDateRange(range, customStart, customEnd);

      logger.info(`[Analytics] Calculating revenue trend from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Build query
      const matchQuery: any = {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] }
      };

      if (propertyId) {
        matchQuery.property = new mongoose.Types.ObjectId(propertyId);
      }

      // Aggregate by day
      const dailyRevenue = await Booking.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            revenue: { $sum: '$pricing.total' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]);

      return dailyRevenue.map(item => ({
        date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
        value: parseFloat(item.revenue.toFixed(2)),
        label: `${item._id.month}/${item._id.day}`
      }));
    } catch (error) {
      logger.error('[Analytics] Error calculating revenue trend:', error);
      throw error;
    }
  }

  /**
   * Get occupancy trend (daily data points)
   */
  async getOccupancyTrend(
    range: TimeRange = TimeRange.LAST_30_DAYS,
    propertyId?: string,
    customStart?: Date,
    customEnd?: Date
  ): Promise<TrendDataPoint[]> {
    try {
      const { startDate, endDate } = this.getDateRange(range, customStart, customEnd);

      logger.info(`[Analytics] Calculating occupancy trend from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Build query
      const matchQuery: any = {
        date: { $gte: startDate, $lte: endDate }
      };

      if (propertyId) {
        matchQuery.property = new mongoose.Types.ObjectId(propertyId);
      }

      // Aggregate by day
      const dailyOccupancy = await Calendar.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' },
              day: { $dayOfMonth: '$date' }
            },
            total: { $sum: 1 },
            booked: {
              $sum: {
                $cond: [{ $eq: ['$status', CalendarStatus.BOOKED] }, 1, 0]
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            occupancyRate: {
              $cond: [
                { $gt: ['$total', 0] },
                { $multiply: [{ $divide: ['$booked', '$total'] }, 100] },
                0
              ]
            }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]);

      return dailyOccupancy.map(item => ({
        date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
        value: parseFloat(item.occupancyRate.toFixed(2)),
        label: `${item._id.month}/${item._id.day}`
      }));
    } catch (error) {
      logger.error('[Analytics] Error calculating occupancy trend:', error);
      throw error;
    }
  }

  /**
   * Get dashboard summary (overview metrics)
   */
  async getDashboardSummary(propertyId?: string) {
    try {
      logger.info(`[Analytics] Generating dashboard summary`);

      const [
        revenueToday,
        revenueThisMonth,
        occupancyLast30Days,
        bookingStatsLast30Days,
        activeProperties,
        upcomingBookings
      ] = await Promise.all([
        this.getRevenueBreakdown(TimeRange.TODAY, propertyId),
        this.getRevenueBreakdown(TimeRange.THIS_MONTH, propertyId),
        this.getOccupancyMetrics(TimeRange.LAST_30_DAYS, propertyId),
        this.getBookingStatistics(TimeRange.LAST_30_DAYS, propertyId),
        Property.countDocuments(propertyId ? { _id: propertyId, status: PropertyStatus.ACTIVE } : { status: PropertyStatus.ACTIVE }),
        Booking.countDocuments({
          checkIn: { $gte: new Date() },
          status: { $in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
          ...(propertyId && { property: new mongoose.Types.ObjectId(propertyId) })
        })
      ]);

      return {
        revenue: {
          today: revenueToday.total,
          thisMonth: revenueThisMonth.total,
          currency: revenueToday.currency
        },
        occupancy: {
          rate: occupancyLast30Days.occupancyRate,
          bookedNights: occupancyLast30Days.bookedNights,
          totalNights: occupancyLast30Days.totalNights
        },
        bookings: {
          total: bookingStatsLast30Days.totalBookings,
          confirmed: bookingStatsLast30Days.confirmedBookings,
          cancelled: bookingStatsLast30Days.cancelledBookings,
          cancellationRate: bookingStatsLast30Days.cancellationRate,
          averageValue: bookingStatsLast30Days.averageBookingValue
        },
        properties: {
          active: activeProperties,
          total: await Property.countDocuments(propertyId ? { _id: propertyId } : {})
        },
        upcomingBookings
      };
    } catch (error) {
      logger.error('[Analytics] Error generating dashboard summary:', error);
      throw error;
    }
  }
}

export default new AnalyticsService();

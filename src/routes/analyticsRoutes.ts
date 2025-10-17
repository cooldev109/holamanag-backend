import { Router, Request, Response } from 'express';
import analyticsService from '../services/AnalyticsService';
import { TimeRange } from '../services/AnalyticsService';
import { authenticate } from '../middleware/auth';
import { logger } from '../config/logger';

const router = Router();

// Apply authentication to all analytics routes
router.use(authenticate);

/**
 * GET /api/v1/analytics/revenue
 * Get revenue breakdown by channel, status, and property
 *
 * Query params:
 * - range: TimeRange (today, yesterday, last_7_days, last_30_days, this_month, last_month, this_year, custom)
 * - propertyId: Optional property filter
 * - startDate: Required if range=custom
 * - endDate: Required if range=custom
 */
router.get('/revenue', async (req: Request, res: Response) => {
  try {
    const { range = TimeRange.LAST_30_DAYS, propertyId, startDate, endDate } = req.query;

    // Validate time range
    if (!Object.values(TimeRange).includes(range as TimeRange)) {
      return res.status(400).json({
        success: false,
        error: `Invalid time range. Must be one of: ${Object.values(TimeRange).join(', ')}`
      });
    }

    // Validate custom range
    if (range === TimeRange.CUSTOM && (!startDate || !endDate)) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required for custom time range'
      });
    }

    logger.info(`[Analytics] Getting revenue breakdown for range: ${range}, propertyId: ${propertyId || 'all'}`);

    const revenueBreakdown = await analyticsService.getRevenueBreakdown(
      range as TimeRange,
      propertyId as string | undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    return res.json({
      success: true,
      data: revenueBreakdown,
      metadata: {
        range,
        propertyId: propertyId || null,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('[Analytics] Error getting revenue breakdown:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve revenue breakdown',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/analytics/occupancy
 * Get occupancy metrics and rates
 *
 * Query params:
 * - range: TimeRange
 * - propertyId: Optional property filter
 * - startDate: Required if range=custom
 * - endDate: Required if range=custom
 */
router.get('/occupancy', async (req: Request, res: Response) => {
  try {
    const { range = TimeRange.LAST_30_DAYS, propertyId, startDate, endDate } = req.query;

    // Validate time range
    if (!Object.values(TimeRange).includes(range as TimeRange)) {
      return res.status(400).json({
        success: false,
        error: `Invalid time range. Must be one of: ${Object.values(TimeRange).join(', ')}`
      });
    }

    // Validate custom range
    if (range === TimeRange.CUSTOM && (!startDate || !endDate)) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required for custom time range'
      });
    }

    logger.info(`[Analytics] Getting occupancy metrics for range: ${range}, propertyId: ${propertyId || 'all'}`);

    const occupancyMetrics = await analyticsService.getOccupancyMetrics(
      range as TimeRange,
      propertyId as string | undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    return res.json({
      success: true,
      data: occupancyMetrics,
      metadata: {
        range,
        propertyId: propertyId || null,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('[Analytics] Error getting occupancy metrics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve occupancy metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/analytics/bookings
 * Get booking statistics
 *
 * Query params:
 * - range: TimeRange
 * - propertyId: Optional property filter
 * - startDate: Required if range=custom
 * - endDate: Required if range=custom
 */
router.get('/bookings', async (req: Request, res: Response) => {
  try {
    const { range = TimeRange.LAST_30_DAYS, propertyId, startDate, endDate } = req.query;

    // Validate time range
    if (!Object.values(TimeRange).includes(range as TimeRange)) {
      return res.status(400).json({
        success: false,
        error: `Invalid time range. Must be one of: ${Object.values(TimeRange).join(', ')}`
      });
    }

    // Validate custom range
    if (range === TimeRange.CUSTOM && (!startDate || !endDate)) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required for custom time range'
      });
    }

    logger.info(`[Analytics] Getting booking statistics for range: ${range}, propertyId: ${propertyId || 'all'}`);

    const bookingStats = await analyticsService.getBookingStatistics(
      range as TimeRange,
      propertyId as string | undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    return res.json({
      success: true,
      data: bookingStats,
      metadata: {
        range,
        propertyId: propertyId || null,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('[Analytics] Error getting booking statistics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve booking statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/analytics/trends/revenue
 * Get revenue trend data points over time
 *
 * Query params:
 * - range: TimeRange
 * - propertyId: Optional property filter
 * - startDate: Required if range=custom
 * - endDate: Required if range=custom
 */
router.get('/trends/revenue', async (req: Request, res: Response) => {
  try {
    const { range = TimeRange.LAST_30_DAYS, propertyId, startDate, endDate } = req.query;

    // Validate time range
    if (!Object.values(TimeRange).includes(range as TimeRange)) {
      return res.status(400).json({
        success: false,
        error: `Invalid time range. Must be one of: ${Object.values(TimeRange).join(', ')}`
      });
    }

    // Validate custom range
    if (range === TimeRange.CUSTOM && (!startDate || !endDate)) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required for custom time range'
      });
    }

    logger.info(`[Analytics] Getting revenue trend for range: ${range}, propertyId: ${propertyId || 'all'}`);

    const revenueTrend = await analyticsService.getRevenueTrend(
      range as TimeRange,
      propertyId as string | undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    return res.json({
      success: true,
      data: revenueTrend,
      metadata: {
        range,
        propertyId: propertyId || null,
        dataPoints: revenueTrend.length,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('[Analytics] Error getting revenue trend:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve revenue trend',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/analytics/trends/occupancy
 * Get occupancy trend data points over time
 *
 * Query params:
 * - range: TimeRange
 * - propertyId: Optional property filter
 * - startDate: Required if range=custom
 * - endDate: Required if range=custom
 */
router.get('/trends/occupancy', async (req: Request, res: Response) => {
  try {
    const { range = TimeRange.LAST_30_DAYS, propertyId, startDate, endDate } = req.query;

    // Validate time range
    if (!Object.values(TimeRange).includes(range as TimeRange)) {
      return res.status(400).json({
        success: false,
        error: `Invalid time range. Must be one of: ${Object.values(TimeRange).join(', ')}`
      });
    }

    // Validate custom range
    if (range === TimeRange.CUSTOM && (!startDate || !endDate)) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required for custom time range'
      });
    }

    logger.info(`[Analytics] Getting occupancy trend for range: ${range}, propertyId: ${propertyId || 'all'}`);

    const occupancyTrend = await analyticsService.getOccupancyTrend(
      range as TimeRange,
      propertyId as string | undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    return res.json({
      success: true,
      data: occupancyTrend,
      metadata: {
        range,
        propertyId: propertyId || null,
        dataPoints: occupancyTrend.length,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('[Analytics] Error getting occupancy trend:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve occupancy trend',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/analytics/dashboard
 * Get comprehensive dashboard summary with all key metrics
 *
 * Query params:
 * - propertyId: Optional property filter
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.query;

    logger.info(`[Analytics] Getting dashboard summary for propertyId: ${propertyId || 'all'}`);

    const dashboardData = await analyticsService.getDashboardSummary(
      propertyId as string | undefined
    );

    return res.json({
      success: true,
      data: dashboardData,
      metadata: {
        propertyId: propertyId || null,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('[Analytics] Error getting dashboard summary:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/analytics/export/revenue
 * Export revenue data to CSV format
 *
 * Query params:
 * - range: TimeRange
 * - propertyId: Optional property filter
 * - startDate: Required if range=custom
 * - endDate: Required if range=custom
 * - format: csv (default)
 */
router.get('/export/revenue', async (req: Request, res: Response) => {
  try {
    const { range = TimeRange.LAST_30_DAYS, propertyId, startDate, endDate, format = 'csv' } = req.query;

    if (format !== 'csv') {
      return res.status(400).json({
        success: false,
        error: 'Only CSV format is currently supported'
      });
    }

    logger.info(`[Analytics] Exporting revenue data for range: ${range}, propertyId: ${propertyId || 'all'}`);

    const revenueBreakdown = await analyticsService.getRevenueBreakdown(
      range as TimeRange,
      propertyId as string | undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    // Generate CSV
    const csvRows: string[] = [];
    csvRows.push('Metric,Value,Currency');
    csvRows.push(`Total Revenue,${revenueBreakdown.total},${revenueBreakdown.currency}`);
    csvRows.push('');
    csvRows.push('Channel,Revenue');
    Object.entries(revenueBreakdown.byChannel).forEach(([channel, revenue]) => {
      csvRows.push(`${channel},${revenue}`);
    });
    csvRows.push('');
    csvRows.push('Status,Revenue');
    Object.entries(revenueBreakdown.byStatus).forEach(([status, revenue]) => {
      csvRows.push(`${status},${revenue}`);
    });
    csvRows.push('');
    csvRows.push('Property,Revenue');
    revenueBreakdown.byProperty.forEach((item) => {
      csvRows.push(`${item.propertyName},${item.revenue}`);
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="revenue_report_${range}_${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error) {
    logger.error('[Analytics] Error exporting revenue data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to export revenue data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/analytics/export/occupancy
 * Export occupancy data to CSV format
 *
 * Query params:
 * - range: TimeRange
 * - propertyId: Optional property filter
 * - startDate: Required if range=custom
 * - endDate: Required if range=custom
 * - format: csv (default)
 */
router.get('/export/occupancy', async (req: Request, res: Response) => {
  try {
    const { range = TimeRange.LAST_30_DAYS, propertyId, startDate, endDate, format = 'csv' } = req.query;

    if (format !== 'csv') {
      return res.status(400).json({
        success: false,
        error: 'Only CSV format is currently supported'
      });
    }

    logger.info(`[Analytics] Exporting occupancy data for range: ${range}, propertyId: ${propertyId || 'all'}`);

    const occupancyMetrics = await analyticsService.getOccupancyMetrics(
      range as TimeRange,
      propertyId as string | undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    // Generate CSV
    const csvRows: string[] = [];
    csvRows.push('Metric,Value');
    csvRows.push(`Occupancy Rate,${occupancyMetrics.occupancyRate.toFixed(2)}%`);
    csvRows.push(`Total Nights,${occupancyMetrics.totalNights}`);
    csvRows.push(`Booked Nights,${occupancyMetrics.bookedNights}`);
    csvRows.push(`Available Nights,${occupancyMetrics.availableNights}`);
    csvRows.push('');
    csvRows.push('Property,Occupancy Rate,Booked Nights,Total Nights');
    occupancyMetrics.byProperty.forEach((item) => {
      csvRows.push(`${item.propertyName},${item.occupancyRate.toFixed(2)}%,${item.bookedNights},${item.totalNights}`);
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="occupancy_report_${range}_${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error) {
    logger.error('[Analytics] Error exporting occupancy data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to export occupancy data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

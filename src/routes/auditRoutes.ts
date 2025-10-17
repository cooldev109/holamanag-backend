import { Router } from 'express';
import auditService from '../services/auditService';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler, createError } from '../utils/errors';
import { Request, Response } from 'express';
import { Role } from '../models/User';

const router = Router();

// Apply authentication to all audit routes
router.use(authenticate);

// Get audit logs with filtering and pagination
router.get('/logs', 
  authorize(['superadmin', 'admin'] as Role[]),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      userId,
      action,
      resource,
      resourceId,
      propertyId,
      bookingId,
      ratePlanId,
      calendarId,
      channelId,
      startDate,
      endDate,
      ipAddress,
      page = 1,
      limit = 50,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    const filters: any = {};

    if (userId) filters.userId = userId as string;
    if (action) filters.action = action as string;
    if (resource) filters.resource = resource as string;
    if (resourceId) filters.resourceId = resourceId as string;
    if (propertyId) filters.propertyId = propertyId as string;
    if (bookingId) filters.bookingId = bookingId as string;
    if (ratePlanId) filters.ratePlanId = ratePlanId as string;
    if (calendarId) filters.calendarId = calendarId as string;
    if (channelId) filters.channelId = channelId as string;
    if (ipAddress) filters.ipAddress = ipAddress as string;
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (page) filters.page = parseInt(page as string);
    if (limit) filters.limit = parseInt(limit as string);
    if (sortBy) filters.sortBy = sortBy as string;
    if (sortOrder) filters.sortOrder = sortOrder as 'asc' | 'desc';

    const result = await auditService.getAuditLogs(filters);

    res.status(200).json({
      success: true,
      message: 'Audit logs retrieved successfully',
      data: result
    });
  })
);

// Get audit statistics
router.get('/statistics', 
  authorize(['superadmin', 'admin'] as Role[]),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      startDate,
      endDate,
      userId,
      propertyId
    } = req.query;

    const filters: any = {};

    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (userId) filters.userId = userId as string;
    if (propertyId) filters.propertyId = propertyId as string;

    const statistics = await auditService.getAuditStatistics(filters);

    res.status(200).json({
      success: true,
      message: 'Audit statistics retrieved successfully',
      data: statistics
    });
  })
);

// Export audit logs
router.get('/export', 
  authorize(['superadmin'] as Role[]),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      startDate,
      endDate,
      userId,
      action,
      resource,
      format = 'json'
    } = req.query;

    const filters: any = {};

    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (userId) filters.userId = userId as string;
    if (action) filters.action = action as string;
    if (resource) filters.resource = resource as string;
    if (format) filters.format = format as 'json' | 'csv';

    const exportData = await auditService.exportAuditLogs(filters);

    // Set appropriate headers based on format
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"');
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.json"');
    }

    res.status(200).send(exportData);
  })
);

// Get audit log by ID
router.get('/logs/:logId', 
  authorize(['superadmin', 'admin'] as Role[]),
  asyncHandler(async (req: Request, res: Response) => {
    const { logId } = req.params;

    if (!logId) {
      throw createError.validation('Log ID is required');
    }

    // Get single log by ID
    const { logs } = await auditService.getAuditLogs({
      resourceId: logId,
      limit: 1
    });

    if (logs.length === 0) {
      throw createError.notFound('Audit log not found');
    }

    res.status(200).json({
      success: true,
      message: 'Audit log retrieved successfully',
      data: logs[0]
    });
  })
);

// Get audit logs for specific user
router.get('/users/:userId/logs', 
  authorize(['superadmin', 'admin'] as Role[]),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const {
      startDate,
      endDate,
      action,
      resource,
      page = 1,
      limit = 50
    } = req.query;

    const filters: any = {
      userId
    };

    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (action) filters.action = action as string;
    if (resource) filters.resource = resource as string;
    if (page) filters.page = parseInt(page as string);
    if (limit) filters.limit = parseInt(limit as string);

    const result = await auditService.getAuditLogs(filters);

    res.status(200).json({
      success: true,
      message: 'User audit logs retrieved successfully',
      data: result
    });
  })
);

// Get audit logs for specific property
router.get('/properties/:propertyId/logs', 
  authorize(['superadmin', 'admin', 'supervisor'] as Role[]),
  asyncHandler(async (req: Request, res: Response) => {
    const { propertyId } = req.params;
    const {
      startDate,
      endDate,
      action,
      resource,
      page = 1,
      limit = 50
    } = req.query;

    const filters: any = {
      propertyId
    };

    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (action) filters.action = action as string;
    if (resource) filters.resource = resource as string;
    if (page) filters.page = parseInt(page as string);
    if (limit) filters.limit = parseInt(limit as string);

    const result = await auditService.getAuditLogs(filters);

    res.status(200).json({
      success: true,
      message: 'Property audit logs retrieved successfully',
      data: result
    });
  })
);

// Get audit logs for specific booking
router.get('/bookings/:bookingId/logs', 
  authorize(['superadmin', 'admin', 'supervisor'] as Role[]),
  asyncHandler(async (req: Request, res: Response) => {
    const { bookingId } = req.params;
    const {
      startDate,
      endDate,
      action,
      page = 1,
      limit = 50
    } = req.query;

    const filters: any = {
      bookingId
    };

    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (action) filters.action = action as string;
    if (page) filters.page = parseInt(page as string);
    if (limit) filters.limit = parseInt(limit as string);

    const result = await auditService.getAuditLogs(filters);

    res.status(200).json({
      success: true,
      message: 'Booking audit logs retrieved successfully',
      data: result
    });
  })
);

// Cleanup old audit logs (superadmin only)
router.delete('/cleanup', 
  authorize(['superadmin'] as Role[]),
  asyncHandler(async (req: Request, res: Response) => {
    const { olderThanDays = 365 } = req.body;

    if (olderThanDays < 30) {
      throw createError.validation('Cannot delete logs newer than 30 days');
    }

    const deletedCount = await auditService.deleteOldAuditLogs(olderThanDays);

    res.status(200).json({
      success: true,
      message: `Cleaned up ${deletedCount} old audit logs`,
      data: {
        deletedCount,
        olderThanDays
      }
    });
  })
);

// Get available audit actions and resources
router.get('/metadata',
  authorize(['superadmin', 'admin'] as Role[]),
  asyncHandler(async (_req: Request, res: Response) => {
    const actions = [
      'LOGIN', 'LOGOUT', 'REGISTER', 'PASSWORD_RESET', 'PASSWORD_CHANGE',
      'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_STATUS_CHANGED',
      'PROPERTY_CREATED', 'PROPERTY_UPDATED', 'PROPERTY_DELETED', 'PROPERTY_STATUS_CHANGED',
      'BOOKING_CREATED', 'BOOKING_UPDATED', 'BOOKING_CANCELLED', 'BOOKING_CHECKED_IN', 'BOOKING_CHECKED_OUT',
      'RATE_PLAN_CREATED', 'RATE_PLAN_UPDATED', 'RATE_PLAN_DELETED',
      'CALENDAR_UPDATED', 'CALENDAR_BLOCKED', 'CALENDAR_SYNCED',
      'CHANNEL_CONNECTED', 'CHANNEL_DISCONNECTED', 'CHANNEL_SYNCED', 'CHANNEL_ERROR',
      'FILE_UPLOADED', 'FILE_DELETED', 'FILE_DOWNLOADED',
      'SYSTEM_ERROR', 'CONFIGURATION_CHANGED', 'API_ACCESS', 'API_ERROR'
    ];

    const resources = [
      'USER', 'PROPERTY', 'BOOKING', 'RATE_PLAN', 'CALENDAR', 'CHANNEL', 'FILE', 'SYSTEM', 'API', 'AUTHENTICATION'
    ];

    res.status(200).json({
      success: true,
      message: 'Audit metadata retrieved successfully',
      data: {
        actions,
        resources
      }
    });
  })
);

export default router;

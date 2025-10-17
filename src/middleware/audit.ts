import { Request, Response, NextFunction } from 'express';
import auditService from '../services/auditService';
import { AuditLogError } from '../utils/errors';
import { logger } from '../config/logger';

// Audit middleware to automatically log API requests
export const auditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const originalSend = res.send;

  // Override res.send to capture response data
  res.send = function(body: any) {
    const responseTime = Date.now() - startTime;
    
    // Log audit event asynchronously (don't block response)
    setImmediate(async () => {
      try {
        await auditService.logAuditEvent({
          action: getActionFromRequest(req),
          resource: getResourceFromRequest(req),
          resourceId: getResourceIdFromRequest(req),
          userId: (req as any).user?.id,
          userEmail: (req as any).user?.email,
          userRoles: (req as any).user?.roles,
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          method: req.method,
          url: req.originalUrl,
          requestBody: req.method !== 'GET' ? req.body : undefined,
          responseStatus: res.statusCode,
          responseTime,
          errorMessage: res.statusCode >= 400 ? body?.message || 'Request failed' : undefined,
          metadata: {
            query: req.query,
            params: req.params,
            headers: sanitizeHeaders(req.headers)
          },
          sessionId: (req as any).sessionID,
          ...extractResourceIds(req)
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to log audit event:', {
          error: errorMessage,
          url: req.originalUrl,
          method: req.method,
          userId: (req as any).user?.id
        });
      }
    });

    return originalSend.call(this, body);
  };

  next();
};

// Helper function to determine action from request
function getActionFromRequest(req: Request): string {
  const method = req.method;
  const url = req.originalUrl.toLowerCase();

  // Authentication actions
  if (url.includes('/auth/login')) return 'LOGIN';
  if (url.includes('/auth/logout')) return 'LOGOUT';
  if (url.includes('/auth/register')) return 'REGISTER';
  if (url.includes('/auth/refresh')) return 'TOKEN_REFRESH';
  if (url.includes('/auth/password-reset')) return 'PASSWORD_RESET';
  if (url.includes('/auth/change-password')) return 'PASSWORD_CHANGE';

  // CRUD operations
  if (method === 'POST') {
    if (url.includes('/users')) return 'USER_CREATED';
    if (url.includes('/properties')) return 'PROPERTY_CREATED';
    if (url.includes('/bookings')) return 'BOOKING_CREATED';
    if (url.includes('/rate-plans')) return 'RATE_PLAN_CREATED';
    if (url.includes('/calendar')) return 'CALENDAR_UPDATED';
    if (url.includes('/channels')) return 'CHANNEL_CONNECTED';
    if (url.includes('/upload')) return 'FILE_UPLOADED';
    return 'RESOURCE_CREATED';
  }

  if (method === 'PUT' || method === 'PATCH') {
    if (url.includes('/users')) return 'USER_UPDATED';
    if (url.includes('/properties')) return 'PROPERTY_UPDATED';
    if (url.includes('/bookings')) {
      if (url.includes('/cancel')) return 'BOOKING_CANCELLED';
      if (url.includes('/check-in')) return 'BOOKING_CHECKED_IN';
      if (url.includes('/check-out')) return 'BOOKING_CHECKED_OUT';
      return 'BOOKING_UPDATED';
    }
    if (url.includes('/rate-plans')) return 'RATE_PLAN_UPDATED';
    if (url.includes('/calendar')) {
      if (url.includes('/block')) return 'CALENDAR_BLOCKED';
      if (url.includes('/unblock')) return 'CALENDAR_UNBLOCKED';
      return 'CALENDAR_UPDATED';
    }
    if (url.includes('/channels')) return 'CHANNEL_SETTINGS_UPDATED';
    return 'RESOURCE_UPDATED';
  }

  if (method === 'DELETE') {
    if (url.includes('/users')) return 'USER_DELETED';
    if (url.includes('/properties')) return 'PROPERTY_DELETED';
    if (url.includes('/bookings')) return 'BOOKING_DELETED';
    if (url.includes('/rate-plans')) return 'RATE_PLAN_DELETED';
    if (url.includes('/calendar')) return 'CALENDAR_DELETED';
    if (url.includes('/channels')) return 'CHANNEL_DISCONNECTED';
    if (url.includes('/upload')) return 'FILE_DELETED';
    return 'RESOURCE_DELETED';
  }

  if (method === 'GET') {
    if (url.includes('/export')) return 'DATA_EXPORTED';
    if (url.includes('/download')) return 'FILE_DOWNLOADED';
    return 'API_ACCESS';
  }

  return 'API_ACCESS';
}

// Helper function to determine resource type from request
function getResourceFromRequest(req: Request): string {
  const url = req.originalUrl.toLowerCase();

  if (url.includes('/auth')) return 'AUTHENTICATION';
  if (url.includes('/users')) return 'USER';
  if (url.includes('/properties')) return 'PROPERTY';
  if (url.includes('/bookings')) return 'BOOKING';
  if (url.includes('/rate-plans')) return 'RATE_PLAN';
  if (url.includes('/calendar')) return 'CALENDAR';
  if (url.includes('/channels')) return 'CHANNEL';
  if (url.includes('/upload') || url.includes('/files')) return 'FILE';
  if (url.includes('/health') || url.includes('/system')) return 'SYSTEM';
  if (url.includes('/email')) return 'EMAIL';

  return 'API';
}

// Helper function to extract resource ID from request
function getResourceIdFromRequest(req: Request): string {
  // Try to get ID from params
  if (req.params.id) return req.params.id;
  if (req.params.propertyId) return req.params.propertyId;
  if (req.params.bookingId) return req.params.bookingId;
  if (req.params.ratePlanId) return req.params.ratePlanId;
  if (req.params.calendarId) return req.params.calendarId;
  if (req.params.channelId) return req.params.channelId;
  if (req.params.userId) return req.params.userId;

  // Try to get ID from body
  if (req.body && req.body.id) return req.body.id;
  if (req.body && req.body._id) return req.body._id;

  // Try to get ID from query
  if (req.query.id) return req.query.id as string;

  // Generate a unique identifier for the request
  return `${req.method}_${req.originalUrl}_${Date.now()}`;
}

// Helper function to extract resource IDs for specific tracking
function extractResourceIds(req: Request): {
  propertyId?: string;
  bookingId?: string;
  ratePlanId?: string;
  calendarId?: string;
  channelId?: string;
} {
  const result: any = {};

  // Extract from params
  if (req.params.propertyId) result.propertyId = req.params.propertyId;
  if (req.params.bookingId) result.bookingId = req.params.bookingId;
  if (req.params.ratePlanId) result.ratePlanId = req.params.ratePlanId;
  if (req.params.calendarId) result.calendarId = req.params.calendarId;
  if (req.params.channelId) result.channelId = req.params.channelId;

  // Extract from body
  if (req.body) {
    if (req.body.propertyId || req.body.property) result.propertyId = req.body.propertyId || req.body.property;
    if (req.body.bookingId || req.body.booking) result.bookingId = req.body.bookingId || req.body.booking;
    if (req.body.ratePlanId || req.body.ratePlan) result.ratePlanId = req.body.ratePlanId || req.body.ratePlan;
    if (req.body.calendarId || req.body.calendar) result.calendarId = req.body.calendarId || req.body.calendar;
    if (req.body.channelId || req.body.channel) result.channelId = req.body.channelId || req.body.channel;
  }

  // Extract from query
  if (req.query.propertyId) result.propertyId = req.query.propertyId as string;
  if (req.query.bookingId) result.bookingId = req.query.bookingId as string;
  if (req.query.ratePlanId) result.ratePlanId = req.query.ratePlanId as string;
  if (req.query.calendarId) result.calendarId = req.query.calendarId as string;
  if (req.query.channelId) result.channelId = req.query.channelId as string;

  return result;
}

// Helper function to sanitize headers (remove sensitive information)
function sanitizeHeaders(headers: any): any {
  const sanitized = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];

  for (const header of sensitiveHeaders) {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  }

  return sanitized;
}

// Manual audit logging function for specific events
export const logAuditEvent = async (
  action: string,
  resource: string,
  resourceId: string,
  req: Request,
  additionalData: {
    metadata?: any;
    errorMessage?: string;
    propertyId?: string;
    bookingId?: string;
    ratePlanId?: string;
    calendarId?: string;
    channelId?: string;
  } = {}
): Promise<void> => {
  try {
    await auditService.logAuditEvent({
      action,
      resource,
      resourceId,
      userId: (req as any).user?.id,
      userEmail: (req as any).user?.email,
      userRoles: (req as any).user?.roles,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      method: req.method,
      url: req.originalUrl,
      requestBody: req.method !== 'GET' ? req.body : undefined,
      metadata: additionalData.metadata,
      errorMessage: additionalData.errorMessage,
      sessionId: (req as any).sessionID,
      propertyId: additionalData.propertyId,
      bookingId: additionalData.bookingId,
      ratePlanId: additionalData.ratePlanId,
      calendarId: additionalData.calendarId,
      channelId: additionalData.channelId
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to log manual audit event:', {
      error: errorMessage,
      action,
      resource,
      resourceId,
      userId: (req as any).user?.id
    });
    throw new AuditLogError(`Failed to log audit event: ${errorMessage}`);
  }
};

// Audit logging for specific business events
export const auditLoggers = {
  // User events
  userCreated: (req: Request, userId: string, userEmail: string) =>
    logAuditEvent('USER_CREATED', 'USER', userId, req, { metadata: { userEmail } }),

  userUpdated: (req: Request, userId: string, changes: any) =>
    logAuditEvent('USER_UPDATED', 'USER', userId, req, { metadata: { changes } }),

  userDeleted: (req: Request, userId: string) =>
    logAuditEvent('USER_DELETED', 'USER', userId, req),

  userStatusChanged: (req: Request, userId: string, newStatus: string) =>
    logAuditEvent('USER_STATUS_CHANGED', 'USER', userId, req, { metadata: { newStatus } }),

  // Property events
  propertyCreated: (req: Request, propertyId: string, propertyName: string) =>
    logAuditEvent('PROPERTY_CREATED', 'PROPERTY', propertyId, req, { 
      propertyId, 
      metadata: { propertyName } 
    }),

  propertyUpdated: (req: Request, propertyId: string, changes: any) =>
    logAuditEvent('PROPERTY_UPDATED', 'PROPERTY', propertyId, req, { 
      propertyId, 
      metadata: { changes } 
    }),

  propertyDeleted: (req: Request, propertyId: string) =>
    logAuditEvent('PROPERTY_DELETED', 'PROPERTY', propertyId, req, { propertyId }),

  // Booking events
  bookingCreated: (req: Request, bookingId: string, propertyId: string, guestName: string) =>
    logAuditEvent('BOOKING_CREATED', 'BOOKING', bookingId, req, { 
      bookingId, 
      propertyId, 
      metadata: { guestName } 
    }),

  bookingCancelled: (req: Request, bookingId: string, propertyId: string, reason?: string) =>
    logAuditEvent('BOOKING_CANCELLED', 'BOOKING', bookingId, req, { 
      bookingId, 
      propertyId, 
      metadata: { reason } 
    }),

  bookingCheckedIn: (req: Request, bookingId: string, propertyId: string) =>
    logAuditEvent('BOOKING_CHECKED_IN', 'BOOKING', bookingId, req, { bookingId, propertyId }),

  bookingCheckedOut: (req: Request, bookingId: string, propertyId: string) =>
    logAuditEvent('BOOKING_CHECKED_OUT', 'BOOKING', bookingId, req, { bookingId, propertyId }),

  // Rate plan events
  ratePlanCreated: (req: Request, ratePlanId: string, propertyId: string, planName: string) =>
    logAuditEvent('RATE_PLAN_CREATED', 'RATE_PLAN', ratePlanId, req, { 
      ratePlanId, 
      propertyId, 
      metadata: { planName } 
    }),

  ratePlanUpdated: (req: Request, ratePlanId: string, propertyId: string, changes: any) =>
    logAuditEvent('RATE_PLAN_UPDATED', 'RATE_PLAN', ratePlanId, req, { 
      ratePlanId, 
      propertyId, 
      metadata: { changes } 
    }),

  // Calendar events
  calendarBlocked: (req: Request, calendarId: string, propertyId: string, dates: string[]) =>
    logAuditEvent('CALENDAR_BLOCKED', 'CALENDAR', calendarId, req, { 
      calendarId, 
      propertyId, 
      metadata: { dates } 
    }),

  calendarSynced: (req: Request, propertyId: string, channelId: string, syncType: string) =>
    logAuditEvent('CALENDAR_SYNCED', 'CALENDAR', propertyId, req, { 
      propertyId, 
      channelId, 
      metadata: { syncType } 
    }),

  // Channel events
  channelConnected: (req: Request, channelId: string, propertyId: string, channelType: string) =>
    logAuditEvent('CHANNEL_CONNECTED', 'CHANNEL', channelId, req, { 
      channelId, 
      propertyId, 
      metadata: { channelType } 
    }),

  channelDisconnected: (req: Request, channelId: string, propertyId: string) =>
    logAuditEvent('CHANNEL_DISCONNECTED', 'CHANNEL', channelId, req, { channelId, propertyId }),

  channelError: (req: Request, channelId: string, propertyId: string, error: string) =>
    logAuditEvent('CHANNEL_ERROR', 'CHANNEL', channelId, req, { 
      channelId, 
      propertyId, 
      errorMessage: error 
    }),

  // File events
  fileUploaded: (req: Request, fileName: string, fileType: string, fileSize: number) =>
    logAuditEvent('FILE_UPLOADED', 'FILE', fileName, req, { 
      metadata: { fileType, fileSize } 
    }),

  fileDeleted: (req: Request, fileName: string) =>
    logAuditEvent('FILE_DELETED', 'FILE', fileName, req),

  // System events
  systemError: (req: Request, error: string, component: string) =>
    logAuditEvent('SYSTEM_ERROR', 'SYSTEM', component, req, { 
      errorMessage: error, 
      metadata: { component } 
    }),

  configurationChanged: (req: Request, configKey: string, oldValue: any, newValue: any) =>
    logAuditEvent('CONFIGURATION_CHANGED', 'SYSTEM', configKey, req, { 
      metadata: { oldValue, newValue } 
    })
};

export default {
  auditMiddleware,
  logAuditEvent,
  auditLoggers
};

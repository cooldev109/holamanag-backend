import mongoose, { Schema, Document, Model } from 'mongoose';
import { AuditLogError } from '../utils/errors';
import { logger } from '../config/logger';

// Audit log interface
interface IAuditLog extends Document {
  action: string;
  resource: string;
  resourceId: string;
  userId?: string;
  userEmail?: string;
  userRoles?: string[];
  ipAddress: string;
  userAgent: string;
  method: string;
  url: string;
  requestBody?: any;
  responseStatus?: number;
  responseTime?: number;
  errorMessage?: string;
  metadata?: any;
  timestamp: Date;
  sessionId?: string;
  channel?: string;
  propertyId?: string;
  bookingId?: string;
  ratePlanId?: string;
  calendarId?: string;
  channelId?: string;
}

// Audit log schema
const auditLogSchema = new Schema<IAuditLog>({
  action: {
    type: String,
    required: true,
    enum: [
      // Authentication actions
      'LOGIN',
      'LOGOUT',
      'REGISTER',
      'TOKEN_REFRESH',
      'PASSWORD_RESET',
      'PASSWORD_CHANGE',
      'ACCOUNT_LOCKED',
      'ACCOUNT_UNLOCKED',
      
      // User management actions
      'USER_CREATED',
      'USER_UPDATED',
      'USER_DELETED',
      'USER_STATUS_CHANGED',
      'USER_ROLE_CHANGED',
      
      // Property management actions
      'PROPERTY_CREATED',
      'PROPERTY_UPDATED',
      'PROPERTY_DELETED',
      'PROPERTY_STATUS_CHANGED',
      'PROPERTY_IMAGE_UPLOADED',
      'PROPERTY_IMAGE_DELETED',
      
      // Booking management actions
      'BOOKING_CREATED',
      'BOOKING_UPDATED',
      'BOOKING_CANCELLED',
      'BOOKING_CHECKED_IN',
      'BOOKING_CHECKED_OUT',
      'BOOKING_STATUS_CHANGED',
      
      // Rate plan actions
      'RATE_PLAN_CREATED',
      'RATE_PLAN_UPDATED',
      'RATE_PLAN_DELETED',
      'RATE_PLAN_ACTIVATED',
      'RATE_PLAN_DEACTIVATED',
      
      // Calendar actions
      'CALENDAR_UPDATED',
      'CALENDAR_BLOCKED',
      'CALENDAR_UNBLOCKED',
      'CALENDAR_SYNCED',
      
      // Channel actions
      'CHANNEL_CONNECTED',
      'CHANNEL_DISCONNECTED',
      'CHANNEL_SYNCED',
      'CHANNEL_ERROR',
      'CHANNEL_SETTINGS_UPDATED',
      
      // File actions
      'FILE_UPLOADED',
      'FILE_DELETED',
      'FILE_DOWNLOADED',
      
      // System actions
      'SYSTEM_BACKUP',
      'SYSTEM_RESTORE',
      'SYSTEM_MAINTENANCE',
      'SYSTEM_ERROR',
      'CONFIGURATION_CHANGED',
      
      // API actions
      'API_ACCESS',
      'API_ERROR',
      'RATE_LIMIT_EXCEEDED',
      
      // Email actions
      'EMAIL_SENT',
      'EMAIL_FAILED',
      
      // Data export/import actions
      'DATA_EXPORTED',
      'DATA_IMPORTED',
      'DATA_DELETED'
    ]
  },
  resource: {
    type: String,
    required: true,
    enum: [
      'USER',
      'PROPERTY',
      'BOOKING',
      'RATE_PLAN',
      'CALENDAR',
      'CHANNEL',
      'FILE',
      'SYSTEM',
      'API',
      'EMAIL',
      'AUTHENTICATION'
    ]
  },
  resourceId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: false
  },
  userEmail: {
    type: String,
    required: false
  },
  userRoles: [{
    type: String,
    enum: ['superadmin', 'admin', 'supervisor', 'client']
  }],
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
  },
  url: {
    type: String,
    required: true
  },
  requestBody: {
    type: Schema.Types.Mixed,
    required: false
  },
  responseStatus: {
    type: Number,
    required: false
  },
  responseTime: {
    type: Number,
    required: false
  },
  errorMessage: {
    type: String,
    required: false
  },
  metadata: {
    type: Schema.Types.Mixed,
    required: false
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  sessionId: {
    type: String,
    required: false
  },
  channel: {
    type: String,
    required: false
  },
  propertyId: {
    type: String,
    required: false
  },
  bookingId: {
    type: String,
    required: false
  },
  ratePlanId: {
    type: String,
    required: false
  },
  calendarId: {
    type: String,
    required: false
  },
  channelId: {
    type: String,
    required: false
  }
}, {
  timestamps: true,
  collection: 'audit_logs'
});

// Indexes for performance
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ ipAddress: 1, timestamp: -1 });
auditLogSchema.index({ propertyId: 1, timestamp: -1 });
auditLogSchema.index({ bookingId: 1, timestamp: -1 });

// Create model
const AuditLog: Model<IAuditLog> = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

// Audit service class
class AuditService {
  // Log an audit event
  async logAuditEvent(auditData: {
    action: string;
    resource: string;
    resourceId: string;
    userId?: string;
    userEmail?: string;
    userRoles?: string[];
    ipAddress: string;
    userAgent: string;
    method: string;
    url: string;
    requestBody?: any;
    responseStatus?: number;
    responseTime?: number;
    errorMessage?: string;
    metadata?: any;
    sessionId?: string;
    channel?: string;
    propertyId?: string;
    bookingId?: string;
    ratePlanId?: string;
    calendarId?: string;
    channelId?: string;
  }): Promise<void> {
    try {
      // Sanitize sensitive data from request body
      const sanitizedRequestBody = this.sanitizeRequestBody(auditData.requestBody);
      
      const auditLog = new AuditLog({
        ...auditData,
        requestBody: sanitizedRequestBody,
        timestamp: new Date()
      });

      await auditLog.save();
      
      logger.info('Audit log created', {
        action: auditData.action,
        resource: auditData.resource,
        resourceId: auditData.resourceId,
        userId: auditData.userId,
        ipAddress: auditData.ipAddress
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create audit log:', {
        error: errorMessage,
        auditData: {
          action: auditData.action,
          resource: auditData.resource,
          resourceId: auditData.resourceId,
          userId: auditData.userId
        }
      });
      throw new AuditLogError(`Failed to log audit event: ${errorMessage}`);
    }
  }

  // Get audit logs with filtering and pagination
  async getAuditLogs(filters: {
    userId?: string;
    action?: string;
    resource?: string;
    resourceId?: string;
    propertyId?: string;
    bookingId?: string;
    ratePlanId?: string;
    calendarId?: string;
    channelId?: string;
    startDate?: Date;
    endDate?: Date;
    ipAddress?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    logs: IAuditLog[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    try {
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
      } = filters;

      // Build query
      const query: any = {};

      if (userId) query.userId = userId;
      if (action) query.action = action;
      if (resource) query.resource = resource;
      if (resourceId) query.resourceId = resourceId;
      if (propertyId) query.propertyId = propertyId;
      if (bookingId) query.bookingId = bookingId;
      if (ratePlanId) query.ratePlanId = ratePlanId;
      if (calendarId) query.calendarId = calendarId;
      if (channelId) query.channelId = channelId;
      if (ipAddress) query.ipAddress = ipAddress;

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = startDate;
        if (endDate) query.timestamp.$lte = endDate;
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      const sort: any = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments(query)
      ]);

      const pages = Math.ceil(total / limit);

      return {
        logs,
        total,
        page,
        limit,
        pages
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get audit logs:', error);
      throw new AuditLogError(`Failed to retrieve audit logs: ${errorMessage}`);
    }
  }

  // Get audit statistics
  async getAuditStatistics(filters: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    propertyId?: string;
  } = {}): Promise<{
    totalLogs: number;
    actionsByType: { [key: string]: number };
    resourcesByType: { [key: string]: number };
    usersByActivity: { [key: string]: number };
    errorsByType: { [key: string]: number };
    averageResponseTime: number;
    topIPAddresses: { [key: string]: number };
  }> {
    try {
      const { startDate, endDate, userId, propertyId } = filters;

      // Build base query
      const baseQuery: any = {};
      if (startDate || endDate) {
        baseQuery.timestamp = {};
        if (startDate) baseQuery.timestamp.$gte = startDate;
        if (endDate) baseQuery.timestamp.$lte = endDate;
      }
      if (userId) baseQuery.userId = userId;
      if (propertyId) baseQuery.propertyId = propertyId;

      // Get statistics using aggregation
      const stats = await AuditLog.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: null,
            totalLogs: { $sum: 1 },
            actionsByType: {
              $push: '$action'
            },
            resourcesByType: {
              $push: '$resource'
            },
            usersByActivity: {
              $push: '$userId'
            },
            errorsByType: {
              $push: {
                $cond: [
                  { $ne: ['$errorMessage', null] },
                  '$action',
                  null
                ]
              }
            },
            responseTimes: {
              $push: {
                $cond: [
                  { $ne: ['$responseTime', null] },
                  '$responseTime',
                  null
                ]
              }
            },
            ipAddresses: {
              $push: '$ipAddress'
            }
          }
        }
      ]);

      if (stats.length === 0) {
        return {
          totalLogs: 0,
          actionsByType: {},
          resourcesByType: {},
          usersByActivity: {},
          errorsByType: {},
          averageResponseTime: 0,
          topIPAddresses: {}
        };
      }

      const data = stats[0];

      // Process statistics
      const actionsByType = this.countOccurrences(data.actionsByType.filter(Boolean));
      const resourcesByType = this.countOccurrences(data.resourcesByType.filter(Boolean));
      const usersByActivity = this.countOccurrences(data.usersByActivity.filter(Boolean));
      const errorsByType = this.countOccurrences(data.errorsByType.filter(Boolean));
      const topIPAddresses = this.countOccurrences(data.ipAddresses.filter(Boolean));
      
      const validResponseTimes = data.responseTimes.filter((time: any) => time !== null);
      const averageResponseTime = validResponseTimes.length > 0 
        ? validResponseTimes.reduce((sum: number, time: number) => sum + time, 0) / validResponseTimes.length
        : 0;

      return {
        totalLogs: data.totalLogs,
        actionsByType,
        resourcesByType,
        usersByActivity,
        errorsByType,
        averageResponseTime: Math.round(averageResponseTime),
        topIPAddresses
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get audit statistics:', error);
      throw new AuditLogError(`Failed to retrieve audit statistics: ${errorMessage}`);
    }
  }

  // Delete old audit logs (cleanup)
  async deleteOldAuditLogs(olderThanDays: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await AuditLog.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      logger.info(`Deleted ${result.deletedCount} old audit logs older than ${olderThanDays} days`);
      return result.deletedCount || 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete old audit logs:', error);
      throw new AuditLogError(`Failed to delete old audit logs: ${errorMessage}`);
    }
  }

  // Export audit logs
  async exportAuditLogs(filters: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    action?: string;
    resource?: string;
    format?: 'json' | 'csv';
  } = {}): Promise<string> {
    try {
      const { format = 'json', ...queryFilters } = filters;
      
      const { logs } = await this.getAuditLogs({
        ...queryFilters,
        limit: 10000 // Large limit for export
      });

      if (format === 'csv') {
        return this.convertToCSV(logs);
      } else {
        return JSON.stringify(logs, null, 2);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to export audit logs:', error);
      throw new AuditLogError(`Failed to export audit logs: ${errorMessage}`);
    }
  }

  // Helper methods
  private sanitizeRequestBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private countOccurrences<T extends string | number>(array: T[]): Record<string, number> {
    return array.reduce((acc: Record<string, number>, item: T) => {
      const key = String(item);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  private convertToCSV(logs: IAuditLog[]): string {
    if (logs.length === 0) {
      return '';
    }

    const headers = [
      'timestamp',
      'action',
      'resource',
      'resourceId',
      'userId',
      'userEmail',
      'ipAddress',
      'method',
      'url',
      'responseStatus',
      'responseTime',
      'errorMessage'
    ];

    const csvRows = [headers.join(',')];

    for (const log of logs) {
      const row = headers.map(header => {
        const value = log[header as keyof IAuditLog];
        if (value === null || value === undefined) {
          return '';
        }
        if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  }
}

// Create singleton instance
const auditService = new AuditService();

export default auditService;
export { IAuditLog, AuditLog };

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '../config/logger';
import { calendarSyncService, ISyncConflict, ConflictResolutionStrategy } from './calendarSyncService';
import { availabilityService } from './availabilityService';
import { CalendarChannel, CalendarStatus, ICalendar } from '../models/Calendar';
// import { authenticateSocket } from '../middleware/auth'; // TODO: Implement socket authentication

// WebSocket event types
export enum CalendarSyncEvent {
  CONNECT = 'calendar:connect',
  DISCONNECT = 'calendar:disconnect',
  SUBSCRIBE = 'calendar:subscribe',
  UNSUBSCRIBE = 'calendar:unsubscribe',
  SYNC_FROM_CHANNEL = 'calendar:sync_from_channel',
  SYNC_TO_CHANNEL = 'calendar:sync_to_channel',
  AVAILABILITY_UPDATE = 'calendar:availability_update',
  CONFLICT_DETECTED = 'calendar:conflict_detected',
  CONFLICT_RESOLVED = 'calendar:conflict_resolved',
  SYNC_STATUS_UPDATE = 'calendar:sync_status_update',
  ERROR = 'calendar:error'
}

// Subscription interface
export interface ICalendarSubscription {
  propertyId: string;
  roomId?: string;
  channels?: CalendarChannel[];
}

// Sync event payload interfaces
export interface ISyncFromChannelPayload {
  propertyId: string;
  roomId: string;
  channel: CalendarChannel;
  startDate: Date;
  endDate: Date;
  strategy?: ConflictResolutionStrategy;
}

export interface ISyncToChannelPayload {
  propertyId: string;
  roomId: string;
  channel: CalendarChannel;
  startDate: Date;
  endDate: Date;
}

export interface IAvailabilityUpdatePayload {
  propertyId: string;
  roomId: string;
  date: Date;
  status: CalendarStatus;
  channel: CalendarChannel;
  rate?: number;
  currency?: string;
  minStay?: number;
  maxStay?: number;
}

class CalendarSyncWebSocketService {
  private io: SocketIOServer | null = null;
  private subscriptions: Map<string, Set<ICalendarSubscription>> = new Map();

  /**
   * Initialize WebSocket server
   */
  public initialize(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env['CLIENT_URL'] || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
      path: '/socket.io'
    });

    // Authentication middleware (TODO: Implement proper socket authentication)
    this.io.use(async (_socket, next) => {
      try {
        // await authenticateSocket(socket); // TODO: Implement socket authentication
        next(); // Allow all connections for now
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Calendar sync WebSocket client connected: ${socket.id}`);
      this.handleConnection(socket);
    });

    logger.info('Calendar sync WebSocket server initialized');
  }

  /**
   * Handle client connection
   */
  private handleConnection(socket: Socket): void {
    // Send connection acknowledgment
    socket.emit(CalendarSyncEvent.CONNECT, {
      socketId: socket.id,
      timestamp: new Date()
    });

    // Subscribe to property/room calendar updates
    socket.on(CalendarSyncEvent.SUBSCRIBE, (subscription: ICalendarSubscription) => {
      this.handleSubscribe(socket, subscription);
    });

    // Unsubscribe from property/room calendar updates
    socket.on(CalendarSyncEvent.UNSUBSCRIBE, (subscription: ICalendarSubscription) => {
      this.handleUnsubscribe(socket, subscription);
    });

    // Handle sync from channel request
    socket.on(CalendarSyncEvent.SYNC_FROM_CHANNEL, async (payload: ISyncFromChannelPayload) => {
      await this.handleSyncFromChannel(socket, payload);
    });

    // Handle sync to channel request
    socket.on(CalendarSyncEvent.SYNC_TO_CHANNEL, async (payload: ISyncToChannelPayload) => {
      await this.handleSyncToChannel(socket, payload);
    });

    // Handle availability update
    socket.on(CalendarSyncEvent.AVAILABILITY_UPDATE, async (payload: IAvailabilityUpdatePayload) => {
      await this.handleAvailabilityUpdate(socket, payload);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });
  }

  /**
   * Handle subscription
   */
  private handleSubscribe(socket: Socket, subscription: ICalendarSubscription): void {
    try {
      const socketSubscriptions = this.subscriptions.get(socket.id) || new Set();
      socketSubscriptions.add(subscription);
      this.subscriptions.set(socket.id, socketSubscriptions);

      logger.info(`Client ${socket.id} subscribed to property ${subscription.propertyId}${subscription.roomId ? `, room ${subscription.roomId}` : ''}`);

      socket.emit(CalendarSyncEvent.SUBSCRIBE, {
        success: true,
        subscription
      });
    } catch (error) {
      socket.emit(CalendarSyncEvent.ERROR, {
        error: 'Subscription failed',
        message: (error as Error).message
      });
    }
  }

  /**
   * Handle unsubscription
   */
  private handleUnsubscribe(socket: Socket, subscription: ICalendarSubscription): void {
    try {
      const socketSubscriptions = this.subscriptions.get(socket.id);
      if (socketSubscriptions) {
        // Remove matching subscription
        const updatedSubscriptions = Array.from(socketSubscriptions).filter(
          sub => !(sub.propertyId === subscription.propertyId &&
                   sub.roomId === subscription.roomId)
        );
        this.subscriptions.set(socket.id, new Set(updatedSubscriptions));
      }

      logger.info(`Client ${socket.id} unsubscribed from property ${subscription.propertyId}`);

      socket.emit(CalendarSyncEvent.UNSUBSCRIBE, {
        success: true,
        subscription
      });
    } catch (error) {
      socket.emit(CalendarSyncEvent.ERROR, {
        error: 'Unsubscription failed',
        message: (error as Error).message
      });
    }
  }

  /**
   * Handle sync from channel
   */
  private async handleSyncFromChannel(socket: Socket, payload: ISyncFromChannelPayload): Promise<void> {
    try {
      logger.info(`Syncing from channel ${payload.channel} for property ${payload.propertyId}`);

      // Note: In production, this would fetch calendar data from the actual OTA channel API
      // For now, we'll use an empty array as placeholder
      const calendarData: Array<Partial<ICalendar>> = [];

      const result = await calendarSyncService.syncFromChannel(
        payload.propertyId,
        payload.roomId,
        payload.channel,
        calendarData,
        payload.strategy || ConflictResolutionStrategy.CHANNEL_PRIORITY
      );

      // Emit sync status update
      socket.emit(CalendarSyncEvent.SYNC_STATUS_UPDATE, {
        success: true,
        direction: 'from',
        channel: payload.channel,
        result
      });

      // Broadcast to subscribed clients
      this.broadcastToSubscribers({
        propertyId: payload.propertyId,
        roomId: payload.roomId
      }, CalendarSyncEvent.SYNC_STATUS_UPDATE, {
        direction: 'from',
        channel: payload.channel,
        synced: result.synced,
        conflicts: result.conflicts.length
      }, socket.id);

      // Emit conflicts if any
      if (result.conflicts.length > 0) {
        const conflicts = calendarSyncService.getUnresolvedConflicts(
          payload.propertyId
        );
        socket.emit(CalendarSyncEvent.CONFLICT_DETECTED, { conflicts });
      }
    } catch (error) {
      socket.emit(CalendarSyncEvent.ERROR, {
        error: 'Sync from channel failed',
        message: (error as Error).message
      });
    }
  }

  /**
   * Handle sync to channel
   */
  private async handleSyncToChannel(socket: Socket, payload: ISyncToChannelPayload): Promise<void> {
    try {
      logger.info(`Syncing to channel ${payload.channel} for property ${payload.propertyId}`);

      const calendarData = await calendarSyncService.syncToChannel(
        payload.propertyId,
        payload.roomId,
        payload.channel,
        new Date(payload.startDate),
        new Date(payload.endDate)
      );

      // Emit sync status update
      socket.emit(CalendarSyncEvent.SYNC_STATUS_UPDATE, {
        success: true,
        direction: 'to',
        channel: payload.channel,
        synced: calendarData.length,
        data: calendarData
      });

      // Broadcast to subscribed clients
      this.broadcastToSubscribers({
        propertyId: payload.propertyId,
        roomId: payload.roomId
      }, CalendarSyncEvent.SYNC_STATUS_UPDATE, {
        direction: 'to',
        channel: payload.channel,
        synced: calendarData.length
      }, socket.id);
    } catch (error) {
      socket.emit(CalendarSyncEvent.ERROR, {
        error: 'Sync to channel failed',
        message: (error as Error).message
      });
    }
  }

  /**
   * Handle availability update
   */
  private async handleAvailabilityUpdate(socket: Socket, payload: IAvailabilityUpdatePayload): Promise<void> {
    try {
      logger.info(`Updating availability for property ${payload.propertyId}, room ${payload.roomId}, date ${payload.date}`);

      const userId = (socket as Socket & { userId?: string }).userId;

      const calendar = await availabilityService.updateAvailability(
        payload.propertyId,
        payload.roomId,
        new Date(payload.date),
        payload.status,
        payload.channel,
        userId,
        {
          rate: payload.rate,
          currency: payload.currency,
          minStay: payload.minStay,
          maxStay: payload.maxStay
        }
      );

      // Emit success
      socket.emit(CalendarSyncEvent.AVAILABILITY_UPDATE, {
        success: true,
        calendar
      });

      // Broadcast to subscribed clients
      this.broadcastToSubscribers({
        propertyId: payload.propertyId,
        roomId: payload.roomId
      }, CalendarSyncEvent.AVAILABILITY_UPDATE, {
        date: payload.date,
        status: payload.status,
        channel: payload.channel,
        rate: payload.rate,
        calendar
      }, socket.id);
    } catch (error) {
      socket.emit(CalendarSyncEvent.ERROR, {
        error: 'Availability update failed',
        message: (error as Error).message
      });
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(socket: Socket): void {
    logger.info(`Calendar sync WebSocket client disconnected: ${socket.id}`);
    this.subscriptions.delete(socket.id);
  }

  /**
   * Broadcast to subscribed clients
   */
  private broadcastToSubscribers(
    subscription: { propertyId: string; roomId?: string },
    event: CalendarSyncEvent,
    data: Record<string, unknown>,
    excludeSocketId?: string
  ): void {
    if (!this.io) return;

    for (const [socketId, subscriptions] of this.subscriptions) {
      if (excludeSocketId && socketId === excludeSocketId) continue;

      for (const sub of subscriptions) {
        if (sub.propertyId === subscription.propertyId &&
            (!subscription.roomId || sub.roomId === subscription.roomId)) {
          this.io.to(socketId).emit(event, data);
          break;
        }
      }
    }
  }

  /**
   * Broadcast conflict detected
   */
  public broadcastConflict(conflict: ISyncConflict): void {
    if (!this.io) return;

    this.broadcastToSubscribers({
      propertyId: conflict.property.toString(),
      roomId: conflict.room.toString()
    }, CalendarSyncEvent.CONFLICT_DETECTED, { conflict });
  }

  /**
   * Broadcast conflict resolved
   */
  public broadcastConflictResolved(conflict: ISyncConflict): void {
    if (!this.io) return;

    this.broadcastToSubscribers({
      propertyId: conflict.property.toString(),
      roomId: conflict.room.toString()
    }, CalendarSyncEvent.CONFLICT_RESOLVED, { conflict });
  }

  /**
   * Get connected clients count
   */
  public getConnectedClientsCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get subscriptions for property
   */
  public getPropertySubscriptions(propertyId: string): number {
    let count = 0;
    for (const subscriptions of this.subscriptions.values()) {
      for (const sub of subscriptions) {
        if (sub.propertyId === propertyId) {
          count++;
          break;
        }
      }
    }
    return count;
  }
}

// Singleton instance
export const calendarSyncWebSocket = new CalendarSyncWebSocketService();
export default calendarSyncWebSocket;

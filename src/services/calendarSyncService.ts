import Calendar, { ICalendar, CalendarStatus, CalendarChannel } from '../models/Calendar';
import { logger } from '../config/logger';
import { createError } from '../utils/errors';
import mongoose from 'mongoose';

// Sync conflict type
export enum SyncConflictType {
  DOUBLE_BOOKING = 'double_booking',
  STATUS_MISMATCH = 'status_mismatch',
  RATE_MISMATCH = 'rate_mismatch',
  AVAILABILITY_CONFLICT = 'availability_conflict',
  CHANNEL_OVERRIDE = 'channel_override'
}

// Sync conflict resolution strategy
export enum ConflictResolutionStrategy {
  CHANNEL_PRIORITY = 'channel_priority', // Use channel-specific priority
  LATEST_UPDATE = 'latest_update', // Use latest update
  MANUAL = 'manual', // Require manual resolution
  MERGE = 'merge' // Merge changes
}

// Sync conflict interface
export interface ISyncConflict {
  id: string;
  property: mongoose.Types.ObjectId;
  room: mongoose.Types.ObjectId;
  date: Date;
  type: SyncConflictType;
  channels: CalendarChannel[];
  details: {
    existing?: Partial<ICalendar>;
    incoming: Partial<ICalendar>;
    channel: CalendarChannel;
  };
  resolution?: ConflictResolutionStrategy;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

// Sync result interface
export interface ISyncResult {
  success: boolean;
  channel: CalendarChannel;
  synced: number;
  conflicts: ISyncConflict[];
  errors: Array<{ date: Date; error: string }>;
  duration: number;
}

// Sync status interface
export interface ISyncStatus {
  property: mongoose.Types.ObjectId;
  room?: mongoose.Types.ObjectId;
  channel: CalendarChannel;
  lastSync: Date;
  nextSync?: Date;
  status: 'success' | 'partial' | 'failed';
  syncCount: number;
  conflictCount: number;
  errorCount: number;
}

class CalendarSyncService {
  private syncStatuses: Map<string, ISyncStatus> = new Map();
  private conflicts: Map<string, ISyncConflict> = new Map();
  private channelPriority: Map<CalendarChannel, number> = new Map([
    [CalendarChannel.DIRECT, 100],
    [CalendarChannel.BOOKING, 90],
    [CalendarChannel.EXPEDIA, 80],
    [CalendarChannel.AIRBNB, 70],
    [CalendarChannel.AGODA, 60],
    [CalendarChannel.VRBO, 50],
    [CalendarChannel.ALL, 0]
  ]);

  /**
   * Sync calendar from a specific channel
   */
  public async syncFromChannel(
    propertyId: string,
    roomId: string,
    channel: CalendarChannel,
    calendarData: Array<Partial<ICalendar>>,
    strategy: ConflictResolutionStrategy = ConflictResolutionStrategy.CHANNEL_PRIORITY
  ): Promise<ISyncResult> {
    const startTime = Date.now();
    const conflicts: ISyncConflict[] = [];
    const errors: Array<{ date: Date; error: string }> = [];
    let synced = 0;

    logger.info(`Starting calendar sync for property ${propertyId}, room ${roomId}, channel ${channel}`);

    try {
      for (const data of calendarData) {
        try {
          if (!data.date) {
            errors.push({ date: new Date(), error: 'Missing date in calendar data' });
            continue;
          }

          // Check for existing calendar entry
          const existing = await Calendar.findOne({
            property: propertyId,
            room: roomId,
            date: data.date
          });

          if (existing) {
            // Detect conflicts
            const conflict = this.detectConflict(existing, data, channel);

            if (conflict) {
              conflicts.push(conflict);

              // Apply conflict resolution strategy
              const resolved = await this.resolveConflict(conflict, strategy);

              if (resolved) {
                synced++;
              } else {
                errors.push({ date: data.date, error: 'Conflict could not be resolved' });
              }
            } else {
              // No conflict, update
              await this.updateCalendar(existing, data, channel);
              synced++;
            }
          } else {
            // Create new calendar entry
            await this.createCalendar(propertyId, roomId, data, channel);
            synced++;
          }
        } catch (error) {
          logger.error(`Error syncing date ${data.date}:`, error);
          errors.push({ date: data.date || new Date(), error: (error as Error).message });
        }
      }

      // Update sync status
      this.updateSyncStatus(propertyId, roomId, channel, {
        success: errors.length === 0,
        synced,
        conflicts: conflicts.length,
        errors: errors.length
      });

      const duration = Date.now() - startTime;
      logger.info(`Calendar sync completed: ${synced} synced, ${conflicts.length} conflicts, ${errors.length} errors in ${duration}ms`);

      return {
        success: errors.length === 0 && conflicts.filter(c => !c.resolved).length === 0,
        channel,
        synced,
        conflicts,
        errors,
        duration
      };
    } catch (error) {
      logger.error('Calendar sync failed:', error);
      throw createError.calendar(`Calendar sync failed: ${(error as Error).message}`);
    }
  }

  /**
   * Bidirectional sync - sync to channel
   */
  public async syncToChannel(
    propertyId: string,
    roomId: string,
    channel: CalendarChannel,
    startDate: Date,
    endDate: Date
  ): Promise<Array<Partial<ICalendar>>> {
    try {
      logger.info(`Syncing calendar to channel ${channel} for property ${propertyId}, room ${roomId}`);

      // Get calendar data for date range
      const calendars = await Calendar.find({
        property: propertyId,
        room: roomId,
        date: { $gte: startDate, $lte: endDate }
      }).sort({ date: 1 });

      // Transform to channel-specific format
      const channelData = calendars.map(cal => this.transformToChannelFormat(cal, channel));

      logger.info(`Prepared ${channelData.length} calendar entries for channel ${channel}`);

      return channelData;
    } catch (error) {
      logger.error('Sync to channel failed:', error);
      throw createError.calendar(`Sync to channel failed: ${(error as Error).message}`);
    }
  }

  /**
   * Detect conflicts between existing and incoming calendar data
   */
  private detectConflict(
    existing: ICalendar,
    incoming: Partial<ICalendar>,
    channel: CalendarChannel
  ): ISyncConflict | null {
    // Check for double booking
    if (
      existing.status === CalendarStatus.BOOKED &&
      incoming.status === CalendarStatus.BOOKED &&
      existing.channel !== channel
    ) {
      return {
        id: `${existing.property}_${existing.room}_${existing.date}_${Date.now()}`,
        property: existing.property,
        room: existing.room,
        date: existing.date,
        type: SyncConflictType.DOUBLE_BOOKING,
        channels: [existing.channel, channel],
        details: {
          existing: { status: existing.status, channel: existing.channel, booking: existing.booking },
          incoming: { status: incoming.status, channel },
          channel
        },
        resolved: false,
        createdAt: new Date()
      };
    }

    // Check for status mismatch
    if (incoming.status && existing.status !== incoming.status) {
      return {
        id: `${existing.property}_${existing.room}_${existing.date}_${Date.now()}`,
        property: existing.property,
        room: existing.room,
        date: existing.date,
        type: SyncConflictType.STATUS_MISMATCH,
        channels: [existing.channel, channel],
        details: {
          existing: { status: existing.status, channel: existing.channel },
          incoming: { status: incoming.status, channel },
          channel
        },
        resolved: false,
        createdAt: new Date()
      };
    }

    // Check for rate mismatch (significant difference)
    if (incoming.rate && existing.rate && Math.abs(existing.rate - incoming.rate) > 10) {
      return {
        id: `${existing.property}_${existing.room}_${existing.date}_${Date.now()}`,
        property: existing.property,
        room: existing.room,
        date: existing.date,
        type: SyncConflictType.RATE_MISMATCH,
        channels: [existing.channel, channel],
        details: {
          existing: { rate: existing.rate, channel: existing.channel },
          incoming: { rate: incoming.rate, channel },
          channel
        },
        resolved: false,
        createdAt: new Date()
      };
    }

    return null;
  }

  /**
   * Resolve sync conflict using specified strategy
   */
  private async resolveConflict(
    conflict: ISyncConflict,
    strategy: ConflictResolutionStrategy
  ): Promise<boolean> {
    try {
      logger.info(`Resolving conflict ${conflict.id} using strategy ${strategy}`);

      switch (strategy) {
        case ConflictResolutionStrategy.CHANNEL_PRIORITY:
          return await this.resolveByChannelPriority(conflict);

        case ConflictResolutionStrategy.LATEST_UPDATE:
          return await this.resolveByLatestUpdate(conflict);

        case ConflictResolutionStrategy.MERGE:
          return await this.resolveByMerge(conflict);

        case ConflictResolutionStrategy.MANUAL:
          // Store conflict for manual resolution
          this.conflicts.set(conflict.id, conflict);
          logger.info(`Conflict ${conflict.id} requires manual resolution`);
          return false;

        default:
          logger.warn(`Unknown conflict resolution strategy: ${strategy}`);
          return false;
      }
    } catch (error) {
      logger.error(`Error resolving conflict ${conflict.id}:`, error);
      return false;
    }
  }

  /**
   * Resolve conflict by channel priority
   */
  private async resolveByChannelPriority(conflict: ISyncConflict): Promise<boolean> {
    const existingChannel = conflict.details.existing?.channel || CalendarChannel.ALL;
    const incomingChannel = conflict.details.channel;

    const existingPriority = this.channelPriority.get(existingChannel) || 0;
    const incomingPriority = this.channelPriority.get(incomingChannel) || 0;

    if (incomingPriority > existingPriority) {
      // Incoming has higher priority, update
      const calendar = await Calendar.findOne({
        property: conflict.property,
        room: conflict.room,
        date: conflict.date
      });

      if (calendar) {
        await this.updateCalendar(calendar, conflict.details.incoming, incomingChannel);
        conflict.resolved = true;
        conflict.resolvedAt = new Date();
        conflict.resolution = ConflictResolutionStrategy.CHANNEL_PRIORITY;
        return true;
      }
    }

    // Existing has higher or equal priority, keep existing
    conflict.resolved = true;
    conflict.resolvedAt = new Date();
    conflict.resolution = ConflictResolutionStrategy.CHANNEL_PRIORITY;
    return true;
  }

  /**
   * Resolve conflict by latest update
   */
  private async resolveByLatestUpdate(conflict: ISyncConflict): Promise<boolean> {
    // Always prefer incoming data (latest update)
    const calendar = await Calendar.findOne({
      property: conflict.property,
      room: conflict.room,
      date: conflict.date
    });

    if (calendar) {
      await this.updateCalendar(calendar, conflict.details.incoming, conflict.details.channel);
      conflict.resolved = true;
      conflict.resolvedAt = new Date();
      conflict.resolution = ConflictResolutionStrategy.LATEST_UPDATE;
      return true;
    }

    return false;
  }

  /**
   * Resolve conflict by merging data
   */
  private async resolveByMerge(conflict: ISyncConflict): Promise<boolean> {
    const calendar = await Calendar.findOne({
      property: conflict.property,
      room: conflict.room,
      date: conflict.date
    });

    if (calendar) {
      // Merge logic: take non-null values from incoming, keep existing otherwise
      const merged = {
        ...conflict.details.existing,
        ...Object.fromEntries(
          Object.entries(conflict.details.incoming).filter(([_, v]) => v != null)
        )
      };

      await this.updateCalendar(calendar, merged, conflict.details.channel);
      conflict.resolved = true;
      conflict.resolvedAt = new Date();
      conflict.resolution = ConflictResolutionStrategy.MERGE;
      return true;
    }

    return false;
  }

  /**
   * Update calendar entry
   */
  private async updateCalendar(
    calendar: ICalendar,
    data: Partial<ICalendar>,
    channel: CalendarChannel
  ): Promise<void> {
    if (data.status !== undefined) calendar.status = data.status;
    if (data.rate !== undefined) calendar.rate = data.rate;
    if (data.currency !== undefined) calendar.currency = data.currency;
    if (data.minStay !== undefined) calendar.minStay = data.minStay;
    if (data.maxStay !== undefined) calendar.maxStay = data.maxStay;
    if (data.blockReason !== undefined) calendar.blockReason = data.blockReason;
    if (data.blockDescription !== undefined) calendar.blockDescription = data.blockDescription;
    if (data.rateOverride !== undefined) calendar.rateOverride = data.rateOverride;
    if (data.booking !== undefined) calendar.booking = data.booking;

    calendar.channel = channel;
    await calendar.save();

    logger.debug(`Updated calendar for ${calendar.date} on channel ${channel}`);
  }

  /**
   * Create new calendar entry
   */
  private async createCalendar(
    propertyId: string,
    roomId: string,
    data: Partial<ICalendar>,
    channel: CalendarChannel
  ): Promise<void> {
    const calendar = new Calendar({
      property: propertyId,
      room: roomId,
      date: data.date,
      status: data.status || CalendarStatus.AVAILABLE,
      rate: data.rate,
      currency: data.currency,
      minStay: data.minStay || 1,
      maxStay: data.maxStay,
      channel,
      rateOverride: data.rateOverride,
      booking: data.booking
    });

    await calendar.save();
    logger.debug(`Created calendar for ${calendar.date} on channel ${channel}`);
  }

  /**
   * Transform calendar data to channel-specific format
   */
  private transformToChannelFormat(
    calendar: ICalendar,
    channel: CalendarChannel
  ): Partial<ICalendar> {
    // Base transformation
    const transformed: Partial<ICalendar> = {
      date: calendar.date,
      status: calendar.status,
      rate: calendar.getEffectiveRate(),
      currency: calendar.currency,
      minStay: calendar.minStay,
      maxStay: calendar.maxStay
    };

    // Channel-specific transformations
    switch (channel) {
      case CalendarChannel.AIRBNB:
        // Airbnb-specific format
        break;
      case CalendarChannel.BOOKING:
        // Booking.com-specific format
        break;
      case CalendarChannel.EXPEDIA:
        // Expedia-specific format
        break;
      case CalendarChannel.AGODA:
        // Agoda-specific format
        break;
      case CalendarChannel.VRBO:
        // Vrbo-specific format
        break;
    }

    return transformed;
  }

  /**
   * Update sync status
   */
  private updateSyncStatus(
    propertyId: string,
    roomId: string,
    channel: CalendarChannel,
    result: { success: boolean; synced: number; conflicts: number; errors: number }
  ): void {
    const key = `${propertyId}_${roomId}_${channel}`;
    const existing = this.syncStatuses.get(key);

    const status: ISyncStatus = {
      property: new mongoose.Types.ObjectId(propertyId),
      room: new mongoose.Types.ObjectId(roomId),
      channel,
      lastSync: new Date(),
      status: result.success ? 'success' : result.conflicts > 0 ? 'partial' : 'failed',
      syncCount: (existing?.syncCount || 0) + result.synced,
      conflictCount: (existing?.conflictCount || 0) + result.conflicts,
      errorCount: (existing?.errorCount || 0) + result.errors
    };

    this.syncStatuses.set(key, status);
  }

  /**
   * Get sync status
   */
  public getSyncStatus(
    propertyId: string,
    roomId?: string,
    channel?: CalendarChannel
  ): ISyncStatus[] {
    const statuses: ISyncStatus[] = [];

    for (const [key, status] of this.syncStatuses) {
      const [propId, rmId, ch] = key.split('_');

      if (propId === propertyId) {
        if ((!roomId || rmId === roomId) && (!channel || ch === channel)) {
          statuses.push(status);
        }
      }
    }

    return statuses;
  }

  /**
   * Get unresolved conflicts
   */
  public getUnresolvedConflicts(propertyId?: string): ISyncConflict[] {
    const conflicts: ISyncConflict[] = [];

    for (const conflict of this.conflicts.values()) {
      if (!conflict.resolved) {
        if (!propertyId || conflict.property.toString() === propertyId) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  /**
   * Manually resolve conflict
   */
  public async resolveConflictManually(
    conflictId: string,
    resolution: Partial<ICalendar>,
    userId: string
  ): Promise<boolean> {
    const conflict = this.conflicts.get(conflictId);

    if (!conflict) {
      throw createError.notFound('Conflict not found');
    }

    try {
      const calendar = await Calendar.findOne({
        property: conflict.property,
        room: conflict.room,
        date: conflict.date
      });

      if (calendar) {
        await this.updateCalendar(calendar, resolution, conflict.details.channel);
        conflict.resolved = true;
        conflict.resolvedAt = new Date();
        conflict.resolvedBy = new mongoose.Types.ObjectId(userId);
        conflict.resolution = ConflictResolutionStrategy.MANUAL;

        logger.info(`Conflict ${conflictId} manually resolved by user ${userId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error manually resolving conflict ${conflictId}:`, error);
      return false;
    }
  }

  /**
   * Set channel priority
   */
  public setChannelPriority(channel: CalendarChannel, priority: number): void {
    this.channelPriority.set(channel, priority);
    logger.info(`Channel ${channel} priority set to ${priority}`);
  }

  /**
   * Get channel priority
   */
  public getChannelPriority(channel: CalendarChannel): number {
    return this.channelPriority.get(channel) || 0;
  }
}

// Singleton instance
export const calendarSyncService = new CalendarSyncService();
export default calendarSyncService;

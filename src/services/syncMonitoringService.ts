import { logger } from '../config/logger';
import { calendarSyncService, ISyncResult, ISyncConflict } from './calendarSyncService';
import { CalendarChannel } from '../models/Calendar';
// import mongoose from 'mongoose';

// Sync status enum
export enum SyncStatus {
  IDLE = 'idle',
  SYNCING = 'syncing',
  SUCCESS = 'success',
  FAILED = 'failed',
  PARTIAL = 'partial'
}

// Sync direction
export enum SyncDirection {
  FROM_CHANNEL = 'from_channel',
  TO_CHANNEL = 'to_channel',
  BIDIRECTIONAL = 'bidirectional'
}

// Sync job interface
export interface ISyncJob {
  id: string;
  propertyId: string;
  roomId: string;
  channel: CalendarChannel;
  direction: SyncDirection;
  status: SyncStatus;
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // milliseconds
  result?: ISyncResult;
  errors: string[];
  conflicts: ISyncConflict[];
  retryCount: number;
  maxRetries: number;
}

// Channel sync status
export interface IChannelSyncStatus {
  channel: CalendarChannel;
  lastSync?: Date;
  nextScheduledSync?: Date;
  status: SyncStatus;
  consecutiveFailures: number;
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageDuration: number;
  lastError?: string;
}

// Property sync status
export interface IPropertySyncStatus {
  propertyId: string;
  roomId?: string;
  channels: Map<CalendarChannel, IChannelSyncStatus>;
  overallStatus: SyncStatus;
  activeJobs: number;
  unresolvedConflicts: number;
  lastSyncAt?: Date;
}

// Sync metrics
export interface ISyncMetrics {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageDuration: number;
  totalConflicts: number;
  unresolvedConflicts: number;
  channelMetrics: Map<CalendarChannel, {
    totalSyncs: number;
    successRate: number;
    averageDuration: number;
    lastSync?: Date;
  }>;
}

class SyncMonitoringService {
  private syncJobs: Map<string, ISyncJob> = new Map();
  private channelStatus: Map<string, Map<CalendarChannel, IChannelSyncStatus>> = new Map();
  private jobHistory: ISyncJob[] = [];
  private readonly MAX_HISTORY = 1000;

  /**
   * Start sync job
   */
  public startSyncJob(
    propertyId: string,
    roomId: string,
    channel: CalendarChannel,
    direction: SyncDirection,
    maxRetries: number = 3
  ): string {
    const jobId = `sync_${propertyId}_${roomId}_${channel}_${Date.now()}`;

    const job: ISyncJob = {
      id: jobId,
      propertyId,
      roomId,
      channel,
      direction,
      status: SyncStatus.SYNCING,
      startedAt: new Date(),
      errors: [],
      conflicts: [],
      retryCount: 0,
      maxRetries
    };

    this.syncJobs.set(jobId, job);
    this.updateChannelStatus(propertyId, roomId, channel, SyncStatus.SYNCING);

    logger.info(`Started sync job: ${jobId}`);
    return jobId;
  }

  /**
   * Complete sync job
   */
  public completeSyncJob(
    jobId: string,
    result: ISyncResult,
    conflicts: ISyncConflict[] = []
  ): void {
    const job = this.syncJobs.get(jobId);
    if (!job) {
      logger.warn(`Sync job not found: ${jobId}`);
      return;
    }

    job.completedAt = new Date();
    job.duration = job.completedAt.getTime() - job.startedAt.getTime();
    job.result = result;
    job.conflicts = conflicts;

    // Determine final status
    if (result.errors.length > 0 && result.synced === 0) {
      job.status = SyncStatus.FAILED;
    } else if (result.errors.length > 0 || conflicts.length > 0) {
      job.status = SyncStatus.PARTIAL;
    } else {
      job.status = SyncStatus.SUCCESS;
    }

    // Update channel status
    this.updateChannelStatus(
      job.propertyId,
      job.roomId,
      job.channel,
      job.status,
      job.duration,
      job.errors[0]
    );

    // Move to history
    this.addToHistory(job);
    this.syncJobs.delete(jobId);

    logger.info(`Completed sync job: ${jobId} with status: ${job.status}`);
  }

  /**
   * Fail sync job
   */
  public failSyncJob(jobId: string, error: string): void {
    const job = this.syncJobs.get(jobId);
    if (!job) {
      logger.warn(`Sync job not found: ${jobId}`);
      return;
    }

    job.errors.push(error);
    job.retryCount++;

    // Check if should retry
    if (job.retryCount < job.maxRetries) {
      logger.info(`Retrying sync job: ${jobId} (attempt ${job.retryCount + 1}/${job.maxRetries})`);
      return;
    }

    // Max retries reached, mark as failed
    job.completedAt = new Date();
    job.duration = job.completedAt.getTime() - job.startedAt.getTime();
    job.status = SyncStatus.FAILED;

    this.updateChannelStatus(
      job.propertyId,
      job.roomId,
      job.channel,
      SyncStatus.FAILED,
      job.duration,
      error
    );

    this.addToHistory(job);
    this.syncJobs.delete(jobId);

    logger.error(`Sync job failed after ${job.retryCount} retries: ${jobId}`);
  }

  /**
   * Get sync job status
   */
  public getSyncJobStatus(jobId: string): ISyncJob | undefined {
    return this.syncJobs.get(jobId) || this.jobHistory.find(j => j.id === jobId);
  }

  /**
   * Get active sync jobs
   */
  public getActiveSyncJobs(propertyId?: string, roomId?: string): ISyncJob[] {
    const jobs = Array.from(this.syncJobs.values());

    if (!propertyId) {
      return jobs;
    }

    return jobs.filter(j =>
      j.propertyId === propertyId &&
      (!roomId || j.roomId === roomId)
    );
  }

  /**
   * Get property sync status
   */
  public getPropertySyncStatus(propertyId: string, roomId?: string): IPropertySyncStatus {
    const key = roomId ? `${propertyId}_${roomId}` : propertyId;
    const channels = this.channelStatus.get(key) || new Map();

    const activeJobs = this.getActiveSyncJobs(propertyId, roomId).length;
    const unresolvedConflicts = calendarSyncService.getUnresolvedConflicts(propertyId).length;

    // Determine overall status
    let overallStatus = SyncStatus.IDLE;
    let lastSyncAt: Date | undefined;

    for (const channelStatus of channels.values()) {
      if (channelStatus.status === SyncStatus.SYNCING) {
        overallStatus = SyncStatus.SYNCING;
      } else if (channelStatus.status === SyncStatus.FAILED && overallStatus !== SyncStatus.SYNCING) {
        overallStatus = SyncStatus.FAILED;
      }

      if (channelStatus.lastSync) {
        if (!lastSyncAt || channelStatus.lastSync > lastSyncAt) {
          lastSyncAt = channelStatus.lastSync;
        }
      }
    }

    return {
      propertyId,
      roomId,
      channels,
      overallStatus,
      activeJobs,
      unresolvedConflicts,
      lastSyncAt
    };
  }

  /**
   * Get channel sync status
   */
  public getChannelSyncStatus(
    propertyId: string,
    roomId: string,
    channel: CalendarChannel
  ): IChannelSyncStatus {
    const key = `${propertyId}_${roomId}`;
    const channels = this.channelStatus.get(key);

    if (!channels) {
      return this.createDefaultChannelStatus(channel);
    }

    return channels.get(channel) || this.createDefaultChannelStatus(channel);
  }

  /**
   * Get sync metrics
   */
  public getSyncMetrics(propertyId?: string, roomId?: string): ISyncMetrics {
    let jobs = this.jobHistory;

    if (propertyId) {
      jobs = jobs.filter(j =>
        j.propertyId === propertyId &&
        (!roomId || j.roomId === roomId)
      );
    }

    const totalJobs = jobs.length;
    const activeJobs = this.getActiveSyncJobs(propertyId, roomId).length;
    const completedJobs = jobs.filter(j => j.status === SyncStatus.SUCCESS).length;
    const failedJobs = jobs.filter(j => j.status === SyncStatus.FAILED).length;

    const durations = jobs.filter(j => j.duration).map(j => j.duration!);
    const averageDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    const totalConflicts = jobs.reduce((sum, j) => sum + j.conflicts.length, 0);
    const unresolvedConflicts = propertyId
      ? calendarSyncService.getUnresolvedConflicts(propertyId).length
      : 0;

    // Channel metrics
    const channelMetrics = new Map<CalendarChannel, {
      totalSyncs: number;
      successRate: number;
      averageDuration: number;
      lastSync?: Date;
    }>();

    const channels = [
      CalendarChannel.AIRBNB,
      CalendarChannel.BOOKING,
      CalendarChannel.EXPEDIA,
      CalendarChannel.AGODA,
      CalendarChannel.VRBO,
      CalendarChannel.DIRECT
    ];

    for (const channel of channels) {
      const channelJobs = jobs.filter(j => j.channel === channel);
      const totalSyncs = channelJobs.length;
      const successfulSyncs = channelJobs.filter(j => j.status === SyncStatus.SUCCESS).length;
      const successRate = totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 0;

      const channelDurations = channelJobs.filter(j => j.duration).map(j => j.duration!);
      const avgDuration = channelDurations.length > 0
        ? channelDurations.reduce((sum, d) => sum + d, 0) / channelDurations.length
        : 0;

      const lastSync = channelJobs.length > 0
        ? channelJobs[channelJobs.length - 1].completedAt
        : undefined;

      channelMetrics.set(channel, {
        totalSyncs,
        successRate,
        averageDuration: avgDuration,
        lastSync
      });
    }

    return {
      totalJobs,
      activeJobs,
      completedJobs,
      failedJobs,
      averageDuration,
      totalConflicts,
      unresolvedConflicts,
      channelMetrics
    };
  }

  /**
   * Get sync history
   */
  public getSyncHistory(
    propertyId?: string,
    roomId?: string,
    limit: number = 50
  ): ISyncJob[] {
    let jobs = this.jobHistory;

    if (propertyId) {
      jobs = jobs.filter(j =>
        j.propertyId === propertyId &&
        (!roomId || j.roomId === roomId)
      );
    }

    return jobs.slice(-limit).reverse();
  }

  /**
   * Clear sync history
   */
  public clearSyncHistory(propertyId?: string, roomId?: string): void {
    if (propertyId) {
      this.jobHistory = this.jobHistory.filter(j =>
        !(j.propertyId === propertyId && (!roomId || j.roomId === roomId))
      );
    } else {
      this.jobHistory = [];
    }

    logger.info('Sync history cleared');
  }

  /**
   * Update channel status
   */
  private updateChannelStatus(
    propertyId: string,
    roomId: string,
    channel: CalendarChannel,
    status: SyncStatus,
    duration?: number,
    error?: string
  ): void {
    const key = `${propertyId}_${roomId}`;
    let channels = this.channelStatus.get(key);

    if (!channels) {
      channels = new Map();
      this.channelStatus.set(key, channels);
    }

    let channelStatus = channels.get(channel);

    if (!channelStatus) {
      channelStatus = this.createDefaultChannelStatus(channel);
      channels.set(channel, channelStatus);
    }

    channelStatus.status = status;
    channelStatus.totalSyncs++;

    if (status === SyncStatus.SUCCESS) {
      channelStatus.successfulSyncs++;
      channelStatus.consecutiveFailures = 0;
      channelStatus.lastSync = new Date();
    } else if (status === SyncStatus.FAILED) {
      channelStatus.failedSyncs++;
      channelStatus.consecutiveFailures++;
      channelStatus.lastError = error;
    }

    if (duration) {
      const totalDuration = channelStatus.averageDuration * (channelStatus.totalSyncs - 1) + duration;
      channelStatus.averageDuration = totalDuration / channelStatus.totalSyncs;
    }
  }

  /**
   * Create default channel status
   */
  private createDefaultChannelStatus(channel: CalendarChannel): IChannelSyncStatus {
    return {
      channel,
      status: SyncStatus.IDLE,
      consecutiveFailures: 0,
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageDuration: 0
    };
  }

  /**
   * Add job to history
   */
  private addToHistory(job: ISyncJob): void {
    this.jobHistory.push(job);

    // Maintain max history size
    if (this.jobHistory.length > this.MAX_HISTORY) {
      this.jobHistory = this.jobHistory.slice(-this.MAX_HISTORY);
    }
  }

  /**
   * Get health status
   */
  public getHealthStatus(): {
    healthy: boolean;
    activeJobs: number;
    failedJobsLast24h: number;
    unresolvedConflicts: number;
    channelsWithIssues: CalendarChannel[];
  } {
    const activeJobs = this.syncJobs.size;

    // Get failed jobs in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failedJobsLast24h = this.jobHistory.filter(j =>
      j.status === SyncStatus.FAILED &&
      j.completedAt &&
      j.completedAt > oneDayAgo
    ).length;

    // Get total unresolved conflicts
    let unresolvedConflicts = 0;
    for (const channels of this.channelStatus.values()) {
      for (const status of channels.values()) {
        if (status.consecutiveFailures >= 3) {
          unresolvedConflicts++;
        }
      }
    }

    // Get channels with issues
    const channelsWithIssues: CalendarChannel[] = [];
    for (const channels of this.channelStatus.values()) {
      for (const [channel, status] of channels) {
        if (status.consecutiveFailures >= 3 && !channelsWithIssues.includes(channel)) {
          channelsWithIssues.push(channel);
        }
      }
    }

    const healthy = failedJobsLast24h < 10 && channelsWithIssues.length === 0;

    return {
      healthy,
      activeJobs,
      failedJobsLast24h,
      unresolvedConflicts,
      channelsWithIssues
    };
  }
}

// Singleton instance
export const syncMonitoringService = new SyncMonitoringService();
export default syncMonitoringService;

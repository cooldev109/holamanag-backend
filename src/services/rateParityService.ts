import Calendar, { ICalendar, CalendarChannel } from '../models/Calendar';
import { logger } from '../config/logger';
import { createError } from '../utils/errors';
import mongoose from 'mongoose';

// Rate parity violation interface
export interface IRateParityViolation {
  id: string;
  property: mongoose.Types.ObjectId;
  room: mongoose.Types.ObjectId;
  date: Date;
  baseChannel: CalendarChannel;
  baseRate: number;
  violations: Array<{
    channel: CalendarChannel;
    rate: number;
    difference: number;
    percentageDifference: number;
  }>;
  severity: 'low' | 'medium' | 'high';
  detected: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

// Rate parity rule interface
export interface IRateParityRule {
  id: string;
  property: mongoose.Types.ObjectId;
  room?: mongoose.Types.ObjectId;
  baseChannel: CalendarChannel;
  tolerance: number; // Percentage tolerance
  enforceHigher: boolean; // Enforce base channel has highest rate
  enforceLower: boolean; // Enforce base channel has lowest rate
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Rate sync result
export interface IRateSyncResult {
  synced: number;
  violations: number;
  errors: Array<{ channel: CalendarChannel; error: string }>;
}

class RateParityService {
  private parityRules: Map<string, IRateParityRule> = new Map();
  private violations: Map<string, IRateParityViolation> = new Map();

  /**
   * Check rate parity across channels
   */
  public async checkRateParity(
    propertyId: string,
    roomId: string,
    startDate: Date,
    endDate: Date
  ): Promise<IRateParityViolation[]> {
    try {
      logger.info(`Checking rate parity for property ${propertyId}, room ${roomId}`);

      const violations: IRateParityViolation[] = [];

      // Get active parity rule for this property/room
      const rule = this.getApplicableRule(propertyId, roomId);

      if (!rule || !rule.isActive) {
        logger.info('No active rate parity rule found');
        return [];
      }

      // Get all calendar entries for date range
      const calendars = await Calendar.find({
        property: propertyId,
        room: roomId,
        date: { $gte: startDate, $lte: endDate }
      });

      // Group by date
      const dateMap = new Map<string, ICalendar[]>();

      for (const calendar of calendars) {
        const dateKey = calendar.date.toISOString().split('T')[0];

        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, []);
        }

        dateMap.get(dateKey)!.push(calendar);
      }

      // Check each date
      for (const [dateKey, dateCalendars] of dateMap) {
        const baseCalendar = dateCalendars.find(c => c.channel === rule.baseChannel);

        if (!baseCalendar || !baseCalendar.rate) {
          continue;
        }

        const baseRate = baseCalendar.getEffectiveRate();
        const channelViolations: Array<{
          channel: CalendarChannel;
          rate: number;
          difference: number;
          percentageDifference: number;
        }> = [];

        // Check other channels
        for (const calendar of dateCalendars) {
          if (calendar.channel === rule.baseChannel) {
            continue;
          }

          const channelRate = calendar.getEffectiveRate();
          const difference = Math.abs(channelRate - baseRate);
          const percentageDifference = (difference / baseRate) * 100;

          // Check if violates tolerance
          if (percentageDifference > rule.tolerance) {
            channelViolations.push({
              channel: calendar.channel,
              rate: channelRate,
              difference,
              percentageDifference
            });
          }

          // Check enforce higher rule
          if (rule.enforceHigher && channelRate > baseRate) {
            channelViolations.push({
              channel: calendar.channel,
              rate: channelRate,
              difference: channelRate - baseRate,
              percentageDifference: ((channelRate - baseRate) / baseRate) * 100
            });
          }

          // Check enforce lower rule
          if (rule.enforceLower && channelRate < baseRate) {
            channelViolations.push({
              channel: calendar.channel,
              rate: channelRate,
              difference: baseRate - channelRate,
              percentageDifference: ((baseRate - channelRate) / baseRate) * 100
            });
          }
        }

        if (channelViolations.length > 0) {
          const violation: IRateParityViolation = {
            id: `${propertyId}_${roomId}_${dateKey}_${Date.now()}`,
            property: new mongoose.Types.ObjectId(propertyId),
            room: new mongoose.Types.ObjectId(roomId),
            date: new Date(dateKey),
            baseChannel: rule.baseChannel,
            baseRate,
            violations: channelViolations,
            severity: this.determineSeverity(channelViolations),
            detected: new Date(),
            resolved: false
          };

          violations.push(violation);
          this.violations.set(violation.id, violation);
        }
      }

      logger.info(`Found ${violations.length} rate parity violations`);

      return violations;
    } catch (error) {
      logger.error('Rate parity check failed:', error);
      throw createError.ratePlan(`Rate parity check failed: ${(error as Error).message}`);
    }
  }

  /**
   * Enforce rate parity across channels
   */
  public async enforceRateParity(
    propertyId: string,
    roomId: string,
    startDate: Date,
    endDate: Date,
    baseChannel: CalendarChannel = CalendarChannel.DIRECT
  ): Promise<IRateSyncResult> {
    try {
      logger.info(`Enforcing rate parity for property ${propertyId}, room ${roomId}`);

      let synced = 0;
      const errors: Array<{ channel: CalendarChannel; error: string }> = [];

      // Get base channel rates
      const baseRates = await Calendar.find({
        property: propertyId,
        room: roomId,
        channel: baseChannel,
        date: { $gte: startDate, $lte: endDate }
      });

      if (baseRates.length === 0) {
        throw createError.notFound('No base channel rates found');
      }

      // Sync rates to other channels
      const channels = [
        CalendarChannel.AIRBNB,
        CalendarChannel.BOOKING,
        CalendarChannel.EXPEDIA,
        CalendarChannel.AGODA,
        CalendarChannel.VRBO
      ].filter(c => c !== baseChannel);

      for (const baseRate of baseRates) {
        for (const channel of channels) {
          try {
            let calendar = await Calendar.findOne({
              property: propertyId,
              room: roomId,
              channel,
              date: baseRate.date
            });

            if (calendar) {
              // Update existing
              calendar.rate = baseRate.rate;
              calendar.currency = baseRate.currency;
              calendar.minStay = baseRate.minStay;
              calendar.maxStay = baseRate.maxStay;
              await calendar.save();
            } else {
              // Create new
              calendar = new Calendar({
                property: propertyId,
                room: roomId,
                date: baseRate.date,
                status: baseRate.status,
                rate: baseRate.rate,
                currency: baseRate.currency,
                minStay: baseRate.minStay,
                maxStay: baseRate.maxStay,
                channel
              });
              await calendar.save();
            }

            synced++;
          } catch (error) {
            errors.push({
              channel,
              error: `Failed to sync rate for ${baseRate.date}: ${(error as Error).message}`
            });
          }
        }
      }

      // Check for remaining violations
      const violations = await this.checkRateParity(propertyId, roomId, startDate, endDate);

      logger.info(`Rate parity enforcement completed: ${synced} synced, ${violations.length} violations, ${errors.length} errors`);

      return {
        synced,
        violations: violations.length,
        errors
      };
    } catch (error) {
      logger.error('Rate parity enforcement failed:', error);
      throw createError.ratePlan(`Rate parity enforcement failed: ${(error as Error).message}`);
    }
  }

  /**
   * Sync specific channel rate to base rate
   */
  public async syncChannelToBase(
    propertyId: string,
    roomId: string,
    date: Date,
    targetChannel: CalendarChannel,
    baseChannel: CalendarChannel
  ): Promise<boolean> {
    try {
      const baseCalendar = await Calendar.findOne({
        property: propertyId,
        room: roomId,
        channel: baseChannel,
        date
      });

      if (!baseCalendar) {
        throw createError.notFound('Base channel calendar not found');
      }

      let targetCalendar = await Calendar.findOne({
        property: propertyId,
        room: roomId,
        channel: targetChannel,
        date
      });

      if (targetCalendar) {
        targetCalendar.rate = baseCalendar.rate;
        targetCalendar.currency = baseCalendar.currency;
        targetCalendar.minStay = baseCalendar.minStay;
        targetCalendar.maxStay = baseCalendar.maxStay;
        await targetCalendar.save();
      } else {
        targetCalendar = new Calendar({
          property: propertyId,
          room: roomId,
          date,
          status: baseCalendar.status,
          rate: baseCalendar.rate,
          currency: baseCalendar.currency,
          minStay: baseCalendar.minStay,
          maxStay: baseCalendar.maxStay,
          channel: targetChannel
        });
        await targetCalendar.save();
      }

      logger.info(`Synced ${targetChannel} to ${baseChannel} for ${date}`);
      return true;
    } catch (error) {
      logger.error('Channel sync failed:', error);
      return false;
    }
  }

  /**
   * Add rate parity rule
   */
  public addParityRule(
    propertyId: string,
    baseChannel: CalendarChannel,
    options: {
      roomId?: string;
      tolerance?: number;
      enforceHigher?: boolean;
      enforceLower?: boolean;
    } = {}
  ): string {
    const id = `parity_${propertyId}_${baseChannel}_${Date.now()}`;

    const rule: IRateParityRule = {
      id,
      property: new mongoose.Types.ObjectId(propertyId),
      room: options.roomId ? new mongoose.Types.ObjectId(options.roomId) : undefined,
      baseChannel,
      tolerance: options.tolerance || 5, // 5% default tolerance
      enforceHigher: options.enforceHigher || false,
      enforceLower: options.enforceLower || false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.parityRules.set(id, rule);
    logger.info(`Added rate parity rule: ${id}`);

    return id;
  }

  /**
   * Update parity rule
   */
  public updateParityRule(
    ruleId: string,
    updates: Partial<Omit<IRateParityRule, 'id' | 'createdAt'>>
  ): boolean {
    const rule = this.parityRules.get(ruleId);

    if (!rule) {
      return false;
    }

    const updatedRule = {
      ...rule,
      ...updates,
      updatedAt: new Date()
    };

    this.parityRules.set(ruleId, updatedRule);
    logger.info(`Updated rate parity rule: ${ruleId}`);

    return true;
  }

  /**
   * Delete parity rule
   */
  public deleteParityRule(ruleId: string): boolean {
    const deleted = this.parityRules.delete(ruleId);

    if (deleted) {
      logger.info(`Deleted rate parity rule: ${ruleId}`);
    }

    return deleted;
  }

  /**
   * Get applicable rule for property/room
   */
  private getApplicableRule(propertyId: string, roomId?: string): IRateParityRule | undefined {
    for (const rule of this.parityRules.values()) {
      if (rule.property.toString() === propertyId) {
        if (!rule.room || (roomId && rule.room.toString() === roomId)) {
          return rule;
        }
      }
    }

    return undefined;
  }

  /**
   * Determine violation severity
   */
  private determineSeverity(
    violations: Array<{
      channel: CalendarChannel;
      rate: number;
      difference: number;
      percentageDifference: number;
    }>
  ): 'low' | 'medium' | 'high' {
    const maxDifference = Math.max(...violations.map(v => v.percentageDifference));

    if (maxDifference > 20) {
      return 'high';
    } else if (maxDifference > 10) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Get all violations
   */
  public getViolations(propertyId?: string, resolved?: boolean): IRateParityViolation[] {
    const violations = Array.from(this.violations.values());

    return violations.filter(v => {
      if (propertyId && v.property.toString() !== propertyId) {
        return false;
      }

      if (resolved !== undefined && v.resolved !== resolved) {
        return false;
      }

      return true;
    });
  }

  /**
   * Resolve violation
   */
  public resolveViolation(violationId: string): boolean {
    const violation = this.violations.get(violationId);

    if (!violation) {
      return false;
    }

    violation.resolved = true;
    violation.resolvedAt = new Date();

    logger.info(`Resolved rate parity violation: ${violationId}`);
    return true;
  }
}

// Singleton instance
export const rateParityService = new RateParityService();
export default rateParityService;

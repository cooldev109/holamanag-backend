import RatePlan, { RatePlanStatus } from '../models/RatePlan';
import Calendar from '../models/Calendar';
import Booking from '../models/Booking';
import { logger } from '../config/logger';
import { createError } from '../utils/errors';
import mongoose from 'mongoose';

// Pricing strategy enum
export enum PricingStrategy {
  OCCUPANCY_BASED = 'occupancy_based', // Based on current occupancy
  DEMAND_BASED = 'demand_based', // Based on booking demand
  SEASONAL = 'seasonal', // Seasonal pricing
  COMPETITIVE = 'competitive', // Competitive pricing
  DYNAMIC = 'dynamic', // AI/ML based dynamic pricing
  FIXED = 'fixed' // Fixed pricing
}

// Pricing rule interface
export interface IPricingRule {
  id: string;
  name: string;
  strategy: PricingStrategy;
  property: mongoose.Types.ObjectId;
  room?: mongoose.Types.ObjectId;
  priority: number;
  isActive: boolean;
  conditions: {
    occupancyThreshold?: number;
    demandThreshold?: number;
    dayOfWeek?: number[]; // 0-6 (Sunday-Saturday)
    seasonalPeriod?: {
      startMonth: number;
      endMonth: number;
    };
    advanceBookingDays?: {
      min?: number;
      max?: number;
    };
  };
  adjustments: {
    type: 'percentage' | 'fixed';
    value: number;
    min?: number;
    max?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Rate calculation result
export interface IRateCalculationResult {
  baseRate: number;
  finalRate: number;
  currency: string;
  appliedRules: Array<{
    ruleName: string;
    strategy: PricingStrategy;
    adjustment: number;
    adjustmentType: 'percentage' | 'fixed';
  }>;
  breakdown: {
    baseRate: number;
    seasonalAdjustment: number;
    occupancyAdjustment: number;
    demandAdjustment: number;
    lengthOfStayDiscount: number;
    advanceBookingDiscount: number;
    otherAdjustments: number;
  };
}

class DynamicPricingService {
  private pricingRules: Map<string, IPricingRule> = new Map();

  /**
   * Calculate dynamic rate for a specific date and room
   */
  public async calculateDynamicRate(
    propertyId: string,
    roomId: string,
    checkIn: Date,
    checkOut: Date,
    _guests: number = 1
  ): Promise<IRateCalculationResult> {
    try {
      logger.info(`Calculating dynamic rate for property ${propertyId}, room ${roomId}`);

      // Get applicable rate plans
      const ratePlans = await RatePlan.find({
        property: propertyId,
        room: roomId,
        status: RatePlanStatus.ACTIVE,
        validFrom: { $lte: checkIn },
        validTo: { $gte: checkOut }
      }).sort({ priority: -1 });

      if (ratePlans.length === 0) {
        throw createError.notFound('No active rate plans found');
      }

      // Use highest priority rate plan
      const ratePlan = ratePlans[0];
      let baseRate = ratePlan.baseRate;
      const currency = ratePlan.currency;

      // Calculate nights
      const nights = Math.ceil(
        (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate advance booking days
      const advanceBookingDays = Math.ceil(
        (checkIn.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      // Initialize breakdown
      const breakdown = {
        baseRate,
        seasonalAdjustment: 0,
        occupancyAdjustment: 0,
        demandAdjustment: 0,
        lengthOfStayDiscount: 0,
        advanceBookingDiscount: 0,
        otherAdjustments: 0
      };

      const appliedRules: Array<{
        ruleName: string;
        strategy: PricingStrategy;
        adjustment: number;
        adjustmentType: 'percentage' | 'fixed';
      }> = [];

      // Apply seasonal rates
      if (ratePlan.seasonalRates && ratePlan.seasonalRates.length > 0) {
        for (const seasonalRate of ratePlan.seasonalRates) {
          if (checkIn >= seasonalRate.startDate && checkOut <= seasonalRate.endDate) {
            const oldRate = baseRate;
            baseRate = seasonalRate.rate;
            breakdown.seasonalAdjustment = baseRate - oldRate;

            appliedRules.push({
              ruleName: 'Seasonal Rate',
              strategy: PricingStrategy.SEASONAL,
              adjustment: breakdown.seasonalAdjustment,
              adjustmentType: 'fixed'
            });

            break;
          }
        }
      }

      // Apply length of stay discounts
      if (ratePlan.lengthOfStayDiscounts && ratePlan.lengthOfStayDiscounts.length > 0) {
        for (const discount of ratePlan.lengthOfStayDiscounts) {
          if (nights >= discount.minNights &&
              (!discount.maxNights || nights <= discount.maxNights)) {
            let discountAmount = 0;

            if (discount.discountType === 'percentage') {
              discountAmount = baseRate * (discount.discountValue / 100);
            } else {
              discountAmount = discount.discountValue;
            }

            baseRate -= discountAmount;
            breakdown.lengthOfStayDiscount -= discountAmount;

            appliedRules.push({
              ruleName: `Length of Stay Discount (${nights} nights)`,
              strategy: PricingStrategy.FIXED,
              adjustment: -discountAmount,
              adjustmentType: discount.discountType
            });

            break;
          }
        }
      }

      // Apply advance booking discounts
      if (ratePlan.advanceBookingDiscounts && ratePlan.advanceBookingDiscounts.length > 0) {
        for (const discount of ratePlan.advanceBookingDiscounts) {
          if (advanceBookingDays >= discount.minDaysAdvance &&
              (!discount.maxDaysAdvance || advanceBookingDays <= discount.maxDaysAdvance)) {
            let discountAmount = 0;

            if (discount.discountType === 'percentage') {
              discountAmount = baseRate * (discount.discountValue / 100);
            } else {
              discountAmount = discount.discountValue;
            }

            baseRate -= discountAmount;
            breakdown.advanceBookingDiscount -= discountAmount;

            appliedRules.push({
              ruleName: `Early Bird Discount (${advanceBookingDays} days advance)`,
              strategy: PricingStrategy.FIXED,
              adjustment: -discountAmount,
              adjustmentType: discount.discountType
            });

            break;
          }
        }
      }

      // Apply occupancy-based pricing
      const occupancyAdjustment = await this.calculateOccupancyAdjustment(
        propertyId,
        roomId,
        checkIn
      );

      if (occupancyAdjustment !== 0) {
        baseRate += occupancyAdjustment;
        breakdown.occupancyAdjustment = occupancyAdjustment;

        appliedRules.push({
          ruleName: 'Occupancy-Based Pricing',
          strategy: PricingStrategy.OCCUPANCY_BASED,
          adjustment: occupancyAdjustment,
          adjustmentType: 'fixed'
        });
      }

      // Apply demand-based pricing
      const demandAdjustment = await this.calculateDemandAdjustment(
        propertyId,
        roomId,
        checkIn,
        checkOut
      );

      if (demandAdjustment !== 0) {
        baseRate += demandAdjustment;
        breakdown.demandAdjustment = demandAdjustment;

        appliedRules.push({
          ruleName: 'Demand-Based Pricing',
          strategy: PricingStrategy.DEMAND_BASED,
          adjustment: demandAdjustment,
          adjustmentType: 'fixed'
        });
      }

      // Apply custom pricing rules
      const customAdjustments = await this.applyCustomPricingRules(
        propertyId,
        roomId,
        checkIn,
        checkOut,
        baseRate
      );

      for (const adj of customAdjustments) {
        baseRate += adj.adjustment;
        breakdown.otherAdjustments += adj.adjustment;
        appliedRules.push(adj);
      }

      // Ensure rate doesn't go below minimum
      const finalRate = Math.max(baseRate, 0);

      logger.info(`Dynamic rate calculated: ${finalRate} ${currency}`);

      return {
        baseRate: breakdown.baseRate,
        finalRate,
        currency,
        appliedRules,
        breakdown
      };
    } catch (error) {
      logger.error('Dynamic rate calculation failed:', error);
      throw createError.ratePlan(`Dynamic rate calculation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Calculate occupancy-based adjustment
   */
  private async calculateOccupancyAdjustment(
    propertyId: string,
    roomId: string,
    date: Date
  ): Promise<number> {
    try {
      // Get occupancy for the next 30 days
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 30);

      const calendars = await Calendar.find({
        property: propertyId,
        room: roomId,
        date: { $gte: date, $lte: endDate }
      });

      const totalDays = calendars.length;
      const bookedDays = calendars.filter(c => c.status === 'booked').length;
      const occupancyRate = totalDays > 0 ? (bookedDays / totalDays) * 100 : 0;

      // Apply adjustment based on occupancy
      if (occupancyRate > 80) {
        return 20; // Increase rate by $20 for high occupancy
      } else if (occupancyRate > 60) {
        return 10; // Increase rate by $10 for medium-high occupancy
      } else if (occupancyRate < 30) {
        return -10; // Decrease rate by $10 for low occupancy
      }

      return 0;
    } catch (error) {
      logger.error('Error calculating occupancy adjustment:', error);
      return 0;
    }
  }

  /**
   * Calculate demand-based adjustment
   */
  private async calculateDemandAdjustment(
    propertyId: string,
    roomId: string,
    checkIn: Date,
    checkOut: Date
  ): Promise<number> {
    try {
      // Get recent booking velocity (bookings in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentBookings = await Booking.countDocuments({
        property: propertyId,
        room: roomId,
        checkIn: { $gte: checkIn, $lte: checkOut },
        createdAt: { $gte: sevenDaysAgo },
        status: { $in: ['confirmed', 'checked_in'] }
      });

      // Apply adjustment based on demand
      if (recentBookings > 10) {
        return 30; // High demand
      } else if (recentBookings > 5) {
        return 15; // Medium demand
      }

      return 0;
    } catch (error) {
      logger.error('Error calculating demand adjustment:', error);
      return 0;
    }
  }

  /**
   * Apply custom pricing rules
   */
  private async applyCustomPricingRules(
    propertyId: string,
    roomId: string,
    checkIn: Date,
    _checkOut: Date,
    currentRate: number
  ): Promise<Array<{
    ruleName: string;
    strategy: PricingStrategy;
    adjustment: number;
    adjustmentType: 'percentage' | 'fixed';
  }>> {
    const adjustments: Array<{
      ruleName: string;
      strategy: PricingStrategy;
      adjustment: number;
      adjustmentType: 'percentage' | 'fixed';
    }> = [];

    // Get active pricing rules for this property/room
    const rules = Array.from(this.pricingRules.values()).filter(rule =>
      rule.isActive &&
      rule.property.toString() === propertyId &&
      (!rule.room || rule.room.toString() === roomId)
    ).sort((a, b) => b.priority - a.priority);

    for (const rule of rules) {
      // Check if rule conditions are met
      if (this.checkRuleConditions(rule, checkIn)) {
        let adjustment = 0;

        if (rule.adjustments.type === 'percentage') {
          adjustment = currentRate * (rule.adjustments.value / 100);
        } else {
          adjustment = rule.adjustments.value;
        }

        // Apply min/max constraints
        if (rule.adjustments.min !== undefined) {
          adjustment = Math.max(adjustment, rule.adjustments.min);
        }

        if (rule.adjustments.max !== undefined) {
          adjustment = Math.min(adjustment, rule.adjustments.max);
        }

        adjustments.push({
          ruleName: rule.name,
          strategy: rule.strategy,
          adjustment,
          adjustmentType: rule.adjustments.type
        });
      }
    }

    return adjustments;
  }

  /**
   * Check if pricing rule conditions are met
   */
  private checkRuleConditions(rule: IPricingRule, checkIn: Date): boolean {
    // Check day of week
    if (rule.conditions.dayOfWeek && rule.conditions.dayOfWeek.length > 0) {
      const dayOfWeek = checkIn.getDay();
      if (!rule.conditions.dayOfWeek.includes(dayOfWeek)) {
        return false;
      }
    }

    // Check seasonal period
    if (rule.conditions.seasonalPeriod) {
      const month = checkIn.getMonth() + 1;
      const { startMonth, endMonth } = rule.conditions.seasonalPeriod;

      if (startMonth <= endMonth) {
        if (month < startMonth || month > endMonth) {
          return false;
        }
      } else {
        // Wraps around year (e.g., Dec-Feb)
        if (month < startMonth && month > endMonth) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Add pricing rule
   */
  public addPricingRule(rule: Omit<IPricingRule, 'id' | 'createdAt' | 'updatedAt'>): string {
    const id = `rule_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const newRule: IPricingRule = {
      ...rule,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.pricingRules.set(id, newRule);
    logger.info(`Added pricing rule: ${newRule.name}`);

    return id;
  }

  /**
   * Update pricing rule
   */
  public updatePricingRule(
    ruleId: string,
    updates: Partial<Omit<IPricingRule, 'id' | 'createdAt'>>
  ): boolean {
    const rule = this.pricingRules.get(ruleId);

    if (!rule) {
      return false;
    }

    const updatedRule = {
      ...rule,
      ...updates,
      updatedAt: new Date()
    };

    this.pricingRules.set(ruleId, updatedRule);
    logger.info(`Updated pricing rule: ${ruleId}`);

    return true;
  }

  /**
   * Delete pricing rule
   */
  public deletePricingRule(ruleId: string): boolean {
    const deleted = this.pricingRules.delete(ruleId);

    if (deleted) {
      logger.info(`Deleted pricing rule: ${ruleId}`);
    }

    return deleted;
  }

  /**
   * Get pricing rules
   */
  public getPricingRules(propertyId?: string): IPricingRule[] {
    const rules = Array.from(this.pricingRules.values());

    if (propertyId) {
      return rules.filter(r => r.property.toString() === propertyId);
    }

    return rules;
  }
}

// Singleton instance
export const dynamicPricingService = new DynamicPricingService();
export default dynamicPricingService;

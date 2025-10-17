import RatePlan, { IRatePlan, RatePlanType, RatePlanStatus, CancellationPolicy, ISeasonalRate, ILengthOfStayDiscount, IAdvanceBookingDiscount } from '../models/RatePlan';
import { logger } from '../config/logger';
import { createError } from '../utils/errors';
import mongoose from 'mongoose';

// Rate plan template interface
export interface IRatePlanTemplate {
  id: string;
  name: string;
  description: string;
  type: RatePlanType;
  baseRateMultiplier?: number; // Multiplier to apply to property base rate
  cancellationPolicy: CancellationPolicy;
  minStay: number;
  maxStay?: number;
  includesBreakfast: boolean;
  includesTaxes: boolean;
  includesFees: boolean;
  seasonalRates?: ISeasonalRate[];
  lengthOfStayDiscounts?: ILengthOfStayDiscount[];
  advanceBookingDiscounts?: IAdvanceBookingDiscount[];
  restrictions: {
    blackoutDates?: Date[];
    minAdvanceBooking?: number;
    maxAdvanceBooking?: number;
    restrictedChannels?: string[];
    guestTypeRestrictions?: string[];
  };
  isPublic: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Automation rule interface
export interface IRatePlanAutomationRule {
  id: string;
  name: string;
  property: mongoose.Types.ObjectId;
  room?: mongoose.Types.ObjectId;
  templateId: string;
  trigger: {
    type: 'occupancy' | 'date' | 'season' | 'manual';
    occupancyThreshold?: number;
    dateRange?: { start: Date; end: Date };
    seasonalPeriod?: { startMonth: number; endMonth: number };
  };
  action: {
    createRatePlan: boolean;
    updateExisting: boolean;
    priority?: number;
  };
  isActive: boolean;
  lastRun?: Date;
  nextRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

class RatePlanTemplateService {
  private templates: Map<string, IRatePlanTemplate> = new Map();
  private automationRules: Map<string, IRatePlanAutomationRule> = new Map();

  constructor() {
    // Initialize default templates
    this.initializeDefaultTemplates();
  }

  /**
   * Initialize default rate plan templates
   */
  private initializeDefaultTemplates(): void {
    // Standard Rate Template
    this.templates.set('standard', {
      id: 'standard',
      name: 'Standard Rate',
      description: 'Basic standard rate plan',
      type: RatePlanType.STANDARD,
      baseRateMultiplier: 1.0,
      cancellationPolicy: CancellationPolicy.FREE_CANCELLATION,
      minStay: 1,
      includesBreakfast: false,
      includesTaxes: false,
      includesFees: false,
      restrictions: {},
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Early Bird Template
    this.templates.set('early_bird', {
      id: 'early_bird',
      name: 'Early Bird Special',
      description: 'Discounted rate for advance bookings',
      type: RatePlanType.ADVANCE_PURCHASE,
      baseRateMultiplier: 0.85,
      cancellationPolicy: CancellationPolicy.NON_REFUNDABLE,
      minStay: 2,
      includesBreakfast: true,
      includesTaxes: false,
      includesFees: false,
      advanceBookingDiscounts: [
        {
          minDaysAdvance: 30,
          discountType: 'percentage',
          discountValue: 15
        },
        {
          minDaysAdvance: 60,
          discountType: 'percentage',
          discountValue: 20
        }
      ],
      restrictions: {
        minAdvanceBooking: 14
      },
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Last Minute Template
    this.templates.set('last_minute', {
      id: 'last_minute',
      name: 'Last Minute Deal',
      description: 'Special rate for last-minute bookings',
      type: RatePlanType.LAST_MINUTE,
      baseRateMultiplier: 0.75,
      cancellationPolicy: CancellationPolicy.NON_REFUNDABLE,
      minStay: 1,
      includesBreakfast: false,
      includesTaxes: false,
      includesFees: false,
      restrictions: {
        maxAdvanceBooking: 3
      },
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Long Stay Template
    this.templates.set('long_stay', {
      id: 'long_stay',
      name: 'Long Stay Discount',
      description: 'Special rate for extended stays',
      type: RatePlanType.PROMOTIONAL,
      baseRateMultiplier: 0.9,
      cancellationPolicy: CancellationPolicy.FREE_CANCELLATION,
      minStay: 7,
      includesBreakfast: true,
      includesTaxes: false,
      includesFees: false,
      lengthOfStayDiscounts: [
        {
          minNights: 7,
          maxNights: 13,
          discountType: 'percentage',
          discountValue: 10
        },
        {
          minNights: 14,
          discountType: 'percentage',
          discountValue: 20
        }
      ],
      restrictions: {},
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Weekend Special Template
    this.templates.set('weekend_special', {
      id: 'weekend_special',
      name: 'Weekend Special',
      description: 'Special weekend rate',
      type: RatePlanType.PROMOTIONAL,
      baseRateMultiplier: 1.15,
      cancellationPolicy: CancellationPolicy.FREE_CANCELLATION,
      minStay: 2,
      includesBreakfast: true,
      includesTaxes: false,
      includesFees: false,
      restrictions: {},
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    logger.info('Initialized default rate plan templates');
  }

  /**
   * Create rate plan from template
   */
  public async createFromTemplate(
    templateId: string,
    propertyId: string,
    roomId: string,
    baseRate: number,
    validFrom: Date,
    validTo: Date,
    userId: string,
    customizations?: Partial<IRatePlan>
  ): Promise<IRatePlan> {
    try {
      const template = this.templates.get(templateId);

      if (!template) {
        throw createError.notFound('Rate plan template not found');
      }

      logger.info(`Creating rate plan from template ${templateId} for property ${propertyId}`);

      // Calculate effective base rate
      const effectiveBaseRate = template.baseRateMultiplier
        ? baseRate * template.baseRateMultiplier
        : baseRate;

      // Create rate plan
      const ratePlan = new RatePlan({
        property: propertyId,
        room: roomId,
        name: customizations?.name || template.name,
        description: customizations?.description || template.description,
        type: template.type,
        baseRate: effectiveBaseRate,
        currency: customizations?.currency || 'USD',
        isRefundable: template.cancellationPolicy !== CancellationPolicy.NON_REFUNDABLE,
        cancellationPolicy: template.cancellationPolicy,
        minStay: template.minStay,
        maxStay: template.maxStay,
        includesBreakfast: template.includesBreakfast,
        includesTaxes: template.includesTaxes,
        includesFees: template.includesFees,
        validFrom,
        validTo,
        status: RatePlanStatus.ACTIVE,
        priority: customizations?.priority || 0,
        seasonalRates: template.seasonalRates,
        lengthOfStayDiscounts: template.lengthOfStayDiscounts,
        advanceBookingDiscounts: template.advanceBookingDiscounts,
        restrictions: template.restrictions,
        createdBy: userId,
        ...customizations
      });

      await ratePlan.save();

      logger.info(`Created rate plan from template: ${ratePlan._id}`);

      return ratePlan;
    } catch (error) {
      logger.error('Failed to create rate plan from template:', error);
      throw createError.ratePlan(`Failed to create rate plan from template: ${(error as Error).message}`);
    }
  }

  /**
   * Add custom template
   */
  public addTemplate(template: Omit<IRatePlanTemplate, 'id' | 'createdAt' | 'updatedAt'>): string {
    const id = `template_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const newTemplate: IRatePlanTemplate = {
      ...template,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.templates.set(id, newTemplate);
    logger.info(`Added rate plan template: ${newTemplate.name}`);

    return id;
  }

  /**
   * Update template
   */
  public updateTemplate(
    templateId: string,
    updates: Partial<Omit<IRatePlanTemplate, 'id' | 'createdAt'>>
  ): boolean {
    const template = this.templates.get(templateId);

    if (!template) {
      return false;
    }

    const updatedTemplate = {
      ...template,
      ...updates,
      updatedAt: new Date()
    };

    this.templates.set(templateId, updatedTemplate);
    logger.info(`Updated rate plan template: ${templateId}`);

    return true;
  }

  /**
   * Delete template
   */
  public deleteTemplate(templateId: string): boolean {
    const template = this.templates.get(templateId);

    if (!template || template.isPublic) {
      return false; // Cannot delete public templates
    }

    const deleted = this.templates.delete(templateId);

    if (deleted) {
      logger.info(`Deleted rate plan template: ${templateId}`);
    }

    return deleted;
  }

  /**
   * Get templates
   */
  public getTemplates(includePrivate: boolean = false): IRatePlanTemplate[] {
    const templates = Array.from(this.templates.values());

    if (includePrivate) {
      return templates;
    }

    return templates.filter(t => t.isPublic);
  }

  /**
   * Get template by ID
   */
  public getTemplate(templateId: string): IRatePlanTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Add automation rule
   */
  public addAutomationRule(rule: Omit<IRatePlanAutomationRule, 'id' | 'createdAt' | 'updatedAt'>): string {
    const id = `automation_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const newRule: IRatePlanAutomationRule = {
      ...rule,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.automationRules.set(id, newRule);
    logger.info(`Added rate plan automation rule: ${newRule.name}`);

    return id;
  }

  /**
   * Update automation rule
   */
  public updateAutomationRule(
    ruleId: string,
    updates: Partial<Omit<IRatePlanAutomationRule, 'id' | 'createdAt'>>
  ): boolean {
    const rule = this.automationRules.get(ruleId);

    if (!rule) {
      return false;
    }

    const updatedRule = {
      ...rule,
      ...updates,
      updatedAt: new Date()
    };

    this.automationRules.set(ruleId, updatedRule);
    logger.info(`Updated rate plan automation rule: ${ruleId}`);

    return true;
  }

  /**
   * Delete automation rule
   */
  public deleteAutomationRule(ruleId: string): boolean {
    const deleted = this.automationRules.delete(ruleId);

    if (deleted) {
      logger.info(`Deleted rate plan automation rule: ${ruleId}`);
    }

    return deleted;
  }

  /**
   * Get automation rules
   */
  public getAutomationRules(propertyId?: string): IRatePlanAutomationRule[] {
    const rules = Array.from(this.automationRules.values());

    if (propertyId) {
      return rules.filter(r => r.property.toString() === propertyId);
    }

    return rules;
  }

  /**
   * Execute automation rules
   */
  public async executeAutomationRules(propertyId?: string): Promise<{
    executed: number;
    created: number;
    errors: string[];
  }> {
    try {
      logger.info('Executing rate plan automation rules');

      let executed = 0;
      let created = 0;
      const errors: string[] = [];

      const rules = this.getAutomationRules(propertyId).filter(r => r.isActive);

      for (const rule of rules) {
        try {
          const shouldExecute = await this.shouldExecuteRule(rule);

          if (shouldExecute) {
            const template = this.templates.get(rule.templateId);

            if (!template) {
              errors.push(`Template ${rule.templateId} not found for rule ${rule.id}`);
              continue;
            }

            // Execute rule action
            if (rule.action.createRatePlan) {
              // This is a placeholder - in production, you'd get actual property data
              // and create rate plans based on the template
              created++;
            }

            // Update rule
            rule.lastRun = new Date();
            rule.nextRun = this.calculateNextRun(rule);

            executed++;
          }
        } catch (error) {
          errors.push(`Error executing rule ${rule.id}: ${(error as Error).message}`);
        }
      }

      logger.info(`Automation execution completed: ${executed} executed, ${created} created, ${errors.length} errors`);

      return { executed, created, errors };
    } catch (error) {
      logger.error('Automation execution failed:', error);
      throw createError.ratePlan(`Automation execution failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check if rule should be executed
   */
  private async shouldExecuteRule(rule: IRatePlanAutomationRule): Promise<boolean> {
    // Check trigger conditions
    switch (rule.trigger.type) {
      case 'date':
        if (rule.trigger.dateRange) {
          const now = new Date();
          return now >= rule.trigger.dateRange.start && now <= rule.trigger.dateRange.end;
        }
        return false;

      case 'season':
        if (rule.trigger.seasonalPeriod) {
          const month = new Date().getMonth() + 1;
          const { startMonth, endMonth } = rule.trigger.seasonalPeriod;

          if (startMonth <= endMonth) {
            return month >= startMonth && month <= endMonth;
          } else {
            return month >= startMonth || month <= endMonth;
          }
        }
        return false;

      case 'manual':
        return false; // Manual rules are not auto-executed

      case 'occupancy':
        // This would require checking actual occupancy data
        return false;

      default:
        return false;
    }
  }

  /**
   * Calculate next run time for automation rule
   */
  private calculateNextRun(rule: IRatePlanAutomationRule): Date | undefined {
    const now = new Date();

    switch (rule.trigger.type) {
      case 'date':
        if (rule.trigger.dateRange) {
          return rule.trigger.dateRange.start;
        }
        return undefined;

      case 'season':
        // Calculate next season start
        if (rule.trigger.seasonalPeriod) {
          const nextYear = now.getFullYear() + 1;
          return new Date(nextYear, rule.trigger.seasonalPeriod.startMonth - 1, 1);
        }
        return undefined;

      default:
        return undefined;
    }
  }
}

// Singleton instance
export const ratePlanTemplateService = new RatePlanTemplateService();
export default ratePlanTemplateService;

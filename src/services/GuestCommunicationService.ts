import mongoose from 'mongoose';
import EmailTemplate, { EmailTemplateType, IEmailTemplate } from '../models/EmailTemplate';
import Booking, { IBooking, BookingStatus } from '../models/Booking';
import Property from '../models/Property';
import { logger } from '../config/logger';

/**
 * Email Provider Configuration
 */
export interface EmailProvider {
  sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
  }): Promise<EmailResult>;
}

/**
 * Email Send Result
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Email Variables for Template Rendering
 */
export interface EmailVariables {
  guestName: string;
  guestEmail: string;
  propertyName: string;
  propertyAddress?: string;
  propertyPhone?: string;
  checkInDate: string;
  checkOutDate: string;
  checkInTime?: string;
  checkOutTime?: string;
  roomType?: string;
  roomNumber?: string;
  numberOfGuests?: number;
  numberOfNights?: number;
  totalAmount?: number;
  bookingReference: string;
  confirmationCode?: string;
  specialRequests?: string;
  paymentStatus?: string;
  balanceDue?: number;
  cancellationPolicy?: string;
  [key: string]: any; // Allow additional custom variables
}

/**
 * Scheduled Email Record
 */
export interface ScheduledEmail {
  templateId: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  guestEmail: string;
  scheduledFor: Date;
  variables: EmailVariables;
  status: 'pending' | 'sent' | 'failed';
  attemptCount: number;
  lastError?: string;
}

/**
 * Guest Communication Service
 * Handles automated email communication with guests
 */
class GuestCommunicationService {
  private emailProvider?: EmailProvider;
  private defaultFromEmail: string;

  constructor() {
    this.defaultFromEmail = process.env['EMAIL_FROM'] || 'noreply@reservario.com';
  }

  /**
   * Set email provider (SendGrid, AWS SES, etc.)
   */
  setEmailProvider(provider: EmailProvider): void {
    this.emailProvider = provider;
    logger.info('[GuestCommunication] Email provider configured');
  }

  /**
   * Send email using template
   */
  async sendTemplateEmail(
    templateType: EmailTemplateType,
    bookingId: mongoose.Types.ObjectId,
    language: string = 'en',
    additionalVariables?: Record<string, any>
  ): Promise<EmailResult> {
    try {
      logger.info(`[GuestCommunication] Sending ${templateType} email for booking ${bookingId}`);

      // Get booking details
      const booking = await Booking.findById(bookingId).populate('property').populate('room');
      if (!booking) {
        throw new Error('Booking not found');
      }

      const property = booking.property as any;
      const room = booking.room as any;

      // Get appropriate template
      const template = await this.getTemplate(
        templateType,
        language,
        property._id,
        property.organization
      );

      if (!template) {
        throw new Error(`No active template found for type ${templateType}`);
      }

      // Prepare variables
      const variables = this.prepareEmailVariables(booking, property, room, additionalVariables);

      // Render template
      const { subject, body } = template.renderTemplate(variables);

      // Send email
      const result = await this.sendEmail({
        to: booking.guestInfo.email,
        subject,
        html: body,
        text: template.plainTextBody,
        from: property.contactInfo?.email || this.defaultFromEmail,
        replyTo: property.contactInfo?.email
      });

      // Update statistics
      if (result.success) {
        template.stats.sent += 1;
        await template.save();
        logger.info(`[GuestCommunication] Email sent successfully to ${booking.guestInfo.email}`);
      }

      return result;
    } catch (error) {
      logger.error('[GuestCommunication] Error sending template email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send email with custom content
   */
  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
  }): Promise<EmailResult> {
    try {
      if (!this.emailProvider) {
        logger.warn('[GuestCommunication] No email provider configured, logging email instead');
        logger.info('[GuestCommunication] Email:', {
          to: params.to,
          subject: params.subject,
          from: params.from || this.defaultFromEmail
        });

        // Return success in development mode without actual email provider
        return {
          success: true,
          messageId: `dev-${Date.now()}`
        };
      }

      const result = await this.emailProvider.sendEmail({
        ...params,
        from: params.from || this.defaultFromEmail
      });

      return result;
    } catch (error) {
      logger.error('[GuestCommunication] Error sending email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get appropriate template based on type, language, and scope
   */
  private async getTemplate(
    type: EmailTemplateType,
    language: string,
    propertyId?: mongoose.Types.ObjectId,
    organizationId?: mongoose.Types.ObjectId
  ): Promise<IEmailTemplate | null> {
    try {
      // Use static method for priority-based template selection
      const template = await (EmailTemplate as any).findActiveByType(
        type,
        language,
        propertyId,
        organizationId
      );

      return template;
    } catch (error) {
      logger.error('[GuestCommunication] Error finding template:', error);
      return null;
    }
  }

  /**
   * Prepare email variables from booking and property
   */
  private prepareEmailVariables(
    booking: IBooking,
    property: any,
    room: any,
    additionalVariables?: Record<string, any>
  ): EmailVariables {
    const checkInDate = new Date(booking.checkIn);
    const checkOutDate = new Date(booking.checkOut);
    const numberOfNights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const guestName = `${booking.guestInfo.firstName} ${booking.guestInfo.lastName}`;
    const totalGuests = booking.guests.adults + booking.guests.children + booking.guests.infants;

    const variables: EmailVariables = {
      guestName,
      guestEmail: booking.guestInfo.email,
      propertyName: property.name,
      propertyAddress: property.address
        ? `${property.address.street}, ${property.address.city}, ${property.address.country}`
        : undefined,
      propertyPhone: property.contactInfo?.phone,
      checkInDate: checkInDate.toLocaleDateString(),
      checkOutDate: checkOutDate.toLocaleDateString(),
      checkInTime: property.policies?.checkInTime,
      checkOutTime: property.policies?.checkOutTime,
      roomType: room?.type,
      numberOfGuests: totalGuests,
      numberOfNights,
      totalAmount: booking.pricing.total,
      bookingReference: booking._id.toString().slice(-8).toUpperCase(),
      confirmationCode: booking.channelConfirmationCode,
      specialRequests: booking.specialRequests.join(', '),
      cancellationPolicy: property.policies?.cancellationPolicy,
      ...additionalVariables
    };

    return variables;
  }

  /**
   * Process automated email triggers
   * Called by scheduler (e.g., cron job)
   */
  async processAutomatedTriggers(): Promise<{
    processed: number;
    sent: number;
    failed: number;
  }> {
    try {
      logger.info('[GuestCommunication] Processing automated email triggers');

      const result = {
        processed: 0,
        sent: 0,
        failed: 0
      };

      // Get all enabled automated templates
      const automatedTemplates = await EmailTemplate.find({
        'automation.enabled': true,
        status: 'active'
      });

      for (const template of automatedTemplates) {
        try {
          const triggerResult = await this.processTrigger(template);
          result.processed += triggerResult.processed;
          result.sent += triggerResult.sent;
          result.failed += triggerResult.failed;
        } catch (error) {
          logger.error(`[GuestCommunication] Error processing trigger for template ${template._id}:`, error);
        }
      }

      logger.info(`[GuestCommunication] Trigger processing complete: ${result.sent} sent, ${result.failed} failed`);
      return result;
    } catch (error) {
      logger.error('[GuestCommunication] Error processing automated triggers:', error);
      throw error;
    }
  }

  /**
   * Process individual trigger
   */
  private async processTrigger(template: IEmailTemplate): Promise<{
    processed: number;
    sent: number;
    failed: number;
  }> {
    const result = { processed: 0, sent: 0, failed: 0 };

    try {
      // Calculate date range based on trigger and delay
      const now = new Date();
      const delayDays = template.automation.delayDays || 0;
      const delayHours = template.automation.delayHours || 0;

      let targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() - delayDays);
      targetDate.setHours(targetDate.getHours() - delayHours);

      // Build booking query based on trigger type
      let bookingQuery: any = {
        status: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] }
      };

      switch (template.automation.trigger) {
        case 'booking_created':
          // Send immediately after booking creation
          bookingQuery.createdAt = {
            $gte: new Date(now.getTime() - 60 * 60 * 1000), // Last hour
            $lte: now
          };
          break;

        case 'pre_arrival':
          // Send X days before check-in
          const preArrivalStart = new Date(targetDate);
          preArrivalStart.setHours(0, 0, 0, 0);
          const preArrivalEnd = new Date(preArrivalStart);
          preArrivalEnd.setHours(23, 59, 59, 999);

          bookingQuery.checkIn = {
            $gte: preArrivalStart,
            $lte: preArrivalEnd
          };
          break;

        case 'check_in_day':
          // Send on check-in day
          const checkInStart = new Date(now);
          checkInStart.setHours(0, 0, 0, 0);
          const checkInEnd = new Date(checkInStart);
          checkInEnd.setHours(23, 59, 59, 999);

          bookingQuery.checkIn = {
            $gte: checkInStart,
            $lte: checkInEnd
          };
          break;

        case 'post_checkout':
          // Send X days after checkout
          const postCheckoutStart = new Date(targetDate);
          postCheckoutStart.setHours(0, 0, 0, 0);
          const postCheckoutEnd = new Date(postCheckoutStart);
          postCheckoutEnd.setHours(23, 59, 59, 999);

          bookingQuery.checkOut = {
            $gte: postCheckoutStart,
            $lte: postCheckoutEnd
          };
          bookingQuery.status = BookingStatus.CHECKED_OUT;
          break;

        case 'review_request':
          // Send 3-7 days after checkout
          const reviewStart = new Date(now);
          reviewStart.setDate(reviewStart.getDate() - 7);
          const reviewEnd = new Date(now);
          reviewEnd.setDate(reviewEnd.getDate() - 3);

          bookingQuery.checkOut = {
            $gte: reviewStart,
            $lte: reviewEnd
          };
          bookingQuery.status = BookingStatus.CHECKED_OUT;
          break;

        default:
          logger.warn(`[GuestCommunication] Unknown trigger type: ${template.automation.trigger}`);
          return result;
      }

      // Apply template scope filters
      if (template.property) {
        bookingQuery.property = template.property;
      } else if (template.organization) {
        const properties = await Property.find({
          organization: template.organization,
          status: 'active'
        });
        bookingQuery.property = { $in: properties.map(p => p._id) };
      }

      // Find matching bookings
      const bookings = await Booking.find(bookingQuery);

      logger.info(`[GuestCommunication] Found ${bookings.length} bookings for trigger ${template.automation.trigger}`);

      // Send emails
      for (const booking of bookings) {
        result.processed++;

        const emailResult = await this.sendTemplateEmail(
          template.type,
          booking._id,
          template.language
        );

        if (emailResult.success) {
          result.sent++;
        } else {
          result.failed++;
        }

        // Add small delay between emails to avoid rate limits
        await this.delay(100);
      }
    } catch (error) {
      logger.error('[GuestCommunication] Error processing trigger:', error);
    }

    return result;
  }

  /**
   * Send booking confirmation email
   */
  async sendBookingConfirmation(bookingId: mongoose.Types.ObjectId): Promise<EmailResult> {
    return this.sendTemplateEmail(EmailTemplateType.BOOKING_CONFIRMATION, bookingId);
  }

  /**
   * Send pre-arrival email
   */
  async sendPreArrivalEmail(bookingId: mongoose.Types.ObjectId): Promise<EmailResult> {
    return this.sendTemplateEmail(EmailTemplateType.PRE_ARRIVAL, bookingId);
  }

  /**
   * Send post-checkout email
   */
  async sendPostCheckoutEmail(bookingId: mongoose.Types.ObjectId): Promise<EmailResult> {
    return this.sendTemplateEmail(EmailTemplateType.POST_CHECKOUT, bookingId);
  }

  /**
   * Send review request email
   */
  async sendReviewRequest(bookingId: mongoose.Types.ObjectId): Promise<EmailResult> {
    return this.sendTemplateEmail(EmailTemplateType.REVIEW_REQUEST, bookingId);
  }

  /**
   * Send payment reminder email
   */
  async sendPaymentReminder(bookingId: mongoose.Types.ObjectId): Promise<EmailResult> {
    return this.sendTemplateEmail(EmailTemplateType.PAYMENT_REMINDER, bookingId);
  }

  /**
   * Get email statistics for a template
   */
  async getTemplateStatistics(templateId: mongoose.Types.ObjectId): Promise<{
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
    openRate: number;
    clickRate: number;
  }> {
    try {
      const template = await EmailTemplate.findById(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      return {
        sent: template.stats.sent,
        opened: template.stats.opened,
        clicked: template.stats.clicked,
        bounced: template.stats.bounced,
        openRate: template.stats.sent > 0 ? (template.stats.opened / template.stats.sent) * 100 : 0,
        clickRate: template.stats.sent > 0 ? (template.stats.clicked / template.stats.sent) * 100 : 0
      };
    } catch (error) {
      logger.error('[GuestCommunication] Error getting template statistics:', error);
      throw error;
    }
  }

  /**
   * Utility: Delay for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new GuestCommunicationService();

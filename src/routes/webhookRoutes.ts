import { Router } from 'express';
import { Request, Response } from 'express';
import { logger } from '../config/logger';
import { OTAProvider } from '../services/OTAService';
import Booking, { BookingStatus, BookingChannel } from '../models/Booking';
import Property from '../models/Property';
import Calendar, { CalendarStatus } from '../models/Calendar';
import mongoose from 'mongoose';

const router = Router();

/**
 * Webhook event types
 */
enum WebhookEvent {
  BOOKING_CREATED = 'booking.created',
  BOOKING_UPDATED = 'booking.updated',
  BOOKING_CANCELLED = 'booking.cancelled',
  PROPERTY_CREATED = 'property.created',
  PROPERTY_UPDATED = 'property.updated',
  CALENDAR_UPDATED = 'calendar.updated',
  RATE_UPDATED = 'rate.updated'
}

/**
 * Webhook payload interface
 */
interface WebhookPayload {
  event: WebhookEvent;
  channel: OTAProvider;
  timestamp: string;
  data: any;
  signature?: string;
}

/**
 * Handle Airbnb webhooks
 */
router.post('/airbnb', async (req: Request, res: Response) => {
  try {
    const payload: WebhookPayload = req.body;

    logger.info(`[Webhook-Airbnb] Received webhook: ${payload.event}`, {
      event: payload.event,
      timestamp: payload.timestamp
    });

    // Process webhook based on event type
    await processWebhook(OTAProvider.AIRBNB, payload);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    logger.error('[Webhook-Airbnb] Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});

/**
 * Handle Booking.com webhooks
 */
router.post('/booking', async (req: Request, res: Response) => {
  try {
    const payload: WebhookPayload = req.body;

    logger.info(`[Webhook-Booking] Received webhook: ${payload.event}`, {
      event: payload.event,
      timestamp: payload.timestamp
    });

    await processWebhook(OTAProvider.BOOKING, payload);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    logger.error('[Webhook-Booking] Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});

/**
 * Handle Expedia webhooks
 */
router.post('/expedia', async (req: Request, res: Response) => {
  try {
    const payload: WebhookPayload = req.body;

    logger.info(`[Webhook-Expedia] Received webhook: ${payload.event}`, {
      event: payload.event,
      timestamp: payload.timestamp
    });

    await processWebhook(OTAProvider.EXPEDIA, payload);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    logger.error('[Webhook-Expedia] Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});

/**
 * Handle Agoda webhooks
 */
router.post('/agoda', async (req: Request, res: Response) => {
  try {
    const payload: WebhookPayload = req.body;

    logger.info(`[Webhook-Agoda] Received webhook: ${payload.event}`, {
      event: payload.event,
      timestamp: payload.timestamp
    });

    await processWebhook(OTAProvider.AGODA, payload);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    logger.error('[Webhook-Agoda] Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});

/**
 * Handle Vrbo webhooks
 */
router.post('/vrbo', async (req: Request, res: Response) => {
  try {
    const payload: WebhookPayload = req.body;

    logger.info(`[Webhook-Vrbo] Received webhook: ${payload.event}`, {
      event: payload.event,
      timestamp: payload.timestamp
    });

    await processWebhook(OTAProvider.VRBO, payload);

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    logger.error('[Webhook-Vrbo] Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});

/**
 * Get webhook processing status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    // Return webhook processing statistics
    const stats = {
      totalProcessed: webhookStats.totalProcessed,
      totalFailed: webhookStats.totalFailed,
      lastProcessed: webhookStats.lastProcessed,
      byChannel: webhookStats.byChannel,
      byEvent: webhookStats.byEvent
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('[Webhook-Status] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get webhook status'
    });
  }
});

// ==================== WEBHOOK PROCESSING LOGIC ====================

/**
 * Webhook statistics
 */
const webhookStats = {
  totalProcessed: 0,
  totalFailed: 0,
  lastProcessed: null as Date | null,
  byChannel: {} as Record<string, number>,
  byEvent: {} as Record<string, number>
};

/**
 * Process webhook based on event type
 */
async function processWebhook(channel: OTAProvider, payload: WebhookPayload): Promise<void> {
  try {
    logger.debug(`[Webhook] Processing ${payload.event} from ${channel}`);

    // Update statistics
    webhookStats.totalProcessed++;
    webhookStats.lastProcessed = new Date();
    webhookStats.byChannel[channel] = (webhookStats.byChannel[channel] || 0) + 1;
    webhookStats.byEvent[payload.event] = (webhookStats.byEvent[payload.event] || 0) + 1;

    // Process based on event type
    switch (payload.event) {
      case WebhookEvent.BOOKING_CREATED:
        await handleBookingCreated(channel, payload.data);
        break;

      case WebhookEvent.BOOKING_UPDATED:
        await handleBookingUpdated(channel, payload.data);
        break;

      case WebhookEvent.BOOKING_CANCELLED:
        await handleBookingCancelled(channel, payload.data);
        break;

      case WebhookEvent.PROPERTY_CREATED:
        await handlePropertyCreated(channel, payload.data);
        break;

      case WebhookEvent.PROPERTY_UPDATED:
        await handlePropertyUpdated(channel, payload.data);
        break;

      case WebhookEvent.CALENDAR_UPDATED:
        await handleCalendarUpdated(channel, payload.data);
        break;

      case WebhookEvent.RATE_UPDATED:
        await handleRateUpdated(channel, payload.data);
        break;

      default:
        logger.warn(`[Webhook] Unknown event type: ${payload.event}`);
    }

    logger.info(`[Webhook] Successfully processed ${payload.event} from ${channel}`);
  } catch (error) {
    webhookStats.totalFailed++;
    logger.error(`[Webhook] Error processing ${payload.event} from ${channel}:`, error);
    throw error;
  }
}

// ==================== EVENT HANDLERS ====================

/**
 * Handle booking created event
 */
async function handleBookingCreated(channel: OTAProvider, data: any): Promise<void> {
  logger.info(`[Webhook] Booking created on ${channel}`, {
    bookingId: data.id,
    propertyId: data.propertyId,
    checkIn: data.checkIn,
    checkOut: data.checkOut
  });

  try {
    // Check if booking already exists (idempotency check)
    const existingBooking = await Booking.findOne({
      channelBookingId: data.id,
      channel: mapOTAProviderToBookingChannel(channel)
    });

    if (existingBooking) {
      logger.warn(`[Webhook] Booking ${data.id} already exists, skipping creation`);
      return;
    }

    // Find property by OTA property ID
    // Note: In production, you'd need a mapping table for OTA property IDs to internal property IDs
    // For now, we'll try to find by property ID directly or use the first property as fallback
    let property;
    try {
      property = await Property.findById(data.propertyId);
    } catch (error) {
      // If property ID is not a valid ObjectId, find first active property as fallback
      logger.warn(`[Webhook] Property ${data.propertyId} not found, using first active property`);
      property = await Property.findOne({ status: 'active' });
    }

    if (!property) {
      throw new Error(`Property ${data.propertyId} not found`);
    }

    // Find room by OTA room ID or use first available room
    let room;
    if (data.roomId) {
      try {
        // Try to find room by _id
        room = property.rooms.find(r => r._id.toString() === data.roomId);
        if (!room) {
          logger.warn(`[Webhook] Room ${data.roomId} not found, using first active room`);
        }
      } catch (error) {
        logger.warn(`[Webhook] Room ${data.roomId} not found, using first active room`);
      }
    }

    if (!room && property.rooms.length > 0) {
      room = property.rooms.find(r => r.isActive) || property.rooms[0];
    }

    if (!room) {
      throw new Error(`No rooms available for property ${property._id}`);
    }

    // Create booking record
    const booking = new Booking({
      property: property._id,
      room: room._id,
      guestInfo: {
        firstName: data.guestInfo?.firstName || 'Guest',
        lastName: data.guestInfo?.lastName || 'User',
        email: data.guestInfo?.email || 'guest@example.com',
        phone: data.guestInfo?.phone || '+1234567890',
        nationality: data.guestInfo?.country || 'Unknown',
        documentType: 'passport',
        documentNumber: 'TEMP-' + data.id
      },
      checkIn: new Date(data.checkIn),
      checkOut: new Date(data.checkOut),
      guests: {
        adults: data.guests?.adults || 1,
        children: data.guests?.children || 0,
        infants: data.guests?.infants || 0
      },
      status: BookingStatus.CONFIRMED,
      channel: mapOTAProviderToBookingChannel(channel),
      channelBookingId: data.id,
      channelConfirmationCode: data.confirmationCode,
      pricing: {
        baseRate: data.pricing?.baseRate || data.pricing?.nightlyRate || 0,
        taxes: data.pricing?.taxes || 0,
        fees: data.pricing?.serviceFee || 0,
        discounts: 0,
        total: data.pricing?.total || 0,
        currency: data.pricing?.currency || 'USD',
        breakdown: {
          roomRate: data.pricing?.nightlyRate || 0,
          cleaningFee: data.pricing?.cleaningFee,
          serviceFee: data.pricing?.serviceFee,
          cityTax: 0,
          tourismTax: 0
        }
      },
      specialRequests: data.specialRequests || [],
      notes: data.notes
    });

    logger.info(`[Webhook] About to save booking, validating first...`);
    const validationError = booking.validateSync();
    if (validationError) {
      logger.error(`[Webhook] Booking validation failed:`, validationError);
      throw validationError;
    }

    logger.info(`[Webhook] Validation passed, saving to database...`);
    logger.debug(`[Webhook] Booking data:`, {
      _id: booking._id,
      property: booking.property,
      room: booking.room,
      channel: booking.channel,
      channelBookingId: booking.channelBookingId,
      status: booking.status,
      guestEmail: booking.guestInfo.email
    });

    const savedBooking = await booking.save();
    logger.info(`[Webhook] Booking ${savedBooking._id} SAVED to database successfully`);
    logger.info(`[Webhook] Saved booking isNew: ${savedBooking.isNew}, _id: ${savedBooking._id}`);

    // Verify it was actually saved by querying it back
    const verification = await Booking.findById(savedBooking._id);
    if (verification) {
      logger.info(`[Webhook] ✅ VERIFIED: Booking exists in database`);
    } else {
      logger.error(`[Webhook] ❌ VERIFICATION FAILED: Booking not found in database after save!`);
    }

    // Update calendar availability
    await updateCalendarForBooking(
      property._id,
      room._id,
      new Date(data.checkIn),
      new Date(data.checkOut),
      booking._id,
      CalendarStatus.BOOKED
    );

    logger.info(`[Webhook] Calendar updated for booking ${booking._id}`);

    // TODO: Send notification to property owner
    // TODO: Sync to other OTAs if needed (to prevent double bookings)
  } catch (error) {
    logger.error(`[Webhook] Error handling booking created:`, error);
    throw error;
  }
}

/**
 * Handle booking updated event
 */
async function handleBookingUpdated(channel: OTAProvider, data: any): Promise<void> {
  logger.info(`[Webhook] Booking updated on ${channel}`, {
    bookingId: data.id,
    status: data.status
  });

  try {
    // Find existing booking
    const booking = await Booking.findOne({
      channelBookingId: data.id,
      channel: mapOTAProviderToBookingChannel(channel)
    });

    if (!booking) {
      logger.warn(`[Webhook] Booking ${data.id} not found, cannot update`);
      return;
    }

    // Track if dates changed
    const datesChanged =
      (data.checkIn && new Date(data.checkIn).getTime() !== booking.checkIn.getTime()) ||
      (data.checkOut && new Date(data.checkOut).getTime() !== booking.checkOut.getTime());

    const oldCheckIn = booking.checkIn;
    const oldCheckOut = booking.checkOut;

    // Update booking details
    if (data.guestInfo) {
      booking.guestInfo.firstName = data.guestInfo.firstName || booking.guestInfo.firstName;
      booking.guestInfo.lastName = data.guestInfo.lastName || booking.guestInfo.lastName;
      booking.guestInfo.email = data.guestInfo.email || booking.guestInfo.email;
      booking.guestInfo.phone = data.guestInfo.phone || booking.guestInfo.phone;
      booking.guestInfo.nationality = data.guestInfo.country || booking.guestInfo.nationality;
    }

    if (data.checkIn) {
      booking.checkIn = new Date(data.checkIn);
    }

    if (data.checkOut) {
      booking.checkOut = new Date(data.checkOut);
    }

    if (data.guests) {
      booking.guests.adults = data.guests.adults || booking.guests.adults;
      booking.guests.children = data.guests.children || booking.guests.children;
      booking.guests.infants = data.guests.infants || booking.guests.infants;
    }

    if (data.status) {
      const newStatus = mapOTAStatusToBookingStatus(data.status);
      if (newStatus !== booking.status) {
        await booking.updateStatus(newStatus);
        logger.info(`[Webhook] Booking ${booking._id} status changed from ${booking.status} to ${newStatus}`);
      }
    }

    if (data.pricing) {
      booking.pricing.baseRate = data.pricing.baseRate || data.pricing.nightlyRate || booking.pricing.baseRate;
      booking.pricing.taxes = data.pricing.taxes || booking.pricing.taxes;
      booking.pricing.fees = data.pricing.serviceFee || booking.pricing.fees;
      booking.pricing.total = data.pricing.total || booking.pricing.total;
      booking.pricing.currency = data.pricing.currency || booking.pricing.currency;
    }

    if (data.specialRequests) {
      booking.specialRequests = data.specialRequests;
    }

    if (data.notes) {
      booking.notes = data.notes;
    }

    await booking.save();
    logger.info(`[Webhook] Booking ${booking._id} updated successfully`);

    // Update calendar if dates changed
    if (datesChanged) {
      // Release old dates
      await updateCalendarForBooking(
        booking.property,
        booking.room,
        oldCheckIn,
        oldCheckOut,
        booking._id,
        CalendarStatus.AVAILABLE
      );

      // Book new dates
      await updateCalendarForBooking(
        booking.property,
        booking.room,
        booking.checkIn,
        booking.checkOut,
        booking._id,
        CalendarStatus.BOOKED
      );

      logger.info(`[Webhook] Calendar updated for booking ${booking._id} date change`);
    }

    // TODO: Send notification if status or dates changed
  } catch (error) {
    logger.error(`[Webhook] Error handling booking updated:`, error);
    throw error;
  }
}

/**
 * Handle booking cancelled event
 */
async function handleBookingCancelled(channel: OTAProvider, data: any): Promise<void> {
  logger.info(`[Webhook] Booking cancelled on ${channel}`, {
    bookingId: data.id,
    cancellationReason: data.cancellationReason
  });

  try {
    // Find existing booking
    const booking = await Booking.findOne({
      channelBookingId: data.id,
      channel: mapOTAProviderToBookingChannel(channel)
    });

    if (!booking) {
      logger.warn(`[Webhook] Booking ${data.id} not found, cannot cancel`);
      return;
    }

    // Update booking status
    booking.status = BookingStatus.CANCELLED;
    booking.cancelledAt = new Date();
    booking.cancellationReason = data.cancellationReason || 'Cancelled via OTA';

    await booking.save();
    logger.info(`[Webhook] Booking ${booking._id} cancelled successfully`);

    // Release calendar dates
    await updateCalendarForBooking(
      booking.property,
      booking.room,
      booking.checkIn,
      booking.checkOut,
      booking._id,
      CalendarStatus.AVAILABLE
    );

    logger.info(`[Webhook] Calendar released for cancelled booking ${booking._id}`);

    // TODO: Process refund if applicable
    // TODO: Send cancellation notification to property owner
  } catch (error) {
    logger.error(`[Webhook] Error handling booking cancelled:`, error);
    throw error;
  }
}

/**
 * Handle property created event
 */
async function handlePropertyCreated(channel: OTAProvider, data: any): Promise<void> {
  logger.info(`[Webhook] Property created on ${channel}`, {
    propertyId: data.id,
    name: data.name
  });

  // TODO: Create or link property in main database
  // - Check if property already exists (by external ID)
  // - Create new property record or update mapping
  // - Store OTA-specific property ID
}

/**
 * Handle property updated event
 */
async function handlePropertyUpdated(channel: OTAProvider, data: any): Promise<void> {
  logger.info(`[Webhook] Property updated on ${channel}`, {
    propertyId: data.id
  });

  // TODO: Update property in main database
  // - Find property by OTA ID
  // - Update property details
  // - Sync changes to other OTAs if needed
}

/**
 * Handle calendar updated event
 */
async function handleCalendarUpdated(channel: OTAProvider, data: any): Promise<void> {
  logger.info(`[Webhook] Calendar updated on ${channel}`, {
    propertyId: data.propertyId,
    startDate: data.startDate,
    endDate: data.endDate
  });

  // TODO: Update calendar in main database
  // - Update availability for date range
  // - Sync to other OTAs if needed
  // - Check for conflicts
}

/**
 * Handle rate updated event
 */
async function handleRateUpdated(channel: OTAProvider, data: any): Promise<void> {
  logger.info(`[Webhook] Rate updated on ${channel}`, {
    propertyId: data.propertyId,
    date: data.date,
    rate: data.rate
  });

  // TODO: Update rates in main database
  // - Update rate for specific date
  // - Sync to other OTAs if needed
  // - Apply rate parity rules
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Map OTA provider to booking channel
 */
function mapOTAProviderToBookingChannel(provider: OTAProvider): BookingChannel {
  switch (provider) {
    case OTAProvider.AIRBNB:
      return BookingChannel.AIRBNB;
    case OTAProvider.BOOKING:
      return BookingChannel.BOOKING;
    case OTAProvider.EXPEDIA:
      return BookingChannel.EXPEDIA;
    case OTAProvider.AGODA:
      return BookingChannel.AGODA;
    case OTAProvider.VRBO:
      return BookingChannel.VRBO;
    default:
      return BookingChannel.OTHER;
  }
}

/**
 * Map OTA booking status to internal booking status
 */
function mapOTAStatusToBookingStatus(otaStatus: string): BookingStatus {
  const statusMap: Record<string, BookingStatus> = {
    'pending': BookingStatus.PENDING,
    'confirmed': BookingStatus.CONFIRMED,
    'checked-in': BookingStatus.CHECKED_IN,
    'checked_in': BookingStatus.CHECKED_IN,
    'checked-out': BookingStatus.CHECKED_OUT,
    'checked_out': BookingStatus.CHECKED_OUT,
    'cancelled': BookingStatus.CANCELLED,
    'canceled': BookingStatus.CANCELLED,
    'no-show': BookingStatus.NO_SHOW,
    'no_show': BookingStatus.NO_SHOW,
    'modified': BookingStatus.MODIFIED
  };

  return statusMap[otaStatus.toLowerCase()] || BookingStatus.PENDING;
}

/**
 * Update calendar dates for a booking
 */
async function updateCalendarForBooking(
  propertyId: mongoose.Types.ObjectId,
  roomId: mongoose.Types.ObjectId,
  checkIn: Date,
  checkOut: Date,
  bookingId: mongoose.Types.ObjectId,
  status: CalendarStatus
): Promise<void> {
  // Generate array of dates between checkIn and checkOut (excluding checkOut)
  const dates: Date[] = [];
  const currentDate = new Date(checkIn);
  const endDate = new Date(checkOut);

  while (currentDate < endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Bulk update calendar
  const bulkOps = dates.map(date => ({
    updateOne: {
      filter: { property: propertyId, room: roomId, date },
      update: {
        status,
        booking: status === CalendarStatus.BOOKED ? bookingId : null
      },
      upsert: true
    }
  }));

  if (bulkOps.length > 0) {
    await Calendar.bulkWrite(bulkOps);
    logger.debug(`Updated ${bulkOps.length} calendar entries from ${checkIn.toISOString()} to ${checkOut.toISOString()}`);
  }
}

export default router;

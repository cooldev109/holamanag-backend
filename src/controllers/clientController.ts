import { Request, Response } from 'express';
import Booking, { BookingStatus } from '../models/Booking';
import { logger } from '../config/logger';
import mongoose from 'mongoose';

/**
 * Client Controller
 * Handles client-facing endpoints for guests to view their bookings
 */

/**
 * Get client overview dashboard data
 * Returns upcoming stay, last reservation, and notices
 */
export const getOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    // Find next upcoming stay (confirmed, check-in in the future)
    const nextStay = await Booking.findOne({
      createdBy: userId,
      status: BookingStatus.CONFIRMED,
      checkIn: { $gte: new Date() }
    })
      .sort({ checkIn: 1 })
      .populate('property', 'name')
      .populate('room', 'name')
      .lean();

    // Find last reservation (any status, most recent)
    const lastReservation = await Booking.findOne({
      createdBy: userId
    })
      .sort({ createdAt: -1 })
      .populate('property', 'name')
      .lean();

    // Calculate nights for next stay
    let nextStayData = null;
    if (nextStay) {
      const checkIn = new Date(nextStay.checkIn);
      const checkOut = new Date(nextStay.checkOut);
      const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

      nextStayData = {
        id: nextStay._id.toString(),
        property: (nextStay.property as any)?.name || 'Unknown Property',
        checkIn: nextStay.checkIn,
        checkOut: nextStay.checkOut,
        nights,
        status: nextStay.status,
        currency: nextStay.pricing.currency,
        total: nextStay.pricing.total
      };
    }

    let lastReservationData = null;
    if (lastReservation) {
      lastReservationData = {
        id: lastReservation._id.toString(),
        property: (lastReservation.property as any)?.name || 'Unknown Property',
        total: lastReservation.pricing.total,
        currency: lastReservation.pricing.currency
      };
    }

    // Generate notices (could be from a notifications system in the future)
    const notices: string[] = [];
    if (nextStay) {
      const daysUntilCheckIn = Math.ceil(
        (new Date(nextStay.checkIn).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilCheckIn <= 7 && daysUntilCheckIn > 2) {
        notices.push('Your check-in details will arrive 48h before arrival.');
      } else if (daysUntilCheckIn <= 2) {
        notices.push('Your stay is coming up soon! Check your email for check-in details.');
      }
    }

    res.json({
      success: true,
      data: {
        nextStay: nextStayData,
        lastReservation: lastReservationData,
        notices
      }
    });
  } catch (error) {
    logger.error('Error getting client overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load overview'
    });
  }
};

/**
 * List all reservations for the current client
 * Supports filtering and pagination
 */
export const listReservations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    const {
      q,
      status,
      from,
      to,
      page = '1',
      size = '10'
    } = req.query;

    const pageNum = parseInt(page as string);
    const sizeNum = parseInt(size as string);
    const skip = (pageNum - 1) * sizeNum;

    // Build query
    const query: any = { createdBy: userId };

    if (status) {
      query.status = status;
    }

    if (from) {
      query.checkIn = { $gte: new Date(from as string) };
    }

    if (to) {
      query.checkOut = { $lte: new Date(to as string) };
    }

    if (q) {
      // Search in property name or booking ID
      query.$or = [
        { _id: mongoose.Types.ObjectId.isValid(q as string) ? new mongoose.Types.ObjectId(q as string) : null },
        { 'guestInfo.email': { $regex: q, $options: 'i' } }
      ];
    }

    // Execute query
    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(sizeNum)
        .populate('property', 'name')
        .populate('room', 'name')
        .lean(),
      Booking.countDocuments(query)
    ]);

    // Format response
    const items = bookings.map((booking) => {
      return {
        id: booking._id.toString(),
        property: (booking.property as any)?.name || 'Unknown Property',
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        status: booking.status,
        channel: booking.channel,
        currency: booking.pricing.currency,
        total: booking.pricing.total,
        guests: booking.guests.adults + booking.guests.children
      };
    });

    res.json({
      success: true,
      data: {
        items,
        page: pageNum,
        size: sizeNum,
        total
      }
    });
  } catch (error) {
    logger.error('Error listing client reservations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load reservations'
    });
  }
};

/**
 * Get detailed information about a specific reservation
 */
export const getReservation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    // Find booking and verify ownership
    const booking = await Booking.findOne({
      _id: id,
      createdBy: userId
    })
      .populate('property', 'name address')
      .populate('room', 'name')
      .lean();

    if (!booking) {
      res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
      return;
    }

    // Calculate nights
    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    // Format response
    const result = {
      id: booking._id.toString(),
      property: (booking.property as any)?.name || 'Unknown Property',
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights,
      guests: booking.guests.adults + booking.guests.children,
      status: booking.status,
      channel: booking.channel,
      amounts: {
        currency: booking.pricing.currency,
        subtotal: booking.pricing.total / 1.1, // Simple calculation, in real scenario would be stored
        taxes: booking.pricing.total * 0.1,
        total: booking.pricing.total
      },
      notes: booking.specialRequests?.join(', ')
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting client reservation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load reservation details'
    });
  }
};

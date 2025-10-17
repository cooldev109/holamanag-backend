import express from 'express';
import { GuestBookingController } from '../controllers/guestBookingController';
import PropertyController from '../controllers/propertyController';

const router = express.Router();

/**
 * Guest Booking Routes
 * No authentication required - public endpoints for guest bookings
 */

// Get all active properties (public access for guest booking)
router.get('/properties', PropertyController.getAllProperties);

// Get property by ID (public access for guest booking)
router.get('/properties/:id', PropertyController.getPropertyById);

// Check availability for a property and room
router.post('/check-availability', GuestBookingController.checkAvailability);

// Create a guest booking
router.post('/bookings', GuestBookingController.createBooking);

// Get booking by confirmation code
router.get('/bookings/:confirmationCode', GuestBookingController.getBooking);

export default router;


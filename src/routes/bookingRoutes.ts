import { Router } from 'express';
import BookingController from '../controllers/bookingController';
import { authenticate, authorize } from '../middleware/auth';
import { ValidationMiddleware } from '../middleware/validation';
import { checkBookingOwnership, checkPropertyAccess } from '../middleware/ownership';
import { Role } from '../models/User';

const router = Router();

/**
 * Booking Routes
 * All routes require authentication
 */

// Public routes (authenticated users only)
router.get('/stats', authenticate, BookingController.getBookingStats);
router.get('/date-range', authenticate, BookingController.getBookingsByDateRange);
router.get('/:id', authenticate, BookingController.getBookingById);

// Admin and Superadmin routes
router.get('/', authenticate, authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]), BookingController.getAllBookings);

// Booking management routes (Admin, Superadmin, and Supervisor)
router.post(
  '/',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  checkPropertyAccess,  // ✅ SECURITY: Verify user can create bookings for this property
  ValidationMiddleware.validateBooking.create,
  BookingController.createBooking
);

router.put(
  '/:id',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  checkBookingOwnership,  // ✅ SECURITY: Verify user owns/manages the booking's property
  ValidationMiddleware.validateBooking.update,
  BookingController.updateBooking
);

// Booking status management routes
router.patch(
  '/:id/cancel',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  checkBookingOwnership,  // ✅ SECURITY: Verify user owns/manages the booking's property
  BookingController.cancelBooking
);

router.patch(
  '/:id/check-in',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  checkBookingOwnership,  // ✅ SECURITY: Verify user owns/manages the booking's property
  BookingController.checkInBooking
);

router.patch(
  '/:id/check-out',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  checkBookingOwnership,  // ✅ SECURITY: Verify user owns/manages the booking's property
  BookingController.checkOutBooking
);

export default router;



import { Router } from 'express';
import CalendarController from '../controllers/calendarController';
import { authenticate, authorize } from '../middleware/auth';
import { ValidationMiddleware } from '../middleware/validation';
import { Role } from '../models/User';

const router = Router();

/**
 * Calendar Routes
 * All routes require authentication
 */

// Public routes (authenticated users only)
router.get('/availability', authenticate, CalendarController.checkAvailability);
router.get('/property/:propertyId', authenticate, CalendarController.getCalendarByProperty);
router.get('/room/:roomId', authenticate, CalendarController.getCalendarByRoom);
router.get('/stats', authenticate, CalendarController.getCalendarStats);

// Admin and Superadmin routes
router.get('/', authenticate, authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]), CalendarController.getCalendarEntries);

// Calendar management routes (Admin, Superadmin, and Supervisor)
router.post(
  '/bulk-update',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  ValidationMiddleware.validateCalendar.bulkUpdate,
  CalendarController.bulkUpdateAvailability
);

router.post(
  '/block-dates',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  CalendarController.blockDates
);

router.post(
  '/sync',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN]),
  CalendarController.syncCalendar
);

export default router;



import { Router } from 'express';
import RatePlanController from '../controllers/ratePlanController';
import { authenticate, authorize } from '../middleware/auth';
import { ValidationMiddleware } from '../middleware/validation';
import { checkRatePlanOwnership, checkPropertyAccess } from '../middleware/ownership';
import { Role } from '../models/User';

const router = Router();

/**
 * RatePlan Routes
 * All routes require authentication
 */

// Public routes (authenticated users only)
router.get('/calculate', authenticate, RatePlanController.calculateRate);
router.get('/property/:propertyId', authenticate, RatePlanController.getRatePlansByProperty);
router.get('/room/:roomId', authenticate, RatePlanController.getRatePlansByRoom);
router.get('/:id', authenticate, RatePlanController.getRatePlanById);

// Admin and Superadmin routes
router.get('/', authenticate, authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]), RatePlanController.getAllRatePlans);

// RatePlan management routes (Admin, Superadmin, and Supervisor)
router.post(
  '/',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  checkPropertyAccess,  // ✅ SECURITY: Verify user can create rate plans for this property
  ValidationMiddleware.validateRatePlan.create,
  RatePlanController.createRatePlan
);

router.put(
  '/:id',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  checkRatePlanOwnership,  // ✅ SECURITY: Verify user owns/manages the rate plan's property
  ValidationMiddleware.validateRatePlan.update,
  RatePlanController.updateRatePlan
);

router.patch(
  '/:id/status',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN]),
  checkRatePlanOwnership,  // ✅ SECURITY: Verify user owns/manages the rate plan's property
  RatePlanController.toggleRatePlanStatus
);

router.delete(
  '/:id',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN]),
  checkRatePlanOwnership,  // ✅ SECURITY: Verify user owns/manages the rate plan's property
  RatePlanController.deleteRatePlan
);

export default router;



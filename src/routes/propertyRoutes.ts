import { Router } from 'express';
import PropertyController from '../controllers/propertyController';
import { authenticate, authorize } from '../middleware/auth';
import { ValidationMiddleware } from '../middleware/validation';
import { checkPropertyOwnership } from '../middleware/ownership';
import { Role } from '../models/User';

const router = Router();

/**
 * Property Routes
 * All routes require authentication
 */

// Public routes (authenticated users only)
router.get('/search', authenticate, PropertyController.searchProperties);
router.get('/location', authenticate, PropertyController.getPropertiesByLocation);
router.get('/:id', authenticate, PropertyController.getPropertyById);
router.get('/:id/stats', authenticate, PropertyController.getPropertyStats);

// Admin, Superadmin, and Supervisor routes
router.get('/', authenticate, authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]), PropertyController.getAllProperties);

// Property management routes (Admin, Superadmin, and Supervisor)
router.post(
  '/',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  ValidationMiddleware.validateProperty.create,
  PropertyController.createProperty
);

router.put(
  '/:id',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  checkPropertyOwnership,  // ✅ SECURITY: Verify user owns/manages this property
  ValidationMiddleware.validateProperty.update,
  PropertyController.updateProperty
);

router.patch(
  '/:id/status',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN]),
  checkPropertyOwnership,  // ✅ SECURITY: Verify user owns/manages this property
  PropertyController.togglePropertyStatus
);

router.delete(
  '/:id',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN]),
  checkPropertyOwnership,  // ✅ SECURITY: Verify user owns/manages this property
  PropertyController.deleteProperty
);

export default router;



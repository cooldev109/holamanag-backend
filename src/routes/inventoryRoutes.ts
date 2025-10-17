import { Router } from 'express';
import InventoryController from '../controllers/inventoryController';
import { authenticate, authorize } from '../middleware/auth';
import { Role } from '../models/User';

const router = Router();

/**
 * Inventory Routes
 * All routes require authentication
 */

// Get inventory for a property
router.get(
  '/',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  InventoryController.getInventory
);

// Bulk update inventory
router.patch(
  '/bulk',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  InventoryController.bulkUpdate
);

// Webhook endpoint for booking updates (called by OTA systems or internal booking system)
router.post(
  '/booking-update',
  authenticate,
  InventoryController.handleBookingUpdate
);

export default router;




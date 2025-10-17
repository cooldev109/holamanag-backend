import { Router } from 'express';
import InventoryControllerV2 from '../controllers/inventoryControllerV2';
import { authenticate, authorize } from '../middleware/auth';
import { Role } from '../models/User';

const router = Router();

/**
 * Inventory Routes V2 - CORRECT Channel Manager Implementation
 * 
 * Key concept:
 * - Same rooms listed across multiple OTA channels
 * - Bookings from any channel reduce availability on ALL channels
 * - Prevents overbooking
 */

// Get inventory for a property
router.get(
  '/',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  InventoryControllerV2.getInventory
);

// Bulk update inventory
router.patch(
  '/bulk',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  InventoryControllerV2.bulkUpdate
);

// Webhook endpoint for booking updates
router.post(
  '/booking-update',
  authenticate,
  InventoryControllerV2.handleBookingUpdate
);

export default router;




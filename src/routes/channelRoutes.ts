import { Router } from 'express';
import ChannelController from '../controllers/channelController';
import { authenticate, authorize } from '../middleware/auth';
import { ValidationMiddleware } from '../middleware/validation';
import { Role } from '../models/User';

const router = Router();

/**
 * Channel Routes
 * All routes require authentication
 */

// Public routes (authenticated users only)
router.get('/property/:propertyId', authenticate, ChannelController.getChannelsByProperty);
router.get('/:id/performance', authenticate, ChannelController.getChannelPerformance);
router.get('/:id', authenticate, ChannelController.getChannelById);

// Admin, Superadmin, and Supervisor routes
router.get('/', authenticate, authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]), ChannelController.getAllChannels);

// Channel management routes (Admin, Superadmin, and Supervisor)
router.post(
  '/',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  ValidationMiddleware.validateChannel.create,
  ChannelController.createChannel
);

router.put(
  '/:id',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  ValidationMiddleware.validateChannel.update,
  ChannelController.updateChannel
);

router.patch(
  '/:id/status',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN]),
  ChannelController.toggleChannelStatus
);

router.delete(
  '/:id',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN]),
  ChannelController.deleteChannel
);

// Channel operations routes
router.post(
  '/:id/test-connection',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  ChannelController.testChannelConnection
);

router.post(
  '/:id/sync',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN]),
  ChannelController.syncChannelData
);

router.post(
  '/:id/add-property',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  ChannelController.addPropertyToChannel
);

router.post(
  '/:id/remove-property',
  authenticate,
  authorize([Role.ADMIN, Role.SUPERADMIN, Role.SUPERVISOR]),
  ChannelController.removePropertyFromChannel
);

export default router;



import { Router } from 'express';
import {
  getSystemSettings,
  updateSystemSettings,
  testEmailSettings
} from '../controllers/settingsController';
import { authenticate, superadminOnly } from '../middleware/auth';

const router = Router();

// All settings routes require superadmin authentication
router.use(authenticate, superadminOnly);

/**
 * @route   GET /api/v1/settings
 * @desc    Get system settings
 * @access  Superadmin only
 */
router.get('/', getSystemSettings);

/**
 * @route   PUT /api/v1/settings
 * @desc    Update system settings
 * @access  Superadmin only
 */
router.put('/', updateSystemSettings);

/**
 * @route   POST /api/v1/settings/test-email
 * @desc    Send test email with current settings
 * @access  Superadmin only
 */
router.post('/test-email', testEmailSettings);

export default router;




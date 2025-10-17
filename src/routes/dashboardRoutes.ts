import { Router } from 'express';
import { getDashboardStats, getKpis } from '../controllers/dashboardController';
import { authenticate, superadminOnly } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/v1/dashboard/kpis
 * @desc    Get KPIs for admin dashboard (occupancy, revenue, bookings)
 * @access  Admin, Supervisor, Superadmin (all authenticated users)
 */
router.get('/kpis', authenticate, getKpis);

/**
 * @route   GET /api/v1/dashboard/stats
 * @desc    Get dashboard statistics (users, properties, bookings, active users)
 * @access  Superadmin only
 */
router.get('/stats', authenticate, superadminOnly, getDashboardStats);

export default router;


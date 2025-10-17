import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import * as clientController from '../controllers/clientController';
import { Role } from '../models/User';

const router = express.Router();

/**
 * Client Routes
 * All routes require authentication and client role
 */

// Apply authentication and role check to all routes
router.use(authenticate);
router.use(requireRole(Role.CLIENT));

/**
 * @route   GET /api/v1/client/overview
 * @desc    Get client dashboard overview
 * @access  Client
 */
router.get('/overview', clientController.getOverview);

/**
 * @route   GET /api/v1/client/reservations
 * @desc    List all reservations for the client
 * @access  Client
 * @query   q - Search query (booking ID or email)
 * @query   status - Filter by status (confirmed, pending, cancelled)
 * @query   from - Filter by check-in date (ISO date)
 * @query   to - Filter by check-out date (ISO date)
 * @query   page - Page number (default: 1)
 * @query   size - Page size (default: 10)
 */
router.get('/reservations', clientController.listReservations);

/**
 * @route   GET /api/v1/client/reservations/:id
 * @desc    Get detailed information about a specific reservation
 * @access  Client
 */
router.get('/reservations/:id', clientController.getReservation);

export default router;

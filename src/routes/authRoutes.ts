import { Router } from 'express';
import {
  login,
  register,
  refreshToken,
  logout,
  getProfile,
  updateProfile
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { registrationRateLimit } from '../middleware/rateLimiting';

const router = Router();

/**
 * @route   POST /api/v1/auth/login
 * @desc    User login
 * @access  Public
 * @rateLimit 5 requests per 15 minutes (applied at app level)
 */
router.post('/login', login);

/**
 * @route   POST /api/v1/auth/register
 * @desc    User registration
 * @access  Public
 * @rateLimit 5 registrations per hour
 */
router.post('/register', registrationRateLimit, register);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', refreshToken);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    User logout
 * @access  Private
 */
router.post('/logout', authenticate, logout);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', authenticate, getProfile);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    Get user profile (alias for /me)
 * @access  Private
 */
router.get('/profile', authenticate, getProfile);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', authenticate, updateProfile);

export default router;
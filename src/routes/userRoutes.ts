import { Router } from 'express';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  getTeamMembers,
  createTeamMember,
  updateTeamMember,
  deactivateTeamMember
} from '../controllers/userController';
import { authenticate, adminOrSuperadmin, superadminOnly, authorize } from '../middleware/auth';
import { Role } from '../models/User';

const router = Router();

// All user management routes require authentication
router.use(authenticate);

/**
 * Team Management Routes (Admin only)
 * IMPORTANT: These routes must come BEFORE /:id routes to avoid path conflicts
 * @route   GET /api/v1/users/team
 * @desc    Get team members for current admin
 * @access  Admin only
 */
router.get('/team', authorize([Role.ADMIN]), getTeamMembers);

/**
 * @route   POST /api/v1/users/team
 * @desc    Create team member (supervisor or client)
 * @access  Admin only
 */
router.post('/team', authorize([Role.ADMIN]), createTeamMember);

/**
 * @route   PUT /api/v1/users/team/:id
 * @desc    Update team member
 * @access  Admin only
 */
router.put('/team/:id', authorize([Role.ADMIN]), updateTeamMember);

/**
 * @route   DELETE /api/v1/users/team/:id
 * @desc    Deactivate team member
 * @access  Admin only
 */
router.delete('/team/:id', authorize([Role.ADMIN]), deactivateTeamMember);

/**
 * Generic User Management Routes (Admin/Superadmin)
 * IMPORTANT: These routes must come AFTER specific routes like /team
 * @route   GET /api/v1/users
 * @desc    Get all users with pagination and filtering
 * @access  Admin/Superadmin only
 */
router.get('/', adminOrSuperadmin, getAllUsers);

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID
 * @access  Admin/Superadmin only
 */
router.get('/:id', adminOrSuperadmin, getUserById);

/**
 * @route   POST /api/v1/users
 * @desc    Create new user
 * @access  Admin/Superadmin only
 */
router.post('/', adminOrSuperadmin, createUser);

/**
 * @route   PUT /api/v1/users/:id
 * @desc    Update user
 * @access  Admin/Superadmin only
 */
router.put('/:id', adminOrSuperadmin, updateUser);

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user
 * @access  Superadmin only
 */
router.delete('/:id', superadminOnly, deleteUser);

/**
 * @route   PATCH /api/v1/users/:id/toggle-status
 * @desc    Toggle user status (activate/deactivate)
 * @access  Admin/Superadmin only
 */
router.patch('/:id/toggle-status', adminOrSuperadmin, toggleUserStatus);

export default router;
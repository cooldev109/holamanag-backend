import { Request, Response } from 'express';
import { z } from 'zod';
import User, { Role } from '../models/User';
import { logger } from '../config/logger';

// Validation schemas
const createUserSchema = z.object({
  email: z.string()
    .email('Please provide a valid email address')
    .min(1, 'Email is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  firstName: z.string()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters')
    .trim(),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters')
    .trim(),
  phone: z.string()
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number')
    .optional(),
  roles: z.array(z.nativeEnum(Role))
    .min(1, 'At least one role is required'),
  isActive: z.boolean().optional()
});

const updateUserSchema = z.object({
  email: z.string()
    .email('Please provide a valid email address')
    .min(1, 'Email is required')
    .optional(),
  firstName: z.string()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters')
    .trim()
    .optional(),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters')
    .trim()
    .optional(),
  phone: z.string()
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number')
    .optional(),
  roles: z.array(z.nativeEnum(Role))
    .min(1, 'At least one role is required')
    .optional(),
  isActive: z.boolean().optional(),
  preferences: z.object({
    language: z.enum(['en', 'es', 'fr', 'de', 'it', 'pt']).optional(),
    timezone: z.string().min(1, 'Timezone is required').optional(),
    notifications: z.object({
      email: z.boolean().optional(),
      push: z.boolean().optional(),
      sms: z.boolean().optional()
    }).optional()
  }).optional()
});

const querySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.string().transform(val => val === 'true').optional(),
  search: z.string().optional(),
  sortBy: z.enum(['email', 'firstName', 'lastName', 'createdAt', 'lastLogin']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
});

/**
 * Get all users with pagination and filtering
 */
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate query parameters
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }

    const {
      page = 1,
      limit = 10,
      role,
      isActive,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = validationResult.data;

    // Build filter object
    const filter: any = {};

    if (role) {
      filter.roles = role;
    }

    if (typeof isActive === 'boolean') {
      filter.isActive = isActive;
    }

    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { 'profile.firstName': { $regex: search, $options: 'i' } },
        { 'profile.lastName': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('-password -loginAttempts -lockUntil'),
      User.countDocuments(filter)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    logger.info(`Retrieved ${users.length} users (page ${page}/${totalPages})`);

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalUsers: total,
          hasNextPage,
          hasPrevPage,
          limit
        }
      }
    });
  } catch (error) {
    logger.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving users',
      code: 'GET_USERS_INTERNAL_ERROR'
    });
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
        code: 'USER_ID_REQUIRED'
      });
      return;
    }

    const user = await User.findById(id).select('-password -loginAttempts -lockUntil');

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    logger.info(`Retrieved user: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'User retrieved successfully',
      data: {
        user
      }
    });
  } catch (error) {
    logger.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving user',
      code: 'GET_USER_INTERNAL_ERROR'
    });
  }
};

/**
 * Create new user
 */
export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input
    const validationResult = createUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }

    const { email, password, firstName, lastName, phone, roles, isActive = true } = validationResult.data;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409).json({
        success: false,
        message: 'User with this email already exists',
        code: 'USER_EXISTS'
      });
      return;
    }

    // Create new user
    const newUser = new User({
      email,
      password,
      profile: {
        firstName,
        lastName,
        phone
      },
      roles,
      isActive,
      preferences: {
        language: 'en',
        timezone: 'UTC',
        notifications: {
          email: true,
          push: true,
          sms: false
        }
      }
    });

    await newUser.save();

    logger.info(`User created successfully: ${newUser.email} by ${req.user?.email}`);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: newUser.toJSON()
      }
    });
  } catch (error) {
    logger.error('Create user error:', error);
    
    if (error instanceof Error && error.message.includes('duplicate key')) {
      res.status(409).json({
        success: false,
        message: 'User with this email already exists',
        code: 'USER_EXISTS'
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error while creating user',
      code: 'CREATE_USER_INTERNAL_ERROR'
    });
  }
};

/**
 * Update user
 */
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
        code: 'USER_ID_REQUIRED'
      });
      return;
    }

    // Validate input
    const validationResult = updateUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }

    const updateData = validationResult.data;

    // Check if user exists
    const existingUser = await User.findById(id);
    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Check if email is being changed and if it already exists
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailExists = await User.findOne({ email: updateData.email });
      if (emailExists) {
        res.status(409).json({
          success: false,
          message: 'User with this email already exists',
          code: 'USER_EXISTS'
        });
        return;
      }
    }

    // Build update object
    const updateObject: any = {};

    if (updateData.email) updateObject.email = updateData.email;
    if (updateData.firstName) updateObject['profile.firstName'] = updateData.firstName;
    if (updateData.lastName) updateObject['profile.lastName'] = updateData.lastName;
    if (updateData.phone !== undefined) updateObject['profile.phone'] = updateData.phone;
    if (updateData.roles) updateObject.roles = updateData.roles;
    if (typeof updateData.isActive === 'boolean') updateObject.isActive = updateData.isActive;

    if (updateData.preferences) {
      if (updateData.preferences.language) updateObject['preferences.language'] = updateData.preferences.language;
      if (updateData.preferences.timezone) updateObject['preferences.timezone'] = updateData.preferences.timezone;
      if (updateData.preferences.notifications) {
        if (typeof updateData.preferences.notifications.email === 'boolean') {
          updateObject['preferences.notifications.email'] = updateData.preferences.notifications.email;
        }
        if (typeof updateData.preferences.notifications.push === 'boolean') {
          updateObject['preferences.notifications.push'] = updateData.preferences.notifications.push;
        }
        if (typeof updateData.preferences.notifications.sms === 'boolean') {
          updateObject['preferences.notifications.sms'] = updateData.preferences.notifications.sms;
        }
      }
    }

    // Handle password update separately (requires hashing)
    if ((req.body as any).password && (req.body as any).password.trim()) {
      // Validate password strength
      const passwordSchema = z.string()
        .min(8, 'Password must be at least 8 characters long')
        .max(128, 'Password cannot exceed 128 characters')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number');
      
      const passwordValidation = passwordSchema.safeParse((req.body as any).password);
      if (!passwordValidation.success) {
        res.status(400).json({
          success: false,
          message: 'Password validation failed',
          errors: passwordValidation.error.errors.map(err => ({
            field: 'password',
            message: err.message
          }))
        });
        return;
      }
      
      // Set password on existing user
      existingUser.password = (req.body as any).password;
    }

    // Apply other updates to the existing user object
    if (updateData.email) existingUser.email = updateData.email;
    if (updateData.firstName) existingUser.profile.firstName = updateData.firstName;
    if (updateData.lastName) existingUser.profile.lastName = updateData.lastName;
    if (updateData.phone !== undefined) existingUser.profile.phone = updateData.phone;
    if (updateData.roles) existingUser.roles = updateData.roles;
    if (typeof updateData.isActive === 'boolean') existingUser.isActive = updateData.isActive;

    if (updateData.preferences) {
      if (!existingUser.preferences) {
        existingUser.preferences = {} as any;
      }
      if (updateData.preferences.language) existingUser.preferences.language = updateData.preferences.language;
      if (updateData.preferences.timezone) existingUser.preferences.timezone = updateData.preferences.timezone;
      if (updateData.preferences.notifications) {
        if (!existingUser.preferences.notifications) {
          existingUser.preferences.notifications = {} as any;
        }
        if (typeof updateData.preferences.notifications.email === 'boolean') {
          existingUser.preferences.notifications.email = updateData.preferences.notifications.email;
        }
        if (typeof updateData.preferences.notifications.push === 'boolean') {
          existingUser.preferences.notifications.push = updateData.preferences.notifications.push;
        }
        if (typeof updateData.preferences.notifications.sms === 'boolean') {
          existingUser.preferences.notifications.sms = updateData.preferences.notifications.sms;
        }
      }
    }

    // Save the user (this will trigger password hashing if password was changed)
    await existingUser.save();

    // Get updated user without sensitive fields
    const updatedUser = await User.findById(id).select('-password -loginAttempts -lockUntil');

    logger.info(`User updated successfully: ${updatedUser?.email} by ${req.user?.email}`);

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    logger.error('Update user error:', error);
    
    if (error instanceof Error && error.message.includes('duplicate key')) {
      res.status(409).json({
        success: false,
        message: 'User with this email already exists',
        code: 'USER_EXISTS'
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error while updating user',
      code: 'UPDATE_USER_INTERNAL_ERROR'
    });
  }
};

/**
 * Delete user
 */
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
        code: 'USER_ID_REQUIRED'
      });
      return;
    }

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Prevent self-deletion
    if (req.user && req.user._id.toString() === id) {
      res.status(400).json({
        success: false,
        message: 'You cannot delete your own account',
        code: 'SELF_DELETE_NOT_ALLOWED'
      });
      return;
    }

    // Delete user
    await User.findByIdAndDelete(id);

    logger.info(`User deleted successfully: ${user.email} by ${req.user?.email}`);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while deleting user',
      code: 'DELETE_USER_INTERNAL_ERROR'
    });
  }
};

/**
 * Toggle user status (activate/deactivate)
 */
export const toggleUserStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'User ID is required',
        code: 'USER_ID_REQUIRED'
      });
      return;
    }

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Prevent self-deactivation
    if (req.user && req.user._id.toString() === id) {
      res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account',
        code: 'SELF_DEACTIVATE_NOT_ALLOWED'
      });
      return;
    }

    // Toggle status
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: { isActive: !user.isActive } },
      { new: true, runValidators: true }
    ).select('-password -loginAttempts -lockUntil');

    const action = updatedUser?.isActive ? 'activated' : 'deactivated';

    logger.info(`User ${action}: ${updatedUser?.email} by ${req.user?.email}`);

    res.status(200).json({
      success: true,
      message: `User ${action} successfully`,
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    logger.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while toggling user status',
      code: 'TOGGLE_STATUS_INTERNAL_ERROR'
    });
  }
};

/**
 * Get team members for current admin
 */
export const getTeamMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = req.user?._id;

    // Get supervisors and clients created by this admin
    const teamMembers = await User.find({
      roles: { $in: [Role.SUPERVISOR, Role.CLIENT] },
      createdBy: adminId
    })
    .select('-password -loginAttempts -lockUntil')
    .sort({ createdAt: -1 });

    logger.info(`Team members retrieved by ${req.user?.email}: ${teamMembers.length} members`);

    res.status(200).json({
      success: true,
      data: { teamMembers, count: teamMembers.length }
    });
  } catch (error) {
    logger.error('Get team members error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team members',
      code: 'TEAM_FETCH_ERROR'
    });
  }
};

/**
 * Create team member (supervisor or client)
 */
export const createTeamMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = req.user?._id;
    const { email, password, firstName, lastName, role, phone } = req.body;

    // Only allow supervisor and client roles
    if (role !== Role.SUPERVISOR && role !== Role.CLIENT) {
      res.status(403).json({
        success: false,
        message: 'Admins can only create supervisors and clients',
        code: 'INVALID_ROLE'
      });
      return;
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409).json({
        success: false,
        message: 'User with this email already exists',
        code: 'USER_EXISTS'
      });
      return;
    }

    // Validate password
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters with uppercase, lowercase, and number',
        code: 'INVALID_PASSWORD'
      });
      return;
    }

    // Create user
    const profileData: any = { firstName, lastName };
    // Only add phone if it's provided and not empty
    if (phone && typeof phone === 'string' && phone.trim().length > 0) {
      // Remove all spaces and non-digit characters except + at the start
      const cleanPhone = phone.replace(/\s/g, '').replace(/[^\d+]/g, '');
      profileData.phone = cleanPhone;
    }

    const newUser = await User.create({
      email,
      password,
      profile: profileData,
      roles: [role],
      isActive: true,
      createdBy: adminId
    });

    const userResponse = await User.findById(newUser._id).select('-password');
    logger.info(`Team member created by ${req.user?.email}: ${email} (${role})`);

    res.status(201).json({
      success: true,
      data: { user: userResponse },
      message: 'Team member created successfully'
    });
  } catch (error) {
    logger.error('Create team member error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating team member',
      code: 'TEAM_CREATE_ERROR'
    });
  }
};

/**
 * Update team member
 */
export const updateTeamMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.user?._id;
    const { email, firstName, lastName, phone, isActive, password } = req.body;

    const user = await User.findOne({
      _id: id,
      createdBy: adminId,
      roles: { $in: [Role.SUPERVISOR, Role.CLIENT] }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Team member not found or no permission',
        code: 'NOT_FOUND'
      });
      return;
    }

    // Update fields
    if (email) user.email = email;
    if (firstName) user.profile.firstName = firstName;
    if (lastName) user.profile.lastName = lastName;
    if (phone !== undefined) {
      if (phone && phone.trim()) {
        // Remove all spaces and non-digit characters except + at the start
        const cleanPhone = phone.replace(/\s/g, '').replace(/[^\d+]/g, '');
        user.profile.phone = cleanPhone;
      } else {
        user.profile.phone = undefined;
      }
    }
    if (typeof isActive === 'boolean') user.isActive = isActive;
    
    if (password && password.trim()) {
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
      if (!passwordRegex.test(password)) {
        res.status(400).json({
          success: false,
          message: 'Invalid password format',
          code: 'INVALID_PASSWORD'
        });
        return;
      }
      user.password = password;
    }

    user.lastModifiedBy = adminId;
    await user.save();

    const updatedUser = await User.findById(id).select('-password');
    logger.info(`Team member updated by ${req.user?.email}: ${email}`);

    res.status(200).json({
      success: true,
      data: { user: updatedUser },
      message: 'Team member updated successfully'
    });
  } catch (error) {
    logger.error('Update team member error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating team member',
      code: 'TEAM_UPDATE_ERROR'
    });
  }
};

/**
 * Deactivate team member
 */
export const deactivateTeamMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.user?._id;

    const user = await User.findOne({
      _id: id,
      createdBy: adminId,
      roles: { $in: [Role.SUPERVISOR, Role.CLIENT] }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Team member not found or no permission',
        code: 'NOT_FOUND'
      });
      return;
    }

    user.isActive = false;
    user.lastModifiedBy = adminId;
    await user.save();

    logger.info(`Team member deactivated by ${req.user?.email}: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Team member deactivated successfully'
    });
  } catch (error) {
    logger.error('Deactivate team member error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deactivating team member',
      code: 'TEAM_DEACTIVATE_ERROR'
    });
  }
};
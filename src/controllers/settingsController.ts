import { Request, Response } from 'express';
import { z } from 'zod';
import SystemSettings from '../models/SystemSettings';
import { logger } from '../config/logger';
import nodemailer from 'nodemailer';

// Validation schema
const updateSettingsSchema = z.object({
  application: z.object({
    appName: z.string().min(1).max(100).trim().optional(),
    defaultLanguage: z.enum(['en', 'es']).optional(),
    defaultTimezone: z.string().trim().optional()
  }).optional(),
  email: z.object({
    smtpHost: z.string().trim().optional(),
    smtpPort: z.number().min(1).max(65535).optional(),
    smtpEmail: z.string().email().optional(),
    smtpPassword: z.string().optional()
  }).optional(),
  security: z.object({
    jwtExpirationHours: z.number().min(1).max(720).optional(),
    maxLoginAttempts: z.number().min(1).max(10).optional(),
    lockDurationMinutes: z.number().min(1).max(1440).optional()
  }).optional()
});

/**
 * Get system settings (create default if not exists)
 */
export const getSystemSettings = async (_req: Request, res: Response): Promise<void> => {
  try {
    let settings = await SystemSettings.findOne();

    // Create default settings if none exist
    if (!settings) {
      settings = new SystemSettings();
      await settings.save();
      logger.info('Default system settings created');
    }

    res.status(200).json({
      success: true,
      data: {
        settings
      }
    });
  } catch (error) {
    logger.error('Get system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching system settings',
      code: 'GET_SETTINGS_ERROR'
    });
  }
};

/**
 * Update system settings
 */
export const updateSystemSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input
    const validationResult = updateSettingsSchema.safeParse(req.body);
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

    // Find settings or create if not exists
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings();
    }

    // Update fields
    if (updateData.application) {
      settings.application = { ...settings.application, ...updateData.application };
    }
    if (updateData.email) {
      settings.email = { ...settings.email, ...updateData.email };
    }
    if (updateData.security) {
      settings.security = { ...settings.security, ...updateData.security };
    }

    settings.lastModifiedBy = req.user!._id;
    await settings.save();

    logger.info(`System settings updated by ${req.user?.email}`);

    res.status(200).json({
      success: true,
      message: 'System settings updated successfully',
      data: {
        settings
      }
    });
  } catch (error) {
    logger.error('Update system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating system settings',
      code: 'UPDATE_SETTINGS_ERROR'
    });
  }
};

/**
 * Test email settings
 */
export const testEmailSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await SystemSettings.findOne();
    if (!settings || !settings.email.smtpHost || !settings.email.smtpEmail) {
      res.status(400).json({
        success: false,
        message: 'Email settings are not configured',
        code: 'EMAIL_NOT_CONFIGURED'
      });
      return;
    }

    // Create test transporter
    const transporter = nodemailer.createTransport({
      host: settings.email.smtpHost,
      port: settings.email.smtpPort,
      secure: settings.email.smtpPort === 465,
      auth: {
        user: settings.email.smtpEmail,
        pass: settings.email.smtpPassword
      }
    });

    // Send test email
    await transporter.sendMail({
      from: settings.email.smtpEmail,
      to: req.user!.email,
      subject: 'Reservario - Test Email',
      text: 'This is a test email from Reservario Channel Manager. If you received this, your email settings are working correctly.',
      html: '<p>This is a test email from <strong>Reservario Channel Manager</strong>.</p><p>If you received this, your email settings are working correctly.</p>'
    });

    logger.info(`Test email sent successfully by ${req.user?.email}`);

    res.status(200).json({
      success: true,
      message: 'Test email sent successfully. Please check your inbox.'
    });
  } catch (error) {
    logger.error('Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email. Please check your email settings.',
      code: 'TEST_EMAIL_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};


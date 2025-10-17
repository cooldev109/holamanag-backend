import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { logger } from '../config/logger';
import EmailTemplate, { EmailTemplateStatus } from '../models/EmailTemplate';
import guestCommunicationService from '../services/GuestCommunicationService';
import mongoose from 'mongoose';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// ============================================================================
// EMAIL TEMPLATE ROUTES
// ============================================================================

/**
 * POST /api/v1/communication/templates
 * Create email template
 */
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const {
      name,
      type,
      subject,
      body,
      plainTextBody,
      variables,
      organization,
      property,
      language,
      automation
    } = req.body;

    if (!name || !type || !subject || !body) {
      return res.status(400).json({
        success: false,
        error: 'Name, type, subject, and body are required'
      });
    }

    const template = new EmailTemplate({
      name,
      type,
      subject,
      body,
      plainTextBody,
      variables: variables || [],
      organization: organization ? new mongoose.Types.ObjectId(organization) : undefined,
      property: property ? new mongoose.Types.ObjectId(property) : undefined,
      language: language || 'en',
      automation: automation || { enabled: false },
      status: EmailTemplateStatus.DRAFT,
      createdBy: req.user!._id
    });

    await template.save();

    logger.info(`[Communication] Email template created: ${template._id}`);

    return res.status(201).json({
      success: true,
      data: template,
      message: 'Email template created successfully'
    });
  } catch (error) {
    logger.error('[Communication] Error creating template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create email template',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/communication/templates
 * List email templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const { type, status, organization, property, language } = req.query;

    const query: any = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (organization) query.organization = new mongoose.Types.ObjectId(organization as string);
    if (property) query.property = new mongoose.Types.ObjectId(property as string);
    if (language) query.language = language;

    const templates = await EmailTemplate.find(query)
      .populate('organization', 'name')
      .populate('property', 'name')
      .sort({ name: 1 });

    return res.json({
      success: true,
      data: templates,
      count: templates.length
    });
  } catch (error) {
    logger.error('[Communication] Error listing templates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve templates',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/communication/templates/:id
 * Get template details
 */
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await EmailTemplate.findById(req.params.id)
      .populate('organization', 'name')
      .populate('property', 'name');

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    return res.json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('[Communication] Error getting template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve template',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/v1/communication/templates/:id
 * Update template
 */
router.put('/templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const allowedUpdates = ['name', 'subject', 'body', 'plainTextBody', 'variables', 'status', 'automation', 'language'];
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        (template as any)[key] = req.body[key];
      }
    });

    template.updatedBy = req.user!._id;
    await template.save();

    logger.info(`[Communication] Template updated: ${template._id}`);

    return res.json({
      success: true,
      data: template,
      message: 'Template updated successfully'
    });
  } catch (error) {
    logger.error('[Communication] Error updating template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update template',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/v1/communication/templates/:id
 * Delete template
 */
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await EmailTemplate.findByIdAndDelete(req.params.id);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    logger.info(`[Communication] Template deleted: ${req.params.id}`);

    return res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    logger.error('[Communication] Error deleting template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete template',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/communication/templates/:id/clone
 * Clone template
 */
router.post('/templates/:id/clone', async (req: Request, res: Response) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const cloned = await template.clone();

    logger.info(`[Communication] Template cloned: ${template._id} -> ${cloned._id}`);

    return res.status(201).json({
      success: true,
      data: cloned,
      message: 'Template cloned successfully'
    });
  } catch (error) {
    logger.error('[Communication] Error cloning template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to clone template',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/communication/templates/:id/statistics
 * Get template statistics
 */
router.get('/templates/:id/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await guestCommunicationService.getTemplateStatistics(
      new mongoose.Types.ObjectId(req.params.id)
    );

    return res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('[Communication] Error getting template statistics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve template statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// EMAIL SENDING ROUTES
// ============================================================================

/**
 * POST /api/v1/communication/send/confirmation
 * Send booking confirmation email
 */
router.post('/send/confirmation', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID is required'
      });
    }

    const result = await guestCommunicationService.sendBookingConfirmation(
      new mongoose.Types.ObjectId(bookingId)
    );

    if (result.success) {
      return res.json({
        success: true,
        data: result,
        message: 'Booking confirmation email sent successfully'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to send booking confirmation',
        message: result.error
      });
    }
  } catch (error) {
    logger.error('[Communication] Error sending confirmation:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send booking confirmation',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/communication/send/pre-arrival
 * Send pre-arrival email
 */
router.post('/send/pre-arrival', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID is required'
      });
    }

    const result = await guestCommunicationService.sendPreArrivalEmail(
      new mongoose.Types.ObjectId(bookingId)
    );

    if (result.success) {
      return res.json({
        success: true,
        data: result,
        message: 'Pre-arrival email sent successfully'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to send pre-arrival email',
        message: result.error
      });
    }
  } catch (error) {
    logger.error('[Communication] Error sending pre-arrival email:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send pre-arrival email',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/communication/send/post-checkout
 * Send post-checkout email
 */
router.post('/send/post-checkout', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID is required'
      });
    }

    const result = await guestCommunicationService.sendPostCheckoutEmail(
      new mongoose.Types.ObjectId(bookingId)
    );

    if (result.success) {
      return res.json({
        success: true,
        data: result,
        message: 'Post-checkout email sent successfully'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to send post-checkout email',
        message: result.error
      });
    }
  } catch (error) {
    logger.error('[Communication] Error sending post-checkout email:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send post-checkout email',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/communication/send/review-request
 * Send review request email
 */
router.post('/send/review-request', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID is required'
      });
    }

    const result = await guestCommunicationService.sendReviewRequest(
      new mongoose.Types.ObjectId(bookingId)
    );

    if (result.success) {
      return res.json({
        success: true,
        data: result,
        message: 'Review request email sent successfully'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to send review request',
        message: result.error
      });
    }
  } catch (error) {
    logger.error('[Communication] Error sending review request:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send review request',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/communication/send/payment-reminder
 * Send payment reminder email
 */
router.post('/send/payment-reminder', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID is required'
      });
    }

    const result = await guestCommunicationService.sendPaymentReminder(
      new mongoose.Types.ObjectId(bookingId)
    );

    if (result.success) {
      return res.json({
        success: true,
        data: result,
        message: 'Payment reminder email sent successfully'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to send payment reminder',
        message: result.error
      });
    }
  } catch (error) {
    logger.error('[Communication] Error sending payment reminder:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send payment reminder',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/communication/triggers/process
 * Manually trigger automated email processing
 */
router.post('/triggers/process', async (_req: Request, res: Response) => {
  try {
    logger.info('[Communication] Manual trigger processing initiated');

    const result = await guestCommunicationService.processAutomatedTriggers();

    return res.json({
      success: true,
      data: result,
      message: `Automated triggers processed: ${result.sent} sent, ${result.failed} failed`
    });
  } catch (error) {
    logger.error('[Communication] Error processing triggers:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process automated triggers',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

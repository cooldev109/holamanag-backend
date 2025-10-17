import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { logger } from '../config/logger';
import PropertyGroup from '../models/PropertyGroup';
import Organization from '../models/Organization';
import Property from '../models/Property';
import multiPropertyService from '../services/MultiPropertyService';
import { TimeRange } from '../services/AnalyticsService';
import { CalendarStatus } from '../models/Calendar';
import mongoose from 'mongoose';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// ============================================================================
// PROPERTY GROUP ROUTES
// ============================================================================

/**
 * POST /api/v1/multi-property/groups
 * Create a new property group
 */
router.post('/groups', async (req: Request, res: Response) => {
  try {
    const { name, description, organization, properties, settings, manager, tags } = req.body;

    // Validate required fields
    if (!name || !organization || !manager) {
      return res.status(400).json({
        success: false,
        error: 'Name, organization, and manager are required'
      });
    }

    const propertyGroup = new PropertyGroup({
      name,
      description,
      organization: new mongoose.Types.ObjectId(organization),
      properties: properties ? properties.map((p: string) => new mongoose.Types.ObjectId(p)) : [],
      settings: settings || {},
      manager: new mongoose.Types.ObjectId(manager),
      tags: tags || [],
      createdBy: req.user!._id
    });

    await propertyGroup.save();

    logger.info(`[MultiProperty] Property group created: ${propertyGroup._id}`);

    return res.status(201).json({
      success: true,
      data: propertyGroup,
      message: 'Property group created successfully'
    });
  } catch (error) {
    logger.error('[MultiProperty] Error creating property group:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create property group',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/multi-property/groups
 * List property groups
 */
router.get('/groups', async (req: Request, res: Response) => {
  try {
    const { organization, manager, status } = req.query;

    const query: any = {};
    if (organization) {
      query.organization = new mongoose.Types.ObjectId(organization as string);
    }
    if (manager) {
      query.manager = new mongoose.Types.ObjectId(manager as string);
    }
    if (status) {
      query.status = status;
    }

    const groups = await PropertyGroup.find(query)
      .populate('organization', 'name type')
      .populate('properties', 'name status')
      .populate('manager', 'firstName lastName email')
      .sort({ name: 1 });

    return res.json({
      success: true,
      data: groups,
      count: groups.length
    });
  } catch (error) {
    logger.error('[MultiProperty] Error listing property groups:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve property groups',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/multi-property/groups/:id
 * Get property group details
 */
router.get('/groups/:id', async (req: Request, res: Response) => {
  try {
    const group = await PropertyGroup.findById(req.params.id)
      .populate('organization', 'name type subscription')
      .populate('properties', 'name status address rooms')
      .populate('manager', 'firstName lastName email');

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Property group not found'
      });
    }

    return res.json({
      success: true,
      data: group
    });
  } catch (error) {
    logger.error('[MultiProperty] Error getting property group:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve property group',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/v1/multi-property/groups/:id
 * Update property group
 */
router.put('/groups/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, settings, manager, tags, status } = req.body;

    const group = await PropertyGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Property group not found'
      });
    }

    // Update fields
    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (settings) group.settings = { ...group.settings, ...settings };
    if (manager) group.manager = new mongoose.Types.ObjectId(manager);
    if (tags) group.tags = tags;
    if (status) group.status = status;
    group.updatedBy = req.user!._id;

    await group.save();

    logger.info(`[MultiProperty] Property group updated: ${group._id}`);

    return res.json({
      success: true,
      data: group,
      message: 'Property group updated successfully'
    });
  } catch (error) {
    logger.error('[MultiProperty] Error updating property group:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update property group',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/v1/multi-property/groups/:id
 * Delete property group
 */
router.delete('/groups/:id', async (req: Request, res: Response) => {
  try {
    const group = await PropertyGroup.findByIdAndDelete(req.params.id);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Property group not found'
      });
    }

    logger.info(`[MultiProperty] Property group deleted: ${req.params.id}`);

    return res.json({
      success: true,
      message: 'Property group deleted successfully'
    });
  } catch (error) {
    logger.error('[MultiProperty] Error deleting property group:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete property group',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/multi-property/groups/:id/properties
 * Add property to group
 */
router.post('/groups/:id/properties', async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.body;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        error: 'Property ID is required'
      });
    }

    const group = await PropertyGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Property group not found'
      });
    }

    // Check if property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    await group.addProperty(new mongoose.Types.ObjectId(propertyId));

    // Update property's group reference
    property.propertyGroup = group._id;
    await property.save();

    logger.info(`[MultiProperty] Property ${propertyId} added to group ${group._id}`);

    return res.json({
      success: true,
      data: group,
      message: 'Property added to group successfully'
    });
  } catch (error) {
    logger.error('[MultiProperty] Error adding property to group:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add property to group',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/v1/multi-property/groups/:id/properties/:propertyId
 * Remove property from group
 */
router.delete('/groups/:id/properties/:propertyId', async (req: Request, res: Response) => {
  try {
    const group = await PropertyGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Property group not found'
      });
    }

    await group.removeProperty(new mongoose.Types.ObjectId(req.params.propertyId));

    // Remove group reference from property
    const property = await Property.findById(req.params.propertyId);
    if (property && property.propertyGroup?.toString() === group._id.toString()) {
      property.propertyGroup = undefined;
      await property.save();
    }

    logger.info(`[MultiProperty] Property ${req.params.propertyId} removed from group ${group._id}`);

    return res.json({
      success: true,
      data: group,
      message: 'Property removed from group successfully'
    });
  } catch (error) {
    logger.error('[MultiProperty] Error removing property from group:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to remove property from group',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// ORGANIZATION ROUTES
// ============================================================================

/**
 * POST /api/v1/multi-property/organizations
 * Create a new organization
 */
router.post('/organizations', async (req: Request, res: Response) => {
  try {
    const { name, legalName, type, contactInfo, businessInfo, subscription, settings } = req.body;

    // Validate required fields
    if (!name || !type || !contactInfo?.email || !contactInfo?.address?.country) {
      return res.status(400).json({
        success: false,
        error: 'Name, type, email, and country are required'
      });
    }

    const organization = new Organization({
      name,
      legalName,
      type,
      contactInfo,
      businessInfo: businessInfo || {},
      subscription: subscription || {},
      settings: settings || {},
      owner: req.user!._id,
      admins: [req.user!._id],
      members: [req.user!._id]
    });

    await organization.save();

    logger.info(`[MultiProperty] Organization created: ${organization._id}`);

    return res.status(201).json({
      success: true,
      data: organization,
      message: 'Organization created successfully'
    });
  } catch (error) {
    logger.error('[MultiProperty] Error creating organization:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create organization',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/multi-property/organizations
 * List organizations
 */
router.get('/organizations', async (req: Request, res: Response) => {
  try {
    const { owner, member, type, status, plan } = req.query;

    const query: any = {};
    if (owner) {
      query.owner = new mongoose.Types.ObjectId(owner as string);
    }
    if (member) {
      query.members = new mongoose.Types.ObjectId(member as string);
    }
    if (type) {
      query.type = type;
    }
    if (status) {
      query.status = status;
    }
    if (plan) {
      query['subscription.plan'] = plan;
    }

    const organizations = await Organization.find(query)
      .populate('owner', 'firstName lastName email')
      .sort({ name: 1 });

    return res.json({
      success: true,
      data: organizations,
      count: organizations.length
    });
  } catch (error) {
    logger.error('[MultiProperty] Error listing organizations:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve organizations',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/multi-property/organizations/:id
 * Get organization details
 */
router.get('/organizations/:id', async (req: Request, res: Response) => {
  try {
    const organization = await Organization.findById(req.params.id)
      .populate('owner', 'firstName lastName email')
      .populate('admins', 'firstName lastName email')
      .populate('members', 'firstName lastName email');

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    return res.json({
      success: true,
      data: organization
    });
  } catch (error) {
    logger.error('[MultiProperty] Error getting organization:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve organization',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/v1/multi-property/organizations/:id
 * Update organization
 */
router.put('/organizations/:id', async (req: Request, res: Response) => {
  try {
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Update fields (allow partial updates)
    const allowedUpdates = ['name', 'legalName', 'contactInfo', 'businessInfo', 'settings', 'tags', 'notes', 'status'];
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        (organization as any)[key] = req.body[key];
      }
    });

    await organization.save();

    logger.info(`[MultiProperty] Organization updated: ${organization._id}`);

    return res.json({
      success: true,
      data: organization,
      message: 'Organization updated successfully'
    });
  } catch (error) {
    logger.error('[MultiProperty] Error updating organization:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update organization',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/multi-property/organizations/:id/summary
 * Get organization summary with analytics
 */
router.get('/organizations/:id/summary', async (req: Request, res: Response) => {
  try {
    const summary = await multiPropertyService.getOrganizationSummary(
      new mongoose.Types.ObjectId(req.params.id)
    );

    return res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('[MultiProperty] Error getting organization summary:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve organization summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// CROSS-PROPERTY ANALYTICS ROUTES
// ============================================================================

/**
 * GET /api/v1/multi-property/analytics
 * Get cross-property analytics
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const { organizationId, propertyGroupId, range = TimeRange.LAST_30_DAYS, startDate, endDate } = req.query;

    if (!organizationId && !propertyGroupId) {
      return res.status(400).json({
        success: false,
        error: 'Either organizationId or propertyGroupId is required'
      });
    }

    const analytics = await multiPropertyService.getCrossPropertyAnalytics(
      organizationId ? new mongoose.Types.ObjectId(organizationId as string) : undefined,
      propertyGroupId ? new mongoose.Types.ObjectId(propertyGroupId as string) : undefined,
      range as TimeRange,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    return res.json({
      success: true,
      data: analytics,
      metadata: {
        range,
        organizationId: organizationId || null,
        propertyGroupId: propertyGroupId || null,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('[MultiProperty] Error getting cross-property analytics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve cross-property analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/multi-property/analytics/compare
 * Compare properties
 */
router.post('/analytics/compare', async (req: Request, res: Response) => {
  try {
    const { propertyIds, range = TimeRange.LAST_30_DAYS, startDate, endDate } = req.body;

    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 property IDs are required for comparison'
      });
    }

    const comparison = await multiPropertyService.compareProperties(
      propertyIds.map((id: string) => new mongoose.Types.ObjectId(id)),
      range as TimeRange,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    return res.json({
      success: true,
      data: comparison,
      metadata: {
        range,
        propertyCount: propertyIds.length,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('[MultiProperty] Error comparing properties:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to compare properties',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// BULK OPERATIONS ROUTES
// ============================================================================

/**
 * POST /api/v1/multi-property/bulk/rates
 * Bulk update rates across properties
 */
router.post('/bulk/rates', async (req: Request, res: Response) => {
  try {
    const { propertyIds, rateAdjustment } = req.body;

    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Property IDs array is required'
      });
    }

    if (!rateAdjustment || !rateAdjustment.type || rateAdjustment.value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Rate adjustment with type and value is required'
      });
    }

    const result = await multiPropertyService.bulkUpdateRates(
      propertyIds.map((id: string) => new mongoose.Types.ObjectId(id)),
      rateAdjustment
    );

    return res.json({
      success: true,
      data: result,
      message: `Bulk rate update completed: ${result.success}/${result.total} successful`
    });
  } catch (error) {
    logger.error('[MultiProperty] Error bulk updating rates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk update rates',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/multi-property/bulk/availability
 * Bulk update availability across properties
 */
router.post('/bulk/availability', async (req: Request, res: Response) => {
  try {
    const { propertyIds, startDate, endDate, status } = req.body;

    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Property IDs array is required'
      });
    }

    if (!startDate || !endDate || !status) {
      return res.status(400).json({
        success: false,
        error: 'Start date, end date, and status are required'
      });
    }

    const result = await multiPropertyService.bulkUpdateAvailability(
      propertyIds.map((id: string) => new mongoose.Types.ObjectId(id)),
      new Date(startDate),
      new Date(endDate),
      status as CalendarStatus
    );

    return res.json({
      success: true,
      data: result,
      message: `Bulk availability update completed: ${result.success}/${result.total} successful`
    });
  } catch (error) {
    logger.error('[MultiProperty] Error bulk updating availability:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk update availability',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/multi-property/bulk/settings
 * Bulk update settings across properties
 */
router.post('/bulk/settings', async (req: Request, res: Response) => {
  try {
    const { propertyIds, settings } = req.body;

    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Property IDs array is required'
      });
    }

    if (!settings || Object.keys(settings).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Settings object is required'
      });
    }

    const result = await multiPropertyService.bulkUpdateSettings(
      propertyIds.map((id: string) => new mongoose.Types.ObjectId(id)),
      settings
    );

    return res.json({
      success: true,
      data: result,
      message: `Bulk settings update completed: ${result.success}/${result.total} successful`
    });
  } catch (error) {
    logger.error('[MultiProperty] Error bulk updating settings:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk update settings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

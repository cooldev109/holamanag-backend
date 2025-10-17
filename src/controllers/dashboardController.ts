import { Request, Response } from 'express';
import User, { Role } from '../models/User';
import Property from '../models/Property';
import Booking from '../models/Booking';
import RoomAvailability from '../models/RoomAvailability';
import { logger } from '../config/logger';

/**
 * Get KPIs for admin dashboard (occupancy, revenue, bookings)
 */
export const getKpis = async (req: Request, res: Response): Promise<void> => {
  try {
    // Calculate dates for metrics
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    // Get properties owned by this user (admin/supervisor)
    const userId = req.user?._id;
    let propertyFilter: any = {};
    
    // If not superadmin, filter by user's properties
    if (!req.user?.roles.includes(Role.SUPERADMIN)) {
      const properties = await Property.find({ 
        $or: [
          { 'owner': userId },
          { 'managers': userId }
        ]
      }).select('_id');
      const propertyIds = properties.map(p => p._id);
      propertyFilter = { property: { $in: propertyIds } };
    }

    // Calculate occupancy percentage for today
    const totalRooms = await RoomAvailability.aggregate([
      { 
        $match: { 
          date: today,
          ...propertyFilter
        } 
      },
      {
        $group: {
          _id: null,
          totalRooms: { $sum: '$totalRooms' },
          bookedRooms: { $sum: { $size: '$bookedRooms' } }
        }
      }
    ]);

    const occupancyPct = totalRooms.length > 0 && totalRooms[0].totalRooms > 0
      ? ((totalRooms[0].bookedRooms / totalRooms[0].totalRooms) * 100).toFixed(1)
      : 0;

    // Calculate revenue for current month
    const revenueData = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          status: { $in: ['confirmed', 'checked_in', 'checked_out'] },
          ...(propertyFilter.property ? { property: { $in: propertyFilter.property.$in } } : {})
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.total' }
        }
      }
    ]);

    const revenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;

    // Count new bookings this month
    const newBookings = await Booking.countDocuments({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      ...(propertyFilter.property ? { property: { $in: propertyFilter.property.$in } } : {})
    });

    logger.info(`KPIs retrieved by ${req.user?.email}`, {
      occupancyPct,
      revenue,
      newBookings
    });

    res.status(200).json({
      success: true,
      data: {
        occupancyPct: parseFloat(occupancyPct.toString()),
        revenue,
        newBookings
      }
    });
  } catch (error) {
    logger.error('Get KPIs error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching KPIs',
      code: 'KPI_ERROR'
    });
  }
};

/**
 * Get dashboard statistics for superadmin
 */
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Calculate dates
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const last7Days = new Date(now);
    last7Days.setDate(now.getDate() - 7);

    // Get user statistics
    const totalUsers = await User.countDocuments();
    const adminCount = await User.countDocuments({ roles: 'admin' });
    const supervisorCount = await User.countDocuments({ roles: 'supervisor' });
    const clientCount = await User.countDocuments({ roles: 'client' });

    // Get property count
    const totalProperties = await Property.countDocuments();

    // Get bookings this week
    const bookingsThisWeek = await Booking.countDocuments({
      createdAt: { $gte: startOfWeek }
    });

    // Get active users (logged in last 7 days)
    const activeUsers = await User.countDocuments({
      lastLoginAt: { $gte: last7Days }
    });

    // Get recent users (last 10)
    const recentUsers = await User.find()
      .select('profile.firstName profile.lastName email roles createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    logger.info(`Dashboard stats retrieved by ${req.user?.email}`);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          users: {
            total: totalUsers,
            admins: adminCount,
            supervisors: supervisorCount,
            clients: clientCount
          },
          properties: totalProperties,
          bookings: {
            thisWeek: bookingsThisWeek
          },
          activeUsers: activeUsers
        },
        recentUsers: recentUsers.map(user => ({
          id: user._id,
          name: `${user.profile.firstName} ${user.profile.lastName}`,
          email: user.email,
          roles: user.roles,
          createdAt: user.createdAt
        }))
      }
    });
  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching dashboard statistics',
      code: 'DASHBOARD_STATS_ERROR'
    });
  }
};


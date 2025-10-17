import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '../config/logger';

class WebSocketService {
  private io: SocketIOServer | null = null;

  /**
   * Initialize Socket.IO with HTTP server
   */
  initialize(httpServer: HTTPServer): void {
    // Get allowed origins from environment or use defaults
    const allowedOrigins = process.env['CORS_ORIGIN']
      ? process.env['CORS_ORIGIN'].split(',').map(origin => origin.trim())
      : [
          'http://localhost:5173',
          'http://localhost:3000',
          'https://holamanag-frontend.netlify.app'
        ];

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          // Allow requests with no origin (mobile apps)
          if (!origin) return callback(null, true);
          
          // Check if origin is allowed
          if (allowedOrigins.includes(origin) || origin.includes('holamanag-frontend.netlify.app')) {
            return callback(null, true);
          }
          
          callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.io.on('connection', (socket) => {
      logger.info(`WebSocket client connected: ${socket.id}`);

      // Join property room for targeted updates
      socket.on('join', (data: { propertyId: string }) => {
        const room = `property:${data.propertyId}`;
        socket.join(room);
        logger.info(`Socket ${socket.id} joined room: ${room}`);
      });

      // Leave property room
      socket.on('leave', (data: { propertyId: string }) => {
        const room = `property:${data.propertyId}`;
        socket.leave(room);
        logger.info(`Socket ${socket.id} left room: ${room}`);
      });

      socket.on('disconnect', () => {
        logger.info(`WebSocket client disconnected: ${socket.id}`);
      });
    });

    logger.info('WebSocket service initialized');
  }

  /**
   * Emit booking created event
   */
  emitBookingCreated(data: {
    propertyId: string;
    roomId: string;
    dates: string[];
    channel: string;
    guestName: string;
  }): void {
    if (!this.io) {
      logger.warn('WebSocket not initialized, cannot emit booking:created');
      return;
    }

    // Emit to specific property room
    const room = `property:${data.propertyId}`;
    this.io.to(room).emit('booking:created', data);

    // Also emit to all connected clients (for admin dashboard)
    this.io.emit('booking:created:global', data);

    logger.info(`Emitted booking:created for property ${data.propertyId}`, {
      channel: data.channel,
      guestName: data.guestName,
      dates: data.dates.length
    });
  }

  /**
   * Emit inventory updated event
   */
  emitInventoryUpdated(data: {
    propertyId: string;
    roomId: string;
    date: string;
    totalRooms: number;
    availableRooms: number;
    bookedRooms: number;
  }): void {
    if (!this.io) {
      logger.warn('WebSocket not initialized, cannot emit inventory:updated');
      return;
    }

    const room = `property:${data.propertyId}`;
    this.io.to(room).emit('inventory:updated', data);

    logger.info(`Emitted inventory:updated for property ${data.propertyId}`, {
      date: data.date,
      available: data.availableRooms,
      total: data.totalRooms
    });
  }

  /**
   * Emit booking cancelled event
   */
  emitBookingCancelled(data: {
    propertyId: string;
    roomId: string;
    bookingId: string;
    dates: string[];
  }): void {
    if (!this.io) {
      logger.warn('WebSocket not initialized, cannot emit booking:cancelled');
      return;
    }

    const room = `property:${data.propertyId}`;
    this.io.to(room).emit('booking:cancelled', data);
    this.io.emit('booking:cancelled:global', data);

    logger.info(`Emitted booking:cancelled for property ${data.propertyId}`);
  }

  /**
   * Get Socket.IO instance
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;




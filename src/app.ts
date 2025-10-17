import 'dotenv/config';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { logger } from './config/logger';
import connectDB from './config/database';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import propertyRoutes from './routes/propertyRoutes';
import bookingRoutes from './routes/bookingRoutes';
import ratePlanRoutes from './routes/ratePlanRoutes';
import calendarRoutes from './routes/calendarRoutes';
import inventoryRoutesV2 from './routes/inventoryRoutesV2';  // NEW: Correct implementation
import channelRoutes from './routes/channelRoutes';
import uploadRoutes from './routes/uploadRoutes';
import auditRoutes from './routes/auditRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import settingsRoutes from './routes/settingsRoutes';
import guestBookingRoutes from './routes/guestBookingRoutes';
import webhookRoutes from './routes/webhookRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import multiPropertyRoutes from './routes/multiPropertyRoutes';
import communicationRoutes from './routes/communicationRoutes';
import clientRoutes from './routes/clientRoutes';
import { errorHandler } from './utils/errors';
import rateLimitingMiddleware from './middleware/rateLimiting';
import { auditMiddleware } from './middleware/audit';
import swaggerUi from 'swagger-ui-express';
import swaggerDocs from './config/swagger';

const app: Application = express();
const PORT = process.env['PORT'] || 3000;
const NODE_ENV = process.env['NODE_ENV'] || 'development';

logger.info('Starting Reservario Backend Server...');
logger.info(`Environment: ${NODE_ENV}`);
logger.info(`Port: ${PORT}`);

// Connect to database (handles initialization, indexes, and seed data)
connectDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration - allow multiple frontend origins
// In development, we allow localhost on common ports
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8080', 
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000'
];

// Add custom origins from environment
if (process.env['CORS_ORIGIN']) {
  allowedOrigins.push(...process.env['CORS_ORIGIN'].split(','));
}

const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS: Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

app.use(helmet());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

app.use(rateLimitingMiddleware.generalRateLimit);
app.use(rateLimitingMiddleware.speedLimiter);
app.use(auditMiddleware);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
app.get('/api-docs.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerDocs);
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Reservario Channel Manager API is healthy!',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.use('/api/v1/auth', rateLimitingMiddleware.authRateLimit, authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/properties', propertyRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/rate-plans', ratePlanRoutes);
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/v1/inventory', inventoryRoutesV2);  // UPDATED: Using correct implementation
// app.use('/api/v1/inventory-old', inventoryRoutes);  // OLD: Keep for reference
app.use('/api/v1/channels', channelRoutes);
app.use('/api/v1/uploads', rateLimitingMiddleware.uploadRateLimit, uploadRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/guest', guestBookingRoutes); // Guest booking endpoints (no auth required)
app.use('/api/v1/webhooks', webhookRoutes); // OTA webhook endpoints (no auth required - uses signature verification)
app.use('/api/v1/analytics', analyticsRoutes); // Analytics and reporting endpoints (requires auth)
app.use('/api/v1/multi-property', multiPropertyRoutes); // Multi-property management endpoints (requires auth)
app.use('/api/v1/communication', communicationRoutes); // Guest communication and email templates (requires auth)
app.use('/api/v1/client', clientRoutes); // Client-facing endpoints (requires auth, client role)

app.use(errorHandler);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    code: 'ROUTE_NOT_FOUND'
  });
});

// Note: Server is started in server.ts to enable Socket.IO
export default app;
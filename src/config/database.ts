import mongoose from 'mongoose';
import { logger } from './logger';
import { SeedData } from '../utils/seedData';
import DatabaseIndexes from './indexes';
import { initializeModels } from '../models';

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/reservario';
    
    const conn = await mongoose.connect(mongoURI, {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      bufferCommands: false, // Disable mongoose buffering
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    
    // Initialize models and relationships
    initializeModels();
    logger.info('Models initialized with relationships and validations');
    
    // Create database indexes
    try {
      await DatabaseIndexes.createAllIndexes();
      logger.info('Database indexes created successfully');
    } catch (error) {
      logger.warn('Failed to create some indexes:', error);
    }
    
    // Seed data in development
    if (process.env['NODE_ENV'] === 'development') {
      try {
        await SeedData.seedAll();
        logger.info('Development seed data created successfully');
      } catch (error) {
        logger.error('Failed to seed data:', error);
      }
    }
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Database connection error:', error);
    process.exit(1);
  }
};

export default connectDB;

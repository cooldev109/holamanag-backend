import http from 'http';
import app from './app';
import { websocketService } from './services/websocketService';
import { logger } from './config/logger';

const PORT = process.env['PORT'] || 3000;
const NODE_ENV = process.env['NODE_ENV'] || 'development';

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize WebSocket service
websocketService.initialize(httpServer);

// Start server
if (NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT} in ${NODE_ENV} mode`);
    logger.info(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    logger.info(`🏥 Health Check: http://localhost:${PORT}/health`);
    logger.info(`🔌 WebSocket enabled for real-time updates`);
  });
}

export default httpServer;




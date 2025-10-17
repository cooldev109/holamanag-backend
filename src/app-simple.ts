import 'dotenv/config';
import express, { Application, Request, Response } from 'express';

const app: Application = express();
const PORT = process.env['PORT'] || 3000;

console.log('Starting simple server...');
console.log(`Port: ${PORT}`);

// Simple health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Simple server is running!',
    timestamp: new Date().toISOString()
  });
});

// Simple API test endpoint
app.get('/api/test', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'API test endpoint working!',
    data: {
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Simple server running on port ${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`🧪 API Test: http://localhost:${PORT}/api/test`);
});

export default app;



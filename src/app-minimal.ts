import 'dotenv/config';
import express, { Application, Request, Response } from 'express';

const app: Application = express();
const PORT = process.env['PORT'] || 3000;

console.log('Starting minimal server...');
console.log(`Port: ${PORT}`);

// Simple health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Minimal server is running!',
    timestamp: new Date().toISOString()
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Minimal server running on port ${PORT}`);
});

export default app;



import { Router } from 'express';
import uploadController from '../controllers/uploadController';
import { authenticate, authorize } from '../middleware/auth';
import { Role } from '../models/User';

const router = Router();

// Apply authentication to all upload routes
router.use(authenticate);

// Property image uploads
router.post('/properties/:propertyId/images', 
  authorize(['superadmin', 'admin', 'supervisor'] as Role[]),
  uploadController.uploadPropertyImages
);

// Self avatar upload (must come before /:userId to avoid path conflict)
router.post('/users/me/avatar',
  uploadController.uploadOwnAvatar
);

// User avatar uploads (admin only)
router.post('/users/:userId/avatar',
  authorize(['superadmin', 'admin', 'supervisor'] as Role[]),
  uploadController.uploadUserAvatar
);

// Document uploads
router.post('/properties/:propertyId/documents', 
  authorize(['superadmin', 'admin', 'supervisor'] as Role[]),
  uploadController.uploadDocuments
);

// File management
router.delete('/files/:filePath(*)', 
  authorize(['superadmin', 'admin', 'supervisor'] as Role[]),
  uploadController.deleteFile
);

router.get('/files/:filePath(*)/info', 
  authorize(['superadmin', 'admin', 'supervisor'] as Role[]),
  uploadController.getFileInfo
);

router.get('/directories/:directory(*)', 
  authorize(['superadmin', 'admin', 'supervisor'] as Role[]),
  uploadController.listFiles
);

router.post('/files/move', 
  authorize(['superadmin', 'admin', 'supervisor'] as Role[]),
  uploadController.moveFile
);

// Upload statistics (admin only)
router.get('/stats', 
  authorize(['superadmin', 'admin'] as Role[]),
  uploadController.getUploadStats
);

export default router;

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { FileUploadError, FileSizeError, FileTypeError } from '../utils/errors';
import { logger } from '../config/logger';

// Ensure upload directories exist
const createUploadDirectories = () => {
  const uploadDirs = [
    'uploads',
    'uploads/properties',
    'uploads/properties/images',
    'uploads/properties/documents',
    'uploads/users',
    'uploads/users/avatars',
    'uploads/temp'
  ];

  uploadDirs.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.info(`Created upload directory: ${dir}`);
    }
  });
};

// Initialize upload directories
createUploadDirectories();

// File type validation
const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const allowedDocumentTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

const fileFilter = (allowedTypes: string[], maxSize: number) => {
  return (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    try {
      // Check file type
      if (!allowedTypes.includes(file.mimetype)) {
        const error = new FileTypeError(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
        logger.warn(`File upload rejected - invalid type: ${file.mimetype}`, {
          filename: file.originalname,
          mimetype: file.mimetype,
          allowedTypes,
          ip: req.ip,
          userId: (req as any).user?.id
        });
        return cb(error);
      }

      // Check file size (if available in file object)
      if (file.size && file.size > maxSize) {
        const error = new FileSizeError(`File size exceeds limit of ${Math.round(maxSize / 1024 / 1024)}MB`);
        logger.warn(`File upload rejected - size exceeded: ${file.size} bytes`, {
          filename: file.originalname,
          size: file.size,
          maxSize,
          ip: req.ip,
          userId: (req as any).user?.id
        });
        return cb(error);
      }

      logger.info(`File upload accepted: ${file.originalname}`, {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        ip: req.ip,
        userId: (req as any).user?.id
      });

      cb(null, true);
    } catch (error) {
      logger.error('File filter error:', error);
      cb(new FileUploadError('File validation failed'));
    }
  };
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    try {
      let uploadPath = 'uploads/temp';

      // Determine upload path based on file type and request context
      if (allowedImageTypes.includes(file.mimetype)) {
        if (req.baseUrl.includes('/properties')) {
          uploadPath = 'uploads/properties/images';
        } else if (req.baseUrl.includes('/users')) {
          uploadPath = 'uploads/users/avatars';
        }
      } else if (allowedDocumentTypes.includes(file.mimetype)) {
        uploadPath = 'uploads/properties/documents';
      }

      // Ensure directory exists
      const fullPath = path.join(process.cwd(), uploadPath);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }

      cb(null, uploadPath);
    } catch (error) {
      logger.error('Storage destination error:', error);
      cb(new FileUploadError('Failed to set upload destination'), '');
    }
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    try {
      // Generate unique filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${name}_${uniqueSuffix}${ext}`;

      logger.info(`Generated filename: ${filename}`, {
        originalName: file.originalname,
        generatedName: filename,
        ip: req.ip,
        userId: (req as any).user?.id
      });

      cb(null, filename);
    } catch (error) {
      logger.error('Filename generation error:', error);
      cb(new FileUploadError('Failed to generate filename'), '');
    }
  }
});

// Memory storage for temporary files
const memoryStorage = multer.memoryStorage();

// Upload configurations
export const propertyImageUpload = multer({
  storage,
  fileFilter: fileFilter(allowedImageTypes, 5 * 1024 * 1024), // 5MB limit
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 10 // Maximum 10 files
  }
});

export const userAvatarUpload = multer({
  storage,
  fileFilter: fileFilter(allowedImageTypes, 2 * 1024 * 1024), // 2MB limit
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 1 // Only one file
  }
});

export const documentUpload = multer({
  storage,
  fileFilter: fileFilter(allowedDocumentTypes, 10 * 1024 * 1024), // 10MB limit
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // Maximum 5 files
  }
});

export const tempUpload = multer({
  storage: memoryStorage,
  fileFilter: fileFilter([...allowedImageTypes, ...allowedDocumentTypes], 5 * 1024 * 1024), // 5MB limit
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1 // Only one file
  }
});

// Error handling middleware for multer
export const handleUploadError = (error: any, req: Request, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    let message = 'File upload failed';
    let code = 'FILE_UPLOAD_ERROR';
    let statusCode = 400;

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File size exceeds limit';
        code = 'FILE_SIZE_ERROR';
        statusCode = 413;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded';
        code = 'FILE_COUNT_ERROR';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        code = 'UNEXPECTED_FILE_ERROR';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Too many parts in multipart request';
        code = 'PART_COUNT_ERROR';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Field name too long';
        code = 'FIELD_KEY_ERROR';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Field value too long';
        code = 'FIELD_VALUE_ERROR';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields';
        code = 'FIELD_COUNT_ERROR';
        break;
    }

    logger.error(`Multer error: ${error.code}`, {
      error: error.message,
      code: error.code,
      field: error.field,
      ip: req.ip,
      userId: (req as any).user?.id
    });

    return res.status(statusCode).json({
      success: false,
      message,
      code,
      errors: [{
        field: error.field || 'file',
        message: error.message,
        code: error.code
      }]
    });
  }

  if (error instanceof FileUploadError || error instanceof FileSizeError || error instanceof FileTypeError) {
    logger.error('File upload validation error:', {
      message: error.message,
      code: error.code,
      ip: req.ip,
      userId: (req as any).user?.id
    });

    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
      errors: error.errors
    });
  }

  next(error);
};

// Utility functions
export const deleteFile = (filePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(process.cwd(), filePath);
    
    fs.unlink(fullPath, (error) => {
      if (error) {
        if (error.code === 'ENOENT') {
          // File doesn't exist, consider it deleted
          logger.warn(`File not found for deletion: ${filePath}`);
          resolve();
        } else {
          logger.error(`Failed to delete file: ${filePath}`, error);
          reject(error);
        }
      } else {
        logger.info(`File deleted successfully: ${filePath}`);
        resolve();
      }
    });
  });
};

export const moveFile = (sourcePath: string, destinationPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const fullSourcePath = path.join(process.cwd(), sourcePath);
    const fullDestinationPath = path.join(process.cwd(), destinationPath);

    // Ensure destination directory exists
    const destDir = path.dirname(fullDestinationPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.rename(fullSourcePath, fullDestinationPath, (error) => {
      if (error) {
        logger.error(`Failed to move file from ${sourcePath} to ${destinationPath}`, error);
        reject(error);
      } else {
        logger.info(`File moved successfully from ${sourcePath} to ${destinationPath}`);
        resolve();
      }
    });
  });
};

export const getFileInfo = (filePath: string): Promise<fs.Stats | null> => {
  return new Promise((resolve) => {
    const fullPath = path.join(process.cwd(), filePath);
    
    fs.stat(fullPath, (error, stats) => {
      if (error) {
        if (error.code === 'ENOENT') {
          resolve(null);
        } else {
          logger.error(`Failed to get file info: ${filePath}`, error);
          resolve(null);
        }
      } else {
        resolve(stats);
      }
    });
  });
};

// Cleanup temporary files older than 24 hours
export const cleanupTempFiles = async (): Promise<void> => {
  try {
    const tempDir = path.join(process.cwd(), 'uploads/temp');
    
    if (!fs.existsSync(tempDir)) {
      return;
    }

    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        logger.info(`Cleaned up temporary file: ${file}`);
      }
    }
  } catch (error) {
    logger.error('Failed to cleanup temporary files:', error);
  }
};

export default {
  propertyImageUpload,
  userAvatarUpload,
  documentUpload,
  tempUpload,
  handleUploadError,
  deleteFile,
  moveFile,
  getFileInfo,
  cleanupTempFiles
};

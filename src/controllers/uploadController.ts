import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { 
  propertyImageUpload, 
  userAvatarUpload, 
  documentUpload, 
  handleUploadError,
  deleteFile as deleteFileUtil,
  moveFile as moveFileUtil,
  getFileInfo as getFileInfoUtil
} from '../middleware/upload';
import { 
  asyncHandler,
  createError
} from '../utils/errors';
import { auditLoggers } from '../middleware/audit';
import { logger } from '../config/logger';

// Upload property images
export const uploadPropertyImages = [
  propertyImageUpload.array('images', 10),
  handleUploadError,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const files = req.files as Express.Multer.File[];
    const propertyId = req.params.propertyId || req.body.propertyId;

    if (!files || files.length === 0) {
      throw createError.fileUpload('No files uploaded');
    }

    if (!propertyId) {
      throw createError.validation('Property ID is required');
    }

    const uploadedFiles = files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      url: `/uploads/properties/images/${file.filename}`
    }));

    // Log audit event
    await auditLoggers.fileUploaded(req, files[0].filename, files[0].mimetype, files[0].size);

    logger.info(`Uploaded ${files.length} property images`, {
      propertyId,
      files: uploadedFiles.map(f => f.filename),
      userId: (req as any).user?.id
    });

    res.status(201).json({
      success: true,
      message: `${files.length} images uploaded successfully`,
      data: {
        files: uploadedFiles,
        propertyId
      }
    });
  })
];

// Upload user avatar (admin/supervisor uploading for another user)
export const uploadUserAvatar = [
  userAvatarUpload.single('avatar'),
  handleUploadError,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const file = req.file;
    const userId = req.params.userId;

    if (!file) {
      throw createError.fileUpload('No file uploaded');
    }

    if (!userId) {
      throw createError.validation('User ID is required');
    }

    const uploadedFile = {
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      url: `/uploads/users/avatars/${file.filename}`
    };

    // Log audit event
    await auditLoggers.fileUploaded(req, file.filename, file.mimetype, file.size);

    logger.info(`Admin uploaded user avatar`, {
      userId,
      filename: file.filename,
      uploaderId: (req as any).user?.id
    });

    res.status(201).json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        file: uploadedFile,
        userId
      }
    });
  })
];

// Upload own avatar (authenticated user uploading their own avatar)
export const uploadOwnAvatar = [
  userAvatarUpload.single('avatar'),
  handleUploadError,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const file = req.file;
    const userId = (req as any).user?._id || (req as any).user?.id;

    if (!file) {
      throw createError.fileUpload('No file uploaded');
    }

    if (!userId) {
      throw createError.authentication('User not authenticated');
    }

    const uploadedFile = {
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      url: `/uploads/users/avatars/${file.filename}`
    };

    // Log audit event
    await auditLoggers.fileUploaded(req, file.filename, file.mimetype, file.size);

    logger.info(`User uploaded own avatar`, {
      userId: userId.toString(),
      filename: file.filename
    });

    res.status(201).json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        file: uploadedFile,
        userId: userId.toString()
      }
    });
  })
];

// Upload documents
export const uploadDocuments = [
  documentUpload.array('documents', 5),
  handleUploadError,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const files = req.files as Express.Multer.File[];
    const propertyId = req.params.propertyId || req.body.propertyId;

    if (!files || files.length === 0) {
      throw createError.fileUpload('No files uploaded');
    }

    if (!propertyId) {
      throw createError.validation('Property ID is required');
    }

    const uploadedFiles = files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      url: `/uploads/properties/documents/${file.filename}`
    }));

    // Log audit event
    await auditLoggers.fileUploaded(req, files[0].filename, files[0].mimetype, files[0].size);

    logger.info(`Uploaded ${files.length} documents`, {
      propertyId,
      files: uploadedFiles.map(f => f.filename),
      userId: (req as any).user?.id
    });

    res.status(201).json({
      success: true,
      message: `${files.length} documents uploaded successfully`,
      data: {
        files: uploadedFiles,
        propertyId
      }
    });
  })
];

// Delete file
export const deleteFile = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { filePath } = req.params;
  const userId = (req as any).user?.id;

  if (!filePath) {
    throw createError.validation('File path is required');
  }

  // Check if file exists
  const fileInfo = await getFileInfoUtil(filePath);
  if (!fileInfo) {
    throw createError.notFound('File not found');
  }

  // Delete the file
  await deleteFileUtil(filePath);

  // Log audit event
  await auditLoggers.fileDeleted(req, path.basename(filePath));

  logger.info(`File deleted`, {
    filePath,
    userId
  });

  res.status(200).json({
    success: true,
    message: 'File deleted successfully',
    data: {
      filePath
    }
  });
});

// Get file information
export const getFileInfo = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { filePath } = req.params;

  if (!filePath) {
    throw createError.validation('File path is required');
  }

  const fileInfo = await getFileInfoUtil(filePath);
  if (!fileInfo) {
    throw createError.notFound('File not found');
  }

  res.status(200).json({
    success: true,
    message: 'File information retrieved successfully',
    data: {
      filePath,
      size: fileInfo.size,
      created: fileInfo.birthtime,
      modified: fileInfo.mtime,
      accessed: fileInfo.atime,
      isFile: fileInfo.isFile(),
      isDirectory: fileInfo.isDirectory()
    }
  });
});

// List files in directory
export const listFiles = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { directory } = req.params;
  const { type, limit = 50, offset = 0 } = req.query;

  if (!directory) {
    throw createError.validation('Directory path is required');
  }

  const fullPath = path.join(process.cwd(), directory);
  
  // Check if directory exists
  if (!fs.existsSync(fullPath)) {
    throw createError.notFound('Directory not found');
  }

  if (!fs.statSync(fullPath).isDirectory()) {
    throw createError.validation('Path is not a directory');
  }

  let files = fs.readdirSync(fullPath).map(filename => {
    const filePath = path.join(fullPath, filename);
    const stats = fs.statSync(filePath);
    
    return {
      filename,
      path: path.join(directory, filename),
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      url: `/uploads/${path.join(directory, filename)}`
    };
  });

  // Filter by type if specified
  if (type === 'images') {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    files = files.filter(file => 
      imageExtensions.includes(path.extname(file.filename).toLowerCase())
    );
  } else if (type === 'documents') {
    const docExtensions = ['.pdf', '.doc', '.docx', '.txt'];
    files = files.filter(file => 
      docExtensions.includes(path.extname(file.filename).toLowerCase())
    );
  }

  // Apply pagination
  const total = files.length;
  const paginatedFiles = files.slice(Number(offset), Number(offset) + Number(limit));

  res.status(200).json({
    success: true,
    message: 'Files listed successfully',
    data: {
      files: paginatedFiles,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + Number(limit) < total
      }
    }
  });
});

// Move file
export const moveFile = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { sourcePath, destinationPath } = req.body;
  const userId = (req as any).user?.id;

  if (!sourcePath || !destinationPath) {
    throw createError.validation('Source path and destination path are required');
  }

  // Check if source file exists
  const sourceInfo = await getFileInfoUtil(sourcePath);
  if (!sourceInfo) {
    throw createError.notFound('Source file not found');
  }

  // Move the file
  await moveFileUtil(sourcePath, destinationPath);

  logger.info(`File moved`, {
    sourcePath,
    destinationPath,
    userId
  });

  res.status(200).json({
    success: true,
    message: 'File moved successfully',
    data: {
      sourcePath,
      destinationPath
    }
  });
});

// Get upload statistics
export const getUploadStats = asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const uploadDirs = [
    'uploads/properties/images',
    'uploads/properties/documents',
    'uploads/users/avatars',
    'uploads/temp'
  ];

  const stats = await Promise.all(
    uploadDirs.map(async (dir) => {
      const fullPath = path.join(process.cwd(), dir);
      
      if (!fs.existsSync(fullPath)) {
        return {
          directory: dir,
          fileCount: 0,
          totalSize: 0,
          exists: false
        };
      }

      const files = fs.readdirSync(fullPath);
      let totalSize = 0;
      let fileCount = 0;

      for (const file of files) {
        const filePath = path.join(fullPath, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
          totalSize += stats.size;
          fileCount++;
        }
      }

      return {
        directory: dir,
        fileCount,
        totalSize,
        exists: true
      };
    })
  );

  const totalFiles = stats.reduce((sum, stat) => sum + stat.fileCount, 0);
  const totalSize = stats.reduce((sum, stat) => sum + stat.totalSize, 0);

  res.status(200).json({
    success: true,
    message: 'Upload statistics retrieved successfully',
    data: {
      directories: stats,
      summary: {
        totalFiles,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize)
      }
    }
  });
});

// Helper function to format bytes
function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default {
  uploadPropertyImages,
  uploadUserAvatar,
  uploadOwnAvatar,
  uploadDocuments,
  deleteFile,
  getFileInfo,
  listFiles,
  moveFile,
  getUploadStats
};

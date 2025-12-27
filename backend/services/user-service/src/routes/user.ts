import { Router, Response } from 'express';
import { UserService } from '../services/user';
import { validateRequest, schemas } from '../middleware/validation';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/users/profile
 * Get current user profile
 * Requirements: 1.5 - User profile CRUD operations
 */
router.get('/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const profile = await UserService.getUserProfile(req.user!.userId);
    
    if (!profile) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User profile not found',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    res.json({
      success: true,
      data: { profile },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Get profile failed', { error: (error as Error).message, userId: req.user?.userId });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_PROFILE_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * PUT /api/users/profile
 * Update user profile
 * Requirements: 1.5 - User profile CRUD operations
 */
router.put('/profile', authenticateToken, validateRequest({ body: schemas.updateProfile }), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updatedProfile = await UserService.updateUserProfile(req.user!.userId, req.body);

    res.json({
      success: true,
      data: { profile: updatedProfile },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Update profile failed', { error: (error as Error).message, userId: req.user?.userId });
    
    res.status(400).json({
      success: false,
      error: {
        code: 'UPDATE_PROFILE_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/users/change-password
 * Change user password
 * Requirements: 1.5 - User profile CRUD operations
 */
router.post('/change-password', authenticateToken, validateRequest({ body: schemas.changePassword }), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await UserService.changePassword(req.user!.userId, req.body);

    res.json({
      success: true,
      data: { message: 'Password changed successfully. Please log in again.' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Change password failed', { error: (error as Error).message, userId: req.user?.userId });
    
    res.status(400).json({
      success: false,
      error: {
        code: 'CHANGE_PASSWORD_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/users/settings
 * Get all user settings
 * Requirements: 1.5 - User preferences and trading settings
 */
router.get('/settings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = await UserService.getUserSettings(req.user!.userId);

    res.json({
      success: true,
      data: { settings },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Get settings failed', { error: (error as Error).message, userId: req.user?.userId });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_SETTINGS_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/users/settings/:key
 * Get specific user setting
 * Requirements: 1.5 - User preferences and trading settings
 */
router.get('/settings/:key', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const setting = await UserService.getUserSetting(req.user!.userId, req.params['key']!);
    
    if (!setting) {
      res.status(404).json({
        success: false,
        error: {
          code: 'SETTING_NOT_FOUND',
          message: 'Setting not found',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    res.json({
      success: true,
      data: { setting },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Get setting failed', { error: (error as Error).message, userId: req.user?.userId, key: req.params['key'] });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_SETTING_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * PUT /api/users/settings/:key
 * Set user setting
 * Requirements: 1.5 - User preferences and trading settings
 */
router.put('/settings/:key', authenticateToken, validateRequest({ body: schemas.userSettings }), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const setting = await UserService.setUserSetting(
      req.user!.userId, 
      req.params['key']!, 
      req.body.settingValue
    );

    res.json({
      success: true,
      data: { setting },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Set setting failed', { error: (error as Error).message, userId: req.user?.userId, key: req.params['key'] });
    
    res.status(400).json({
      success: false,
      error: {
        code: 'SET_SETTING_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * DELETE /api/users/settings/:key
 * Delete user setting
 * Requirements: 1.5 - User preferences and trading settings
 */
router.delete('/settings/:key', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const deleted = await UserService.deleteUserSetting(req.user!.userId, req.params['key']!);
    
    if (!deleted) {
      res.status(404).json({
        success: false,
        error: {
          code: 'SETTING_NOT_FOUND',
          message: 'Setting not found',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    res.json({
      success: true,
      data: { message: 'Setting deleted successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Delete setting failed', { error: (error as Error).message, userId: req.user?.userId, key: req.params['key'] });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_SETTING_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/users/deactivate
 * Deactivate user account
 * Requirements: 1.5 - User role and permission system
 */
router.post('/deactivate', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await UserService.deactivateUser(req.user!.userId);

    res.json({
      success: true,
      data: { message: 'Account deactivated successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Deactivate user failed', { error: (error as Error).message, userId: req.user?.userId });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'DEACTIVATE_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/users/stats
 * Get user statistics
 */
router.get('/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await UserService.getUserStats(req.user!.userId);

    res.json({
      success: true,
      data: { stats },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Get user stats failed', { error: (error as Error).message, userId: req.user?.userId });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_STATS_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

export { router as userRoutes };
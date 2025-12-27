import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth';
import { validateRequest, schemas } from '../middleware/validation';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user
 * Requirements: 1.1 - User registration with email validation
 */
router.post('/register', validateRequest({ body: schemas.register }), async (req: Request, res: Response) => {
  try {
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      acceptLanguage: req.get('Accept-Language')
    };

    const result = await AuthService.register(req.body, deviceInfo, req.ip);

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Registration failed', { error: (error as Error).message, email: req.body.email });
    
    res.status(400).json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user login
 * Requirements: 1.2 - User authentication with JWT token generation
 */
router.post('/login', validateRequest({ body: schemas.login }), async (req: Request, res: Response) => {
  try {
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      acceptLanguage: req.get('Accept-Language')
    };

    const result = await AuthService.login(req.body, deviceInfo, req.ip);

    res.json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Login failed', { error: (error as Error).message, email: req.body.email });
    
    res.status(401).json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 * Requirements: 1.3 - JWT refresh token rotation
 */
router.post('/refresh', validateRequest({ body: schemas.refreshToken }), async (req: Request, res: Response) => {
  try {
    const tokens = await AuthService.refreshToken(req.body.refreshToken);

    res.json({
      success: true,
      data: { tokens },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Token refresh failed', { error: (error as Error).message });
    
    res.status(401).json({
      success: false,
      error: {
        code: 'REFRESH_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user and revoke session
 * Requirements: 1.4 - Session invalidation and cleanup
 */
router.post('/logout', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await AuthService.logout(req.user!.userId, req.user!.sessionId);

    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Logout failed', { error: (error as Error).message, userId: req.user?.userId });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * POST /api/auth/logout-all
 * Logout from all devices
 * Requirements: 1.4 - Session invalidation and cleanup
 */
router.post('/logout-all', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await AuthService.logout(req.user!.userId); // No sessionId = logout all

    res.json({
      success: true,
      data: { message: 'Logged out from all devices successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Logout all failed', { error: (error as Error).message, userId: req.user?.userId });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_ALL_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/auth/sessions
 * Get user sessions
 * Requirements: 1.4 - Multi-device session tracking
 */
router.get('/sessions', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessions = await AuthService.getUserSessions(req.user!.userId);

    res.json({
      success: true,
      data: { sessions },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Get sessions failed', { error: (error as Error).message, userId: req.user?.userId });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_SESSIONS_FAILED',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/auth/verify
 * Verify token validity
 */
router.get('/verify', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      userId: req.user!.userId,
      valid: true
    },
    timestamp: new Date().toISOString()
  });
});

export { router as authRoutes };
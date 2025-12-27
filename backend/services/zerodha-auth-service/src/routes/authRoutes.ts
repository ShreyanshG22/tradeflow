import { Router, Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { RedisService } from '../services/redisService';
import { createLogger } from '@tradeflow/zerodha-utils';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('AuthRoutes');

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    zerodhaUserId: string;
  };
}

export function createAuthRoutes(
  authService: AuthService,
  redisService: RedisService
): Router {
  const router = Router();

  /**
   * Generate Zerodha login URL
   * GET /api/zerodha/auth/login
   */
  router.get('/login', async (req: Request, res: Response) => {
    try {
      const { userId } = req.query;
      
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'User ID is required',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Generate state parameter for CSRF protection
      const state = uuidv4();
      
      // Store state in Redis for validation (5 minutes TTL)
      await redisService.setTemporary(`oauth_state:${state}`, userId, 300);

      // Generate login URL
      const loginUrl = authService.generateLoginUrl(state);

      logger.info('Login URL generated', { userId, state });

      res.json({
        success: true,
        data: {
          login_url: loginUrl,
          state: state
        }
      });
    } catch (error) {
      logger.error('Failed to generate login URL', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate login URL',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  /**
   * Handle Zerodha OAuth callback
   * GET /api/zerodha/auth/callback
   */
  router.get('/callback', async (req: Request, res: Response) => {
    try {
      const { request_token, action, status, state } = req.query;

      // Validate required parameters
      if (!request_token || typeof request_token !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request token is required',
            timestamp: new Date().toISOString()
          }
        });
      }

      if (!state || typeof state !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'State parameter is required',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Validate state parameter (CSRF protection)
      const userId = await redisService.getTemporary(`oauth_state:${state}`);
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Invalid or expired state parameter',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Check if user denied access
      if (status === 'error' || action === 'deny') {
        logger.info('User denied Zerodha access', { userId, state });
        
        return res.status(400).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'User denied access to Zerodha account',
            timestamp: new Date().toISOString()
          }
        });
      }

      logger.info('Processing OAuth callback', { 
        userId, 
        requestToken: request_token.substring(0, 8) + '...',
        state 
      });

      // Exchange request token for access token
      const authResponse = await authService.exchangeRequestToken(request_token);

      // Get user profile
      const userProfile = await authService.getUserProfile(authResponse.access_token);

      // Store user session
      const session = await authService.storeUserSession(
        userId,
        authResponse.user_id,
        authResponse
      );

      // Create JWT token
      const jwtToken = authService.createJWTToken(userId, authResponse.user_id);

      logger.info('OAuth callback processed successfully', { 
        userId, 
        zerodhaUserId: authResponse.user_id,
        userName: authResponse.user_name 
      });

      res.json({
        success: true,
        data: {
          access_token: jwtToken,
          user: {
            id: userId,
            zerodha_user_id: authResponse.user_id,
            user_name: authResponse.user_name,
            user_shortname: authResponse.user_shortname,
            email: authResponse.email,
            avatar_url: authResponse.avatar_url,
            user_type: authResponse.user_type,
            broker: authResponse.broker,
            exchanges: authResponse.exchanges,
            products: authResponse.products,
            order_types: authResponse.order_types
          },
          session: {
            login_time: session.login_time,
            expires_at: session.expires_at
          }
        }
      });
    } catch (error) {
      logger.error('OAuth callback failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        requestToken: req.query.request_token ? 
          String(req.query.request_token).substring(0, 8) + '...' : 'none'
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: error instanceof Error ? error.message : 'Authentication failed',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  /**
   * Get user profile
   * GET /api/zerodha/auth/profile
   */
  router.get('/profile', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const { userId, zerodhaUserId } = req.user;

      // Get user session
      const session = await authService.getUserSession(userId);
      if (!session) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Session expired, please login again',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Get fresh user profile
      const userProfile = await authService.getUserProfile(session.access_token);

      logger.info('User profile retrieved', { userId, zerodhaUserId });

      res.json({
        success: true,
        data: {
          user: userProfile,
          session: {
            login_time: session.login_time,
            expires_at: session.expires_at
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get user profile', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.userId
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'PROFILE_FETCH_FAILED',
          message: 'Failed to fetch user profile',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  /**
   * Refresh access token
   * POST /api/zerodha/auth/refresh
   */
  router.post('/refresh', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const { userId } = req.user;

      // Get current session
      const session = await authService.getUserSession(userId);
      if (!session || !session.refresh_token) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'REFRESH_NOT_AVAILABLE',
            message: 'Token refresh not available, please login again',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Attempt to refresh token
      const refreshedAuth = await authService.refreshAccessToken(session.refresh_token);
      
      if (!refreshedAuth) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'REFRESH_FAILED',
            message: 'Token refresh not supported by Zerodha API',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Store new session
      const newSession = await authService.storeUserSession(
        userId,
        refreshedAuth.user_id,
        refreshedAuth
      );

      // Create new JWT token
      const jwtToken = authService.createJWTToken(userId, refreshedAuth.user_id);

      logger.info('Token refreshed successfully', { userId });

      res.json({
        success: true,
        data: {
          access_token: jwtToken,
          session: {
            login_time: newSession.login_time,
            expires_at: newSession.expires_at
          }
        }
      });
    } catch (error) {
      logger.error('Token refresh failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.userId
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'REFRESH_FAILED',
          message: 'Failed to refresh token',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  /**
   * Logout user
   * DELETE /api/zerodha/auth/logout
   */
  router.delete('/logout', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const { userId } = req.user;

      // Clear user session
      await authService.clearUserSession(userId);

      logger.info('User logged out successfully', { userId });

      res.json({
        success: true,
        data: {
          message: 'Logged out successfully'
        }
      });
    } catch (error) {
      logger.error('Logout failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.userId
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'LOGOUT_FAILED',
          message: 'Failed to logout',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  /**
   * Validate token
   * GET /api/zerodha/auth/validate
   */
  router.get('/validate', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const { userId, zerodhaUserId } = req.user;

      // Get user session
      const session = await authService.getUserSession(userId);
      if (!session) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Session expired',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Validate token with Zerodha
      const isValid = await authService.validateAccessToken(session.access_token);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_INVALID',
            message: 'Token is invalid',
            timestamp: new Date().toISOString()
          }
        });
      }

      res.json({
        success: true,
        data: {
          valid: true,
          user_id: userId,
          zerodha_user_id: zerodhaUserId,
          expires_at: session.expires_at
        }
      });
    } catch (error) {
      logger.error('Token validation failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.userId
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Failed to validate token',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  return router;
}
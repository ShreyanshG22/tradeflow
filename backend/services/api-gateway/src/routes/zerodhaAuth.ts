import { Router } from 'express';
import { validate } from '../middleware/validation';
import { ServiceProxy } from '../services/serviceProxy';
import { authMiddleware } from '../middleware/auth';
import { zerodhaGeneralRateLimit, zerodhaDailyRateLimit } from '../middleware/zerodhaRateLimit';
import Joi from 'joi';

const router = Router();
const zerodhaAuthServiceProxy = new ServiceProxy('zerodhaAuthService');

// Apply rate limiting to auth routes
router.use(zerodhaDailyRateLimit);
router.use(zerodhaGeneralRateLimit);

// Validation schemas
const loginSchema = {
  body: Joi.object({
    api_key: Joi.string().required(),
    redirect_url: Joi.string().uri().required()
  })
};

const callbackSchema = {
  body: Joi.object({
    request_token: Joi.string().required(),
    api_key: Joi.string().required(),
    api_secret: Joi.string().required()
  })
};

const refreshSchema = {
  body: Joi.object({
    refresh_token: Joi.string().required()
  })
};

// POST /api/zerodha/auth/login - Generate Zerodha login URL
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const response = await zerodhaAuthServiceProxy.post('/auth/login', req.body);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/auth/callback - Handle Zerodha OAuth callback
router.get('/callback', async (req, res, next) => {
  try {
    const response = await zerodhaAuthServiceProxy.get(`/auth/callback?${new URLSearchParams(req.query as any).toString()}`);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/zerodha/auth/callback - Process callback with request token
router.post('/callback', validate(callbackSchema), async (req, res, next) => {
  try {
    const response = await zerodhaAuthServiceProxy.post('/auth/callback', req.body);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/zerodha/auth/refresh - Refresh access token
router.post('/refresh', authMiddleware, validate(refreshSchema), async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaAuthServiceProxy.post('/auth/refresh', req.body, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// GET /api/zerodha/auth/profile - Get user profile
router.get('/profile', authMiddleware, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaAuthServiceProxy.get('/auth/profile', {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/zerodha/auth/logout - Logout and revoke tokens
router.delete('/logout', authMiddleware, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await zerodhaAuthServiceProxy.delete('/auth/logout', {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

export { router as zerodhaAuthRoutes };
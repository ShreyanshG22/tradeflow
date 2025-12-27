import { Router } from 'express';
import { validate } from '../middleware/validation';
import { ServiceProxy } from '../services/serviceProxy';
import Joi from 'joi';

const router = Router();
const userServiceProxy = new ServiceProxy('userService');

// Validation schemas
const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
  })
};

const registerSchema = {
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required()
      .messages({
        'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
      }),
    firstName: Joi.string().min(1).max(50).required(),
    lastName: Joi.string().min(1).max(50).required()
  })
};

const refreshTokenSchema = {
  body: Joi.object({
    refreshToken: Joi.string().required()
  })
};

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const response = await userServiceProxy.post('/auth/login', req.body);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const response = await userServiceProxy.post('/auth/register', req.body);
    res.status(201).json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/refresh
router.post('/refresh', validate(refreshTokenSchema), async (req, res, next) => {
  try {
    const response = await userServiceProxy.post('/auth/refresh', req.body);
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await userServiceProxy.post('/auth/logout', {}, {
      headers: { Authorization: authHeader }
    });
    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', 
  validate({
    body: Joi.object({
      email: Joi.string().email().required()
    })
  }), 
  async (req, res, next) => {
    try {
      const response = await userServiceProxy.post('/auth/forgot-password', req.body);
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/reset-password
router.post('/reset-password',
  validate({
    body: Joi.object({
      token: Joi.string().required(),
      password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required()
    })
  }),
  async (req, res, next) => {
    try {
      const response = await userServiceProxy.post('/auth/reset-password', req.body);
      res.json(response.data);
    } catch (error) {
      next(error);
    }
  }
);

export { router as authRoutes };
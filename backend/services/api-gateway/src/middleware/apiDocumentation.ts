import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface APIEndpoint {
  method: string;
  path: string;
  description: string;
  parameters?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[];
  responses?: {
    status: number;
    description: string;
    example?: any;
  }[];
  authentication: boolean;
  rateLimit?: string;
}

const zerodhaAPIDocumentation: APIEndpoint[] = [
  // Authentication endpoints
  {
    method: 'POST',
    path: '/api/zerodha/auth/login',
    description: 'Generate Zerodha login URL for OAuth flow',
    parameters: [
      { name: 'api_key', type: 'string', required: true, description: 'Zerodha API key' },
      { name: 'redirect_url', type: 'string', required: true, description: 'OAuth redirect URL' }
    ],
    responses: [
      { status: 200, description: 'Login URL generated successfully' },
      { status: 400, description: 'Invalid request parameters' }
    ],
    authentication: false,
    rateLimit: '10 requests per second'
  },
  {
    method: 'GET',
    path: '/api/zerodha/auth/callback',
    description: 'Handle Zerodha OAuth callback',
    parameters: [
      { name: 'request_token', type: 'string', required: true, description: 'OAuth request token' },
      { name: 'action', type: 'string', required: true, description: 'OAuth action' },
      { name: 'status', type: 'string', required: true, description: 'OAuth status' }
    ],
    responses: [
      { status: 200, description: 'Authentication successful' },
      { status: 401, description: 'Authentication failed' }
    ],
    authentication: false,
    rateLimit: '10 requests per second'
  },
  {
    method: 'GET',
    path: '/api/zerodha/auth/profile',
    description: 'Get authenticated user profile',
    responses: [
      { status: 200, description: 'User profile retrieved successfully' },
      { status: 401, description: 'Authentication required' }
    ],
    authentication: true,
    rateLimit: '10 requests per second'
  },

  // Market data endpoints
  {
    method: 'GET',
    path: '/api/zerodha/market/instruments',
    description: 'Get list of all tradeable instruments',
    parameters: [
      { name: 'exchange', type: 'string', required: false, description: 'Filter by exchange (NSE, BSE, etc.)' }
    ],
    responses: [
      { status: 200, description: 'Instruments list retrieved successfully' },
      { status: 401, description: 'Authentication required' }
    ],
    authentication: true,
    rateLimit: '3 requests per second'
  },
  {
    method: 'GET',
    path: '/api/zerodha/market/search',
    description: 'Search for instruments',
    parameters: [
      { name: 'q', type: 'string', required: true, description: 'Search query' },
      { name: 'exchange', type: 'string', required: false, description: 'Filter by exchange' }
    ],
    responses: [
      { status: 200, description: 'Search results retrieved successfully' },
      { status: 400, description: 'Invalid search query' }
    ],
    authentication: true,
    rateLimit: '3 requests per second'
  },
  {
    method: 'POST',
    path: '/api/zerodha/market/subscribe',
    description: 'Subscribe to real-time market data',
    parameters: [
      { name: 'instruments', type: 'array', required: true, description: 'Array of instrument tokens' },
      { name: 'mode', type: 'string', required: false, description: 'Subscription mode (ltp, quote, full)' }
    ],
    responses: [
      { status: 200, description: 'Subscription successful' },
      { status: 400, description: 'Invalid instruments' }
    ],
    authentication: true,
    rateLimit: '3 requests per second'
  },

  // Order management endpoints
  {
    method: 'POST',
    path: '/api/zerodha/orders',
    description: 'Place a new order',
    parameters: [
      { name: 'exchange', type: 'string', required: true, description: 'Exchange (NSE, BSE, etc.)' },
      { name: 'tradingsymbol', type: 'string', required: true, description: 'Trading symbol' },
      { name: 'transaction_type', type: 'string', required: true, description: 'BUY or SELL' },
      { name: 'quantity', type: 'number', required: true, description: 'Order quantity' },
      { name: 'product', type: 'string', required: true, description: 'Product type (CNC, MIS, NRML)' },
      { name: 'order_type', type: 'string', required: true, description: 'Order type (MARKET, LIMIT, etc.)' }
    ],
    responses: [
      { status: 201, description: 'Order placed successfully' },
      { status: 400, description: 'Invalid order parameters' },
      { status: 403, description: 'Risk limits exceeded' }
    ],
    authentication: true,
    rateLimit: '10 requests per second'
  },
  {
    method: 'GET',
    path: '/api/zerodha/orders',
    description: 'Get all orders',
    parameters: [
      { name: 'status', type: 'string', required: false, description: 'Filter by order status' },
      { name: 'from_date', type: 'string', required: false, description: 'Start date (ISO format)' },
      { name: 'to_date', type: 'string', required: false, description: 'End date (ISO format)' }
    ],
    responses: [
      { status: 200, description: 'Orders retrieved successfully' },
      { status: 401, description: 'Authentication required' }
    ],
    authentication: true,
    rateLimit: '10 requests per second'
  },

  // Portfolio endpoints
  {
    method: 'GET',
    path: '/api/zerodha/portfolio/positions',
    description: 'Get current trading positions',
    responses: [
      { status: 200, description: 'Positions retrieved successfully' },
      { status: 401, description: 'Authentication required' }
    ],
    authentication: true,
    rateLimit: '10 requests per second'
  },
  {
    method: 'GET',
    path: '/api/zerodha/portfolio/holdings',
    description: 'Get long-term holdings',
    responses: [
      { status: 200, description: 'Holdings retrieved successfully' },
      { status: 401, description: 'Authentication required' }
    ],
    authentication: true,
    rateLimit: '10 requests per second'
  },

  // Risk management endpoints
  {
    method: 'GET',
    path: '/api/zerodha/risk/limits',
    description: 'Get current risk limits',
    responses: [
      { status: 200, description: 'Risk limits retrieved successfully' },
      { status: 401, description: 'Authentication required' }
    ],
    authentication: true,
    rateLimit: '10 requests per second'
  },
  {
    method: 'POST',
    path: '/api/zerodha/risk/validate-order',
    description: 'Validate order against risk limits',
    parameters: [
      { name: 'exchange', type: 'string', required: true, description: 'Exchange' },
      { name: 'tradingsymbol', type: 'string', required: true, description: 'Trading symbol' },
      { name: 'transaction_type', type: 'string', required: true, description: 'BUY or SELL' },
      { name: 'quantity', type: 'number', required: true, description: 'Order quantity' }
    ],
    responses: [
      { status: 200, description: 'Order validation result' },
      { status: 400, description: 'Invalid order parameters' }
    ],
    authentication: true,
    rateLimit: '10 requests per second'
  }
];

export function generateAPIDocumentation(req: Request, res: Response): void {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  const documentation = {
    title: 'TradeFlow Zerodha Integration API',
    version: '1.0.0',
    description: 'REST API for Zerodha integration with TradeFlow platform',
    baseUrl,
    authentication: {
      type: 'Bearer Token',
      description: 'Include JWT token in Authorization header: Bearer <token>'
    },
    rateLimits: {
      general: '10 requests per second',
      marketData: '3 requests per second',
      daily: '1000 requests per day'
    },
    endpoints: zerodhaAPIDocumentation.map(endpoint => ({
      ...endpoint,
      fullPath: `${baseUrl}${endpoint.path}`
    })),
    websocket: {
      url: `${req.protocol === 'https' ? 'wss' : 'ws'}://${req.get('host')}/socket.io`,
      authentication: 'Include JWT token in auth object during connection',
      events: [
        {
          event: 'zerodha:subscribe:market-data',
          description: 'Subscribe to real-time market data',
          payload: { instruments: [256265], mode: 'quote' }
        },
        {
          event: 'zerodha:market-tick',
          description: 'Receive real-time market data updates',
          payload: { instrument_token: 256265, last_price: 1500.50, timestamp: '2023-12-01T10:30:00Z' }
        },
        {
          event: 'zerodha:subscribe:orders',
          description: 'Subscribe to order updates',
          payload: {}
        },
        {
          event: 'zerodha:order-update',
          description: 'Receive order status updates',
          payload: { order_id: 'ORD123', status: 'COMPLETE', filled_quantity: 100 }
        }
      ]
    },
    errorCodes: {
      'ZERODHA_MARKET_RATE_LIMIT_EXCEEDED': 'Market data rate limit exceeded (3 req/sec)',
      'ZERODHA_ORDER_RATE_LIMIT_EXCEEDED': 'Order rate limit exceeded (10 req/sec)',
      'ZERODHA_DAILY_RATE_LIMIT_EXCEEDED': 'Daily rate limit exceeded (1000 req/day)',
      'INVALID_INSTRUMENTS': 'Invalid instruments array provided',
      'TOO_MANY_INSTRUMENTS': 'Maximum 100 instruments allowed per subscription',
      'SUBSCRIPTION_FAILED': 'Failed to subscribe to market data service',
      'NO_SUBSCRIPTION': 'No active subscription found',
      'UNSUPPORTED_API_VERSION': 'Requested API version not supported',
      'IP_NOT_WHITELISTED': 'Access denied from this IP address'
    },
    examples: {
      placeOrder: {
        request: {
          exchange: 'NSE',
          tradingsymbol: 'RELIANCE',
          transaction_type: 'BUY',
          quantity: 10,
          product: 'CNC',
          order_type: 'MARKET'
        },
        response: {
          success: true,
          data: {
            order_id: 'ORD123456',
            status: 'OPEN',
            message: 'Order placed successfully'
          }
        }
      },
      marketDataSubscription: {
        websocketEvent: 'zerodha:subscribe:market-data',
        payload: {
          instruments: [256265, 408065],
          mode: 'quote'
        },
        response: {
          type: 'market-data',
          instruments: [256265, 408065],
          mode: 'quote',
          timestamp: '2023-12-01T10:30:00Z'
        }
      }
    }
  };

  res.json(documentation);
}

export function apiDocumentationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Add API documentation endpoint
  if (req.path === '/api/zerodha/docs' && req.method === 'GET') {
    return generateAPIDocumentation(req, res);
  }

  // Add API info headers to all responses
  res.setHeader('X-API-Documentation', `${req.protocol}://${req.get('host')}/api/zerodha/docs`);
  res.setHeader('X-API-Version', 'v1');
  res.setHeader('X-Rate-Limit-Info', 'See documentation for rate limits');

  next();
}
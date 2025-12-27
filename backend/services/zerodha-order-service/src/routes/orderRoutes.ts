import { Router, Request, Response } from 'express';
import { OrderPlacementService } from '../services/OrderPlacementService';
import { OrderModificationService } from '../services/OrderModificationService';
import { OrderHistoryService } from '../services/OrderHistoryService';
import { OrderStatusService } from '../services/OrderStatusService';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateOrderRequest } from '../middleware/validationMiddleware';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import { logger } from '../utils/logger';

const router = Router();

// Services
const placementService = new OrderPlacementService();
const modificationService = new OrderModificationService();
const historyService = new OrderHistoryService();
const statusService = new OrderStatusService();

/**
 * Place a new order
 * POST /api/zerodha/orders
 */
router.post('/', 
  authMiddleware,
  rateLimitMiddleware,
  validateOrderRequest,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const accessToken = req.user?.accessToken;
      const orderRequest = req.body;

      if (!userId || !accessToken) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const result = await placementService.placeOrder(userId, orderRequest, accessToken);

      if (result.success) {
        res.status(201).json({
          success: true,
          data: {
            orderId: result.orderId,
            order: result.order
          },
          warnings: result.warnings
        });
      } else {
        res.status(400).json({
          success: false,
          errors: result.errors,
          warnings: result.warnings
        });
      }

    } catch (error) {
      logger.error('Order placement route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Place multiple orders in batch
 * POST /api/zerodha/orders/batch
 */
router.post('/batch',
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const accessToken = req.user?.accessToken;
      const orders = req.body.orders;

      if (!userId || !accessToken) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Orders array is required'
        });
      }

      const results = await placementService.placeBatchOrders(userId, orders, accessToken);

      res.status(200).json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('Batch order placement route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Get order details
 * GET /api/zerodha/orders/:orderId
 */
router.get('/:orderId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const accessToken = req.user?.accessToken;
      const { orderId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const orderDetails = await historyService.getOrderDetails(userId, orderId, accessToken);

      if (!orderDetails) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      res.json({
        success: true,
        data: orderDetails
      });

    } catch (error) {
      logger.error('Get order details route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Modify an existing order
 * PUT /api/zerodha/orders/:orderId
 */
router.put('/:orderId',
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const accessToken = req.user?.accessToken;
      const { orderId } = req.params;
      const modifications = req.body;

      if (!userId || !accessToken) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const result = await modificationService.modifyOrder(
        userId,
        orderId,
        modifications,
        accessToken
      );

      if (result.success) {
        res.json({
          success: true,
          data: {
            orderId: result.orderId,
            order: result.order
          },
          warnings: result.warnings
        });
      } else {
        res.status(400).json({
          success: false,
          errors: result.errors,
          warnings: result.warnings
        });
      }

    } catch (error) {
      logger.error('Order modification route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Cancel an order
 * DELETE /api/zerodha/orders/:orderId
 */
router.delete('/:orderId',
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const accessToken = req.user?.accessToken;
      const { orderId } = req.params;
      const { reason } = req.body;

      if (!userId || !accessToken) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const result = await modificationService.cancelOrder(
        userId,
        orderId,
        accessToken,
        reason
      );

      if (result.success) {
        res.json({
          success: true,
          data: {
            orderId: result.orderId,
            message: result.message
          }
        });
      } else {
        res.status(400).json({
          success: false,
          errors: result.errors
        });
      }

    } catch (error) {
      logger.error('Order cancellation route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Cancel multiple orders
 * DELETE /api/zerodha/orders/batch
 */
router.delete('/batch',
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const accessToken = req.user?.accessToken;
      const { orderIds, reason } = req.body;

      if (!userId || !accessToken) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Order IDs array is required'
        });
      }

      const results = await modificationService.cancelBatchOrders(
        userId,
        orderIds,
        accessToken,
        reason
      );

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('Batch order cancellation route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Get order history
 * GET /api/zerodha/orders
 */
router.get('/',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const {
        symbol,
        exchange,
        status,
        fromDate,
        toDate,
        limit = '50',
        offset = '0'
      } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const query = {
        userId,
        symbol: symbol as string,
        exchange: exchange as string,
        status: status as string,
        fromDate: fromDate ? new Date(fromDate as string) : undefined,
        toDate: toDate ? new Date(toDate as string) : undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      };

      const result = await historyService.getOrderHistory(query);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Get order history route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Get order summary/statistics
 * GET /api/zerodha/orders/summary
 */
router.get('/summary/:timeframe?',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const { timeframe = 'today' } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const summary = await historyService.getOrderSummary(
        userId,
        timeframe as 'today' | 'week' | 'month' | 'year'
      );

      res.json({
        success: true,
        data: summary
      });

    } catch (error) {
      logger.error('Get order summary route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Sync order history from Zerodha
 * POST /api/zerodha/orders/sync
 */
router.post('/sync',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const accessToken = req.user?.accessToken;

      if (!userId || !accessToken) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const result = await historyService.syncOrderHistory(userId, accessToken);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Sync order history route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Export order history
 * GET /api/zerodha/orders/export
 */
router.get('/export/csv',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const {
        symbol,
        exchange,
        status,
        fromDate,
        toDate
      } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const query = {
        symbol: symbol as string,
        exchange: exchange as string,
        status: status as string,
        fromDate: fromDate ? new Date(fromDate as string) : undefined,
        toDate: toDate ? new Date(toDate as string) : undefined
      };

      const csvData = await historyService.exportOrderHistory(userId, query);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=order_history.csv');
      res.send(csvData);

    } catch (error) {
      logger.error('Export order history route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Get order analytics
 * GET /api/zerodha/orders/analytics/:timeframe?
 */
router.get('/analytics/:timeframe?',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const { timeframe = 'month' } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const analytics = await historyService.getOrderAnalytics(
        userId,
        timeframe as 'week' | 'month' | 'quarter' | 'year'
      );

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error('Get order analytics route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Get order status updates
 * GET /api/zerodha/orders/updates
 */
router.get('/updates',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const { since } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const sinceDate = since ? new Date(since as string) : undefined;
      const updates = await statusService.getOrderUpdates(userId, sinceDate);

      res.json({
        success: true,
        data: updates
      });

    } catch (error) {
      logger.error('Get order updates route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Get order placement statistics
 * GET /api/zerodha/orders/stats/:timeframe?
 */
router.get('/stats/:timeframe?',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const { timeframe = 'today' } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const stats = await placementService.getOrderStats(
        userId,
        timeframe as 'today' | 'week' | 'month'
      );

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Get order stats route error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

export { router as orderRoutes };
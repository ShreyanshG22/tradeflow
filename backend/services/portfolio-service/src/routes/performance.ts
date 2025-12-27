import { Router } from 'express';
import { performanceService } from '../services/performanceService';
import { validateRequest, schemas } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import Joi from 'joi';

const router = Router();

// Validation schemas for performance endpoints
const performanceCalculationSchema = Joi.object({
  startDate: Joi.date().required(),
  endDate: Joi.date().min(Joi.ref('startDate')).required(),
  benchmarkSymbol: Joi.string().max(20).optional()
});

const performanceReportSchema = Joi.object({
  startDate: Joi.date().required(),
  endDate: Joi.date().min(Joi.ref('startDate')).required(),
  benchmarkSymbol: Joi.string().max(20).optional(),
  includeMonthlyReturns: Joi.boolean().optional(),
  includeEquityCurve: Joi.boolean().optional()
});

// Calculate performance metrics for a portfolio
router.post('/portfolios/:portfolioId/metrics',
  validateRequest({ 
    params: schemas.portfolioId,
    body: performanceCalculationSchema
  }),
  asyncHandler(async (req: any, res: any) => {
    const metrics = await performanceService.calculatePerformanceMetrics({
      portfolioId: req.params.portfolioId,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
      benchmarkSymbol: req.body.benchmarkSymbol
    });

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  })
);

// Generate comprehensive performance report
router.post('/portfolios/:portfolioId/report',
  validateRequest({ 
    params: schemas.portfolioId,
    body: performanceReportSchema
  }),
  asyncHandler(async (req: any, res: any) => {
    const report = await performanceService.generatePerformanceReport({
      portfolioId: req.params.portfolioId,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
      benchmarkSymbol: req.body.benchmarkSymbol
    });

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString()
    });
  })
);

// Get latest performance metrics
router.get('/portfolios/:portfolioId/metrics/latest',
  validateRequest({ params: schemas.portfolioId }),
  asyncHandler(async (req: any, res: any) => {
    const metrics = await performanceService.getLatestPerformanceMetrics(req.params.portfolioId);
    
    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No performance metrics found for this portfolio',
          timestamp: new Date().toISOString()
        }
      });
    }

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
  })
);

// Get performance metrics history
router.get('/portfolios/:portfolioId/metrics/history',
  validateRequest({ 
    params: schemas.portfolioId,
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(100).optional()
    })
  }),
  asyncHandler(async (req: any, res: any) => {
    const limit = parseInt(req.query.limit) || 30;
    const history = await performanceService.getPerformanceHistory(req.params.portfolioId, limit);

    res.json({
      success: true,
      data: history,
      timestamp: new Date().toISOString()
    });
  })
);

// Compare multiple portfolios performance
router.post('/compare',
  validateRequest({ 
    body: Joi.object({
      portfolioIds: Joi.array().items(Joi.string().uuid()).min(2).max(10).required(),
      startDate: Joi.date().required(),
      endDate: Joi.date().min(Joi.ref('startDate')).required(),
      benchmarkSymbol: Joi.string().max(20).optional()
    })
  }),
  asyncHandler(async (req: any, res: any) => {
    const { portfolioIds, startDate, endDate, benchmarkSymbol } = req.body;
    
    // Calculate metrics for all portfolios in parallel
    const comparisons = await Promise.all(
      portfolioIds.map(async (portfolioId: string) => {
        try {
          const metrics = await performanceService.calculatePerformanceMetrics({
            portfolioId,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            benchmarkSymbol
          });
          return { portfolioId, metrics, error: null };
        } catch (error) {
          return { portfolioId, metrics: null, error: error.message };
        }
      })
    );

    res.json({
      success: true,
      data: {
        period: { startDate, endDate },
        benchmarkSymbol,
        comparisons
      },
      timestamp: new Date().toISOString()
    });
  })
);

// Get performance analytics dashboard data
router.get('/portfolios/:portfolioId/dashboard',
  validateRequest({ 
    params: schemas.portfolioId,
    query: Joi.object({
      period: Joi.string().valid('1d', '1w', '1m', '3m', '6m', '1y', 'ytd', 'all').optional()
    })
  }),
  asyncHandler(async (req: any, res: any) => {
    const period = req.query.period || '1m';
    const endDate = new Date();
    let startDate: Date;

    // Calculate start date based on period
    switch (period) {
      case '1d':
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '1w':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '1m':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, endDate.getDate());
        break;
      case '3m':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 3, endDate.getDate());
        break;
      case '6m':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 6, endDate.getDate());
        break;
      case '1y':
        startDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate());
        break;
      case 'ytd':
        startDate = new Date(endDate.getFullYear(), 0, 1);
        break;
      default:
        // For 'all', get the portfolio creation date
        startDate = new Date(endDate.getFullYear() - 5, endDate.getMonth(), endDate.getDate());
    }

    const [report, latestMetrics] = await Promise.all([
      performanceService.generatePerformanceReport({
        portfolioId: req.params.portfolioId,
        startDate,
        endDate
      }),
      performanceService.getLatestPerformanceMetrics(req.params.portfolioId)
    ]);

    const dashboardData = {
      period: {
        selected: period,
        startDate,
        endDate
      },
      summary: {
        totalReturn: report.returns.totalReturnPercent,
        annualizedReturn: report.returns.annualizedReturn,
        sharpeRatio: report.risk.sharpeRatio,
        maxDrawdown: report.risk.maxDrawdownPercent,
        winRate: report.trading.winRate * 100,
        totalTrades: report.trading.totalTrades
      },
      charts: {
        equityCurve: report.equityCurve,
        monthlyReturns: report.monthlyReturns
      },
      latestMetrics
    };

    res.json({
      success: true,
      data: dashboardData,
      timestamp: new Date().toISOString()
    });
  })
);

export { router as performanceRoutes };
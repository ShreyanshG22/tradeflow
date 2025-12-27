import { logger } from '../utils/logger';
import { createError } from '../middleware/errorHandler';
import { 
  StrategyConfig, 
  StrategyNode, 
  StrategyConnection 
} from '../types';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  connectionId?: string;
  details?: Record<string, any>;
}

export interface ValidationWarning {
  code: string;
  message: string;
  nodeId?: string;
  connectionId?: string;
  details?: Record<string, any>;
}

export interface SimulationRequest {
  strategyConfig: StrategyConfig;
  marketData: MarketDataPoint[];
  initialCapital: number;
  startDate: Date;
  endDate: Date;
}

export interface MarketDataPoint {
  timestamp: Date;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SimulationResult {
  trades: SimulatedTrade[];
  performance: PerformanceMetrics;
  equity: EquityPoint[];
  signals: SignalPoint[];
}

export interface SimulatedTrade {
  timestamp: Date;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  reason: string;
  nodeId: string;
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
}

export interface EquityPoint {
  timestamp: Date;
  value: number;
}

export interface SignalPoint {
  timestamp: Date;
  nodeId: string;
  signal: 'buy' | 'sell' | 'hold';
  value: number;
  metadata?: Record<string, any>;
}

export class StrategyValidationEngine {

  /**
   * Validate a complete strategy configuration
   */
  validateStrategy(config: StrategyConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Basic structure validation
      this.validateBasicStructure(config, errors);
      
      // Node validation
      this.validateNodes(config.nodes, errors, warnings);
      
      // Connection validation
      this.validateConnections(config.nodes, config.connections, errors, warnings);
      
      // Flow validation (entry -> exit paths)
      this.validateStrategyFlow(config.nodes, config.connections, errors, warnings);
      
      // Parameter validation
      this.validateParameters(config.parameters, errors, warnings);
      
      // Logic validation
      this.validateStrategyLogic(config, errors, warnings);

      logger.info('Strategy validation completed', {
        errors: errors.length,
        warnings: warnings.length,
        isValid: errors.length === 0
      });

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      logger.error('Strategy validation failed:', error);
      errors.push({
        code: 'VALIDATION_ENGINE_ERROR',
        message: 'Internal validation engine error',
        details: { error: error.message }
      });

      return {
        isValid: false,
        errors,
        warnings
      };
    }
  }

  /**
   * Parse React Flow configuration to internal format
   */
  parseReactFlowConfig(reactFlowData: any): StrategyConfig {
    try {
      if (!reactFlowData.nodes || !reactFlowData.edges) {
        throw createError('Invalid React Flow data structure', 400, 'INVALID_REACT_FLOW_DATA');
      }

      // Convert React Flow nodes to strategy nodes
      const nodes: StrategyNode[] = reactFlowData.nodes.map((node: any) => ({
        id: node.id,
        type: node.type,
        config: node.data || {},
        position: node.position || { x: 0, y: 0 }
      }));

      // Convert React Flow edges to strategy connections
      const connections: StrategyConnection[] = reactFlowData.edges.map((edge: any) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle
      }));

      // Extract parameters from special parameter nodes or use defaults
      const parameterNodes = nodes.filter((node: any) => node.type === 'parameters');
      const parameters = parameterNodes.length > 0 
        ? parameterNodes[0].config 
        : this.getDefaultParameters();

      return {
        nodes: nodes.filter((node: any) => node.type !== 'parameters'),
        connections,
        parameters
      };
    } catch (error) {
      logger.error('Failed to parse React Flow config:', error);
      throw createError('Failed to parse React Flow configuration', 400, 'REACT_FLOW_PARSE_ERROR');
    }
  }

  /**
   * Run dry-run simulation of strategy
   */
  async runDryRunSimulation(request: SimulationRequest): Promise<SimulationResult> {
    try {
      // Validate strategy first
      const validation = this.validateStrategy(request.strategyConfig);
      if (!validation.isValid) {
        throw createError(
          'Cannot simulate invalid strategy', 
          400, 
          'INVALID_STRATEGY_FOR_SIMULATION',
          { errors: validation.errors }
        );
      }

      logger.info('Starting dry-run simulation', {
        startDate: request.startDate,
        endDate: request.endDate,
        dataPoints: request.marketData.length,
        initialCapital: request.initialCapital
      });

      // Initialize simulation state
      const state = this.initializeSimulationState(request);
      
      // Process each market data point
      for (const dataPoint of request.marketData) {
        this.processMarketDataPoint(dataPoint, state, request.strategyConfig);
      }

      // Calculate final performance metrics
      const performance = this.calculatePerformanceMetrics(state);

      logger.info('Dry-run simulation completed', {
        totalTrades: state.trades.length,
        finalEquity: state.equity[state.equity.length - 1]?.value || request.initialCapital,
        totalReturn: performance.totalReturn
      });

      return {
        trades: state.trades,
        performance,
        equity: state.equity,
        signals: state.signals
      };
    } catch (error) {
      logger.error('Dry-run simulation failed:', error);
      throw createError('Simulation failed', 500, 'SIMULATION_ERROR', { error: error.message });
    }
  }

  /**
   * Validate basic strategy structure
   */
  private validateBasicStructure(config: StrategyConfig, errors: ValidationError[]): void {
    if (!config.nodes || !Array.isArray(config.nodes)) {
      errors.push({
        code: 'MISSING_NODES',
        message: 'Strategy must have a nodes array'
      });
    }

    if (!config.connections || !Array.isArray(config.connections)) {
      errors.push({
        code: 'MISSING_CONNECTIONS',
        message: 'Strategy must have a connections array'
      });
    }

    if (!config.parameters) {
      errors.push({
        code: 'MISSING_PARAMETERS',
        message: 'Strategy must have parameters'
      });
    }

    if (config.nodes && config.nodes.length === 0) {
      errors.push({
        code: 'EMPTY_STRATEGY',
        message: 'Strategy must have at least one node'
      });
    }
  }

  /**
   * Validate individual nodes
   */
  private validateNodes(nodes: StrategyNode[], errors: ValidationError[], warnings: ValidationWarning[]): void {
    const nodeIds = new Set<string>();
    let hasEntryNode = false;
    let hasExitNode = false;

    for (const node of nodes) {
      // Check for duplicate IDs
      if (nodeIds.has(node.id)) {
        errors.push({
          code: 'DUPLICATE_NODE_ID',
          message: `Duplicate node ID: ${node.id}`,
          nodeId: node.id
        });
      }
      nodeIds.add(node.id);

      // Validate node type
      if (!['entry', 'exit', 'indicator', 'operator', 'position-size'].includes(node.type)) {
        errors.push({
          code: 'INVALID_NODE_TYPE',
          message: `Invalid node type: ${node.type}`,
          nodeId: node.id
        });
      }

      // Track required node types
      if (node.type === 'entry') hasEntryNode = true;
      if (node.type === 'exit') hasExitNode = true;

      // Validate node configuration
      this.validateNodeConfig(node, errors, warnings);
    }

    // Check for required node types
    if (!hasEntryNode) {
      errors.push({
        code: 'MISSING_ENTRY_NODE',
        message: 'Strategy must have at least one entry node'
      });
    }

    if (!hasExitNode) {
      warnings.push({
        code: 'MISSING_EXIT_NODE',
        message: 'Strategy should have at least one exit node'
      });
    }
  }

  /**
   * Validate node configuration based on type
   */
  private validateNodeConfig(node: StrategyNode, errors: ValidationError[], warnings: ValidationWarning[]): void {
    switch (node.type) {
      case 'entry':
        this.validateEntryNode(node, errors, warnings);
        break;
      case 'exit':
        this.validateExitNode(node, errors, warnings);
        break;
      case 'indicator':
        this.validateIndicatorNode(node, errors, warnings);
        break;
      case 'operator':
        this.validateOperatorNode(node, errors, warnings);
        break;
      case 'position-size':
        this.validatePositionSizeNode(node, errors, warnings);
        break;
    }
  }

  /**
   * Validate entry node configuration
   */
  private validateEntryNode(node: StrategyNode, errors: ValidationError[], warnings: ValidationWarning[]): void {
    const config = node.config;

    if (!config.condition) {
      errors.push({
        code: 'MISSING_ENTRY_CONDITION',
        message: 'Entry node must have a condition',
        nodeId: node.id
      });
    }

    if (!config.side || !['buy', 'sell', 'both'].includes(config.side)) {
      errors.push({
        code: 'INVALID_ENTRY_SIDE',
        message: 'Entry node must specify valid side (buy, sell, or both)',
        nodeId: node.id
      });
    }
  }

  /**
   * Validate exit node configuration
   */
  private validateExitNode(node: StrategyNode, errors: ValidationError[], warnings: ValidationWarning[]): void {
    const config = node.config;

    if (!config.condition && !config.stopLoss && !config.takeProfit) {
      errors.push({
        code: 'MISSING_EXIT_CONDITION',
        message: 'Exit node must have at least one exit condition',
        nodeId: node.id
      });
    }

    if (config.stopLoss && (typeof config.stopLoss !== 'number' || config.stopLoss <= 0)) {
      errors.push({
        code: 'INVALID_STOP_LOSS',
        message: 'Stop loss must be a positive number',
        nodeId: node.id
      });
    }

    if (config.takeProfit && (typeof config.takeProfit !== 'number' || config.takeProfit <= 0)) {
      errors.push({
        code: 'INVALID_TAKE_PROFIT',
        message: 'Take profit must be a positive number',
        nodeId: node.id
      });
    }
  }

  /**
   * Validate indicator node configuration
   */
  private validateIndicatorNode(node: StrategyNode, errors: ValidationError[], warnings: ValidationWarning[]): void {
    const config = node.config;

    if (!config.indicator) {
      errors.push({
        code: 'MISSING_INDICATOR_TYPE',
        message: 'Indicator node must specify indicator type',
        nodeId: node.id
      });
    }

    const validIndicators = ['sma', 'ema', 'rsi', 'macd', 'bollinger', 'stochastic'];
    if (config.indicator && !validIndicators.includes(config.indicator)) {
      errors.push({
        code: 'INVALID_INDICATOR_TYPE',
        message: `Invalid indicator type: ${config.indicator}`,
        nodeId: node.id
      });
    }

    if (config.period && (typeof config.period !== 'number' || config.period <= 0)) {
      errors.push({
        code: 'INVALID_INDICATOR_PERIOD',
        message: 'Indicator period must be a positive number',
        nodeId: node.id
      });
    }
  }

  /**
   * Validate operator node configuration
   */
  private validateOperatorNode(node: StrategyNode, errors: ValidationError[], warnings: ValidationWarning[]): void {
    const config = node.config;

    if (!config.operator) {
      errors.push({
        code: 'MISSING_OPERATOR_TYPE',
        message: 'Operator node must specify operator type',
        nodeId: node.id
      });
    }

    const validOperators = ['and', 'or', 'not', 'greater', 'less', 'equal', 'crossover', 'crossunder'];
    if (config.operator && !validOperators.includes(config.operator)) {
      errors.push({
        code: 'INVALID_OPERATOR_TYPE',
        message: `Invalid operator type: ${config.operator}`,
        nodeId: node.id
      });
    }
  }

  /**
   * Validate position size node configuration
   */
  private validatePositionSizeNode(node: StrategyNode, errors: ValidationError[], warnings: ValidationWarning[]): void {
    const config = node.config;

    if (!config.method) {
      errors.push({
        code: 'MISSING_POSITION_SIZE_METHOD',
        message: 'Position size node must specify sizing method',
        nodeId: node.id
      });
    }

    const validMethods = ['fixed', 'percentage', 'kelly', 'volatility'];
    if (config.method && !validMethods.includes(config.method)) {
      errors.push({
        code: 'INVALID_POSITION_SIZE_METHOD',
        message: `Invalid position sizing method: ${config.method}`,
        nodeId: node.id
      });
    }

    if (config.value && (typeof config.value !== 'number' || config.value <= 0)) {
      errors.push({
        code: 'INVALID_POSITION_SIZE_VALUE',
        message: 'Position size value must be a positive number',
        nodeId: node.id
      });
    }
  }

  /**
   * Validate connections between nodes
   */
  private validateConnections(
    nodes: StrategyNode[], 
    connections: StrategyConnection[], 
    errors: ValidationError[], 
    warnings: ValidationWarning[]
  ): void {
    const nodeIds = new Set(nodes.map(n => n.id));
    const connectionIds = new Set<string>();

    for (const connection of connections) {
      // Check for duplicate connection IDs
      if (connectionIds.has(connection.id)) {
        errors.push({
          code: 'DUPLICATE_CONNECTION_ID',
          message: `Duplicate connection ID: ${connection.id}`,
          connectionId: connection.id
        });
      }
      connectionIds.add(connection.id);

      // Validate source and target nodes exist
      if (!nodeIds.has(connection.source)) {
        errors.push({
          code: 'INVALID_CONNECTION_SOURCE',
          message: `Connection source node not found: ${connection.source}`,
          connectionId: connection.id
        });
      }

      if (!nodeIds.has(connection.target)) {
        errors.push({
          code: 'INVALID_CONNECTION_TARGET',
          message: `Connection target node not found: ${connection.target}`,
          connectionId: connection.id
        });
      }

      // Check for self-connections
      if (connection.source === connection.target) {
        errors.push({
          code: 'SELF_CONNECTION',
          message: 'Node cannot connect to itself',
          connectionId: connection.id
        });
      }
    }
  }

  /**
   * Validate strategy flow (entry to exit paths)
   */
  private validateStrategyFlow(
    nodes: StrategyNode[], 
    connections: StrategyConnection[], 
    errors: ValidationError[], 
    warnings: ValidationWarning[]
  ): void {
    const entryNodes = nodes.filter(n => n.type === 'entry');
    const exitNodes = nodes.filter(n => n.type === 'exit');

    // Build adjacency list
    const adjacencyList = new Map<string, string[]>();
    for (const connection of connections) {
      if (!adjacencyList.has(connection.source)) {
        adjacencyList.set(connection.source, []);
      }
      adjacencyList.get(connection.source)!.push(connection.target);
    }

    // Check if each entry node has a path to at least one exit node
    for (const entryNode of entryNodes) {
      const hasPathToExit = this.hasPathToAnyNode(entryNode.id, exitNodes.map(n => n.id), adjacencyList);
      if (!hasPathToExit) {
        warnings.push({
          code: 'NO_PATH_TO_EXIT',
          message: `Entry node ${entryNode.id} has no path to any exit node`,
          nodeId: entryNode.id
        });
      }
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (this.hasCycle(node.id, adjacencyList, visited, recursionStack)) {
          errors.push({
            code: 'CIRCULAR_DEPENDENCY',
            message: 'Strategy contains circular dependencies',
            nodeId: node.id
          });
          break;
        }
      }
    }
  }

  /**
   * Validate strategy parameters
   */
  private validateParameters(parameters: any, errors: ValidationError[], warnings: ValidationWarning[]): void {
    if (!parameters.timeframe) {
      errors.push({
        code: 'MISSING_TIMEFRAME',
        message: 'Strategy parameters must include timeframe'
      });
    }

    if (!parameters.positionSizing) {
      errors.push({
        code: 'MISSING_POSITION_SIZING',
        message: 'Strategy parameters must include position sizing configuration'
      });
    }

    if (!parameters.riskManagement) {
      errors.push({
        code: 'MISSING_RISK_MANAGEMENT',
        message: 'Strategy parameters must include risk management configuration'
      });
    }

    // Validate position sizing
    if (parameters.positionSizing) {
      const ps = parameters.positionSizing;
      if (ps.method === 'percentage' && (ps.value > 100 || ps.value <= 0)) {
        errors.push({
          code: 'INVALID_PERCENTAGE_SIZE',
          message: 'Percentage position size must be between 0 and 100'
        });
      }
    }

    // Validate risk management
    if (parameters.riskManagement) {
      const rm = parameters.riskManagement;
      if (rm.maxDrawdown > 1 || rm.maxDrawdown <= 0) {
        errors.push({
          code: 'INVALID_MAX_DRAWDOWN',
          message: 'Max drawdown must be between 0 and 1'
        });
      }
    }
  }

  /**
   * Validate strategy logic consistency
   */
  private validateStrategyLogic(config: StrategyConfig, errors: ValidationError[], warnings: ValidationWarning[]): void {
    // Check for conflicting entry conditions
    const entryNodes = config.nodes.filter(n => n.type === 'entry');
    const buyEntries = entryNodes.filter(n => n.config.side === 'buy' || n.config.side === 'both');
    const sellEntries = entryNodes.filter(n => n.config.side === 'sell' || n.config.side === 'both');

    if (buyEntries.length > 0 && sellEntries.length > 0) {
      warnings.push({
        code: 'CONFLICTING_ENTRY_SIDES',
        message: 'Strategy has both buy and sell entry conditions, which may cause conflicts'
      });
    }

    // Check for unreachable nodes
    const reachableNodes = this.findReachableNodes(config.nodes, config.connections);
    for (const node of config.nodes) {
      if (!reachableNodes.has(node.id)) {
        warnings.push({
          code: 'UNREACHABLE_NODE',
          message: `Node ${node.id} is not reachable from any entry point`,
          nodeId: node.id
        });
      }
    }
  }

  /**
   * Check if there's a path from source to any target node
   */
  private hasPathToAnyNode(source: string, targets: string[], adjacencyList: Map<string, string[]>): boolean {
    const visited = new Set<string>();
    const queue = [source];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (targets.includes(current)) {
        return true;
      }

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const neighbors = adjacencyList.get(current) || [];
      queue.push(...neighbors);
    }

    return false;
  }

  /**
   * Check for cycles in the graph
   */
  private hasCycle(
    node: string, 
    adjacencyList: Map<string, string[]>, 
    visited: Set<string>, 
    recursionStack: Set<string>
  ): boolean {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = adjacencyList.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (this.hasCycle(neighbor, adjacencyList, visited, recursionStack)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  /**
   * Find all reachable nodes from entry points
   */
  private findReachableNodes(nodes: StrategyNode[], connections: StrategyConnection[]): Set<string> {
    const entryNodes = nodes.filter(n => n.type === 'entry');
    const adjacencyList = new Map<string, string[]>();
    
    for (const connection of connections) {
      if (!adjacencyList.has(connection.source)) {
        adjacencyList.set(connection.source, []);
      }
      adjacencyList.get(connection.source)!.push(connection.target);
    }

    const reachable = new Set<string>();
    
    for (const entryNode of entryNodes) {
      const visited = new Set<string>();
      const queue = [entryNode.id];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) {
          continue;
        }
        visited.add(current);
        reachable.add(current);

        const neighbors = adjacencyList.get(current) || [];
        queue.push(...neighbors);
      }
    }

    return reachable;
  }

  /**
   * Get default strategy parameters
   */
  private getDefaultParameters(): any {
    return {
      timeframe: '1h',
      positionSizing: {
        method: 'percentage',
        value: 10,
        maxPosition: 25
      },
      riskManagement: {
        maxDrawdown: 0.2,
        dailyLossLimit: 0.05,
        positionLimit: 5,
        correlationLimit: 0.7
      }
    };
  }

  /**
   * Initialize simulation state
   */
  private initializeSimulationState(request: SimulationRequest): any {
    return {
      equity: [{ timestamp: request.startDate, value: request.initialCapital }],
      trades: [],
      signals: [],
      currentCapital: request.initialCapital,
      positions: new Map(),
      indicators: new Map()
    };
  }

  /**
   * Process a single market data point in simulation
   */
  private processMarketDataPoint(dataPoint: MarketDataPoint, state: any, config: StrategyConfig): void {
    // This is a simplified simulation - in a real implementation,
    // you would execute the strategy logic node by node
    
    // Update indicators
    this.updateIndicators(dataPoint, state, config);
    
    // Check entry conditions
    this.checkEntryConditions(dataPoint, state, config);
    
    // Check exit conditions
    this.checkExitConditions(dataPoint, state, config);
    
    // Update equity
    const currentValue = this.calculatePortfolioValue(state, dataPoint);
    state.equity.push({ timestamp: dataPoint.timestamp, value: currentValue });
  }

  /**
   * Update technical indicators
   */
  private updateIndicators(dataPoint: MarketDataPoint, state: any, config: StrategyConfig): void {
    // Simplified indicator calculation
    // In a real implementation, you would calculate each indicator based on the node configuration
  }

  /**
   * Check entry conditions
   */
  private checkEntryConditions(dataPoint: MarketDataPoint, state: any, config: StrategyConfig): void {
    // Simplified entry logic
    // In a real implementation, you would evaluate the strategy graph
  }

  /**
   * Check exit conditions
   */
  private checkExitConditions(dataPoint: MarketDataPoint, state: any, config: StrategyConfig): void {
    // Simplified exit logic
    // In a real implementation, you would evaluate exit nodes
  }

  /**
   * Calculate current portfolio value
   */
  private calculatePortfolioValue(state: any, dataPoint: MarketDataPoint): number {
    // Simplified portfolio valuation
    return state.currentCapital;
  }

  /**
   * Calculate performance metrics from simulation state
   */
  private calculatePerformanceMetrics(state: any): PerformanceMetrics {
    const equity = state.equity;
    const trades = state.trades;
    
    if (equity.length < 2) {
      return {
        totalReturn: 0,
        annualizedReturn: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        winRate: 0,
        totalTrades: 0,
        profitFactor: 0
      };
    }

    const initialValue = equity[0].value;
    const finalValue = equity[equity.length - 1].value;
    const totalReturn = (finalValue - initialValue) / initialValue;

    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = initialValue;
    for (const point of equity) {
      if (point.value > peak) {
        peak = point.value;
      }
      const drawdown = (peak - point.value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Calculate win rate
    const winningTrades = trades.filter((t: any) => t.pnl > 0).length;
    const winRate = trades.length > 0 ? winningTrades / trades.length : 0;

    return {
      totalReturn,
      annualizedReturn: totalReturn, // Simplified - should be annualized based on time period
      sharpeRatio: 0, // Would need risk-free rate and volatility calculation
      maxDrawdown,
      winRate,
      totalTrades: trades.length,
      profitFactor: 0 // Would need profit/loss calculation
    };
  }
}
import { createLogger } from './logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('tracing');

// Trace context
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage?: Record<string, string>;
  flags?: number;
}

// Span status
export enum SpanStatus {
  OK = 'OK',
  ERROR = 'ERROR',
  TIMEOUT = 'TIMEOUT',
  CANCELLED = 'CANCELLED'
}

// Span kind
export enum SpanKind {
  INTERNAL = 'INTERNAL',
  SERVER = 'SERVER',
  CLIENT = 'CLIENT',
  PRODUCER = 'PRODUCER',
  CONSUMER = 'CONSUMER'
}

// Span interface
export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  kind: SpanKind;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: SpanStatus;
  tags: Record<string, any>;
  logs: SpanLog[];
  baggage: Record<string, string>;
}

// Span log entry
export interface SpanLog {
  timestamp: Date;
  level: string;
  message: string;
  fields?: Record<string, any>;
}

// Tracer interface
export interface Tracer {
  startSpan(operationName: string, options?: SpanOptions): Span;
  inject(span: Span, format: string, carrier: any): void;
  extract(format: string, carrier: any): TraceContext | null;
}

// Span options
export interface SpanOptions {
  childOf?: Span;
  references?: SpanReference[];
  tags?: Record<string, any>;
  startTime?: Date;
  kind?: SpanKind;
}

// Span reference
export interface SpanReference {
  type: 'childOf' | 'followsFrom';
  referencedContext: TraceContext;
}

// Distributed tracer implementation
export class DistributedTracer implements Tracer {
  private activeSpans: Map<string, Span> = new Map();
  private finishedSpans: Span[] = [];
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  // Start a new span
  startSpan(operationName: string, options: SpanOptions = {}): Span {
    const spanId = this.generateSpanId();
    const traceId = options.childOf?.traceId || this.generateTraceId();
    const parentSpanId = options.childOf?.spanId;

    const span: Span = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      kind: options.kind || SpanKind.INTERNAL,
      startTime: options.startTime || new Date(),
      status: SpanStatus.OK,
      tags: {
        'service.name': this.serviceName,
        'span.kind': options.kind || SpanKind.INTERNAL,
        ...options.tags
      },
      logs: [],
      baggage: options.childOf?.baggage || {}
    };

    this.activeSpans.set(spanId, span);

    logger.debug('Span started', {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      operationName: span.operationName,
      service: this.serviceName
    });

    return span;
  }

  // Finish a span
  finishSpan(span: Span, status: SpanStatus = SpanStatus.OK): void {
    span.endTime = new Date();
    span.duration = span.endTime.getTime() - span.startTime.getTime();
    span.status = status;

    this.activeSpans.delete(span.spanId);
    this.finishedSpans.push(span);

    logger.debug('Span finished', {
      traceId: span.traceId,
      spanId: span.spanId,
      operationName: span.operationName,
      duration: span.duration,
      status: span.status,
      service: this.serviceName
    });

    // Log span details for observability
    this.logSpan(span);
  }

  // Add tag to span
  setTag(span: Span, key: string, value: any): void {
    span.tags[key] = value;
  }

  // Add log to span
  log(span: Span, level: string, message: string, fields?: Record<string, any>): void {
    span.logs.push({
      timestamp: new Date(),
      level,
      message,
      fields
    });
  }

  // Set baggage item
  setBaggage(span: Span, key: string, value: string): void {
    span.baggage[key] = value;
  }

  // Get baggage item
  getBaggage(span: Span, key: string): string | undefined {
    return span.baggage[key];
  }

  // Inject trace context into carrier (e.g., HTTP headers)
  inject(span: Span, format: string, carrier: any): void {
    if (format === 'http_headers') {
      carrier['x-trace-id'] = span.traceId;
      carrier['x-span-id'] = span.spanId;
      if (span.parentSpanId) {
        carrier['x-parent-span-id'] = span.parentSpanId;
      }
      
      // Inject baggage
      Object.entries(span.baggage).forEach(([key, value]) => {
        carrier[`x-baggage-${key}`] = value;
      });
    }
  }

  // Extract trace context from carrier
  extract(format: string, carrier: any): TraceContext | null {
    if (format === 'http_headers') {
      const traceId = carrier['x-trace-id'];
      const spanId = carrier['x-span-id'];
      const parentSpanId = carrier['x-parent-span-id'];

      if (!traceId || !spanId) {
        return null;
      }

      // Extract baggage
      const baggage: Record<string, string> = {};
      Object.keys(carrier).forEach(key => {
        if (key.startsWith('x-baggage-')) {
          const baggageKey = key.replace('x-baggage-', '');
          baggage[baggageKey] = carrier[key];
        }
      });

      return {
        traceId,
        spanId,
        parentSpanId,
        baggage
      };
    }

    return null;
  }

  // Get active span
  getActiveSpan(spanId: string): Span | undefined {
    return this.activeSpans.get(spanId);
  }

  // Get all finished spans
  getFinishedSpans(): Span[] {
    return [...this.finishedSpans];
  }

  // Clear finished spans (for memory management)
  clearFinishedSpans(): void {
    this.finishedSpans = [];
  }

  // Log span for observability
  private logSpan(span: Span): void {
    const spanData = {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      operationName: span.operationName,
      kind: span.kind,
      startTime: span.startTime.toISOString(),
      endTime: span.endTime?.toISOString(),
      duration: span.duration,
      status: span.status,
      tags: span.tags,
      logs: span.logs,
      baggage: span.baggage,
      service: this.serviceName
    };

    if (span.status === SpanStatus.ERROR) {
      logger.error('Span completed with error', spanData);
    } else {
      logger.info('Span completed', spanData);
    }
  }

  // Generate trace ID
  private generateTraceId(): string {
    return uuidv4().replace(/-/g, '');
  }

  // Generate span ID
  private generateSpanId(): string {
    return Math.random().toString(16).substr(2, 16);
  }
}

// Trace context manager for async operations
export class TraceContextManager {
  private static instance: TraceContextManager;
  private contextMap: Map<string, TraceContext> = new Map();

  static getInstance(): TraceContextManager {
    if (!TraceContextManager.instance) {
      TraceContextManager.instance = new TraceContextManager();
    }
    return TraceContextManager.instance;
  }

  // Set trace context for current async context
  setContext(context: TraceContext): void {
    const asyncId = this.getAsyncId();
    this.contextMap.set(asyncId, context);
  }

  // Get trace context for current async context
  getContext(): TraceContext | undefined {
    const asyncId = this.getAsyncId();
    return this.contextMap.get(asyncId);
  }

  // Clear context
  clearContext(): void {
    const asyncId = this.getAsyncId();
    this.contextMap.delete(asyncId);
  }

  // Get async ID (simplified - in real implementation use async_hooks)
  private getAsyncId(): string {
    return 'main'; // Placeholder - would use async_hooks.executionAsyncId()
  }
}

// Tracing middleware for Express
export const tracingMiddleware = (tracer: DistributedTracer) => {
  return (req: any, res: any, next: any) => {
    // Extract trace context from headers
    const traceContext = tracer.extract('http_headers', req.headers);
    
    // Start new span
    const span = tracer.startSpan(`${req.method} ${req.path}`, {
      kind: SpanKind.SERVER,
      tags: {
        'http.method': req.method,
        'http.url': req.url,
        'http.path': req.path,
        'user.id': req.user?.id
      },
      childOf: traceContext ? {
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        parentSpanId: traceContext.parentSpanId,
        baggage: traceContext.baggage || {}
      } as any : undefined
    });

    // Set trace context in request
    req.traceContext = {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId
    };

    // Set context in context manager
    TraceContextManager.getInstance().setContext(req.traceContext);

    // Finish span when response ends
    res.on('finish', () => {
      tracer.setTag(span, 'http.status_code', res.statusCode);
      
      const status = res.statusCode >= 400 ? SpanStatus.ERROR : SpanStatus.OK;
      tracer.finishSpan(span, status);
      
      TraceContextManager.getInstance().clearContext();
    });

    next();
  };
};

// Decorator for automatic tracing
export function traced(operationName?: string, kind: SpanKind = SpanKind.INTERNAL) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const opName = operationName || `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      const tracer = getGlobalTracer();
      const context = TraceContextManager.getInstance().getContext();
      
      const span = tracer.startSpan(opName, {
        kind,
        childOf: context ? {
          traceId: context.traceId,
          spanId: context.spanId,
          parentSpanId: context.parentSpanId,
          baggage: context.baggage || {}
        } as any : undefined
      });

      try {
        const result = await method.apply(this, args);
        tracer.finishSpan(span, SpanStatus.OK);
        return result;
      } catch (error) {
        tracer.setTag(span, 'error', true);
        tracer.setTag(span, 'error.message', error.message);
        tracer.log(span, 'error', error.message, { stack: error.stack });
        tracer.finishSpan(span, SpanStatus.ERROR);
        throw error;
      }
    };

    return descriptor;
  };
}

// Global tracer instance
let globalTracer: DistributedTracer;

// Initialize global tracer
export const initializeTracer = (serviceName: string): DistributedTracer => {
  globalTracer = new DistributedTracer(serviceName);
  return globalTracer;
};

// Get global tracer
export const getGlobalTracer = (): DistributedTracer => {
  if (!globalTracer) {
    throw new Error('Tracer not initialized. Call initializeTracer() first.');
  }
  return globalTracer;
};

// Utility functions for common tracing scenarios

// Trace HTTP client calls
export const traceHTTPCall = async <T>(
  url: string,
  method: string,
  fn: () => Promise<T>
): Promise<T> => {
  const tracer = getGlobalTracer();
  const span = tracer.startSpan(`HTTP ${method}`, {
    kind: SpanKind.CLIENT,
    tags: {
      'http.method': method,
      'http.url': url,
      'component': 'http-client'
    }
  });

  try {
    const result = await fn();
    tracer.setTag(span, 'http.status_code', 200); // Assume success
    tracer.finishSpan(span, SpanStatus.OK);
    return result;
  } catch (error) {
    tracer.setTag(span, 'error', true);
    tracer.setTag(span, 'error.message', error.message);
    tracer.finishSpan(span, SpanStatus.ERROR);
    throw error;
  }
};

// Trace database operations
export const traceDBOperation = async <T>(
  operation: string,
  table: string,
  fn: () => Promise<T>
): Promise<T> => {
  const tracer = getGlobalTracer();
  const span = tracer.startSpan(`DB ${operation}`, {
    kind: SpanKind.CLIENT,
    tags: {
      'db.operation': operation,
      'db.table': table,
      'component': 'database'
    }
  });

  try {
    const result = await fn();
    tracer.finishSpan(span, SpanStatus.OK);
    return result;
  } catch (error) {
    tracer.setTag(span, 'error', true);
    tracer.setTag(span, 'error.message', error.message);
    tracer.finishSpan(span, SpanStatus.ERROR);
    throw error;
  }
};
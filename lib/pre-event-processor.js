export class PreEventProcessor {
  constructor(options = {}) {
    this.processors = [];
    this.errorHandlers = [];
    this.performanceMonitoring = options.performanceMonitoring || false;
    this.metrics = {
      totalProcessed: 0,
      totalErrors: 0,
      processingTimes: []
    };
  }

  use(processor, options = {}) {
    if (typeof processor !== 'function') {
      throw new Error('Processor must be a function');
    }

    const wrappedProcessor = {
      fn: processor,
      condition: options.condition || (() => true),
      order: options.order || this.processors.length,
      name: options.name || `processor_${this.processors.length}`
    };

    this.processors.push(wrappedProcessor);
    this.processors.sort((a, b) => a.order - b.order);
    
    return this;
  }

  onError(handler) {
    if (typeof handler !== 'function') {
      throw new Error('Error handler must be a function');
    }
    this.errorHandlers.push(handler);
    return this;
  }

  async process(eventData) {
    const startTime = Date.now();
    let processedData = { ...eventData };
    const context = {
      original: { ...eventData },
      errors: [],
      metadata: {}
    };

    try {
      for (const processor of this.processors) {
        if (!processor.condition(processedData, context)) {
          continue;
        }

        const processorStart = Date.now();
        
        try {
          const result = await processor.fn(processedData, context);
          
          if (result === false) {
            throw new Error(`Event rejected by processor: ${processor.name}`);
          }
          
          if (result && typeof result === 'object') {
            processedData = { ...processedData, ...result };
          }
          
          if (this.performanceMonitoring) {
            this.metrics.processingTimes.push({
              processor: processor.name,
              duration: Date.now() - processorStart
            });
          }
        } catch (error) {
          context.errors.push({ processor: processor.name, error });
          
          let shouldContinue = false;
          for (const errorHandler of this.errorHandlers) {
            const handlerResult = await errorHandler(error, processedData, context);
            if (handlerResult) {
              shouldContinue = true;
              break;
            }
          }
          
          if (!shouldContinue) {
            throw error;
          }
        }
      }

      this.metrics.totalProcessed++;
      
      if (this.performanceMonitoring) {
        const totalTime = Date.now() - startTime;
        console.log(`Pre-event processing completed in ${totalTime}ms`);
      }

      return processedData;
    } catch (error) {
      this.metrics.totalErrors++;
      throw error;
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }

  clear() {
    this.processors = [];
    this.errorHandlers = [];
    this.metrics = {
      totalProcessed: 0,
      totalErrors: 0,
      processingTimes: []
    };
  }
}

export class PreEventChainBuilder {
  constructor() {
    this.steps = [];
  }

  add(processor, options = {}) {
    this.steps.push({ processor, options });
    return this;
  }

  when(condition) {
    if (this.steps.length === 0) {
      throw new Error('No processor to apply condition to');
    }
    
    const lastStep = this.steps[this.steps.length - 1];
    lastStep.options.condition = condition;
    return this;
  }

  withOrder(order) {
    if (this.steps.length === 0) {
      throw new Error('No processor to apply order to');
    }
    
    const lastStep = this.steps[this.steps.length - 1];
    lastStep.options.order = order;
    return this;
  }

  withName(name) {
    if (this.steps.length === 0) {
      throw new Error('No processor to apply name to');
    }
    
    const lastStep = this.steps[this.steps.length - 1];
    lastStep.options.name = name;
    return this;
  }

  build(processor = new PreEventProcessor()) {
    for (const step of this.steps) {
      processor.use(step.processor, step.options);
    }
    return processor;
  }
}

export const commonProcessors = {
  validate(schema) {
    return async (eventData, context) => {
      const errors = [];
      
      for (const [key, validator] of Object.entries(schema)) {
        const value = eventData.data?.[key];
        
        if (validator.required && value === undefined) {
          errors.push(`Missing required field: ${key}`);
        }
        
        if (value !== undefined && validator.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (actualType !== validator.type) {
            errors.push(`Invalid type for ${key}: expected ${validator.type}, got ${actualType}`);
          }
        }
        
        if (value !== undefined && validator.validate) {
          const isValid = await validator.validate(value, eventData, context);
          if (!isValid) {
            errors.push(`Validation failed for ${key}`);
          }
        }
      }
      
      if (errors.length > 0) {
        throw new Error(`Validation errors: ${errors.join(', ')}`);
      }
      
      return eventData;
    };
  },

  enrich(enrichments) {
    return async (eventData, context) => {
      const enrichedData = { ...eventData.data };
      
      for (const [key, enricher] of Object.entries(enrichments)) {
        if (typeof enricher === 'function') {
          enrichedData[key] = await enricher(eventData, context);
        } else {
          enrichedData[key] = enricher;
        }
      }
      
      return { data: enrichedData };
    };
  },

  transform(transformations) {
    return async (eventData, context) => {
      const transformedData = { ...eventData.data };
      
      for (const [key, transformer] of Object.entries(transformations)) {
        if (key in transformedData && typeof transformer === 'function') {
          transformedData[key] = await transformer(transformedData[key], eventData, context);
        }
      }
      
      return { data: transformedData };
    };
  },

  authorize(authorizationCheck) {
    return async (eventData, context) => {
      const isAuthorized = await authorizationCheck(eventData, context);
      
      if (!isAuthorized) {
        throw new Error(`Unauthorized event: ${eventData.cmd}`);
      }
      
      return eventData;
    };
  },

  rateLimit(options = {}) {
    const { windowMs = 60000, maxEvents = 100, keyGenerator = (event) => event.user } = options;
    const windows = new Map();
    
    return async (eventData, context) => {
      const key = keyGenerator(eventData);
      const now = Date.now();
      
      if (!windows.has(key)) {
        windows.set(key, { count: 0, resetTime: now + windowMs });
      }
      
      const window = windows.get(key);
      
      if (now > window.resetTime) {
        window.count = 0;
        window.resetTime = now + windowMs;
      }
      
      window.count++;
      
      if (window.count > maxEvents) {
        throw new Error(`Rate limit exceeded for ${key}`);
      }
      
      return eventData;
    };
  },

  deduplicate(options = {}) {
    const { windowMs = 60000, keyGenerator = (event) => `${event.cmd}-${JSON.stringify(event.data)}` } = options;
    const seen = new Map();
    
    return async (eventData, context) => {
      const key = keyGenerator(eventData);
      const now = Date.now();
      
      if (seen.has(key)) {
        const timestamp = seen.get(key);
        if (now - timestamp < windowMs) {
          throw new Error(`Duplicate event detected: ${key}`);
        }
      }
      
      seen.set(key, now);
      
      // Clean up old entries
      for (const [k, timestamp] of seen.entries()) {
        if (now - timestamp > windowMs) {
          seen.delete(k);
        }
      }
      
      return eventData;
    };
  }
};

export class PreEventProcessorWrapper {
  constructor(eventQueue, processor) {
    this.eventQueue = eventQueue;
    this.processor = processor;
    
    // Preserve original methods
    this._originalStore = eventQueue.store.bind(eventQueue);
    
    // Override store method
    eventQueue.store = this.store.bind(this);
  }

  async store(event, model, eventCallbacks = {}) {
    // Ensure eventCallbacks has the required methods
    const safeCallbacks = {
      _error: eventCallbacks._error || (() => {}),
      _default: eventCallbacks._default || (() => {}),
      ...eventCallbacks
    };

    try {
      const processedEvent = await this.processor.process(event);
      return await this._originalStore(processedEvent, model, safeCallbacks);
    } catch (error) {
      if (error.message.includes('rejected') || error.message.includes('Rate limit') || error.message.includes('Duplicate')) {
        // Don't store rejected events
        throw error;
      }
      // For other errors, you might want to store the original event or handle differently
      throw error;
    }
  }

  unwrap() {
    this.eventQueue.store = this._originalStore;
    return this.eventQueue;
  }
}
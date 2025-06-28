export class ExternalServiceIntegration {
  constructor(options = {}) {
    this.services = new Map();
    this.cache = new Map();
    this.defaultRetryPolicy = {
      maxRetries: 3,
      backoffMs: 1000,
      backoffMultiplier: 2,
      maxBackoffMs: 30000
    };
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.globalRateLimit = options.globalRateLimit || null;
    this.healthCheckInterval = options.healthCheckInterval || 60000;
    this.healthChecks = new Map();
    
    // Start health checking if interval is set
    if (this.healthCheckInterval > 0) {
      this.startHealthChecking();
    }
  }

  registerService(name, config) {
    if (!name || !config) {
      throw new Error('Service name and config are required');
    }

    const serviceConfig = {
      baseUrl: config.baseUrl,
      headers: config.headers || {},
      timeout: config.timeout || this.defaultTimeout,
      retryPolicy: { ...this.defaultRetryPolicy, ...config.retryPolicy },
      rateLimit: config.rateLimit || null,
      healthCheck: config.healthCheck || null,
      auth: config.auth || null,
      cacheTtl: config.cacheTtl || 0,
      ...config
    };

    this.services.set(name, {
      config: serviceConfig,
      isHealthy: true,
      lastHealthCheck: null,
      requestCount: 0,
      errorCount: 0,
      lastError: null,
      rateLimitWindow: new Map()
    });

    return this;
  }

  async callService(serviceName, options = {}) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service '${serviceName}' not registered`);
    }

    if (!service.isHealthy) {
      throw new Error(`Service '${serviceName}' is currently unhealthy`);
    }

    const {
      endpoint = '/',
      method = 'GET',
      data = null,
      headers = {},
      useCache = service.config.cacheTtl > 0,
      cacheKey = null,
      skipRateLimit = false
    } = options;

    // Check cache first
    if (useCache && method === 'GET') {
      const key = cacheKey || `${serviceName}:${endpoint}:${JSON.stringify(data)}`;
      const cached = this.cache.get(key);
      if (cached && Date.now() < cached.expiry) {
        return cached.data;
      }
    }

    // Rate limiting
    if (!skipRateLimit && service.config.rateLimit) {
      await this.checkRateLimit(serviceName, service.config.rateLimit);
    }

    // Global rate limiting
    if (!skipRateLimit && this.globalRateLimit) {
      await this.checkRateLimit('__global__', this.globalRateLimit);
    }

    const url = service.config.baseUrl + endpoint;
    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...service.config.headers,
        ...headers
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(service.config.timeout)
    };

    // Add authentication
    if (service.config.auth) {
      await this.addAuthentication(requestOptions, service.config.auth);
    }

    try {
      const response = await this.executeWithRetry(
        () => fetch(url, requestOptions),
        service.config.retryPolicy
      );

      service.requestCount++;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();

      // Cache successful responses
      if (useCache && method === 'GET' && service.config.cacheTtl > 0) {
        const key = cacheKey || `${serviceName}:${endpoint}:${JSON.stringify(data)}`;
        this.cache.set(key, {
          data: responseData,
          expiry: Date.now() + service.config.cacheTtl
        });
      }

      return responseData;
    } catch (error) {
      service.errorCount++;
      service.lastError = error;
      throw error;
    }
  }

  async checkRateLimit(serviceName, rateLimit) {
    const service = this.services.get(serviceName) || { rateLimitWindow: new Map() };
    const { windowMs, maxRequests } = rateLimit;
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;

    if (!service.rateLimitWindow.has(windowStart)) {
      service.rateLimitWindow.set(windowStart, 0);
      
      // Clean up old windows
      for (const [timestamp] of service.rateLimitWindow) {
        if (timestamp < windowStart - windowMs) {
          service.rateLimitWindow.delete(timestamp);
        }
      }
    }

    const currentCount = service.rateLimitWindow.get(windowStart);
    if (currentCount >= maxRequests) {
      const waitTime = windowStart + windowMs - now;
      throw new Error(`Rate limit exceeded for ${serviceName}. Wait ${waitTime}ms`);
    }

    service.rateLimitWindow.set(windowStart, currentCount + 1);
  }

  async executeWithRetry(operation, retryPolicy) {
    let lastError;
    let delay = retryPolicy.backoffMs;

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === retryPolicy.maxRetries) {
          break;
        }

        // Don't retry certain errors
        if (error.name === 'AbortError' || 
            (error.message.includes('HTTP 4') && !error.message.includes('HTTP 429'))) {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * retryPolicy.backoffMultiplier, retryPolicy.maxBackoffMs);
      }
    }

    throw lastError;
  }

  async addAuthentication(requestOptions, authConfig) {
    switch (authConfig.type) {
      case 'bearer':
        requestOptions.headers.Authorization = `Bearer ${authConfig.token}`;
        break;
      case 'basic':
        const credentials = btoa(`${authConfig.username}:${authConfig.password}`);
        requestOptions.headers.Authorization = `Basic ${credentials}`;
        break;
      case 'apikey':
        requestOptions.headers[authConfig.header || 'X-API-Key'] = authConfig.key;
        break;
      case 'oauth2':
        // Implement OAuth2 flow if needed
        throw new Error('OAuth2 authentication not yet implemented');
      default:
        throw new Error(`Unknown auth type: ${authConfig.type}`);
    }
  }

  async performHealthCheck(serviceName) {
    const service = this.services.get(serviceName);
    if (!service || !service.config.healthCheck) {
      return true;
    }

    try {
      const { endpoint = '/health', method = 'GET', expectedStatus = 200 } = service.config.healthCheck;
      
      const response = await fetch(service.config.baseUrl + endpoint, {
        method,
        headers: service.config.headers,
        signal: AbortSignal.timeout(5000) // Short timeout for health checks
      });

      const isHealthy = response.status === expectedStatus;
      service.isHealthy = isHealthy;
      service.lastHealthCheck = Date.now();
      
      return isHealthy;
    } catch (error) {
      service.isHealthy = false;
      service.lastHealthCheck = Date.now();
      service.lastError = error;
      return false;
    }
  }

  startHealthChecking() {
    this.healthCheckTimer = setInterval(async () => {
      for (const [serviceName] of this.services) {
        await this.performHealthCheck(serviceName);
      }
    }, this.healthCheckInterval);
  }

  stopHealthChecking() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  getServiceStatus(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service '${serviceName}' not registered`);
    }

    return {
      name: serviceName,
      isHealthy: service.isHealthy,
      lastHealthCheck: service.lastHealthCheck,
      requestCount: service.requestCount,
      errorCount: service.errorCount,
      errorRate: service.requestCount > 0 ? (service.errorCount / service.requestCount) * 100 : 0,
      lastError: service.lastError
    };
  }

  getAllServiceStatuses() {
    const statuses = {};
    for (const [serviceName] of this.services) {
      statuses[serviceName] = this.getServiceStatus(serviceName);
    }
    return statuses;
  }

  clearCache(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  createPreEventProcessor(serviceName, options = {}) {
    return async (eventData, context) => {
      const {
        endpoint = '/',
        method = 'POST',
        dataMapper = (event) => event.data,
        responseMapper = (response) => response,
        onError = 'throw', // 'throw', 'continue', 'enrich'
        cacheKey = null
      } = options;

      try {
        const serviceData = typeof dataMapper === 'function' 
          ? dataMapper(eventData, context)
          : dataMapper;

        const response = await this.callService(serviceName, {
          endpoint,
          method,
          data: serviceData,
          cacheKey
        });

        const mappedResponse = typeof responseMapper === 'function'
          ? responseMapper(response, eventData, context)
          : response;

        // Merge the response into event data
        return {
          ...eventData,
          data: {
            ...eventData.data,
            ...mappedResponse
          }
        };
      } catch (error) {
        switch (onError) {
          case 'throw':
            throw error;
          case 'continue':
            return eventData;
          case 'enrich':
            return {
              ...eventData,
              data: {
                ...eventData.data,
                serviceError: {
                  service: serviceName,
                  error: error.message,
                  timestamp: Date.now()
                }
              }
            };
          default:
            throw error;
        }
      }
    };
  }

  destroy() {
    this.stopHealthChecking();
    this.services.clear();
    this.cache.clear();
  }
}

export const servicePresets = {
  sendgrid: (apiKey) => ({
    baseUrl: 'https://api.sendgrid.com/v3',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    healthCheck: {
      endpoint: '/user/profile',
      expectedStatus: 200
    },
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100
    }
  }),

  stripe: (apiKey) => ({
    baseUrl: 'https://api.stripe.com/v1',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    rateLimit: {
      windowMs: 1000,
      maxRequests: 25
    }
  }),

  slack: (token) => ({
    baseUrl: 'https://slack.com/api',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    rateLimit: {
      windowMs: 60000,
      maxRequests: 50
    }
  }),

  twilio: (accountSid, authToken) => ({
    baseUrl: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`,
    auth: {
      type: 'basic',
      username: accountSid,
      password: authToken
    },
    rateLimit: {
      windowMs: 1000,
      maxRequests: 10
    }
  })
};
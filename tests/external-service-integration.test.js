import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ExternalServiceIntegration, servicePresets } from "../lib/external-service-integration.js";

describe("External Service Integration", () => {
  let integration;
  let originalFetch;

  beforeEach(() => {
    // Store original fetch
    originalFetch = global.fetch;
    
    integration = new ExternalServiceIntegration({
      healthCheckInterval: 0 // Disable automatic health checks for tests
    });
  });

  afterEach(() => {
    integration.destroy();
    // Always restore original fetch
    global.fetch = originalFetch;
  });

  describe("Service Registration", () => {
    test("should register service with configuration", () => {
      integration.registerService("testService", {
        baseUrl: "https://api.test.com",
        headers: { "X-API-Key": "test-key" }
      });

      expect(integration.services.has("testService")).toBe(true);
      
      const service = integration.services.get("testService");
      expect(service.config.baseUrl).toBe("https://api.test.com");
      expect(service.config.headers["X-API-Key"]).toBe("test-key");
    });

    test("should apply default configurations", () => {
      integration.registerService("testService", {
        baseUrl: "https://api.test.com"
      });

      const service = integration.services.get("testService");
      expect(service.config.timeout).toBe(30000);
      expect(service.config.retryPolicy.maxRetries).toBe(3);
      expect(service.isHealthy).toBe(true);
    });

    test("should throw error for invalid registration", () => {
      expect(() => integration.registerService()).toThrow("Service name and config are required");
      expect(() => integration.registerService("test")).toThrow("Service name and config are required");
    });
  });

  describe("Service Calls", () => {
    beforeEach(() => {
      integration.registerService("testService", {
        baseUrl: "https://api.test.com",
        headers: { "X-API-Key": "test-key" }
      });
    });

    test("should make successful API call", async () => {
      const mockResponse = { success: true, data: "test-data" };
      
      global.fetch = async () => ({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await integration.callService("testService", {
        endpoint: "/test",
        method: "GET"
      });

      expect(result).toEqual(mockResponse);
    });

    test("should make POST request with data", async () => {
      const requestData = { name: "test", value: 123 };
      const mockResponse = { id: 1, ...requestData };
      
      global.fetch = async () => ({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await integration.callService("testService", {
        endpoint: "/create",
        method: "POST",
        data: requestData
      });

      expect(result).toEqual(mockResponse);
    });

    test("should handle HTTP errors", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found"
      });

      await expect(integration.callService("testService", {
        endpoint: "/notfound"
      })).rejects.toThrow("HTTP 404: Not Found");
    });

    test("should throw error for unregistered service", async () => {
      await expect(integration.callService("unknownService"))
        .rejects.toThrow("Service 'unknownService' not registered");
    });

    test("should throw error for unhealthy service", async () => {
      const service = integration.services.get("testService");
      service.isHealthy = false;

      await expect(integration.callService("testService"))
        .rejects.toThrow("Service 'testService' is currently unhealthy");
    });
  });

  describe("Caching", () => {
    beforeEach(() => {
      integration.registerService("testService", {
        baseUrl: "https://api.test.com",
        cacheTtl: 1000 // 1 second cache
      });
    });

    test("should cache GET responses", async () => {
      const mockResponse = { data: "cached-data" };
      let callCount = 0;
      
      global.fetch = async () => {
        callCount++;
        return {
          ok: true,
          json: () => Promise.resolve(mockResponse)
        };
      };

      // First call
      const result1 = await integration.callService("testService", {
        endpoint: "/cached",
        useCache: true
      });

      // Second call should use cache
      const result2 = await integration.callService("testService", {
        endpoint: "/cached",
        useCache: true
      });

      expect(result1).toEqual(mockResponse);
      expect(result2).toEqual(mockResponse);
      expect(callCount).toBe(1);
    });

    test("should not cache POST requests", async () => {
      const mockResponse = { data: "not-cached" };
      let callCount = 0;
      
      global.fetch = async () => {
        callCount++;
        return {
          ok: true,
          json: () => Promise.resolve(mockResponse)
        };
      };

      // Two POST calls
      await integration.callService("testService", {
        endpoint: "/create",
        method: "POST",
        data: { test: "data" },
        useCache: true
      });

      await integration.callService("testService", {
        endpoint: "/create",
        method: "POST",
        data: { test: "data" },
        useCache: true
      });

      expect(callCount).toBe(2);
    });

    test("should clear cache", async () => {
      const mockResponse = { data: "cached-data" };
      let callCount = 0;
      
      global.fetch = async () => {
        callCount++;
        return {
          ok: true,
          json: () => Promise.resolve(mockResponse)
        };
      };

      await integration.callService("testService", {
        endpoint: "/cached",
        useCache: true
      });

      integration.clearCache();

      await integration.callService("testService", {
        endpoint: "/cached",
        useCache: true
      });

      expect(callCount).toBe(2);
    });
  });

  describe("Rate Limiting", () => {
    beforeEach(() => {
      integration.registerService("rateLimitedService", {
        baseUrl: "https://api.test.com",
        rateLimit: {
          windowMs: 1000,
          maxRequests: 2
        }
      });
    });

    test("should enforce rate limits", async () => {
      global.fetch = async () => ({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      // First two calls should succeed
      await integration.callService("rateLimitedService");
      await integration.callService("rateLimitedService");

      // Third call should fail
      await expect(integration.callService("rateLimitedService"))
        .rejects.toThrow("Rate limit exceeded");
    });

    test("should allow rate limit bypass", async () => {
      global.fetch = async () => ({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      // Fill rate limit
      await integration.callService("rateLimitedService");
      await integration.callService("rateLimitedService");

      // This should succeed with skipRateLimit
      const result = await integration.callService("rateLimitedService", {
        skipRateLimit: true
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Authentication", () => {
    test("should add Bearer token authentication", async () => {
      integration.registerService("bearerService", {
        baseUrl: "https://api.test.com",
        auth: {
          type: "bearer",
          token: "test-token"
        }
      });

      let capturedHeaders = null;
      global.fetch = async (url, options) => {
        capturedHeaders = options.headers;
        return {
          ok: true,
          json: () => Promise.resolve({ success: true })
        };
      };

      await integration.callService("bearerService");

      expect(capturedHeaders.Authorization).toBe("Bearer test-token");
    });

    test("should add Basic authentication", async () => {
      integration.registerService("basicService", {
        baseUrl: "https://api.test.com",
        auth: {
          type: "basic",
          username: "user",
          password: "pass"
        }
      });

      let capturedHeaders = null;
      global.fetch = async (url, options) => {
        capturedHeaders = options.headers;
        return {
          ok: true,
          json: () => Promise.resolve({ success: true })
        };
      };

      await integration.callService("basicService");

      const expectedAuth = "Basic " + btoa("user:pass");
      expect(capturedHeaders.Authorization).toBe(expectedAuth);
    });

    test("should add API key authentication", async () => {
      integration.registerService("apiKeyService", {
        baseUrl: "https://api.test.com",
        auth: {
          type: "apikey",
          key: "test-api-key",
          header: "X-Custom-Key"
        }
      });

      let capturedHeaders = null;
      global.fetch = async (url, options) => {
        capturedHeaders = options.headers;
        return {
          ok: true,
          json: () => Promise.resolve({ success: true })
        };
      };

      await integration.callService("apiKeyService");

      expect(capturedHeaders["X-Custom-Key"]).toBe("test-api-key");
    });
  });

  describe("Health Checks", () => {
    test("should perform health check", async () => {
      integration.registerService("healthService", {
        baseUrl: "https://api.test.com",
        healthCheck: {
          endpoint: "/health",
          expectedStatus: 200
        }
      });

      global.fetch = async () => ({
        status: 200
      });

      const isHealthy = await integration.performHealthCheck("healthService");
      
      expect(isHealthy).toBe(true);
    });

    test("should mark service as unhealthy on failed health check", async () => {
      integration.registerService("unhealthyService", {
        baseUrl: "https://api.test.com",
        healthCheck: {
          endpoint: "/health"
        }
      });

      global.fetch = async () => ({
        status: 500
      });

      const isHealthy = await integration.performHealthCheck("unhealthyService");
      
      expect(isHealthy).toBe(false);
      
      const service = integration.services.get("unhealthyService");
      expect(service.isHealthy).toBe(false);
    });
  });

  describe("Service Status", () => {
    test("should return service status", () => {
      integration.registerService("statusService", {
        baseUrl: "https://api.test.com"
      });

      const service = integration.services.get("statusService");
      service.requestCount = 10;
      service.errorCount = 2;

      const status = integration.getServiceStatus("statusService");
      
      expect(status.name).toBe("statusService");
      expect(status.requestCount).toBe(10);
      expect(status.errorCount).toBe(2);
      expect(status.errorRate).toBe(20);
    });

    test("should return all service statuses", () => {
      integration.registerService("service1", { baseUrl: "https://api1.com" });
      integration.registerService("service2", { baseUrl: "https://api2.com" });

      const statuses = integration.getAllServiceStatuses();
      
      expect(Object.keys(statuses)).toEqual(["service1", "service2"]);
      expect(statuses.service1.name).toBe("service1");
      expect(statuses.service2.name).toBe("service2");
    });
  });

  describe("Pre-Event Processor Creation", () => {
    beforeEach(() => {
      integration.registerService("processorService", {
        baseUrl: "https://api.test.com",
        retryPolicy: {
          maxRetries: 1,
          backoffMs: 1,
          backoffMultiplier: 1,
          maxBackoffMs: 1
        }
      });
    });

    test("should create pre-event processor", async () => {
      const processor = integration.createPreEventProcessor("processorService", {
        endpoint: "/validate",
        method: "POST",
        dataMapper: (event) => ({ eventData: event.data }),
        responseMapper: (response) => ({ validated: response.valid })
      });

      global.fetch = async () => ({
        ok: true,
        json: () => Promise.resolve({ valid: true })
      });

      const eventData = {
        cmd: "testEvent",
        data: { value: "test" }
      };

      const result = await processor(eventData, {});
      
      expect(result.data.value).toBe("test");
      expect(result.data.validated).toBe(true);
    });

    test("should handle service errors in processor", async () => {
      const processor = integration.createPreEventProcessor("processorService", {
        onError: "enrich"
      });

      // Mock fetch with immediate rejection to avoid timeout
      global.fetch = () => Promise.reject(new Error("Service unavailable"));

      const eventData = {
        cmd: "testEvent",
        data: { value: "test" }
      };

      const result = await processor(eventData, {});
      
      expect(result.data.value).toBe("test");
      expect(result.data.serviceError).toBeDefined();
      expect(result.data.serviceError.error).toBe("Service unavailable");
    });
  });

  describe("Service Presets", () => {
    test("should create SendGrid preset", () => {
      const config = servicePresets.sendgrid("test-api-key");
      
      expect(config.baseUrl).toBe("https://api.sendgrid.com/v3");
      expect(config.headers.Authorization).toBe("Bearer test-api-key");
      expect(config.healthCheck).toBeDefined();
    });

    test("should create Stripe preset", () => {
      const config = servicePresets.stripe("sk_test_123");
      
      expect(config.baseUrl).toBe("https://api.stripe.com/v1");
      expect(config.headers.Authorization).toBe("Bearer sk_test_123");
      expect(config.rateLimit).toBeDefined();
    });

    test("should create Slack preset", () => {
      const config = servicePresets.slack("xoxb-token");
      
      expect(config.baseUrl).toBe("https://slack.com/api");
      expect(config.headers.Authorization).toBe("Bearer xoxb-token");
    });

    test("should create Twilio preset", () => {
      const config = servicePresets.twilio("ACxxx", "token123");
      
      expect(config.baseUrl).toBe("https://api.twilio.com/2010-04-01/Accounts/ACxxx");
      expect(config.auth.type).toBe("basic");
      expect(config.auth.username).toBe("ACxxx");
      expect(config.auth.password).toBe("token123");
    });
  });
});
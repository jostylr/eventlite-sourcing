import { describe, test, expect, beforeEach } from "bun:test";
import { DataGenerator, dataGenerators, defaultDataGenerator } from "../lib/data-generation.js";

describe("Data Generation", () => {
  let generator;

  beforeEach(() => {
    generator = new DataGenerator();
  });

  describe("UUID Generation", () => {
    test("should generate UUIDv4 by default", () => {
      const uuid = generator.generateUUID();
      
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test("should generate UUIDv4 explicitly", () => {
      const uuid = generator.generateUUID(4);
      
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test("should generate UUIDv7", () => {
      const uuid = generator.generateUUID(7);
      
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test("should generate unique UUIDs", () => {
      const uuid1 = generator.generateUUID();
      const uuid2 = generator.generateUUID();
      
      expect(uuid1).not.toBe(uuid2);
    });

    test("should throw error for unsupported UUID version", () => {
      expect(() => generator.generateUUID(3)).toThrow("UUID version 3 not supported");
    });
  });

  describe("Password Generation", () => {
    test("should generate password with default options", () => {
      const password = generator.generateSecurePassword();
      
      expect(password).toHaveLength(16);
      expect(password).toMatch(/[A-Z]/); // uppercase
      expect(password).toMatch(/[a-z]/); // lowercase
      expect(password).toMatch(/[0-9]/); // numbers
      expect(password).toMatch(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/); // symbols
    });

    test("should generate password with custom length", () => {
      const password = generator.generateSecurePassword({ length: 24 });
      
      expect(password).toHaveLength(24);
    });

    test("should respect character type options", () => {
      const password = generator.generateSecurePassword({
        length: 12,
        includeUppercase: false,
        includeSymbols: false
      });
      
      expect(password).not.toMatch(/[A-Z]/);
      expect(password).not.toMatch(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
    });

    test("should exclude similar characters when requested", () => {
      const password = generator.generateSecurePassword({
        length: 20,
        excludeSimilar: true,
        customCharset: "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // Pre-filtered charset
      });
      
      expect(password).not.toMatch(/[il1Lo0O]/);
    });

    test("should use custom charset", () => {
      const password = generator.generateSecurePassword({
        length: 10,
        customCharset: "ABCDEF123456"
      });
      
      expect(password).toHaveLength(10);
      expect(password).toMatch(/^[ABCDEF123456]+$/);
    });

    test("should throw error for too short password", () => {
      expect(() => generator.generateSecurePassword({ length: 3 }))
        .toThrow("Password length must be at least 4 characters");
    });

    test("should throw error when no character types selected", () => {
      expect(() => generator.generateSecurePassword({
        includeUppercase: false,
        includeLowercase: false,
        includeNumbers: false,
        includeSymbols: false
      })).toThrow("No character types selected for password generation");
    });
  });

  describe("Token Generation", () => {
    test("should generate token with default options", () => {
      const token = generator.generateToken();
      
      expect(token).toHaveLength(64); // 32 bytes * 2 hex chars
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    test("should generate token with custom length", () => {
      const token = generator.generateToken({ length: 16 });
      
      expect(token).toHaveLength(32); // 16 bytes * 2 hex chars
    });

    test("should generate token with base64url encoding", () => {
      const token = generator.generateToken({ encoding: 'base64url' });
      
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test("should add prefix to token", () => {
      const token = generator.generateToken({ prefix: 'tok_' });
      
      expect(token).toMatch(/^tok_[0-9a-f]+$/);
    });

    test("should include timestamp when requested", () => {
      const token = generator.generateToken({ includeTimestamp: true });
      
      expect(token).toMatch(/^[0-9a-z]+_[0-9a-f]+$/);
    });
  });

  describe("API Key Generation", () => {
    test("should generate API key with default options", () => {
      const apiKey = generator.generateAPIKey();
      
      expect(apiKey).toMatch(/^ak_[0-9a-f]{64}_[0-9a-f]{8}$/);
    });

    test("should generate API key with custom prefix", () => {
      const apiKey = generator.generateAPIKey({ prefix: 'api' });
      
      expect(apiKey).toMatch(/^api_[0-9a-f]{64}_[0-9a-f]{8}$/);
    });

    test("should generate API key without checksum", () => {
      const apiKey = generator.generateAPIKey({ includeChecksum: false });
      
      expect(apiKey).toMatch(/^ak_[0-9a-f]{64}$/);
      expect(apiKey).not.toMatch(/_[0-9a-f]{8}$/);
    });

    test("should generate API key with custom secret length", () => {
      const apiKey = generator.generateAPIKey({ 
        secretLength: 16,
        includeChecksum: false 
      });
      
      expect(apiKey).toMatch(/^ak_[0-9a-f]{32}$/);
    });
  });

  describe("JWT Generation", () => {
    test("should generate JWT with default options", () => {
      const payload = { userId: 123, role: 'user' };
      const secret = 'test-secret';
      const jwt = generator.generateJWT(payload, secret);
      
      const parts = jwt.split('.');
      expect(parts).toHaveLength(3);
      
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');
      
      const tokenPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(tokenPayload.userId).toBe(123);
      expect(tokenPayload.role).toBe('user');
      expect(tokenPayload.iat).toBeNumber();
      expect(tokenPayload.exp).toBeNumber();
    });

    test("should parse expiration strings correctly", () => {
      expect(generator.parseExpiration('30s')).toBe(30);
      expect(generator.parseExpiration('5m')).toBe(300);
      expect(generator.parseExpiration('2h')).toBe(7200);
      expect(generator.parseExpiration('1d')).toBe(86400);
      expect(generator.parseExpiration(3600)).toBe(3600);
    });

    test("should throw error for invalid expiration format", () => {
      expect(() => generator.parseExpiration('invalid'))
        .toThrow('Invalid expiresIn format');
    });
  });

  describe("Password Hashing", () => {
    test("should hash password with scrypt", async () => {
      const password = "test-password";
      const result = await generator.generateHashedPassword(password);
      
      expect(result.hash).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.algorithm).toBe('scrypt');
      expect(result.cost).toBe(16384);
      expect(result.keyLength).toBe(64);
    });

    test("should verify correct password", async () => {
      const password = "test-password";
      const hashedPassword = await generator.generateHashedPassword(password);
      
      const isValid = await generator.verifyPassword(password, hashedPassword);
      expect(isValid).toBe(true);
    });

    test("should reject incorrect password", async () => {
      const password = "test-password";
      const hashedPassword = await generator.generateHashedPassword(password);
      
      const isValid = await generator.verifyPassword("wrong-password", hashedPassword);
      expect(isValid).toBe(false);
    });
  });

  describe("Data Anonymization", () => {
    test("should partially anonymize string", () => {
      const result = generator.anonymizeData("john.doe@example.com", "partial");
      expect(result).toBe("jo****************om");
    });

    test("should hash anonymize string", () => {
      const result = generator.anonymizeData("sensitive-data", "hash");
      expect(result).toMatch(/^[0-9a-f]{16}$/);
    });

    test("should random anonymize string", () => {
      const result = generator.anonymizeData("test", "random");
      expect(result).toHaveLength(4);
      expect(result).toMatch(/^[a-z0-9]+$/);
      expect(result).not.toBe("test");
    });

    test("should remove data when strategy is remove", () => {
      const result = generator.anonymizeData("sensitive", "remove");
      expect(result).toBeNull();
    });

    test("should anonymize object properties", () => {
      const data = {
        name: "John Doe",
        email: "john@example.com",
        age: 30
      };
      
      const result = generator.anonymizeData(data, "partial");
      expect(result.name).toBe("Jo****oe");
      expect(result.email).toBe("jo************om");
      expect(result.age).toBe(30); // Numbers should remain unchanged
    });

    test("should anonymize arrays", () => {
      const data = ["secret1", "secret2", "secret3"];
      const result = generator.anonymizeData(data, "partial");
      
      expect(result).toEqual(["se***t1", "se***t2", "se***t3"]);
    });
  });

  describe("Test Data Generation", () => {
    test("should generate data from schema", () => {
      const schema = {
        name: 'name',
        email: 'email',
        age: { type: 'number', options: { min: 18, max: 65 } },
        active: 'boolean'
      };
      
      const data = generator.generateTestData(schema);
      
      expect(typeof data.name).toBe('string');
      expect(data.email).toMatch(/^test\d+@example\.com$/);
      expect(data.age).toBeNumber();
      expect(data.age).toBeGreaterThanOrEqual(18);
      expect(data.age).toBeLessThanOrEqual(65);
      expect(['boolean', 'string'].includes(typeof data.active)).toBe(true);
    });

    test("should generate array data", () => {
      const schema = {
        tags: {
          type: 'array',
          length: 3,
          items: 'string'
        }
      };
      
      const data = generator.generateTestData(schema);
      
      expect(Array.isArray(data.tags)).toBe(true);
      expect(data.tags).toHaveLength(3);
      expect(typeof data.tags[0]).toBe('string');
    });

    test("should generate nested object data", () => {
      const schema = {
        user: {
          type: 'object',
          properties: {
            name: 'name',
            email: 'email'
          }
        }
      };
      
      const data = generator.generateTestData(schema);
      
      expect(typeof data.user).toBe('object');
      expect(typeof data.user.name).toBe('string');
      expect(data.user.email).toMatch(/^test\d+@example\.com$/);
    });
  });

  describe("Pre-Event Processor Creation", () => {
    test("should create pre-event processor for data generation", async () => {
      const generatorConfig = {
        id: { type: 'uuid' },
        createdAt: { type: 'timestamp', format: 'iso' },
        token: { type: 'token', options: { length: 16 } }
      };
      
      const processor = generator.createPreEventProcessor(generatorConfig);
      
      const eventData = {
        cmd: 'createUser',
        data: { name: 'John Doe' }
      };
      
      const result = await processor(eventData, {});
      
      expect(result.data.name).toBe('John Doe');
      expect(result.data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(result.data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result.data.token).toHaveLength(32); // 16 bytes * 2 hex chars
    });

    test("should generate password hash from source field", async () => {
      const generatorConfig = {
        hashedPassword: {
          type: 'hash',
          source: 'password',
          options: { keyLength: 32 }
        }
      };
      
      const processor = generator.createPreEventProcessor(generatorConfig);
      
      const eventData = {
        cmd: 'createUser',
        data: { 
          name: 'John Doe',
          password: 'secret123'
        }
      };
      
      const result = await processor(eventData, {});
      
      expect(result.data.hashedPassword).toBeDefined();
      expect(result.data.hashedPassword.hash).toBeDefined();
      expect(result.data.hashedPassword.salt).toBeDefined();
    });

    test("should use custom generator function", async () => {
      const generatorConfig = {
        customField: {
          generator: async (eventData, context) => {
            return `custom-${eventData.data.name}`;
          }
        }
      };
      
      const processor = generator.createPreEventProcessor(generatorConfig);
      
      const eventData = {
        cmd: 'test',
        data: { name: 'John' }
      };
      
      const result = await processor(eventData, {});
      
      expect(result.data.customField).toBe('custom-John');
    });

    test("should not overwrite existing fields unless specified", async () => {
      const generatorConfig = {
        id: { type: 'uuid' },
        existingId: { type: 'uuid', overwrite: true }
      };
      
      const processor = generator.createPreEventProcessor(generatorConfig);
      
      const eventData = {
        cmd: 'test',
        data: { 
          id: 'existing-id',
          existingId: 'existing-existing-id'
        }
      };
      
      const result = await processor(eventData, {});
      
      expect(result.data.id).toBe('existing-id'); // Not overwritten
      expect(result.data.existingId).not.toBe('existing-existing-id'); // Overwritten
      expect(result.data.existingId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe("Data Generator Presets", () => {
    test("should generate user data", () => {
      const userData = dataGenerators.user();
      
      expect(userData.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(userData.username).toHaveLength(8);
      expect(userData.email).toMatch(/^user\d+@example\.com$/);
      expect(userData.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test("should generate session data", () => {
      const sessionData = dataGenerators.session();
      
      expect(sessionData.sessionId).toHaveLength(64);
      expect(sessionData.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test("should generate transaction data", () => {
      const transactionData = dataGenerators.transaction();
      
      expect(transactionData.transactionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(typeof transactionData.amount).toBe('number');
      expect(transactionData.currency).toBe('USD');
      expect(transactionData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("Default Data Generator", () => {
    test("should export default instance", () => {
      expect(defaultDataGenerator).toBeInstanceOf(DataGenerator);
      
      const uuid = defaultDataGenerator.generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });
});
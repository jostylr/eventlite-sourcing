import { randomBytes, createHash, scrypt } from 'crypto';

export class DataGenerator {
  constructor(options = {}) {
    this.defaultOptions = {
      uuidVersion: 4,
      passwordLength: 16,
      tokenLength: 32,
      includeTimestamp: false,
      ...options
    };
  }

  generateUUID(version = this.defaultOptions.uuidVersion) {
    switch (version) {
      case 4:
        return this.generateUUIDv4();
      case 7:
        return this.generateUUIDv7();
      default:
        throw new Error(`UUID version ${version} not supported`);
    }
  }

  generateUUIDv4() {
    const bytes = randomBytes(16);
    
    // Set version (4) and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    
    const hex = bytes.toString('hex');
    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20, 32)
    ].join('-');
  }

  generateUUIDv7() {
    const timestamp = Date.now();
    const randomA = randomBytes(2);
    const randomB = randomBytes(8);
    
    // 48-bit timestamp
    const timestampHex = timestamp.toString(16).padStart(12, '0');
    
    // Set version (7) and variant bits
    randomA[0] = (randomA[0] & 0x0f) | 0x70;
    randomB[0] = (randomB[0] & 0x3f) | 0x80;
    
    const hex = timestampHex + randomA.toString('hex') + randomB.toString('hex');
    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20, 32)
    ].join('-');
  }

  generateSecurePassword(options = {}) {
    const {
      length = this.defaultOptions.passwordLength,
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSymbols = true,
      excludeSimilar = false,
      customCharset = null
    } = options;

    if (length < 4) {
      throw new Error('Password length must be at least 4 characters');
    }

    let charset = '';
    const charsets = {
      uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      lowercase: 'abcdefghijklmnopqrstuvwxyz',
      numbers: '0123456789',
      symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
    };

    if (customCharset) {
      charset = customCharset;
    } else {
      if (includeUppercase) charset += charsets.uppercase;
      if (includeLowercase) charset += charsets.lowercase;
      if (includeNumbers) charset += charsets.numbers;
      if (includeSymbols) charset += charsets.symbols;
    }

    if (excludeSimilar) {
      charset = charset.replace(/[il1Lo0O]/g, '');
    }

    if (!charset) {
      throw new Error('No character types selected for password generation');
    }

    let password = '';
    const requiredChars = [];

    // Ensure at least one character from each selected type
    if (includeUppercase && !customCharset) requiredChars.push(this.getRandomChar(charsets.uppercase));
    if (includeLowercase && !customCharset) requiredChars.push(this.getRandomChar(charsets.lowercase));
    if (includeNumbers && !customCharset) requiredChars.push(this.getRandomChar(charsets.numbers));
    if (includeSymbols && !customCharset) requiredChars.push(this.getRandomChar(charsets.symbols));

    // Fill the rest randomly
    for (let i = requiredChars.length; i < length; i++) {
      requiredChars.push(this.getRandomChar(charset));
    }

    // Shuffle the password
    for (let i = requiredChars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [requiredChars[i], requiredChars[j]] = [requiredChars[j], requiredChars[i]];
    }

    return requiredChars.join('');
  }

  getRandomChar(charset) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    return charset[randomIndex];
  }

  generateToken(options = {}) {
    const {
      length = this.defaultOptions.tokenLength,
      encoding = 'hex',
      prefix = '',
      includeTimestamp = this.defaultOptions.includeTimestamp
    } = options;

    let token = randomBytes(length).toString(encoding);
    
    if (includeTimestamp) {
      const timestamp = Date.now().toString(36);
      token = `${timestamp}_${token}`;
    }
    
    return prefix + token;
  }

  generateAPIKey(options = {}) {
    const {
      prefix = 'ak',
      secretLength = 32,
      includeChecksum = true
    } = options;

    const secret = randomBytes(secretLength).toString('hex');
    let apiKey = `${prefix}_${secret}`;
    
    if (includeChecksum) {
      const checksum = createHash('sha256').update(secret).digest('hex').substring(0, 8);
      apiKey += `_${checksum}`;
    }
    
    return apiKey;
  }

  generateJWT(payload, secret, options = {}) {
    const {
      algorithm = 'HS256',
      expiresIn = '1h'
    } = options;

    const header = {
      alg: algorithm,
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const exp = this.parseExpiration(expiresIn);

    const tokenPayload = {
      ...payload,
      iat: now,
      exp: now + exp
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const signature = createHash('sha256').update(`${encodedHeader}.${encodedPayload}.${secret}`).digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  parseExpiration(expiresIn) {
    if (typeof expiresIn === 'number') return expiresIn;
    
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) throw new Error('Invalid expiresIn format');
    
    const [, value, unit] = match;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    
    return parseInt(value) * multipliers[unit];
  }

  async generateHashedPassword(password, options = {}) {
    const {
      algorithm = 'scrypt',
      saltLength = 16,
      keyLength = 64,
      cost = 16384
    } = options;

    const salt = randomBytes(saltLength);
    
    return new Promise((resolve, reject) => {
      scrypt(password, salt, keyLength, { cost }, (err, derivedKey) => {
        if (err) reject(err);
        else resolve({
          hash: derivedKey.toString('hex'),
          salt: salt.toString('hex'),
          algorithm,
          cost,
          keyLength
        });
      });
    });
  }

  async verifyPassword(password, storedHash) {
    const { hash, salt, algorithm, cost, keyLength } = storedHash;
    
    return new Promise((resolve, reject) => {
      scrypt(password, Buffer.from(salt, 'hex'), keyLength, { cost }, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex') === hash);
      });
    });
  }

  anonymizeData(data, strategy = 'partial') {
    const strategies = {
      partial: this.partialAnonymize.bind(this),
      hash: this.hashAnonymize.bind(this),
      random: this.randomAnonymize.bind(this),
      remove: () => null
    };

    const anonymizer = strategies[strategy];
    if (!anonymizer) {
      throw new Error(`Unknown anonymization strategy: ${strategy}`);
    }

    if (typeof data === 'string') {
      return anonymizer(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.anonymizeData(item, strategy));
    }

    if (typeof data === 'object' && data !== null) {
      const anonymized = {};
      for (const [key, value] of Object.entries(data)) {
        anonymized[key] = this.anonymizeData(value, strategy);
      }
      return anonymized;
    }

    return data;
  }

  partialAnonymize(str) {
    if (str.length <= 4) return '*'.repeat(str.length);
    return str.substring(0, 2) + '*'.repeat(str.length - 4) + str.substring(str.length - 2);
  }

  hashAnonymize(str) {
    return createHash('sha256').update(str).digest('hex').substring(0, 16);
  }

  randomAnonymize(str) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: str.length }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }

  generateTestData(schema) {
    const generators = {
      string: (opts = {}) => this.generateRandomString(opts.length || 10),
      number: (opts = {}) => Math.floor(Math.random() * ((opts.max || 1000) - (opts.min || 0) + 1)) + (opts.min || 0),
      boolean: () => Math.random() < 0.5,
      email: () => `test${Math.floor(Math.random() * 10000)}@example.com`,
      phone: () => `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
      date: (opts = {}) => new Date(Date.now() - Math.random() * (opts.pastDays || 365) * 24 * 60 * 60 * 1000),
      uuid: () => this.generateUUID(),
      name: () => {
        const names = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana'];
        return names[Math.floor(Math.random() * names.length)];
      },
      address: () => `${Math.floor(Math.random() * 9999) + 1} Main St, City, ST 12345`,
      url: () => `https://example${Math.floor(Math.random() * 100)}.com`
    };

    const generateValue = (fieldSchema) => {
      if (typeof fieldSchema === 'string') {
        return generators[fieldSchema]?.() || 'unknown';
      }

      if (typeof fieldSchema === 'object') {
        if (fieldSchema.type === 'array') {
          const length = fieldSchema.length || Math.floor(Math.random() * 5) + 1;
          return Array.from({ length }, () => generateValue(fieldSchema.items));
        }

        if (fieldSchema.type === 'object') {
          const obj = {};
          for (const [key, value] of Object.entries(fieldSchema.properties || {})) {
            obj[key] = generateValue(value);
          }
          return obj;
        }

        return generators[fieldSchema.type]?.(fieldSchema.options) || 'unknown';
      }

      return 'unknown';
    };

    const result = {};
    for (const [key, value] of Object.entries(schema)) {
      result[key] = generateValue(value);
    }

    return result;
  }

  generateRandomString(length = 10, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
    return Array.from({ length }, () => 
      charset[Math.floor(Math.random() * charset.length)]
    ).join('');
  }

  createPreEventProcessor(generatorConfig) {
    return async (eventData, context) => {
      const enrichedData = { ...eventData.data };
      
      for (const [field, config] of Object.entries(generatorConfig)) {
        if (enrichedData[field] === undefined || config.overwrite) {
          switch (config.type) {
            case 'uuid':
              enrichedData[field] = this.generateUUID(config.version);
              break;
            case 'password':
              enrichedData[field] = this.generateSecurePassword(config.options);
              break;
            case 'token':
              enrichedData[field] = this.generateToken(config.options);
              break;
            case 'apikey':
              enrichedData[field] = this.generateAPIKey(config.options);
              break;
            case 'timestamp':
              enrichedData[field] = config.format === 'iso' ? new Date().toISOString() : Date.now();
              break;
            case 'hash':
              if (config.source && enrichedData[config.source]) {
                enrichedData[field] = await this.generateHashedPassword(enrichedData[config.source], config.options);
              }
              break;
            default:
              if (typeof config.generator === 'function') {
                enrichedData[field] = await config.generator(eventData, context);
              }
          }
        }
      }
      
      return { data: enrichedData };
    };
  }
}

export const dataGenerators = {
  user: () => ({
    id: new DataGenerator().generateUUID(),
    username: new DataGenerator().generateRandomString(8),
    email: `user${Math.floor(Math.random() * 10000)}@example.com`,
    createdAt: new Date().toISOString()
  }),

  session: () => ({
    sessionId: new DataGenerator().generateToken({ length: 32 }),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }),

  transaction: () => ({
    transactionId: new DataGenerator().generateUUID(),
    amount: Math.floor(Math.random() * 100000) / 100,
    currency: 'USD',
    timestamp: new Date().toISOString()
  })
};

// Export a default instance for convenience
export const defaultDataGenerator = new DataGenerator();
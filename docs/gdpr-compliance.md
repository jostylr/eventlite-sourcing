# GDPR Compliance in Event Sourcing

This document explains strategies for handling GDPR and other privacy regulations that require data deletion in an event-sourced system where the event log is meant to be immutable.

## The Challenge

Event Sourcing's fundamental principle is that events are **immutable** - they represent facts that happened and should never be changed. However, privacy regulations like GDPR require that personal data must be deletable upon request. This creates an apparent conflict.

## Key GDPR Requirements

1. **Right to Erasure (Article 17)**: Users can request deletion of their personal data
2. **Data Minimization (Article 5)**: Only collect and store necessary data
3. **Purpose Limitation**: Data should only be used for stated purposes
4. **Storage Limitation**: Don't keep data longer than necessary

## Strategies for GDPR Compliance

### 1. Crypto-Shredding (Recommended)

Store sensitive personal data encrypted with per-user encryption keys. When deletion is requested, delete the encryption key, making the data unrecoverable.

```javascript
// Example implementation
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

class CryptoShredder {
  constructor(keyStore) {
    this.keyStore = keyStore; // Separate key storage
    this.algorithm = 'aes-256-gcm';
  }

  // Generate a unique key for each user
  async generateUserKey(userId) {
    const key = randomBytes(32);
    const keyId = `user-key-${userId}`;
    await this.keyStore.store(keyId, key);
    return keyId;
  }

  // Encrypt personal data
  encrypt(data, keyId) {
    const key = this.keyStore.get(keyId);
    if (!key) throw new Error('Key not found');
    
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      keyId
    };
  }

  // Decrypt personal data
  decrypt(encryptedData) {
    const key = this.keyStore.get(encryptedData.keyId);
    if (!key) return null; // Key has been deleted
    
    const decipher = createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  // Delete user's encryption key
  async deleteUserData(userId) {
    const keyId = `user-key-${userId}`;
    await this.keyStore.delete(keyId);
    // Data in events is now unrecoverable
  }
}
```

### 2. Segregated Personal Data Storage

Store personal data in a separate, mutable database and only reference IDs in events.

```javascript
// Event contains only reference
const userRegisteredEvent = {
  cmd: 'userRegistered',
  data: {
    userId: 'user-123',
    profileId: 'profile-123', // Reference to personal data
    accountType: 'premium'    // Non-personal data stays in event
  }
};

// Personal data in separate store
const personalDataStore = {
  'profile-123': {
    email: 'user@example.com',
    name: 'John Doe',
    address: '123 Main St',
    phone: '+1234567890'
  }
};

// Deletion only affects personal store
async function deleteUserData(userId) {
  const profileId = await getProfileId(userId);
  await personalDataStore.delete(profileId);
  // Events remain intact but personal data is gone
}
```

### 3. Event Transformation Pattern

Keep events but transform them to remove personal data when requested.

```javascript
class EventTransformer {
  constructor(eventQueue) {
    this.eventQueue = eventQueue;
    this.transformations = new Map();
  }

  // Register a deletion request
  async requestDeletion(userId, fields) {
    // Store transformation rules
    this.transformations.set(userId, {
      requestedAt: Date.now(),
      fields: fields
    });

    // Store deletion event
    await this.eventQueue.store({
      cmd: 'userDataDeleted',
      data: {
        userId,
        fields,
        deletedAt: Date.now()
      },
      metadata: {
        gdprRequest: true,
        reason: 'user-requested'
      }
    });
  }

  // Transform event data when reading
  transformEvent(event) {
    if (!event.data.userId) return event;
    
    const transformation = this.transformations.get(event.data.userId);
    if (!transformation) return event;
    
    // Apply transformations
    const transformedData = { ...event.data };
    transformation.fields.forEach(field => {
      if (transformedData[field]) {
        transformedData[field] = '[REDACTED]';
      }
    });
    
    return {
      ...event,
      data: transformedData,
      metadata: {
        ...event.metadata,
        transformed: true,
        transformedAt: transformation.requestedAt
      }
    };
  }

  // Read events with transformation
  readEvents(criteria) {
    const events = this.eventQueue.query(criteria);
    return events.map(event => this.transformEvent(event));
  }
}
```

### 4. Hybrid Approach (Most Practical)

Combine multiple strategies based on data sensitivity:

```javascript
class GDPRCompliantEventStore {
  constructor(eventQueue, cryptoShredder, personalStore) {
    this.eventQueue = eventQueue;
    this.crypto = cryptoShredder;
    this.personalStore = personalStore;
  }

  async storeUserEvent(eventData) {
    // Classify data by sensitivity
    const { 
      highSensitive,  // SSN, credit cards - crypto-shred
      mediumSensitive, // Email, name - separate store
      lowSensitive,   // Preferences - can stay in events
      nonPersonal     // Product IDs, timestamps
    } = this.classifyData(eventData);

    // Encrypt highly sensitive data
    let encryptedData = null;
    if (highSensitive) {
      const keyId = await this.crypto.getUserKey(eventData.userId);
      encryptedData = this.crypto.encrypt(highSensitive, keyId);
    }

    // Store medium sensitive data separately
    let profileId = null;
    if (mediumSensitive) {
      profileId = await this.personalStore.store(
        eventData.userId,
        mediumSensitive
      );
    }

    // Store event with references and non-sensitive data
    return await this.eventQueue.store({
      cmd: eventData.cmd,
      data: {
        userId: eventData.userId,
        ...nonPersonal,
        ...lowSensitive,
        encryptedRef: encryptedData ? encryptedData.id : null,
        profileRef: profileId
      },
      correlationId: eventData.correlationId,
      metadata: {
        ...eventData.metadata,
        dataClassification: {
          hasEncrypted: !!encryptedData,
          hasProfile: !!profileId,
          hasLowSensitive: !!Object.keys(lowSensitive).length
        }
      }
    });
  }

  async deleteUserData(userId) {
    // 1. Delete encryption keys (crypto-shredding)
    await this.crypto.deleteUserData(userId);
    
    // 2. Delete from personal store
    await this.personalStore.deleteUser(userId);
    
    // 3. Store deletion event for audit
    await this.eventQueue.store({
      cmd: 'gdprDeletionCompleted',
      data: {
        userId,
        deletedAt: Date.now(),
        deletionMethods: ['crypto-shred', 'personal-store']
      },
      metadata: {
        gdprCompliant: true
      }
    });
    
    // 4. Low sensitive data remains but is anonymized in projections
    return { success: true, userId };
  }
}
```

## Implementation Example: User Management with GDPR

```javascript
// Setup
const eventQueue = initQueue({ dbName: 'data/events.sqlite' });
const keyStore = new SecureKeyStore(); // Implement secure key storage
const cryptoShredder = new CryptoShredder(keyStore);
const personalStore = new PersonalDataStore(); // Separate DB

// Model with GDPR considerations
const gdprModel = modelSetup({
  db: 'data/state.sqlite',
  
  tables() {
    return {
      users: `
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        account_type TEXT,
        created_at INTEGER,
        profile_ref TEXT,
        encrypted_ref TEXT,
        is_deleted INTEGER DEFAULT 0
      `,
      
      deletion_requests: `
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        requested_at INTEGER,
        completed_at INTEGER,
        status TEXT
      `
    };
  },
  
  methods(queries) {
    return {
      createUser(data, metadata) {
        // Only store non-personal data in state
        queries.insertUser.run({
          id: data.userId,
          username: data.username, // Assuming username is not PII
          account_type: data.accountType,
          created_at: metadata.datetime,
          profile_ref: data.profileRef,
          encrypted_ref: data.encryptedRef,
          is_deleted: 0
        });
        
        return { userId: data.userId };
      },
      
      gdprDeletionRequested(data, metadata) {
        queries.insertDeletionRequest.run({
          user_id: data.userId,
          requested_at: metadata.datetime,
          status: 'pending'
        });
        
        return { requestId: this.lastInsertRowid };
      },
      
      gdprDeletionCompleted(data, metadata) {
        // Mark user as deleted
        queries.updateUser.run({
          id: data.userId,
          is_deleted: 1
        });
        
        // Update request status
        queries.updateDeletionRequest.run({
          user_id: data.userId,
          completed_at: metadata.datetime,
          status: 'completed'
        });
        
        return { deleted: true };
      }
    };
  }
});

// Usage example
async function registerUser(userData) {
  // Separate personal data
  const { email, name, phone, ...nonPersonalData } = userData;
  
  // Generate encryption key for user
  const keyId = await cryptoShredder.generateUserKey(userData.userId);
  
  // Encrypt highly sensitive data
  const encrypted = cryptoShredder.encrypt(
    { ssn: userData.ssn, creditCard: userData.creditCard },
    keyId
  );
  
  // Store medium sensitive data separately
  const profileId = await personalStore.create({
    userId: userData.userId,
    email,
    name,
    phone
  });
  
  // Store event with references
  return await eventQueue.store({
    cmd: 'createUser',
    data: {
      userId: userData.userId,
      username: userData.username,
      accountType: userData.accountType,
      profileRef: profileId,
      encryptedRef: encrypted.id
    }
  }, gdprModel, callbacks);
}

// GDPR deletion request
async function handleDeletionRequest(userId) {
  // 1. Store deletion request event
  await eventQueue.store({
    cmd: 'gdprDeletionRequested',
    data: { userId, requestedAt: Date.now() }
  }, gdprModel, callbacks);
  
  // 2. Delete encryption keys
  await cryptoShredder.deleteUserData(userId);
  
  // 3. Delete from personal store
  await personalStore.delete(userId);
  
  // 4. Store completion event
  await eventQueue.store({
    cmd: 'gdprDeletionCompleted',
    data: { userId, completedAt: Date.now() }
  }, gdprModel, callbacks);
}
```

## Data Classification Guidelines

### Highly Sensitive (Crypto-shred)
- Social Security Numbers
- Credit card numbers
- Health records
- Biometric data
- Passwords (should be hashed anyway)

### Medium Sensitive (Separate store)
- Email addresses
- Full names
- Physical addresses
- Phone numbers
- Date of birth

### Low Sensitive (Can remain in events)
- User preferences
- Feature toggles
- Anonymized usage data
- Account settings

### Non-Personal (Always in events)
- User IDs (if random)
- Timestamps
- Product IDs
- Transaction amounts
- System metadata

## Best Practices

1. **Design for Privacy**: Consider GDPR from the start
   ```javascript
   // Bad: Everything in one event
   { cmd: 'userRegistered', data: { name, email, ssn, preferences }}
   
   // Good: Separated by sensitivity
   { cmd: 'userRegistered', data: { userId, profileRef, encryptedRef }}
   ```

2. **Use References**: Store IDs instead of personal data
   ```javascript
   // Instead of embedding personal data
   { orderId: '123', customerName: 'John Doe', email: 'john@example.com' }
   
   // Reference the customer
   { orderId: '123', customerId: 'user-456' }
   ```

3. **Audit Deletion**: Always record deletion events
   ```javascript
   await eventQueue.store({
     cmd: 'personalDataDeleted',
     data: {
       userId,
       deletionMethod: 'crypto-shred',
       affectedSystems: ['events', 'profile-store'],
       timestamp: Date.now()
     }
   });
   ```

4. **Time-bound Retention**: Implement automatic deletion
   ```javascript
   // Scheduled job to delete old data
   async function cleanupOldData() {
     const retentionPeriod = 7 * 365 * 24 * 60 * 60 * 1000; // 7 years
     const cutoffDate = Date.now() - retentionPeriod;
     
     const oldUsers = await findInactiveUsers(cutoffDate);
     for (const user of oldUsers) {
       await handleDeletionRequest(user.id);
     }
   }
   ```

5. **Test Deletion**: Verify data is truly unrecoverable
   ```javascript
   async function verifyDeletion(userId) {
     // Try to decrypt - should fail
     const encrypted = await getEncryptedData(userId);
     const decrypted = cryptoShredder.decrypt(encrypted);
     assert(decrypted === null, 'Data still decryptable!');
     
     // Check personal store
     const profile = await personalStore.get(userId);
     assert(profile === null, 'Profile still exists!');
     
     // Verify events don't contain PII
     const events = await eventQueue.getTransaction(userId);
     events.forEach(event => {
       assert(!containsPII(event.data), 'Event contains PII!');
     });
   }
   ```

## Projection Handling

When building projections, handle deleted data gracefully:

```javascript
class GDPRCompliantProjection {
  async buildUserView(userId) {
    // Check if user is deleted
    const user = await this.getUser(userId);
    if (user.is_deleted) {
      return {
        userId,
        status: 'deleted',
        message: 'User data has been deleted per GDPR request'
      };
    }
    
    // Try to get personal data
    const profile = await this.personalStore.get(user.profile_ref);
    const encrypted = await this.getEncryptedData(user.encrypted_ref);
    
    return {
      userId,
      // Fallback to anonymous if data is deleted
      name: profile?.name || 'Anonymous User',
      email: profile?.email || 'deleted@example.com',
      // Only include decrypted data if available
      ...(encrypted ? this.cryptoShredder.decrypt(encrypted) : {})
    };
  }
}
```

## Legal Considerations

1. **Legitimate Interest**: Some data may be retained for legal reasons
   - Financial records (tax law)
   - Security logs (fraud prevention)
   - Legal disputes

2. **Anonymization vs Deletion**: Sometimes anonymization is sufficient
   ```javascript
   // Instead of full deletion
   function anonymizeUser(userData) {
     return {
       ...userData,
       name: 'Anonymous',
       email: `deleted-${userData.userId}@example.com`,
       ip: '0.0.0.0'
     };
   }
   ```

3. **Right to be Informed**: Tell users what data you keep
   ```javascript
   const retentionPolicy = {
     personalData: '30 days after deletion request',
     financialRecords: '7 years (legal requirement)',
     securityLogs: '90 days',
     anonymizedAnalytics: 'indefinite'
   };
   ```

## Summary

GDPR compliance in event sourcing requires a thoughtful approach:

1. **Crypto-shredding** for highly sensitive data provides true deletion while maintaining immutable events
2. **Segregated storage** keeps personal data separate and deletable
3. **Event transformation** allows post-hoc redaction
4. **Hybrid approaches** combine strategies for practical implementation

The key is to design your system with privacy in mind from the start, classify data by sensitivity, and implement appropriate handling for each category. This allows you to maintain the benefits of event sourcing while respecting user privacy rights.
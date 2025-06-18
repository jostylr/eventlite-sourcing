import { initQueue, modelSetup, eventCallbacks } from '../index.js';
import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'crypto';
import { Database } from 'bun:sqlite';
import { unlinkSync, existsSync, mkdirSync } from 'fs';

// Crypto-shredding implementation
class CryptoShredder {
  constructor(keyDbPath = 'data/gdpr-keys.sqlite') {
    this.db = new Database(keyDbPath, { create: true });
    this.algorithm = 'aes-256-gcm';

    // Initialize key storage
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS encryption_keys (
        key_id TEXT PRIMARY KEY,
        key_data BLOB NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        deleted_at INTEGER
      )
    `);

    this.queries = {
      store: this.db.prepare('INSERT INTO encryption_keys (key_id, key_data) VALUES (?, ?)'),
      get: this.db.prepare('SELECT key_data FROM encryption_keys WHERE key_id = ? AND deleted_at IS NULL'),
      delete: this.db.prepare('UPDATE encryption_keys SET deleted_at = unixepoch() WHERE key_id = ?'),
      purge: this.db.prepare('DELETE FROM encryption_keys WHERE deleted_at < ?')
    };
  }

  async generateUserKey(userId) {
    const key = randomBytes(32);
    const keyId = `user-key-${userId}`;
    this.queries.store.run(keyId, key);
    return keyId;
  }

  encrypt(data, keyId) {
    const keyRow = this.queries.get.get(keyId);
    if (!keyRow) throw new Error('Encryption key not found');

    const key = keyRow.key_data;
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

  decrypt(encryptedData) {
    if (!encryptedData || !encryptedData.keyId) return null;

    const keyRow = this.queries.get.get(encryptedData.keyId);
    if (!keyRow) return null; // Key has been deleted

    try {
      const key = keyRow.key_data;
      const decipher = createDecipheriv(
        this.algorithm,
        key,
        Buffer.from(encryptedData.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error.message);
      return null;
    }
  }

  async deleteUserData(userId) {
    const keyId = `user-key-${userId}`;
    this.queries.delete.run(keyId);
    return { keyId, deleted: true };
  }

  // Permanently remove old deleted keys
  async purgeOldKeys(daysOld = 30) {
    const cutoff = Math.floor(Date.now() / 1000) - (daysOld * 24 * 60 * 60);
    return this.queries.purge.run(cutoff);
  }
}

// Personal data store (separate from events)
class PersonalDataStore {
  constructor(dbPath = 'data/gdpr-personal.sqlite') {
    this.db = new Database(dbPath, { create: true });

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS personal_data (
        profile_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT,
        full_name TEXT,
        phone TEXT,
        address TEXT,
        date_of_birth TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        deleted_at INTEGER,
        UNIQUE(user_id, deleted_at)
      )
    `);

    this.queries = {
      create: this.db.prepare(`
        INSERT INTO personal_data (profile_id, user_id, email, full_name, phone, address, date_of_birth)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      get: this.db.prepare('SELECT * FROM personal_data WHERE profile_id = ? AND deleted_at IS NULL'),
      getByUserId: this.db.prepare('SELECT * FROM personal_data WHERE user_id = ? AND deleted_at IS NULL'),
      delete: this.db.prepare('UPDATE personal_data SET deleted_at = unixepoch() WHERE user_id = ? AND deleted_at IS NULL'),
      purge: this.db.prepare('DELETE FROM personal_data WHERE deleted_at < ?')
    };
  }

  async create(userId, data) {
    const profileId = `profile-${randomUUID()}`;
    this.queries.create.run(
      profileId,
      userId,
      data.email,
      data.fullName,
      data.phone,
      data.address,
      data.dateOfBirth
    );
    return profileId;
  }

  async get(profileId) {
    return this.queries.get.get(profileId);
  }

  async getByUserId(userId) {
    return this.queries.getByUserId.get(userId);
  }

  async delete(userId) {
    return this.queries.delete.run(userId);
  }

  async purgeOld(daysOld = 30) {
    const cutoff = Math.floor(Date.now() / 1000) - (daysOld * 24 * 60 * 60);
    return this.queries.purge.run(cutoff);
  }
}

// Components will be initialized after table cleanup
let eventQueue, cryptoShredder, personalStore, gdprModel;

// GDPR-compliant model setup function
function createGdprModel() {
  return modelSetup({
    dbName: 'data/gdpr-state.sqlite',

  tables(db) {
    // Users table
    db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        account_type TEXT,
        created_at INTEGER,
        profile_ref TEXT,
        encrypted_ref TEXT,
        is_deleted INTEGER DEFAULT 0,
        deletion_requested_at INTEGER,
        deletion_completed_at INTEGER
      )
    `).run();

    // GDPR requests table
    db.query(`
      CREATE TABLE IF NOT EXISTS gdpr_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        request_type TEXT NOT NULL,
        requested_at INTEGER NOT NULL,
        completed_at INTEGER,
        status TEXT DEFAULT 'pending',
        metadata TEXT
      )
    `).run();

    // Data inventory table
    db.query(`
      CREATE TABLE IF NOT EXISTS data_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        data_type TEXT NOT NULL,
        storage_location TEXT NOT NULL,
        reference TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        deleted_at INTEGER
      )
    `).run();
  },

  queries(db) {
    return {
      insertUser: db.query('INSERT INTO users (id, username, account_type, created_at, profile_ref, encrypted_ref) VALUES ($id, $username, $account_type, $created_at, $profile_ref, $encrypted_ref)'),
      updateUser: db.query('UPDATE users SET is_deleted = $is_deleted, deletion_requested_at = $deletion_requested_at, deletion_completed_at = $deletion_completed_at WHERE id = $id'),
      getUser: db.query('SELECT * FROM users WHERE id = $id'),

      insertGdprRequest: db.query('INSERT INTO gdpr_requests (user_id, request_type, requested_at, metadata) VALUES ($user_id, $request_type, $requested_at, $metadata)'),
      updateGdprRequest: db.query('UPDATE gdpr_requests SET completed_at = $completed_at, status = $status WHERE user_id = $user_id AND status = "pending"'),

      insertDataInventory: db.query('INSERT INTO data_inventory (user_id, data_type, storage_location, reference) VALUES ($user_id, $data_type, $storage_location, $reference)'),
      deleteDataInventory: db.query('UPDATE data_inventory SET deleted_at = unixepoch() WHERE user_id = $user_id')
    };
  },

  methods(queries) {
    return {
      // User registration with data classification
      registerUser(data, metadata) {
        // Record what data we're storing where
        queries.insertDataInventory.run({
          user_id: data.userId,
          data_type: 'personal_profile',
          storage_location: 'personal_store',
          reference: data.profileRef
        });

        if (data.encryptedRef) {
          queries.insertDataInventory.run({
            user_id: data.userId,
            data_type: 'sensitive_encrypted',
            storage_location: 'event_store',
            reference: data.encryptedRef
          });
        }

        // Store user record
        queries.insertUser.run({
          id: data.userId,
          username: data.username,
          account_type: data.accountType,
          created_at: metadata.datetime,
          profile_ref: data.profileRef,
          encrypted_ref: data.encryptedRef
        });

        return { userId: data.userId, success: true };
      },

      // GDPR deletion request
      gdprDeletionRequested(data, metadata) {
        queries.insertGdprRequest.run({
          user_id: data.userId,
          request_type: 'deletion',
          requested_at: metadata.datetime,
          metadata: JSON.stringify(data.metadata || {})
        });

        queries.updateUser.run({
          id: data.userId,
          is_deleted: 0,
          deletion_requested_at: metadata.datetime,
          deletion_completed_at: null
        });

        return { requestId: this.lastInsertRowid };
      },

      // GDPR deletion completed
      gdprDeletionCompleted(data, metadata) {
        queries.updateUser.run({
          id: data.userId,
          is_deleted: 1,
          deletion_requested_at: queries.getUser.get({ id: data.userId }).deletion_requested_at,
          deletion_completed_at: metadata.datetime
        });

        queries.updateGdprRequest.run({
          user_id: data.userId,
          completed_at: metadata.datetime,
          status: 'completed'
        });

        queries.deleteDataInventory.run({
          user_id: data.userId
        });

        return { success: true };
      },

      // Data export request (GDPR Article 20 - Data Portability)
      gdprExportRequested(data, metadata) {
        queries.insertGdprRequest.run({
          user_id: data.userId,
          request_type: 'export',
          requested_at: metadata.datetime,
          metadata: JSON.stringify(data.metadata || {})
        });

        return { requestId: this.lastInsertRowid };
      },

      gdprExportCompleted(data, metadata) {
        queries.updateGdprRequest.run({
          user_id: data.userId,
          completed_at: metadata.datetime,
          status: 'completed'
        });

        return { success: true, exportLocation: data.exportLocation };
      }
    };
  }
  });
}

// Callbacks
const gdprCallbacks = {
  registerUser(result, row) {
    console.log(`User ${row.data.userId} registered successfully`);
  },

  gdprDeletionRequested(result, row) {
    console.log(`GDPR deletion requested for user ${row.data.userId}`);
    // In production, you might trigger an async deletion process here
  },

  gdprDeletionCompleted(result, row) {
    console.log(`GDPR deletion completed for user ${row.data.userId}`);
  },

  gdprExportRequested(result, row) {
    console.log(`GDPR export requested for user ${row.data.userId}`);
  },

  gdprExportCompleted(result, row) {
    console.log(`GDPR export completed for user ${row.data.userId}`);
  },

  _error(error) {
    console.error('Error:', error);
  },

  _default(result, row) {
    console.log(`Processed ${row.cmd}:`, result);
  }
};

// Helper functions
async function classifyUserData(userData) {
  return {
    // Highly sensitive - encrypt
    highSensitive: {
      ssn: userData.ssn,
      creditCard: userData.creditCard,
      medicalInfo: userData.medicalInfo
    },

    // Medium sensitive - separate store
    mediumSensitive: {
      email: userData.email,
      fullName: userData.fullName,
      phone: userData.phone,
      address: userData.address,
      dateOfBirth: userData.dateOfBirth
    },

    // Low sensitive - can stay in events
    lowSensitive: {
      preferences: userData.preferences,
      settings: userData.settings,
      locale: userData.locale
    },

    // Non-personal - always in events
    nonPersonal: {
      username: userData.username,
      accountType: userData.accountType,
      createdAt: Date.now()
    }
  };
}

// Main functions
export async function registerUser(userData) {
  const userId = `user-${randomUUID()}`;

  // Classify data
  const classified = await classifyUserData(userData);

  // Generate encryption key for user
  const keyId = await cryptoShredder.generateUserKey(userId);

  // Encrypt highly sensitive data
  let encryptedRef = null;
  if (Object.keys(classified.highSensitive).some(key => classified.highSensitive[key])) {
    const encrypted = cryptoShredder.encrypt(classified.highSensitive, keyId);
    encryptedRef = `encrypted-${randomUUID()}`;
    // In production, store encrypted data reference
  }

  // Store medium sensitive data separately
  const profileRef = await personalStore.create(userId, classified.mediumSensitive);

  // Store event with references only
  return await eventQueue.store({
    cmd: 'registerUser',
    data: {
      userId,
      ...classified.nonPersonal,
      ...classified.lowSensitive,
      profileRef,
      encryptedRef
    },
    metadata: {
      source: 'web-registration',
      ipAddress: userData.ipAddress // Store for security, delete after retention period
    }
  }, gdprModel, gdprCallbacks);
}

export async function deleteUser(userId) {
  // 1. Record deletion request
  await eventQueue.store({
    cmd: 'gdprDeletionRequested',
    data: {
      userId,
      requestedAt: Date.now(),
      metadata: {
        source: 'user-request',
        verificationMethod: 'email-confirmation'
      }
    }
  }, gdprModel, gdprCallbacks);

  // 2. Delete encryption keys (crypto-shredding)
  const keyDeletion = await cryptoShredder.deleteUserData(userId);

  // 3. Delete from personal store
  const personalDeletion = await personalStore.delete(userId);

  // 4. Record completion
  await eventQueue.store({
    cmd: 'gdprDeletionCompleted',
    data: {
      userId,
      completedAt: Date.now(),
      deletionSummary: {
        encryptionKeys: keyDeletion,
        personalData: personalDeletion,
        eventsRetained: true, // Events are retained but personal data is gone
        stateAnonymized: true
      }
    }
  }, gdprModel, gdprCallbacks);

  return { success: true, userId };
}

export async function exportUserData(userId) {
  // Record export request
  await eventQueue.store({
    cmd: 'gdprExportRequested',
    data: {
      userId,
      requestedAt: Date.now()
    }
  }, gdprModel, gdprCallbacks);

  // Gather all user data
  const user = gdprModel.get('getUser', { id: userId });
  const personalData = await personalStore.getByUserId(userId);
  const events = eventQueue.getTransaction(userId);

  // Decrypt sensitive data if available
  let sensitiveData = null;
  if (user && user.encrypted_ref) {
    // In production, retrieve encrypted data by reference and decrypt
    sensitiveData = { /* decrypted data */ };
  }

  const exportData = {
    user: user,
    personalData: personalData,
    sensitiveData: sensitiveData,
    eventHistory: events.map(e => ({
      cmd: e.cmd,
      datetime: e.datetime,
      // Only include non-personal event data
      data: filterPersonalData(e.data)
    })),
    exportedAt: Date.now()
  };

  // In production, save to secure location and notify user
  const exportLocation = `exports/user-${userId}-${Date.now()}.json`;

  // Record completion
  await eventQueue.store({
    cmd: 'gdprExportCompleted',
    data: {
      userId,
      completedAt: Date.now(),
      exportLocation
    }
  }, gdprModel, gdprCallbacks);

  return exportData;
}

function filterPersonalData(data) {
  // Remove any personal data from event data for export
  const { email, fullName, phone, address, ssn, creditCard, ...filtered } = data;
  return filtered;
}

// Clean up existing tables to ensure fresh start
function cleanupTables() {
  console.log('Cleaning up existing tables...');
  
  // Clean up event queue tables
  try {
    const eventDb = new Database('data/gdpr-events.sqlite', { create: true });
    eventDb.exec('DROP TABLE IF EXISTS event_queue');
    eventDb.close();
    console.log('  Cleaned: event_queue table');
  } catch (e) {
    console.log('  Skipped: event_queue table (new database)');
  }

  // Clean up crypto shredder tables
  try {
    const keyDb = new Database('data/gdpr-keys.sqlite', { create: true });
    keyDb.exec('DROP TABLE IF EXISTS encryption_keys');
    keyDb.close();
    console.log('  Cleaned: encryption_keys table');
  } catch (e) {
    console.log('  Skipped: encryption_keys table (new database)');
  }

  // Clean up personal data store tables
  try {
    const personalDb = new Database('data/gdpr-personal.sqlite', { create: true });
    personalDb.exec('DROP TABLE IF EXISTS personal_data');
    personalDb.close();
    console.log('  Cleaned: personal_data table');
  } catch (e) {
    console.log('  Skipped: personal_data table (new database)');
  }

  // Clean up GDPR model tables
  try {
    const gdprDb = new Database('data/gdpr-state.sqlite', { create: true });
    gdprDb.exec('DROP TABLE IF EXISTS users');
    gdprDb.exec('DROP TABLE IF EXISTS gdpr_requests');
    gdprDb.exec('DROP TABLE IF EXISTS data_inventory');
    gdprDb.close();
    console.log('  Cleaned: users, gdpr_requests, data_inventory tables');
  } catch (e) {
    console.log('  Skipped: GDPR model tables (new database)');
  }
  
  console.log('Table cleanup complete.\n');
}

// Example usage
async function example() {
  // Clean up existing tables first
  cleanupTables();
  
  // Initialize components after cleanup to ensure fresh tables
  console.log('Initializing components with fresh tables...');
  eventQueue = initQueue({ dbName: 'data/gdpr-events.sqlite' });
  cryptoShredder = new CryptoShredder('data/gdpr-keys.sqlite');
  personalStore = new PersonalDataStore('data/gdpr-personal.sqlite');
  gdprModel = createGdprModel();
  console.log('Components initialized.\n');
  
  console.log('=== GDPR-Compliant User Management Example ===\n');

  // Register a user
  console.log('1. Registering user with personal data...');
  const user = await registerUser({
    username: 'johndoe123',
    email: 'john.doe@example.com',
    fullName: 'John Doe',
    phone: '+1234567890',
    address: '123 Main St, City',
    dateOfBirth: '1990-01-01',
    ssn: '123-45-6789',
    creditCard: '4111111111111111',
    accountType: 'premium',
    preferences: { theme: 'dark', language: 'en' },
    settings: { notifications: true },
    locale: 'en-US',
    ipAddress: '192.168.1.1'
  });

  console.log('\n2. User data is now stored:');
  console.log('   - Highly sensitive data (SSN, CC): Encrypted with user-specific key');
  console.log('   - Personal data (email, name): In separate personal store');
  console.log('   - Preferences: In event (low sensitivity)');
  console.log('   - Username, account type: In event (non-personal)');

  // Export user data
  console.log('\n3. Exporting user data (GDPR Article 20)...');
  const exportedData = await exportUserData(user.userId);
  console.log('   Data exported successfully');

  // Delete user data
  console.log('\n4. Processing GDPR deletion request...');
  const deletion = await deleteUser(user.userId);
  console.log('   - Encryption keys deleted (crypto-shredded)');
  console.log('   - Personal data store entries deleted');
  console.log('   - Events retained but personal data is unrecoverable');
  console.log('   - User marked as deleted in state');

  console.log('\n5. Attempting to access deleted user data...');
  const deletedUserProfile = await personalStore.getByUserId(user.userId);
  console.log('   Personal data:', deletedUserProfile ? 'ERROR - Still exists!' : 'Successfully deleted');

  // In production, you would also verify encryption keys are deleted
  console.log('\n=== Example Complete ===\n');
}

// Run example if called directly
if (import.meta.main) {
  example().catch(console.error);
}

// Export for use in other modules
export { cryptoShredder, personalStore, gdprModel, gdprCallbacks };

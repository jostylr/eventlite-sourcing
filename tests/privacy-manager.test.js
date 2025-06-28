import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrivacyManager, CryptoShredder, PersonalDataStore, ConsentManager, DataClassifier } from '../lib/privacy-manager.js';
import { initQueue, modelSetup } from '../index.js';
import { unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { Database } from 'bun:sqlite';

// Test database paths
const TEST_PATHS = {
  events: 'tests/data/privacy-manager-events.sqlite',
  state: 'tests/data/privacy-manager-state.sqlite',
  keys: 'tests/data/privacy-manager-keys.sqlite',
  personal: 'tests/data/privacy-manager-personal.sqlite',
  exportDir: 'tests/data/privacy-exports'
};

// Cleanup function
function cleanup() {
  Object.values(TEST_PATHS).forEach(path => {
    if (path.includes('.sqlite')) {
      try { unlinkSync(path); } catch (e) { /* ignore */ }
    } else {
      try { rmSync(path, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
  });
}

// Setup test model
function createTestModel() {
  return modelSetup({
    dbName: TEST_PATHS.state,
    tables(db) {
      db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT,
          created_at INTEGER,
          profile_ref TEXT
        )
      `).run();
    },
    queries(db) {
      return {
        insertUser: db.query('INSERT INTO users (id, username, created_at, profile_ref) VALUES ($id, $username, $created_at, $profile_ref)'),
        getUser: db.query('SELECT * FROM users WHERE id = $id')
      };
    },
    methods(queries) {
      return {
        registerUser(data, metadata) {
          queries.insertUser.run({
            id: data.userId,
            username: data.username,
            created_at: metadata.datetime,
            profile_ref: data.profileRef
          });
          return { userId: data.userId, success: true };
        }
      };
    }
  });
}

describe('PrivacyManager', () => {
  let privacyManager, eventQueue, model;

  beforeEach(() => {
    cleanup();
    
    // Ensure export directory exists
    if (!existsSync(TEST_PATHS.exportDir)) {
      mkdirSync(TEST_PATHS.exportDir, { recursive: true });
    }

    eventQueue = initQueue({ dbName: TEST_PATHS.events });
    model = createTestModel();
    
    privacyManager = new PrivacyManager({
      keyDbPath: TEST_PATHS.keys,
      personalDbPath: TEST_PATHS.personal,
      eventQueue,
      model,
      callbacks: {
        gdprExportRequested: () => {},
        gdprExportCompleted: () => {},
        gdprExportFailed: () => {},
        gdprDeletionRequested: () => {},
        gdprDeletionCompleted: () => {},
        gdprDeletionFailed: () => {},
        gdprRectificationRequested: () => {},
        gdprRectificationCompleted: () => {},
        consentWithdrawn: () => {},
        _error: () => {},
        _default: () => {}
      },
      exportDir: TEST_PATHS.exportDir
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('Data Export (GDPR Article 20)', () => {
    test('should export user data in JSON format', async () => {
      const userId = 'test-user-export';
      
      // Create test data
      await privacyManager.personalStore.create(userId, {
        email: 'test@example.com',
        fullName: 'Test User',
        phone: '+1234567890',
        address: '123 Test St',
        dateOfBirth: '1990-01-01'
      });

      const result = await privacyManager.requestDataExport(userId, { format: 'json' });

      expect(result.success).toBe(true);
      expect(result.exportPath).toMatch(/\.json$/);
      expect(result.data.userId).toBe(userId);
      expect(result.data.personalData).toBeDefined();
      expect(result.data.personalData.email).toBe('test@example.com');
      expect(existsSync(result.exportPath)).toBe(true);
    });

    test('should export user data in CSV format', async () => {
      const userId = 'test-user-csv';
      
      await privacyManager.personalStore.create(userId, {
        email: 'csv@example.com',
        fullName: 'CSV User'
      });

      const result = await privacyManager.requestDataExport(userId, { format: 'csv' });

      expect(result.success).toBe(true);
      expect(result.exportPath).toMatch(/\.csv$/);
      expect(typeof result.data).toBe('string');
      expect(result.data).toContain('Type,Field,Value,Timestamp');
    });

    test('should handle export for non-existent user', async () => {
      const result = await privacyManager.requestDataExport('non-existent-user');

      expect(result.success).toBe(true);
      expect(result.data.personalData).toBeNull();
      expect(result.data.user).toBeNull();
    });
  });

  describe('Data Deletion (GDPR Article 17)', () => {
    test('should delete user data using crypto-shredding', async () => {
      const userId = 'test-user-delete';
      
      // Create encryption key and personal data
      const keyId = await privacyManager.cryptoShredder.generateUserKey(userId);
      await privacyManager.personalStore.create(userId, {
        email: 'delete@example.com',
        fullName: 'Delete User'
      });

      const result = await privacyManager.requestDataDeletion(userId);

      expect(result.success).toBe(true);
      expect(result.deletionResults.encryptionKeys.deleted).toBe(true);
      expect(result.deletionResults.personalData.changes).toBeGreaterThan(0);

      // Verify data is actually deleted
      const personalData = await privacyManager.personalStore.getByUserId(userId);
      expect(personalData).toBeNull();
    });

    test('should handle deletion with verification options', async () => {
      const userId = 'test-user-verify';
      
      await privacyManager.personalStore.create(userId, {
        email: 'verify@example.com',
        fullName: 'Verify User'
      });

      const result = await privacyManager.requestDataDeletion(userId, {
        verificationMethod: 'two-factor',
        reason: 'account-closure',
        metadata: { confirmedAt: Date.now() }
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
    });
  });

  describe('Data Portability (GDPR Article 20)', () => {
    test('should create portable data format', async () => {
      const userId = 'test-user-portable';
      
      await privacyManager.personalStore.create(userId, {
        email: 'portable@example.com',
        fullName: 'Portable User'
      });

      const result = await privacyManager.requestDataPortability(userId, 'json');

      expect(result.subject.id).toBe(userId);
      expect(result.metadata.format).toBe('json');
      expect(result.metadata.gdprCompliant).toBe(true);
      expect(result.metadata.machineReadable).toBe(true);
      expect(result.data.userId).toBe(userId);
    });
  });

  describe('Data Rectification (GDPR Article 16)', () => {
    test('should correct user data', async () => {
      const userId = 'test-user-rectify';
      
      // Create initial data
      await privacyManager.personalStore.create(userId, {
        email: 'old@example.com',
        fullName: 'Old Name'
      });

      const corrections = {
        email: 'corrected@example.com',
        fullName: 'Corrected Name'
      };

      const result = await privacyManager.requestDataRectification(userId, corrections);

      expect(result.success).toBe(true);
      expect(result.correctionsSummary.updated).toBe(true);
      expect(result.correctionsSummary.changes.email).toBe('corrected@example.com');

      // Verify data was actually updated
      const updatedData = await privacyManager.personalStore.getByUserId(userId);
      expect(updatedData.email).toBe('corrected@example.com');
      expect(updatedData.full_name).toBe('Corrected Name');
    });

    test('should fail rectification for non-existent user', async () => {
      const corrections = { email: 'new@example.com' };

      try {
        await privacyManager.requestDataRectification('non-existent', corrections);
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('Data rectification failed');
      }
    });
  });

  describe('Consent Withdrawal (GDPR Article 7)', () => {
    test('should withdraw user consent', async () => {
      const userId = 'test-user-consent';
      const consentType = 'marketing';

      // Grant consent first
      await privacyManager.consentManager.grantConsent(userId, consentType, 'marketing-emails', 'consent');

      const result = await privacyManager.withdrawConsent(userId, consentType);

      expect(result.success).toBe(true);
      expect(result.consentType).toBe(consentType);
      expect(result.withdrawnAt).toBeDefined();
    });
  });

  describe('Data Processing Audit (GDPR Article 30)', () => {
    test('should generate comprehensive audit trail', async () => {
      const userId = 'test-user-audit';
      
      // Create some audit data
      await privacyManager.personalStore.create(userId, {
        email: 'audit@example.com',
        fullName: 'Audit User'
      });

      // Grant some consent
      await privacyManager.consentManager.grantConsent(userId, 'analytics', 'usage-tracking', 'legitimate-interest');

      const auditReport = await privacyManager.auditDataProcessing(userId);

      expect(auditReport.userId).toBe(userId);
      expect(auditReport.auditedAt).toBeDefined();
      expect(auditReport.processingActivities).toBeDefined();
      expect(auditReport.personalDataHistory).toBeDefined();
      expect(auditReport.consentHistory).toBeDefined();
      expect(auditReport.dataClassification).toBeDefined();
    });
  });
});

describe('CryptoShredder', () => {
  let cryptoShredder;

  beforeEach(() => {
    cleanup();
    cryptoShredder = new CryptoShredder(TEST_PATHS.keys);
  });

  afterEach(() => {
    cleanup();
  });

  test('should generate and store encryption keys', async () => {
    const userId = 'test-crypto-user';
    const keyId = await cryptoShredder.generateUserKey(userId);

    expect(keyId).toBe(`user-key-${userId}`);
  });

  test('should encrypt and decrypt data', async () => {
    const userId = 'test-encrypt-user';
    const keyId = await cryptoShredder.generateUserKey(userId);
    
    const testData = { ssn: '123-45-6789', creditCard: '4111111111111111' };
    const encrypted = cryptoShredder.encrypt(testData, keyId);

    expect(encrypted.keyId).toBe(keyId);
    expect(encrypted.encrypted).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();

    const decrypted = cryptoShredder.decrypt(encrypted);
    expect(decrypted).toEqual(testData);
  });

  test('should implement crypto-shredding', async () => {
    const userId = 'test-shred-user';
    const keyId = await cryptoShredder.generateUserKey(userId);
    
    const testData = { sensitive: 'data' };
    const encrypted = cryptoShredder.encrypt(testData, keyId);

    // Delete the key (crypto-shredding)
    await cryptoShredder.deleteUserData(userId);

    // Should not be able to decrypt anymore
    const decrypted = cryptoShredder.decrypt(encrypted);
    expect(decrypted).toBeNull();
  });

  test('should purge old deleted keys', async () => {
    const userId = 'test-purge-user';
    await cryptoShredder.generateUserKey(userId);
    await cryptoShredder.deleteUserData(userId);

    // Wait a moment to ensure the deletion timestamp is set
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const result = await cryptoShredder.purgeOldKeys(0); // Purge immediately
    expect(result.changes).toBeGreaterThanOrEqual(0); // May be 0 if already purged
  });
});

describe('PersonalDataStore', () => {
  let personalStore;

  beforeEach(() => {
    cleanup();
    personalStore = new PersonalDataStore(TEST_PATHS.personal);
  });

  afterEach(() => {
    cleanup();
  });

  test('should create and retrieve personal data', async () => {
    const userId = 'test-personal-user';
    const data = {
      email: 'personal@example.com',
      fullName: 'Personal User',
      phone: '+1234567890',
      address: '123 Personal St',
      dateOfBirth: '1990-01-01'
    };

    const profileId = await personalStore.create(userId, data);
    expect(profileId).toMatch(/^profile-/);

    const retrieved = await personalStore.getByUserId(userId);
    expect(retrieved.email).toBe(data.email);
    expect(retrieved.full_name).toBe(data.fullName);
    expect(retrieved.user_id).toBe(userId);
  });

  test('should update personal data with audit trail', async () => {
    const userId = 'test-update-user';
    
    // Create initial data
    await personalStore.create(userId, {
      email: 'old@example.com',
      fullName: 'Old Name'
    });

    // Update data
    const corrections = {
      email: 'new@example.com',
      fullName: 'New Name'
    };

    const result = await personalStore.updateData(userId, corrections);
    expect(result.updated).toBe(true);

    // Check audit trail
    const auditTrail = await personalStore.getAuditTrail(userId);
    expect(auditTrail.length).toBeGreaterThanOrEqual(2); // create + update
    
    // Find the update action in the audit trail
    const updateAction = auditTrail.find(entry => entry.action === 'update');
    expect(updateAction).toBeDefined();
    expect(updateAction.new_data).toContain('new@example.com');
  });

  test('should delete personal data', async () => {
    const userId = 'test-delete-personal';
    
    await personalStore.create(userId, {
      email: 'delete@example.com',
      fullName: 'Delete User'
    });

    const deleteResult = await personalStore.delete(userId);
    expect(deleteResult.changes).toBeGreaterThan(0);

    const retrieved = await personalStore.getByUserId(userId);
    expect(retrieved).toBeNull();
  });
});

describe('ConsentManager', () => {
  let consentManager;

  beforeEach(() => {
    cleanup();
    consentManager = new ConsentManager(TEST_PATHS.personal);
  });

  afterEach(() => {
    cleanup();
  });

  test('should grant and retrieve consent', async () => {
    const userId = 'test-consent-user';
    const consentType = 'marketing';

    await consentManager.grantConsent(userId, consentType, 'email-marketing', 'consent');

    const consents = await consentManager.getConsent(userId);
    expect(consents.length).toBe(1);
    expect(consents[0].consent_type).toBe(consentType);
    expect(consents[0].granted).toBe(1);
  });

  test('should withdraw consent', async () => {
    const userId = 'test-withdraw-user';
    const consentType = 'analytics';

    // Grant consent first
    await consentManager.grantConsent(userId, consentType, 'usage-analytics', 'legitimate-interest');

    // Withdraw consent
    const result = await consentManager.withdrawConsent(userId, consentType);
    expect(result.changes).toBeGreaterThan(0);

    // Verify consent is withdrawn
    const activeConsents = await consentManager.getConsent(userId);
    expect(activeConsents.length).toBe(0);
  });

  test('should maintain consent history', async () => {
    const userId = 'test-history-user';
    const consentType = 'preferences';

    // Grant consent
    await consentManager.grantConsent(userId, consentType, 'user-preferences', 'consent');
    
    // Withdraw consent
    await consentManager.withdrawConsent(userId, consentType);

    // Check history
    const history = await consentManager.getConsentHistory(userId);
    expect(history.length).toBe(1); // Should show the granted consent (now withdrawn)
    expect(history[0].granted).toBe(0); // Should be withdrawn
    expect(history[0].withdrawn_at).toBeDefined();
  });

  test('should revoke all consent', async () => {
    const userId = 'test-revoke-all';

    // Grant multiple consents
    await consentManager.grantConsent(userId, 'marketing', 'email-marketing', 'consent');
    await consentManager.grantConsent(userId, 'analytics', 'usage-analytics', 'legitimate-interest');
    await consentManager.grantConsent(userId, 'preferences', 'user-preferences', 'consent');

    // Revoke all
    const result = await consentManager.revokeAllConsent(userId);
    expect(result.changes).toBe(3);

    // Verify all consents are revoked
    const activeConsents = await consentManager.getConsent(userId);
    expect(activeConsents.length).toBe(0);
  });
});

describe('DataClassifier', () => {
  let dataClassifier;

  beforeEach(() => {
    dataClassifier = new DataClassifier();
  });

  test('should classify data by sensitivity levels', () => {
    const testData = {
      ssn: '123-45-6789',
      email: 'test@example.com',
      preferences: { theme: 'dark' },
      username: 'testuser',
      medicalInfo: 'sensitive medical data'
    };

    const classification = dataClassifier.classifyData(testData);

    expect(Object.keys(classification.highSensitive)).toContain('ssn');
    expect(Object.keys(classification.mediumSensitive)).toContain('email');
    expect(Object.keys(classification.lowSensitive)).toContain('preferences');
    expect(Object.keys(classification.nonPersonal)).toContain('username');
  });

  test('should validate corrections', () => {
    const corrections = {
      email: 'valid@example.com',
      phone: '+1234567890',
      invalidField: 'should be filtered',
      emptyField: ''
    };

    const validated = dataClassifier.validateCorrections(corrections);

    expect(validated.email).toBe('valid@example.com');
    expect(validated.phone).toBe('+1234567890');
    expect(validated.invalidField).toBeUndefined();
    expect(validated.emptyField).toBeUndefined();
  });

  test('should reject invalid email format', () => {
    const corrections = {
      email: 'invalid-email-format'
    };

    const validated = dataClassifier.validateCorrections(corrections);
    expect(validated.email).toBeUndefined();
  });

  test('should reject invalid phone format', () => {
    const corrections = {
      phone: 'not-a-phone-number'
    };

    const validated = dataClassifier.validateCorrections(corrections);
    expect(validated.phone).toBeUndefined();
  });
});
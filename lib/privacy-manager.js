import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'crypto';
import { Database } from 'bun:sqlite';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * PrivacyManager - Standardized GDPR helper methods for EventLite Sourcing
 * 
 * Provides a comprehensive toolkit for GDPR compliance including:
 * - Data export and portability
 * - Data deletion (crypto-shredding)
 * - Data rectification
 * - Consent management
 * - Data processing auditing
 */
export class PrivacyManager {
  constructor(options = {}) {
    this.options = {
      keyDbPath: options.keyDbPath || 'data/gdpr-keys.sqlite',
      personalDbPath: options.personalDbPath || 'data/gdpr-personal.sqlite',
      eventQueue: options.eventQueue,
      model: options.model,
      exportDir: options.exportDir || 'data/exports',
      retentionDays: options.retentionDays || 30,
      ...options
    };

    // Initialize crypto shredder
    this.cryptoShredder = new CryptoShredder(this.options.keyDbPath);
    
    // Initialize personal data store
    this.personalStore = new PersonalDataStore(this.options.personalDbPath);
    
    // Initialize consent manager
    this.consentManager = new ConsentManager(this.options.personalDbPath);
    
    // Initialize data classifier
    this.dataClassifier = new DataClassifier();

    // Ensure export directory exists
    if (!existsSync(this.options.exportDir)) {
      mkdirSync(this.options.exportDir, { recursive: true });
    }
  }

  /**
   * Export all user data (GDPR Article 20 - Data Portability)
   * @param {string} userId - User identifier
   * @param {Object} options - Export options
   * @returns {Promise<Object>} Export result with data and location
   */
  async requestDataExport(userId, options = {}) {
    const requestId = randomUUID();
    const timestamp = Date.now();
    const format = options.format || 'json';

    try {
      // Record export request if event queue available
      if (this.options.eventQueue && this.options.model) {
        await this.options.eventQueue.store({
          cmd: 'gdprExportRequested',
          data: {
            userId,
            requestId,
            requestedAt: timestamp,
            format,
            metadata: options.metadata || {}
          }
        }, this.options.model, this.options.callbacks || {});
      }

      // Gather all user data
      const exportData = await this._gatherUserData(userId);

      // Format data according to request
      const formattedData = this._formatExportData(exportData, format);

      // Save export file
      const filename = `user-${userId}-${timestamp}.${format}`;
      const exportPath = join(this.options.exportDir, filename);
      
      if (format === 'json') {
        writeFileSync(exportPath, JSON.stringify(formattedData, null, 2));
      } else if (format === 'csv') {
        writeFileSync(exportPath, this._convertToCSV(formattedData));
      } else {
        writeFileSync(exportPath, String(formattedData));
      }

      // Record completion
      if (this.options.eventQueue && this.options.model) {
        await this.options.eventQueue.store({
          cmd: 'gdprExportCompleted',
          data: {
            userId,
            requestId,
            completedAt: Date.now(),
            exportLocation: exportPath,
            exportSize: formattedData.length || 0
          }
        }, this.options.model, this.options.callbacks || {});
      }

      return {
        success: true,
        requestId,
        exportPath,
        data: formattedData,
        exportedAt: timestamp
      };

    } catch (error) {
      // Record failure
      if (this.options.eventQueue && this.options.model) {
        await this.options.eventQueue.store({
          cmd: 'gdprExportFailed',
          data: {
            userId,
            requestId,
            error: error.message,
            failedAt: Date.now()
          }
        }, this.options.model, this.options.callbacks || {});
      }

      throw new Error(`Data export failed: ${error.message}`);
    }
  }

  /**
   * Delete user data using crypto-shredding (GDPR Article 17 - Right to Erasure)
   * @param {string} userId - User identifier
   * @param {Object} options - Deletion options
   * @returns {Promise<Object>} Deletion result
   */
  async requestDataDeletion(userId, options = {}) {
    const requestId = randomUUID();
    const timestamp = Date.now();

    try {
      // Record deletion request
      if (this.options.eventQueue && this.options.model) {
        await this.options.eventQueue.store({
          cmd: 'gdprDeletionRequested',
          data: {
            userId,
            requestId,
            requestedAt: timestamp,
            verificationMethod: options.verificationMethod || 'email',
            reason: options.reason || 'user-request',
            metadata: options.metadata || {}
          }
        }, this.options.model, this.options.callbacks || {});
      }

      // Perform deletion steps
      const deletionResults = {
        encryptionKeys: await this.cryptoShredder.deleteUserData(userId),
        personalData: await this.personalStore.delete(userId),
        consent: await this.consentManager.revokeAllConsent(userId),
        timestamp
      };

      // Record completion
      if (this.options.eventQueue && this.options.model) {
        await this.options.eventQueue.store({
          cmd: 'gdprDeletionCompleted',
          data: {
            userId,
            requestId,
            completedAt: Date.now(),
            deletionSummary: {
              ...deletionResults,
              eventsRetained: true,
              stateAnonymized: true
            }
          }
        }, this.options.model, this.options.callbacks || {});
      }

      return {
        success: true,
        requestId,
        deletionResults,
        deletedAt: timestamp
      };

    } catch (error) {
      // Record failure
      if (this.options.eventQueue && this.options.model) {
        await this.options.eventQueue.store({
          cmd: 'gdprDeletionFailed',
          data: {
            userId,
            requestId,
            error: error.message,
            failedAt: Date.now()
          }
        }, this.options.model, this.options.callbacks || {});
      }

      throw new Error(`Data deletion failed: ${error.message}`);
    }
  }

  /**
   * Data portability in structured format (GDPR Article 20)
   * @param {string} userId - User identifier
   * @param {string} targetFormat - Target format (json, xml, csv)
   * @returns {Promise<Object>} Portable data
   */
  async requestDataPortability(userId, targetFormat = 'json') {
    const exportResult = await this.requestDataExport(userId, { 
      format: targetFormat,
      metadata: { purpose: 'data-portability' }
    });

    // Structure data for portability
    const portableData = {
      subject: {
        id: userId,
        exportedAt: exportResult.exportedAt
      },
      data: exportResult.data,
      metadata: {
        format: targetFormat,
        version: '1.0',
        gdprCompliant: true,
        machineReadable: true
      }
    };

    return portableData;
  }

  /**
   * Correct/update user data (GDPR Article 16 - Right to Rectification)
   * @param {string} userId - User identifier
   * @param {Object} corrections - Data corrections to apply
   * @returns {Promise<Object>} Rectification result
   */
  async requestDataRectification(userId, corrections) {
    const requestId = randomUUID();
    const timestamp = Date.now();

    try {
      // Validate corrections
      const validatedCorrections = this.dataClassifier.validateCorrections(corrections);

      // Record rectification request
      if (this.options.eventQueue && this.options.model) {
        await this.options.eventQueue.store({
          cmd: 'gdprRectificationRequested',
          data: {
            userId,
            requestId,
            requestedAt: timestamp,
            corrections: validatedCorrections,
            metadata: corrections.metadata || {}
          }
        }, this.options.model, this.options.callbacks || {});
      }

      // Apply corrections to personal data store
      const rectificationResults = await this.personalStore.updateData(userId, validatedCorrections);

      // Record completion
      if (this.options.eventQueue && this.options.model) {
        await this.options.eventQueue.store({
          cmd: 'gdprRectificationCompleted',
          data: {
            userId,
            requestId,
            completedAt: Date.now(),
            correctionsSummary: rectificationResults
          }
        }, this.options.model, this.options.callbacks || {});
      }

      return {
        success: true,
        requestId,
        correctionsSummary: rectificationResults,
        correctedAt: timestamp
      };

    } catch (error) {
      throw new Error(`Data rectification failed: ${error.message}`);
    }
  }

  /**
   * Withdraw specific consent (GDPR Article 7)
   * @param {string} userId - User identifier
   * @param {string} consentType - Type of consent to withdraw
   * @returns {Promise<Object>} Consent withdrawal result
   */
  async withdrawConsent(userId, consentType) {
    const requestId = randomUUID();
    const timestamp = Date.now();

    try {
      // Record consent withdrawal
      if (this.options.eventQueue && this.options.model) {
        await this.options.eventQueue.store({
          cmd: 'consentWithdrawn',
          data: {
            userId,
            requestId,
            consentType,
            withdrawnAt: timestamp
          }
        }, this.options.model, this.options.callbacks || {});
      }

      // Withdraw consent
      const withdrawalResult = await this.consentManager.withdrawConsent(userId, consentType);

      return {
        success: true,
        requestId,
        consentType,
        withdrawalResult,
        withdrawnAt: timestamp
      };

    } catch (error) {
      throw new Error(`Consent withdrawal failed: ${error.message}`);
    }
  }

  /**
   * Audit data processing activities for a user (GDPR Article 30)
   * @param {string} userId - User identifier
   * @returns {Promise<Object>} Audit trail
   */
  async auditDataProcessing(userId) {
    try {
      // Get all events related to user
      const events = this.options.eventQueue ? 
        this.options.eventQueue.getByCorrelationId ? 
          this.options.eventQueue.getByCorrelationId(userId) : 
          [] : [];

      // Get personal data audit trail
      const personalDataAudit = await this.personalStore.getAuditTrail(userId);

      // Get consent history
      const consentHistory = await this.consentManager.getConsentHistory(userId);

      // Compile audit report
      const auditReport = {
        userId,
        auditedAt: Date.now(),
        processingActivities: {
          events: events.length,
          personalDataChanges: personalDataAudit.length,
          consentChanges: consentHistory.length
        },
        eventHistory: events.map(e => ({
          id: e.id,
          cmd: e.cmd,
          datetime: e.datetime,
          causationId: e.causation_id,
          correlationId: e.correlation_id,
          purpose: this._determinePurpose(e.cmd)
        })),
        personalDataHistory: personalDataAudit,
        consentHistory,
        dataClassification: await this._getDataClassification(userId)
      };

      return auditReport;

    } catch (error) {
      throw new Error(`Data processing audit failed: ${error.message}`);
    }
  }

  // Private helper methods

  async _gatherUserData(userId) {
    const data = {
      userId,
      gatheredAt: Date.now()
    };

    // Get user from model if available
    if (this.options.model && this.options.model.get) {
      try {
        data.user = this.options.model.get('getUser', { id: userId });
      } catch (e) {
        data.user = null;
      }
    }

    // Get personal data
    data.personalData = await this.personalStore.getByUserId(userId);

    // Get consent records
    data.consent = await this.consentManager.getConsent(userId);

    // Get events if available
    if (this.options.eventQueue) {
      try {
        data.events = this.options.eventQueue.getByCorrelationId ? 
          this.options.eventQueue.getByCorrelationId(userId) : [];
      } catch (e) {
        data.events = [];
      }
    }

    // Get encrypted data (if keys still exist)
    if (data.user && data.user.encrypted_ref) {
      try {
        data.sensitiveData = this.cryptoShredder.decrypt({ keyId: `user-key-${userId}` });
      } catch (e) {
        data.sensitiveData = null; // Keys may have been deleted
      }
    }

    return data;
  }

  _formatExportData(data, format) {
    if (format === 'json') {
      return data;
    }

    if (format === 'csv') {
      return this._convertToCSV(data);
    }

    if (format === 'xml') {
      return this._convertToXML(data);
    }

    return JSON.stringify(data, null, 2);
  }

  _convertToCSV(data) {
    const rows = [];
    
    // Headers
    rows.push('Type,Field,Value,Timestamp');

    // User data
    if (data.user) {
      Object.entries(data.user).forEach(([key, value]) => {
        rows.push(`user,${key},${value},${data.gatheredAt}`);
      });
    }

    // Personal data
    if (data.personalData) {
      Object.entries(data.personalData).forEach(([key, value]) => {
        rows.push(`personal,${key},${value},${data.gatheredAt}`);
      });
    }

    return rows.join('\n');
  }

  _convertToXML(data) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<userData>\n';
    
    Object.entries(data).forEach(([key, value]) => {
      xml += `  <${key}>${this._xmlEscape(JSON.stringify(value))}</${key}>\n`;
    });
    
    xml += '</userData>';
    return xml;
  }

  _xmlEscape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _determinePurpose(cmd) {
    const purposeMap = {
      'registerUser': 'account-creation',
      'updateProfile': 'profile-management',
      'gdprExportRequested': 'data-portability',
      'gdprDeletionRequested': 'right-to-erasure',
      'consentGiven': 'consent-management',
      'consentWithdrawn': 'consent-management'
    };

    return purposeMap[cmd] || 'general-processing';
  }

  async _getDataClassification(userId) {
    const personalData = await this.personalStore.getByUserId(userId);
    return this.dataClassifier.classifyData(personalData);
  }
}

/**
 * CryptoShredder - Handles encryption key management for GDPR compliance
 */
class CryptoShredder {
  constructor(keyDbPath = 'data/gdpr-keys.sqlite') {
    this.db = new Database(keyDbPath, { create: true });
    this.algorithm = 'aes-256-gcm';

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
    if (!keyRow) return null;

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
      return null;
    }
  }

  async deleteUserData(userId) {
    const keyId = `user-key-${userId}`;
    this.queries.delete.run(keyId);
    return { keyId, deleted: true };
  }

  async purgeOldKeys(daysOld = 30) {
    const cutoff = Math.floor(Date.now() / 1000) - (daysOld * 24 * 60 * 60);
    return this.queries.purge.run(cutoff);
  }
}

/**
 * PersonalDataStore - Manages personal data separately from events
 */
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
        updated_at INTEGER,
        deleted_at INTEGER,
        UNIQUE(user_id, deleted_at)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS personal_data_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        old_data TEXT,
        new_data TEXT,
        changed_at INTEGER DEFAULT (unixepoch())
      )
    `);

    this.queries = {
      create: this.db.prepare(`
        INSERT INTO personal_data (profile_id, user_id, email, full_name, phone, address, date_of_birth)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      get: this.db.prepare('SELECT * FROM personal_data WHERE profile_id = ? AND deleted_at IS NULL'),
      getByUserId: this.db.prepare('SELECT * FROM personal_data WHERE user_id = ? AND deleted_at IS NULL'),
      update: this.db.prepare(`
        UPDATE personal_data 
        SET email = ?, full_name = ?, phone = ?, address = ?, date_of_birth = ?, updated_at = unixepoch()
        WHERE user_id = ? AND deleted_at IS NULL
      `),
      delete: this.db.prepare('UPDATE personal_data SET deleted_at = unixepoch() WHERE user_id = ? AND deleted_at IS NULL'),
      audit: this.db.prepare('INSERT INTO personal_data_audit (user_id, action, old_data, new_data) VALUES (?, ?, ?, ?)'),
      getAudit: this.db.prepare('SELECT * FROM personal_data_audit WHERE user_id = ? ORDER BY changed_at DESC')
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

    this.queries.audit.run(userId, 'create', null, JSON.stringify(data));
    return profileId;
  }

  async updateData(userId, corrections) {
    const current = this.queries.getByUserId.get(userId);
    if (!current) throw new Error('User not found');

    const updated = {
      email: corrections.email || current.email,
      fullName: corrections.fullName || current.full_name,
      phone: corrections.phone || current.phone,
      address: corrections.address || current.address,
      dateOfBirth: corrections.dateOfBirth || current.date_of_birth
    };

    this.queries.update.run(
      updated.email,
      updated.fullName,
      updated.phone,
      updated.address,
      updated.dateOfBirth,
      userId
    );

    this.queries.audit.run(userId, 'update', JSON.stringify(current), JSON.stringify(updated));
    return { updated: true, changes: corrections };
  }

  async get(profileId) {
    return this.queries.get.get(profileId);
  }

  async getByUserId(userId) {
    return this.queries.getByUserId.get(userId);
  }

  async delete(userId) {
    const current = this.queries.getByUserId.get(userId);
    this.queries.audit.run(userId, 'delete', JSON.stringify(current), null);
    return this.queries.delete.run(userId);
  }

  async getAuditTrail(userId) {
    return this.queries.getAudit.all(userId);
  }
}

/**
 * ConsentManager - Manages user consent records
 */
class ConsentManager {
  constructor(dbPath = 'data/gdpr-personal.sqlite') {
    this.db = new Database(dbPath, { create: true });

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS consent_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        consent_type TEXT NOT NULL,
        granted BOOLEAN NOT NULL,
        granted_at INTEGER,
        withdrawn_at INTEGER,
        purpose TEXT,
        legal_basis TEXT,
        UNIQUE(user_id, consent_type, granted_at)
      )
    `);

    this.queries = {
      grant: this.db.prepare(`
        INSERT INTO consent_records (user_id, consent_type, granted, granted_at, purpose, legal_basis)
        VALUES (?, ?, 1, unixepoch(), ?, ?)
      `),
      withdraw: this.db.prepare(`
        UPDATE consent_records 
        SET granted = 0, withdrawn_at = unixepoch()
        WHERE user_id = ? AND consent_type = ? AND granted = 1 AND withdrawn_at IS NULL
      `),
      revokeAll: this.db.prepare(`
        UPDATE consent_records 
        SET granted = 0, withdrawn_at = unixepoch()
        WHERE user_id = ? AND granted = 1 AND withdrawn_at IS NULL
      `),
      get: this.db.prepare('SELECT * FROM consent_records WHERE user_id = ? ORDER BY granted_at DESC'),
      getCurrent: this.db.prepare('SELECT * FROM consent_records WHERE user_id = ? AND granted = 1 AND withdrawn_at IS NULL')
    };
  }

  async grantConsent(userId, consentType, purpose, legalBasis = 'consent') {
    return this.queries.grant.run(userId, consentType, purpose, legalBasis);
  }

  async withdrawConsent(userId, consentType) {
    return this.queries.withdraw.run(userId, consentType);
  }

  async revokeAllConsent(userId) {
    return this.queries.revokeAll.run(userId);
  }

  async getConsent(userId) {
    return this.queries.getCurrent.all(userId);
  }

  async getConsentHistory(userId) {
    return this.queries.get.all(userId);
  }
}

/**
 * DataClassifier - Classifies data for GDPR compliance
 */
class DataClassifier {
  constructor() {
    this.sensitivityLevels = {
      'HIGH_SENSITIVE': ['ssn', 'creditCard', 'medicalInfo', 'biometric'],
      'MEDIUM_SENSITIVE': ['email', 'fullName', 'phone', 'address', 'dateOfBirth'],
      'LOW_SENSITIVE': ['preferences', 'settings', 'locale'],
      'NON_PERSONAL': ['username', 'accountType', 'createdAt']
    };
  }

  classifyData(data) {
    const classification = {
      highSensitive: {},
      mediumSensitive: {},
      lowSensitive: {},
      nonPersonal: {}
    };

    Object.entries(data || {}).forEach(([key, value]) => {
      const level = this._getSensitivityLevel(key);
      
      switch (level) {
        case 'HIGH_SENSITIVE':
          classification.highSensitive[key] = value;
          break;
        case 'MEDIUM_SENSITIVE':
          classification.mediumSensitive[key] = value;
          break;
        case 'LOW_SENSITIVE':
          classification.lowSensitive[key] = value;
          break;
        default:
          classification.nonPersonal[key] = value;
      }
    });

    return classification;
  }

  validateCorrections(corrections) {
    const validated = {};
    
    Object.entries(corrections).forEach(([key, value]) => {
      if (this._isValidField(key) && this._isValidValue(key, value)) {
        validated[key] = value;
      }
    });

    return validated;
  }

  _getSensitivityLevel(field) {
    for (const [level, fields] of Object.entries(this.sensitivityLevels)) {
      if (fields.includes(field)) {
        return level;
      }
    }
    return 'NON_PERSONAL';
  }

  _isValidField(field) {
    const allowedFields = Object.values(this.sensitivityLevels).flat();
    return allowedFields.includes(field);
  }

  _isValidValue(field, value) {
    // Basic validation - can be extended
    if (field === 'email') {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    
    if (field === 'phone') {
      return /^[\+]?[1-9][\d]{0,15}$/.test(value);
    }

    return value != null && value !== '';
  }
}

export default PrivacyManager;
export { CryptoShredder, PersonalDataStore, ConsentManager, DataClassifier };
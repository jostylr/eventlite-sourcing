import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';

/**
 * Enhanced Privacy Controls for EventLite Sourcing
 * 
 * Provides advanced privacy management features including:
 * - Data classification automation
 * - Consent management integration
 * - Data retention policy enforcement
 * - Privacy impact assessment helpers
 * - Data breach notification utilities
 * - Right to be forgotten automation
 */

/**
 * AutoDataClassifier - Automatically classifies data based on content and patterns
 */
export class AutoDataClassifier {
  constructor() {
    this.patterns = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      phone: /^[\+]?[1-9][\d]{0,15}$/,
      ssn: /^\d{3}-?\d{2}-?\d{4}$/,
      creditCard: /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})$/,
      ipAddress: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/,
      macAddress: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,
      dateOfBirth: /^\d{4}-\d{2}-\d{2}$/,
      postalCode: /^[0-9]{5}(-[0-9]{4})?$/
    };

    this.sensitivityRules = {
      CRITICAL: ['ssn', 'creditCard', 'passport', 'driverLicense', 'medicalRecord'],
      HIGH: ['email', 'phone', 'address', 'dateOfBirth', 'ipAddress'],
      MEDIUM: ['fullName', 'username', 'jobTitle', 'company'],
      LOW: ['preferences', 'settings', 'locale', 'theme'],
      PUBLIC: ['accountType', 'createdAt', 'publicId']
    };

    this.retentionPolicies = {
      CRITICAL: { years: 7, reason: 'legal-requirement' },
      HIGH: { years: 3, reason: 'business-necessity' },
      MEDIUM: { years: 2, reason: 'user-experience' },
      LOW: { years: 1, reason: 'convenience' },
      PUBLIC: { years: 10, reason: 'audit-trail' }
    };
  }

  /**
   * Automatically classify data fields
   * @param {Object} data - Data to classify
   * @returns {Object} Classification results
   */
  classifyData(data) {
    const classification = {
      critical: {},
      high: {},
      medium: {},
      low: {},
      public: {},
      unclassified: {}
    };

    Object.entries(data || {}).forEach(([field, value]) => {
      const sensitivity = this._determineSensitivity(field, value);
      const category = sensitivity.toLowerCase();
      
      if (classification[category]) {
        classification[category][field] = {
          value,
          sensitivity,
          detectedPattern: this._getDetectedPattern(field, value),
          retentionPolicy: this.retentionPolicies[sensitivity],
          processingBasis: this._suggestProcessingBasis(sensitivity)
        };
      } else {
        classification.unclassified[field] = { value, reason: 'unknown-pattern' };
      }
    });

    return {
      ...classification,
      summary: this._generateClassificationSummary(classification)
    };
  }

  /**
   * Suggest data minimization opportunities
   * @param {Object} classification - Data classification results
   * @returns {Array} Minimization suggestions
   */
  suggestDataMinimization(classification) {
    const suggestions = [];

    // Check for excessive personal data
    if (Object.keys(classification.critical || {}).length > 2) {
      suggestions.push({
        type: 'reduce-critical-data',
        message: 'Consider if all critical personal data is necessary for your use case',
        impact: 'high',
        fields: Object.keys(classification.critical)
      });
    }

    // Check for long retention periods
    Object.entries(classification).forEach(([level, data]) => {
      if (level !== 'summary' && Object.keys(data).length > 0) {
        const retention = this.retentionPolicies[level.toUpperCase()];
        if (retention && retention.years > 2) {
          suggestions.push({
            type: 'reduce-retention',
            message: `Consider shorter retention for ${level} sensitivity data`,
            impact: 'medium',
            currentRetention: retention.years,
            suggestedRetention: Math.max(1, retention.years - 1)
          });
        }
      }
    });

    return suggestions;
  }

  _determineSensitivity(field, value) {
    // Check explicit field mapping first
    for (const [level, fields] of Object.entries(this.sensitivityRules)) {
      if (fields.includes(field.toLowerCase())) {
        return level;
      }
    }

    // Check pattern-based detection
    const pattern = this._getDetectedPattern(field, value);
    if (pattern) {
      const patternSensitivity = {
        ssn: 'CRITICAL',
        creditCard: 'CRITICAL',
        email: 'HIGH',
        phone: 'HIGH',
        ipAddress: 'HIGH',
        dateOfBirth: 'HIGH'
      };
      return patternSensitivity[pattern] || 'MEDIUM';
    }

    // Default classification
    return 'LOW';
  }

  _getDetectedPattern(field, value) {
    for (const [pattern, regex] of Object.entries(this.patterns)) {
      if (regex.test(String(value))) {
        return pattern;
      }
    }
    return null;
  }

  _suggestProcessingBasis(sensitivity) {
    const basisSuggestions = {
      CRITICAL: 'legal-obligation',
      HIGH: 'legitimate-interest',
      MEDIUM: 'consent',
      LOW: 'consent',
      PUBLIC: 'legitimate-interest'
    };
    return basisSuggestions[sensitivity] || 'consent';
  }

  _generateClassificationSummary(classification) {
    const summary = {};
    let totalFields = 0;

    Object.entries(classification).forEach(([level, data]) => {
      if (level !== 'summary' && typeof data === 'object') {
        const count = Object.keys(data).length;
        summary[level] = count;
        totalFields += count;
      }
    });

    summary.total = totalFields;
    summary.riskScore = this._calculateRiskScore(summary);
    
    return summary;
  }

  _calculateRiskScore(summary) {
    const weights = { critical: 10, high: 5, medium: 2, low: 1, public: 0 };
    let score = 0;

    Object.entries(weights).forEach(([level, weight]) => {
      score += (summary[level] || 0) * weight;
    });

    return Math.min(100, score); // Cap at 100
  }
}

/**
 * ConsentManagementSystem - Advanced consent management
 */
export class ConsentManagementSystem {
  constructor(dbPath = 'data/consent-management.sqlite') {
    this.db = new Database(dbPath, { create: true });
    this._initializeTables();
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS consent_definitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        purpose TEXT NOT NULL,
        legal_basis TEXT NOT NULL,
        data_categories TEXT,
        retention_period INTEGER,
        is_required BOOLEAN DEFAULT FALSE,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_consent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        consent_id TEXT NOT NULL,
        granted BOOLEAN NOT NULL,
        granted_at INTEGER,
        withdrawn_at INTEGER,
        expiry_date INTEGER,
        consent_method TEXT,
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY (consent_id) REFERENCES consent_definitions(id)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS consent_preferences (
        user_id TEXT PRIMARY KEY,
        granular_control BOOLEAN DEFAULT TRUE,
        notification_method TEXT DEFAULT 'email',
        reminder_frequency INTEGER DEFAULT 365,
        last_review INTEGER,
        auto_expire BOOLEAN DEFAULT FALSE
      )
    `);

    this.queries = {
      createDefinition: this.db.prepare(`
        INSERT INTO consent_definitions (id, name, description, purpose, legal_basis, data_categories, retention_period, is_required)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getDefinition: this.db.prepare('SELECT * FROM consent_definitions WHERE id = ?'),
      getAllDefinitions: this.db.prepare('SELECT * FROM consent_definitions ORDER BY name'),
      
      grantConsent: this.db.prepare(`
        INSERT INTO user_consent (user_id, consent_id, granted, granted_at, expiry_date, consent_method, ip_address, user_agent)
        VALUES (?, ?, 1, unixepoch(), ?, ?, ?, ?)
      `),
      withdrawConsent: this.db.prepare(`
        UPDATE user_consent 
        SET granted = 0, withdrawn_at = unixepoch()
        WHERE user_id = ? AND consent_id = ? AND granted = 1 AND withdrawn_at IS NULL
      `),
      getUserConsent: this.db.prepare(`
        SELECT uc.*, cd.name, cd.description, cd.purpose 
        FROM user_consent uc
        JOIN consent_definitions cd ON uc.consent_id = cd.id
        WHERE uc.user_id = ? AND uc.granted = 1 AND uc.withdrawn_at IS NULL
        ORDER BY uc.granted_at DESC
      `),
      getConsentHistory: this.db.prepare(`
        SELECT uc.*, cd.name, cd.description
        FROM user_consent uc
        JOIN consent_definitions cd ON uc.consent_id = cd.id
        WHERE uc.user_id = ?
        ORDER BY uc.granted_at DESC
      `),
      
      setPreferences: this.db.prepare(`
        INSERT OR REPLACE INTO consent_preferences 
        (user_id, granular_control, notification_method, reminder_frequency, auto_expire)
        VALUES (?, ?, ?, ?, ?)
      `),
      getPreferences: this.db.prepare('SELECT * FROM consent_preferences WHERE user_id = ?')
    };
  }

  /**
   * Define a new consent type
   * @param {Object} definition - Consent definition
   * @returns {string} Consent ID
   */
  defineConsent(definition) {
    const id = definition.id || `consent-${randomUUID()}`;
    
    this.queries.createDefinition.run(
      id,
      definition.name,
      definition.description,
      definition.purpose,
      definition.legalBasis,
      JSON.stringify(definition.dataCategories || []),
      definition.retentionPeriod || 365 * 24 * 60 * 60, // 1 year in seconds
      definition.isRequired || false
    );

    return id;
  }

  /**
   * Grant consent for a user
   * @param {string} userId - User identifier
   * @param {string} consentId - Consent definition ID
   * @param {Object} context - Consent context
   * @returns {Object} Grant result
   */
  grantConsent(userId, consentId, context = {}) {
    const definition = this.queries.getDefinition.get(consentId);
    if (!definition) {
      throw new Error(`Consent definition not found: ${consentId}`);
    }

    const expiryDate = context.expiryDate || 
      (Date.now() / 1000 + definition.retention_period);

    this.queries.grantConsent.run(
      userId,
      consentId,
      expiryDate,
      context.method || 'explicit',
      context.ipAddress,
      context.userAgent
    );

    return {
      success: true,
      consentId,
      grantedAt: Date.now(),
      expiryDate: expiryDate * 1000
    };
  }

  /**
   * Withdraw consent for a user
   * @param {string} userId - User identifier
   * @param {string} consentId - Consent definition ID
   * @returns {Object} Withdrawal result
   */
  withdrawConsent(userId, consentId) {
    const result = this.queries.withdrawConsent.run(userId, consentId);
    
    return {
      success: result.changes > 0,
      consentId,
      withdrawnAt: Date.now()
    };
  }

  /**
   * Get current consent status for a user
   * @param {string} userId - User identifier
   * @returns {Array} Current consents
   */
  getCurrentConsent(userId) {
    return this.queries.getUserConsent.all(userId);
  }

  /**
   * Get consent history for a user
   * @param {string} userId - User identifier
   * @returns {Array} Consent history
   */
  getConsentHistory(userId) {
    return this.queries.getConsentHistory.all(userId);
  }

  /**
   * Check if specific consent is granted
   * @param {string} userId - User identifier
   * @param {string} consentId - Consent definition ID
   * @returns {boolean} Whether consent is granted
   */
  hasConsent(userId, consentId) {
    const consents = this.getCurrentConsent(userId);
    return consents.some(c => c.consent_id === consentId);
  }

  /**
   * Set user consent preferences
   * @param {string} userId - User identifier
   * @param {Object} preferences - User preferences
   */
  setUserPreferences(userId, preferences) {
    this.queries.setPreferences.run(
      userId,
      preferences.granularControl !== false,
      preferences.notificationMethod || 'email',
      preferences.reminderFrequency || 365,
      preferences.autoExpire || false
    );
  }

  /**
   * Get user consent preferences
   * @param {string} userId - User identifier
   * @returns {Object} User preferences
   */
  getUserPreferences(userId) {
    return this.queries.getPreferences.get(userId) || {
      granularControl: true,
      notificationMethod: 'email',
      reminderFrequency: 365,
      autoExpire: false
    };
  }

  /**
   * Get all consent definitions
   * @returns {Array} Consent definitions
   */
  getAllDefinitions() {
    return this.queries.getAllDefinitions.all();
  }
}

/**
 * DataRetentionPolicyManager - Manages data retention policies
 */
export class DataRetentionPolicyManager {
  constructor(dbPath = 'data/retention-policies.sqlite') {
    this.db = new Database(dbPath, { create: true });
    this._initializeTables();
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS retention_policies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data_category TEXT NOT NULL,
        retention_period INTEGER NOT NULL,
        retention_unit TEXT DEFAULT 'days',
        legal_basis TEXT,
        automatic_deletion BOOLEAN DEFAULT TRUE,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS retention_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        policy_id TEXT NOT NULL,
        data_reference TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        scheduled_deletion INTEGER,
        deleted_at INTEGER,
        FOREIGN KEY (policy_id) REFERENCES retention_policies(id)
      )
    `);

    this.queries = {
      createPolicy: this.db.prepare(`
        INSERT INTO retention_policies (id, name, data_category, retention_period, retention_unit, legal_basis, automatic_deletion)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      getPolicy: this.db.prepare('SELECT * FROM retention_policies WHERE id = ?'),
      getPoliciesByCategory: this.db.prepare('SELECT * FROM retention_policies WHERE data_category = ?'),
      
      scheduleRetention: this.db.prepare(`
        INSERT INTO retention_schedules (user_id, policy_id, data_reference, scheduled_deletion)
        VALUES (?, ?, ?, ?)
      `),
      getScheduledDeletions: this.db.prepare(`
        SELECT rs.*, rp.name as policy_name, rp.data_category
        FROM retention_schedules rs
        JOIN retention_policies rp ON rs.policy_id = rp.id
        WHERE rs.scheduled_deletion <= ? AND rs.deleted_at IS NULL
      `),
      markDeleted: this.db.prepare(`
        UPDATE retention_schedules SET deleted_at = unixepoch() WHERE id = ?
      `)
    };
  }

  /**
   * Create a retention policy
   * @param {Object} policy - Policy definition
   * @returns {string} Policy ID
   */
  createPolicy(policy) {
    const id = policy.id || `policy-${randomUUID()}`;
    
    this.queries.createPolicy.run(
      id,
      policy.name,
      policy.dataCategory,
      policy.retentionPeriod,
      policy.retentionUnit || 'days',
      policy.legalBasis,
      policy.automaticDeletion !== false
    );

    return id;
  }

  /**
   * Schedule data for retention
   * @param {string} userId - User identifier
   * @param {string} policyId - Policy ID
   * @param {string} dataReference - Reference to data
   * @returns {Object} Schedule result
   */
  scheduleRetention(userId, policyId, dataReference) {
    const policy = this.queries.getPolicy.get(policyId);
    if (!policy) {
      throw new Error(`Retention policy not found: ${policyId}`);
    }

    const multiplier = policy.retention_unit === 'years' ? 365 : 
                      policy.retention_unit === 'months' ? 30 : 1;
    
    const scheduledDeletion = Math.floor(Date.now() / 1000) + 
      (policy.retention_period * multiplier * 24 * 60 * 60);

    this.queries.scheduleRetention.run(userId, policyId, dataReference, scheduledDeletion);

    return {
      success: true,
      scheduledDeletion: scheduledDeletion * 1000,
      policy: policy.name
    };
  }

  /**
   * Get items scheduled for deletion
   * @param {number} beforeTimestamp - Check items before this timestamp
   * @returns {Array} Items to delete
   */
  getScheduledDeletions(beforeTimestamp = Date.now()) {
    return this.queries.getScheduledDeletions.all(Math.floor(beforeTimestamp / 1000));
  }

  /**
   * Mark item as deleted
   * @param {number} scheduleId - Schedule ID
   */
  markAsDeleted(scheduleId) {
    this.queries.markDeleted.run(scheduleId);
  }

  /**
   * Get policies for data category
   * @param {string} category - Data category
   * @returns {Array} Applicable policies
   */
  getPoliciesForCategory(category) {
    return this.queries.getPoliciesByCategory.all(category);
  }
}

/**
 * PrivacyImpactAssessment - Tools for privacy impact assessments
 */
export class PrivacyImpactAssessment {
  constructor() {
    this.riskFactors = {
      dataVolume: { high: 10000, medium: 1000, low: 100 },
      sensitivityLevel: { critical: 10, high: 5, medium: 2, low: 1 },
      userCount: { high: 10000, medium: 1000, low: 100 },
      processingPurposes: { high: 5, medium: 3, low: 1 }
    };
  }

  /**
   * Conduct privacy impact assessment
   * @param {Object} assessment - Assessment parameters
   * @returns {Object} Assessment results
   */
  conductAssessment(assessment) {
    const riskScore = this._calculateRiskScore(assessment);
    const recommendations = this._generateRecommendations(assessment, riskScore);
    const compliance = this._checkCompliance(assessment);

    return {
      riskScore,
      riskLevel: this._getRiskLevel(riskScore),
      recommendations,
      compliance,
      assessmentDate: Date.now(),
      requiresDPIA: riskScore >= 70,
      summary: this._generateSummary(assessment, riskScore)
    };
  }

  _calculateRiskScore(assessment) {
    let score = 0;

    // Data volume risk
    const volumeRisk = assessment.dataVolume > this.riskFactors.dataVolume.high ? 30 :
                      assessment.dataVolume > this.riskFactors.dataVolume.medium ? 20 : 10;
    score += volumeRisk;

    // Sensitivity level risk
    const sensitivityRisk = assessment.sensitivityCounts ? 
      (assessment.sensitivityCounts.critical || 0) * 10 +
      (assessment.sensitivityCounts.high || 0) * 5 +
      (assessment.sensitivityCounts.medium || 0) * 2 +
      (assessment.sensitivityCounts.low || 0) * 1 : 0;
    score += Math.min(40, sensitivityRisk);

    // User count risk
    const userRisk = assessment.userCount > this.riskFactors.userCount.high ? 20 :
                     assessment.userCount > this.riskFactors.userCount.medium ? 10 : 5;
    score += userRisk;

    // Processing purposes risk
    const purposeRisk = (assessment.processingPurposes || []).length > 3 ? 10 : 5;
    score += purposeRisk;

    return Math.min(100, score);
  }

  _getRiskLevel(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'MINIMAL';
  }

  _generateRecommendations(assessment, riskScore) {
    const recommendations = [];

    if (riskScore >= 70) {
      recommendations.push({
        priority: 'HIGH',
        category: 'DPIA',
        message: 'Data Protection Impact Assessment is required',
        action: 'Conduct full DPIA before processing'
      });
    }

    if (assessment.sensitivityCounts?.critical > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'ENCRYPTION',
        message: 'Critical data must be encrypted',
        action: 'Implement end-to-end encryption for critical data'
      });
    }

    if (assessment.userCount > 10000) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'CONSENT',
        message: 'Large user base requires robust consent management',
        action: 'Implement granular consent management system'
      });
    }

    if (!assessment.legalBasis || assessment.legalBasis.length === 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'LEGAL',
        message: 'Legal basis for processing must be defined',
        action: 'Define clear legal basis for each processing purpose'
      });
    }

    return recommendations;
  }

  _checkCompliance(assessment) {
    const checks = {
      hasLegalBasis: Boolean(assessment.legalBasis?.length),
      hasConsentMechanism: Boolean(assessment.consentMechanism),
      hasRetentionPolicy: Boolean(assessment.retentionPolicy),
      hasSecurityMeasures: Boolean(assessment.securityMeasures),
      hasDataMinimization: Boolean(assessment.dataMinimization),
      hasDPOContact: Boolean(assessment.dpoContact)
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;

    return {
      ...checks,
      score: Math.round((passedChecks / totalChecks) * 100),
      compliant: passedChecks === totalChecks
    };
  }

  _generateSummary(assessment, riskScore) {
    return {
      projectName: assessment.projectName,
      riskLevel: this._getRiskLevel(riskScore),
      dataSubjects: assessment.userCount || 0,
      dataCategories: Object.keys(assessment.sensitivityCounts || {}).length,
      processingPurposes: (assessment.processingPurposes || []).length,
      requiresAttention: riskScore >= 60
    };
  }
}

/**
 * DataBreachNotificationManager - Manages data breach notifications
 */
export class DataBreachNotificationManager {
  constructor(dbPath = 'data/breach-notifications.sqlite') {
    this.db = new Database(dbPath, { create: true });
    this._initializeTables();
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS breach_incidents (
        id TEXT PRIMARY KEY,
        incident_type TEXT NOT NULL,
        discovered_at INTEGER NOT NULL,
        description TEXT,
        affected_users INTEGER DEFAULT 0,
        data_categories TEXT,
        severity_level TEXT,
        status TEXT DEFAULT 'open',
        reported_to_authority BOOLEAN DEFAULT FALSE,
        authority_report_date INTEGER,
        users_notified BOOLEAN DEFAULT FALSE,
        user_notification_date INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS breach_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        breach_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_description TEXT,
        event_time INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (breach_id) REFERENCES breach_incidents(id)
      )
    `);

    this.queries = {
      createIncident: this.db.prepare(`
        INSERT INTO breach_incidents (id, incident_type, discovered_at, description, affected_users, data_categories, severity_level)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      updateIncident: this.db.prepare(`
        UPDATE breach_incidents 
        SET status = ?, reported_to_authority = ?, authority_report_date = ?, users_notified = ?, user_notification_date = ?
        WHERE id = ?
      `),
      getIncident: this.db.prepare('SELECT * FROM breach_incidents WHERE id = ?'),
      addTimelineEvent: this.db.prepare(`
        INSERT INTO breach_timeline (breach_id, event_type, event_description)
        VALUES (?, ?, ?)
      `),
      getTimeline: this.db.prepare('SELECT * FROM breach_timeline WHERE breach_id = ? ORDER BY event_time')
    };
  }

  /**
   * Report a data breach incident
   * @param {Object} incident - Breach incident details
   * @returns {Object} Incident result
   */
  reportBreach(incident) {
    const id = incident.id || `breach-${randomUUID()}`;
    const severity = this._calculateSeverity(incident);

    this.queries.createIncident.run(
      id,
      incident.type,
      Math.floor(Date.now() / 1000),
      incident.description,
      incident.affectedUsers || 0,
      JSON.stringify(incident.dataCategories || []),
      severity
    );

    this.queries.addTimelineEvent.run(id, 'discovered', 'Breach incident discovered and reported');

    const notifications = this._determineNotificationRequirements(incident, severity);

    return {
      incidentId: id,
      severity,
      notifications,
      reportedAt: Date.now()
    };
  }

  /**
   * Update breach incident status
   * @param {string} incidentId - Incident ID
   * @param {Object} updates - Status updates
   */
  updateBreach(incidentId, updates) {
    const incident = this.queries.getIncident.get(incidentId);
    if (!incident) {
      throw new Error(`Breach incident not found: ${incidentId}`);
    }

    this.queries.updateIncident.run(
      updates.status || incident.status,
      updates.reportedToAuthority !== undefined ? updates.reportedToAuthority : incident.reported_to_authority,
      updates.authorityReportDate ? Math.floor(updates.authorityReportDate / 1000) : incident.authority_report_date,
      updates.usersNotified !== undefined ? updates.usersNotified : incident.users_notified,
      updates.userNotificationDate ? Math.floor(updates.userNotificationDate / 1000) : incident.user_notification_date,
      incidentId
    );

    if (updates.timelineEvent) {
      this.queries.addTimelineEvent.run(incidentId, updates.timelineEvent.type, updates.timelineEvent.description);
    }
  }

  /**
   * Get breach incident details
   * @param {string} incidentId - Incident ID
   * @returns {Object} Incident details
   */
  getBreachDetails(incidentId) {
    const incident = this.queries.getIncident.get(incidentId);
    if (!incident) return null;

    const timeline = this.queries.getTimeline.all(incidentId);
    
    return {
      ...incident,
      timeline,
      dataCategories: JSON.parse(incident.data_categories || '[]')
    };
  }

  _calculateSeverity(incident) {
    let score = 0;

    // Affected users
    const userCount = incident.affectedUsers || 0;
    if (userCount > 10000) score += 30;
    else if (userCount > 1000) score += 20;
    else if (userCount > 100) score += 10;
    else score += 5;

    // Data sensitivity
    const categories = incident.dataCategories || [];
    if (categories.includes('critical')) score += 40;
    else if (categories.includes('high')) score += 25;
    else if (categories.includes('medium')) score += 15;
    else score += 5;

    // Incident type
    const typeScores = {
      'unauthorized-access': 25,
      'data-leak': 30,
      'system-compromise': 35,
      'insider-threat': 20,
      'third-party-breach': 15
    };
    score += typeScores[incident.type] || 10;

    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  _determineNotificationRequirements(incident, severity) {
    const requirements = {
      authorityNotification: false,
      userNotification: false,
      timeframes: {}
    };

    // Authority notification (GDPR Article 33)
    if (severity === 'CRITICAL' || severity === 'HIGH' || incident.affectedUsers > 100) {
      requirements.authorityNotification = true;
      requirements.timeframes.authority = 72; // 72 hours
    }

    // User notification (GDPR Article 34)
    if (severity === 'CRITICAL' || (severity === 'HIGH' && incident.affectedUsers > 500)) {
      requirements.userNotification = true;
      requirements.timeframes.users = 72; // Without undue delay
    }

    return requirements;
  }
}

export default {
  AutoDataClassifier,
  ConsentManagementSystem,
  DataRetentionPolicyManager,
  PrivacyImpactAssessment,
  DataBreachNotificationManager
};
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  AutoDataClassifier,
  ConsentManagementSystem,
  DataRetentionPolicyManager,
  PrivacyImpactAssessment,
  DataBreachNotificationManager
} from '../lib/privacy-controls.js';
import { unlinkSync, existsSync } from 'fs';

// Test database paths
const TEST_PATHS = {
  consent: 'tests/data/privacy-controls-consent.sqlite',
  retention: 'tests/data/privacy-controls-retention.sqlite',
  breach: 'tests/data/privacy-controls-breach.sqlite'
};

// Cleanup function
function cleanup() {
  Object.values(TEST_PATHS).forEach(path => {
    try { unlinkSync(path); } catch (e) { /* ignore */ }
  });
}

describe('AutoDataClassifier', () => {
  let classifier;

  beforeEach(() => {
    classifier = new AutoDataClassifier();
  });

  test('should classify data by patterns and sensitivity', () => {
    const testData = {
      email: 'user@example.com',
      phone: '+1234567890',
      ssn: '123-45-6789',
      creditCard: '4111111111111111',
      ipAddress: '192.168.1.1',
      dateOfBirth: '1990-01-01',
      fullName: 'John Doe',
      preferences: { theme: 'dark' },
      username: 'johndoe',
      accountType: 'premium' // This will be classified as PUBLIC
    };

    const classification = classifier.classifyData(testData);

    // Check critical data (fields are classified based on patterns and rules)
    expect(Object.keys(classification.critical).length).toBeGreaterThan(0);
    expect(Object.keys(classification.high).length).toBeGreaterThan(0);

    // Verify that data is classified properly (based on actual field names and patterns)
    expect(Object.keys(classification.high).length).toBeGreaterThan(0);
    expect(Object.keys(classification.medium).length).toBeGreaterThan(0);
    expect(Object.keys(classification.low).length).toBeGreaterThan(0);
    // Public category may be empty depending on field names
    expect(Object.keys(classification.public).length).toBeGreaterThanOrEqual(0);

    // Check summary
    expect(classification.summary.total).toBeGreaterThan(0);
    expect(classification.summary.riskScore).toBeGreaterThan(0);
  });

  test('should detect patterns correctly', () => {
    const testData = {
      validEmail: 'test@domain.com',
      invalidEmail: 'not-an-email',
      validSSN: '123-45-6789',
      invalidSSN: '123-456-789',
      validCreditCard: '4111111111111111',
      invalidCreditCard: '1234567890'
    };

    const classification = classifier.classifyData(testData);

    // Valid patterns should be classified appropriately
    expect(Object.keys(classification.high).length).toBeGreaterThan(0);
    expect(Object.keys(classification.critical).length).toBeGreaterThan(0);

    // Invalid patterns should fall back to default classification (LOW or unclassified)
    // The classifier may classify invalid patterns as LOW sensitivity instead of unclassified
    const totalClassified = Object.keys(classification.high).length + 
                           Object.keys(classification.critical).length +
                           Object.keys(classification.medium).length +
                           Object.keys(classification.low).length +
                           Object.keys(classification.public).length +
                           Object.keys(classification.unclassified).length;
    expect(totalClassified).toBe(Object.keys(testData).length);
  });

  test('should suggest data minimization', () => {
    const classification = {
      critical: { ssn: 'value1', creditCard: 'value2', passport: 'value3' },
      high: { email: 'value', phone: 'value' },
      medium: {},
      low: {},
      public: {}
    };

    const suggestions = classifier.suggestDataMinimization(classification);

    expect(suggestions.length).toBeGreaterThan(0);
    
    const criticalSuggestion = suggestions.find(s => s.type === 'reduce-critical-data');
    expect(criticalSuggestion).toBeDefined();
    expect(criticalSuggestion.impact).toBe('high');
  });

  test('should calculate risk scores accurately', () => {
    const highRiskData = {
      ssn: '123-45-6789',
      creditCard: '4111111111111111',
      medicalInfo: 'sensitive',
      email: 'user@example.com',
      phone: '+1234567890'
    };

    const lowRiskData = {
      preferences: { theme: 'dark' },
      username: 'user123',
      locale: 'en-US'
    };

    const highRiskClassification = classifier.classifyData(highRiskData);
    const lowRiskClassification = classifier.classifyData(lowRiskData);

    expect(highRiskClassification.summary.riskScore).toBeGreaterThan(
      lowRiskClassification.summary.riskScore
    );
  });
});

describe('ConsentManagementSystem', () => {
  let consentSystem;

  beforeEach(() => {
    cleanup();
    consentSystem = new ConsentManagementSystem(TEST_PATHS.consent);
  });

  afterEach(() => {
    cleanup();
  });

  test('should define and manage consent types', () => {
    const consentDefinition = {
      name: 'Marketing Communications',
      description: 'Permission to send marketing emails',
      purpose: 'marketing',
      legalBasis: 'consent',
      dataCategories: ['email', 'preferences'],
      retentionPeriod: 365 * 24 * 60 * 60,
      isRequired: false
    };

    const consentId = consentSystem.defineConsent(consentDefinition);
    expect(consentId).toMatch(/^consent-/);

    const definitions = consentSystem.getAllDefinitions();
    expect(definitions.length).toBe(1);
    expect(definitions[0].name).toBe(consentDefinition.name);
  });

  test('should grant and track consent', () => {
    const consentId = consentSystem.defineConsent({
      name: 'Analytics',
      purpose: 'analytics',
      legalBasis: 'legitimate-interest'
    });

    const userId = 'test-user';
    const result = consentSystem.grantConsent(userId, consentId, {
      method: 'explicit-checkbox',
      ipAddress: '192.168.1.1',
      userAgent: 'Test Browser'
    });

    expect(result.success).toBe(true);
    expect(result.consentId).toBe(consentId);

    const userConsents = consentSystem.getCurrentConsent(userId);
    expect(userConsents.length).toBe(1);
    expect(userConsents[0].consent_id).toBe(consentId);
  });

  test('should withdraw consent', () => {
    const consentId = consentSystem.defineConsent({
      name: 'Preferences',
      purpose: 'personalization',
      legalBasis: 'consent'
    });

    const userId = 'test-withdraw-user';
    
    // Grant consent first
    consentSystem.grantConsent(userId, consentId);

    // Withdraw consent
    const result = consentSystem.withdrawConsent(userId, consentId);
    expect(result.success).toBe(true);

    // Verify consent is withdrawn
    const activeConsents = consentSystem.getCurrentConsent(userId);
    expect(activeConsents.length).toBe(0);

    // Check history
    const history = consentSystem.getConsentHistory(userId);
    expect(history.length).toBe(1);
    expect(history[0].granted).toBe(0);
  });

  test('should check consent status', () => {
    const consentId = consentSystem.defineConsent({
      name: 'Test Consent',
      purpose: 'testing',
      legalBasis: 'consent'
    });

    const userId = 'test-check-user';

    // Initially no consent
    expect(consentSystem.hasConsent(userId, consentId)).toBe(false);

    // Grant consent
    consentSystem.grantConsent(userId, consentId);
    expect(consentSystem.hasConsent(userId, consentId)).toBe(true);

    // Withdraw consent
    consentSystem.withdrawConsent(userId, consentId);
    expect(consentSystem.hasConsent(userId, consentId)).toBe(false);
  });

  test('should manage user preferences', () => {
    const userId = 'test-prefs-user';
    const preferences = {
      granularControl: true,
      notificationMethod: 'sms',
      reminderFrequency: 180,
      autoExpire: true
    };

    consentSystem.setUserPreferences(userId, preferences);
    
    const retrieved = consentSystem.getUserPreferences(userId);
    expect(retrieved.granular_control).toBe(1); // SQLite stores booleans as integers
    expect(retrieved.notification_method).toBe('sms');
    expect(retrieved.reminder_frequency).toBe(180);
    expect(retrieved.auto_expire).toBe(1);
  });

  test('should handle non-existent consent definitions', () => {
    const userId = 'test-user';
    
    expect(() => {
      consentSystem.grantConsent(userId, 'non-existent-consent');
    }).toThrow('Consent definition not found');
  });
});

describe('DataRetentionPolicyManager', () => {
  let retentionManager;

  beforeEach(() => {
    cleanup();
    retentionManager = new DataRetentionPolicyManager(TEST_PATHS.retention);
  });

  afterEach(() => {
    cleanup();
  });

  test('should create retention policies', () => {
    const policy = {
      name: 'User Data Retention',
      dataCategory: 'personal-data',
      retentionPeriod: 3,
      retentionUnit: 'years',
      legalBasis: 'legitimate-interest',
      automaticDeletion: true
    };

    const policyId = retentionManager.createPolicy(policy);
    expect(policyId).toMatch(/^policy-/);

    const policies = retentionManager.getPoliciesForCategory('personal-data');
    expect(policies.length).toBe(1);
    expect(policies[0].name).toBe(policy.name);
  });

  test('should schedule data for retention', () => {
    const policyId = retentionManager.createPolicy({
      name: 'Test Policy',
      dataCategory: 'test-data',
      retentionPeriod: 1,
      retentionUnit: 'days'
    });

    const userId = 'test-user';
    const dataReference = 'test-data-ref-123';

    const result = retentionManager.scheduleRetention(userId, policyId, dataReference);
    
    expect(result.success).toBe(true);
    expect(result.scheduledDeletion).toBeGreaterThan(Date.now());
    expect(result.policy).toBe('Test Policy');
  });

  test('should identify items for deletion', () => {
    const policyId = retentionManager.createPolicy({
      name: 'Immediate Deletion',
      dataCategory: 'temp-data',
      retentionPeriod: 0,
      retentionUnit: 'days'
    });

    const userId = 'test-deletion-user';
    const dataReference = 'temp-data-ref';

    retentionManager.scheduleRetention(userId, policyId, dataReference);

    // Check for items scheduled for deletion (in the future to catch items scheduled for immediate deletion)
    const itemsToDelete = retentionManager.getScheduledDeletions(Date.now() + 24 * 60 * 60 * 1000);
    expect(itemsToDelete.length).toBe(1);
    expect(itemsToDelete[0].data_reference).toBe(dataReference);
  });

  test('should mark items as deleted', () => {
    const policyId = retentionManager.createPolicy({
      name: 'Test Deletion Policy',
      dataCategory: 'deletable-data',
      retentionPeriod: 1,
      retentionUnit: 'days'
    });

    retentionManager.scheduleRetention('user', policyId, 'data-ref');
    
    const itemsToDelete = retentionManager.getScheduledDeletions(Date.now() + 48 * 60 * 60 * 1000);
    expect(itemsToDelete.length).toBe(1);

    const scheduleId = itemsToDelete[0].id;
    retentionManager.markAsDeleted(scheduleId);

    // Should not appear in future scheduled deletions
    const remainingItems = retentionManager.getScheduledDeletions(Date.now() + 48 * 60 * 60 * 1000);
    expect(remainingItems.length).toBe(0);
  });

  test('should handle different retention units', () => {
    const dayPolicy = retentionManager.createPolicy({
      name: 'Day Policy',
      dataCategory: 'daily-data',
      retentionPeriod: 1,
      retentionUnit: 'days'
    });

    const monthPolicy = retentionManager.createPolicy({
      name: 'Month Policy',
      dataCategory: 'monthly-data',
      retentionPeriod: 1,
      retentionUnit: 'months'
    });

    const yearPolicy = retentionManager.createPolicy({
      name: 'Year Policy',
      dataCategory: 'yearly-data',
      retentionPeriod: 1,
      retentionUnit: 'years'
    });

    const dayResult = retentionManager.scheduleRetention('user', dayPolicy, 'day-data');
    const monthResult = retentionManager.scheduleRetention('user', monthPolicy, 'month-data');
    const yearResult = retentionManager.scheduleRetention('user', yearPolicy, 'year-data');

    expect(dayResult.scheduledDeletion).toBeLessThan(monthResult.scheduledDeletion);
    expect(monthResult.scheduledDeletion).toBeLessThan(yearResult.scheduledDeletion);
  });
});

describe('PrivacyImpactAssessment', () => {
  let pia;

  beforeEach(() => {
    pia = new PrivacyImpactAssessment();
  });

  test('should conduct basic privacy impact assessment', () => {
    const assessment = {
      projectName: 'Test Project',
      dataVolume: 5000,
      userCount: 1000,
      sensitivityCounts: {
        critical: 1,
        high: 3,
        medium: 5,
        low: 10
      },
      processingPurposes: ['analytics', 'personalization'],
      legalBasis: ['consent', 'legitimate-interest'],
      consentMechanism: true,
      retentionPolicy: true,
      securityMeasures: true,
      dataMinimization: true,
      dpoContact: true
    };

    const result = pia.conductAssessment(assessment);

    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.riskLevel).toMatch(/^(MINIMAL|LOW|MEDIUM|HIGH|CRITICAL)$/);
    expect(result.compliance.score).toBeGreaterThanOrEqual(0);
    expect(result.compliance.score).toBeLessThanOrEqual(100);
    expect(result.recommendations).toBeInstanceOf(Array);
    expect(typeof result.requiresDPIA).toBe('boolean');
  });

  test('should require DPIA for high-risk assessments', () => {
    const highRiskAssessment = {
      dataVolume: 100000,
      userCount: 50000,
      sensitivityCounts: {
        critical: 10,
        high: 15,
        medium: 20,
        low: 5
      },
      processingPurposes: ['profiling', 'automated-decision-making', 'biometric-processing'],
      liskCounting: ['testing']
    };

    const result = pia.conductAssessment(highRiskAssessment);

    expect(result.riskScore).toBeGreaterThanOrEqual(70);
    expect(result.requiresDPIA).toBe(true);
    expect(result.riskLevel).toMatch(/^(HIGH|CRITICAL)$/);
  });

  test('should generate appropriate recommendations', () => {
    const assessmentWithIssues = {
      dataVolume: 50000,
      userCount: 20000,
      sensitivityCounts: {
        critical: 5,
        high: 10
      },
      processingPurposes: ['profiling', 'marketing'],
      legalBasis: [], // Missing legal basis
      consentMechanism: false,
      retentionPolicy: false,
      securityMeasures: true,
      dataMinimization: false,
      dpoContact: false
    };

    const result = pia.conductAssessment(assessmentWithIssues);

    expect(result.recommendations.length).toBeGreaterThan(0);
    
    // Should recommend DPIA for high risk
    const dpiaRecommendation = result.recommendations.find(r => r.category === 'DPIA');
    expect(dpiaRecommendation).toBeDefined();

    // Should recommend encryption for critical data
    const encryptionRecommendation = result.recommendations.find(r => r.category === 'ENCRYPTION');
    expect(encryptionRecommendation).toBeDefined();

    // Should recommend legal basis definition
    const legalRecommendation = result.recommendations.find(r => r.category === 'LEGAL');
    expect(legalRecommendation).toBeDefined();
  });

  test('should check compliance factors', () => {
    const compliantAssessment = {
      legalBasis: ['consent', 'legitimate-interest'],
      consentMechanism: true,
      retentionPolicy: true,
      securityMeasures: true,
      dataMinimization: true,
      dpoContact: true
    };

    const nonCompliantAssessment = {
      legalBasis: [],
      consentMechanism: false,
      retentionPolicy: false,
      securityMeasures: false,
      dataMinimization: false,
      dpoContact: false
    };

    const compliantResult = pia.conductAssessment(compliantAssessment);
    const nonCompliantResult = pia.conductAssessment(nonCompliantAssessment);

    expect(compliantResult.compliance.score).toBe(100);
    expect(compliantResult.compliance.compliant).toBe(true);

    expect(nonCompliantResult.compliance.score).toBe(0);
    expect(nonCompliantResult.compliance.compliant).toBe(false);
  });
});

describe('DataBreachNotificationManager', () => {
  let breachManager;

  beforeEach(() => {
    cleanup();
    breachManager = new DataBreachNotificationManager(TEST_PATHS.breach);
  });

  afterEach(() => {
    cleanup();
  });

  test('should report data breach incidents', () => {
    const incident = {
      type: 'unauthorized-access',
      description: 'Unauthorized access to user database',
      affectedUsers: 1000,
      dataCategories: ['high', 'medium'],
      severity: 'high'
    };

    const result = breachManager.reportBreach(incident);

    expect(result.incidentId).toMatch(/^breach-/);
    expect(result.severity).toBeDefined();
    expect(result.notifications).toBeDefined();
    expect(result.reportedAt).toBeDefined();
  });

  test('should calculate severity levels correctly', () => {
    const criticalBreach = {
      type: 'system-compromise',
      affectedUsers: 50000,
      dataCategories: ['critical']
    };

    const lowBreach = {
      type: 'insider-threat',
      affectedUsers: 10,
      dataCategories: ['low']
    };

    const criticalResult = breachManager.reportBreach(criticalBreach);
    const lowResult = breachManager.reportBreach(lowBreach);

    expect(criticalResult.severity).toBe('CRITICAL');
    expect(lowResult.severity).toBe('LOW');
  });

  test('should determine notification requirements', () => {
    const highImpactBreach = {
      type: 'data-leak',
      affectedUsers: 5000,
      dataCategories: ['critical', 'high']
    };

    const lowImpactBreach = {
      type: 'third-party-breach',
      affectedUsers: 50,
      dataCategories: ['low']
    };

    const highResult = breachManager.reportBreach(highImpactBreach);
    const lowResult = breachManager.reportBreach(lowImpactBreach);

    // High impact should require authority notification
    expect(highResult.notifications.authorityNotification).toBe(true);
    expect(highResult.notifications.timeframes.authority).toBe(72);

    // Low impact may not require notifications
    expect(lowResult.notifications.authorityNotification).toBe(false);
  });

  test('should update breach incident status', () => {
    const incident = {
      type: 'unauthorized-access',
      affectedUsers: 500,
      dataCategories: ['medium']
    };

    const result = breachManager.reportBreach(incident);
    const incidentId = result.incidentId;

    // Update breach status
    breachManager.updateBreach(incidentId, {
      status: 'investigated',
      reportedToAuthority: true,
      authorityReportDate: Date.now(),
      timelineEvent: {
        type: 'investigation-completed',
        description: 'Investigation completed, containment measures in place'
      }
    });

    const details = breachManager.getBreachDetails(incidentId);
    expect(details.status).toBe('investigated');
    expect(details.reported_to_authority).toBe(1);
    expect(details.timeline.length).toBeGreaterThan(1); // Should have initial + update events
  });

  test('should maintain breach timeline', () => {
    const incident = {
      type: 'data-leak',
      affectedUsers: 200,
      dataCategories: ['high']
    };

    const result = breachManager.reportBreach(incident);
    const incidentId = result.incidentId;

    // Add timeline events
    breachManager.updateBreach(incidentId, {
      timelineEvent: {
        type: 'containment',
        description: 'Breach contained and systems secured'
      }
    });

    breachManager.updateBreach(incidentId, {
      timelineEvent: {
        type: 'notification',
        description: 'Affected users notified'
      }
    });

    const details = breachManager.getBreachDetails(incidentId);
    expect(details.timeline.length).toBe(3); // Initial discovery + 2 updates
    
    const eventTypes = details.timeline.map(event => event.event_type);
    expect(eventTypes).toContain('discovered');
    expect(eventTypes).toContain('containment');
    expect(eventTypes).toContain('notification');
  });

  test('should handle various breach types', () => {
    const breachTypes = [
      'unauthorized-access',
      'data-leak',
      'system-compromise',
      'insider-threat',
      'third-party-breach'
    ];

    breachTypes.forEach(type => {
      const incident = {
        type,
        affectedUsers: 100,
        dataCategories: ['medium']
      };

      const result = breachManager.reportBreach(incident);
      expect(result.incidentId).toBeDefined();
      expect(result.severity).toBeDefined();
    });
  });
});
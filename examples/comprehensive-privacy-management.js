import { initQueue, modelSetup } from '../index.js';
import { PrivacyManager } from '../lib/privacy-manager.js';
import { 
  AutoDataClassifier,
  ConsentManagementSystem,
  DataRetentionPolicyManager,
  PrivacyImpactAssessment,
  DataBreachNotificationManager
} from '../lib/privacy-controls.js';
import { ComplianceReportingManager } from '../lib/compliance-reporting.js';
import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';

/**
 * Comprehensive Privacy Management Example
 * 
 * Demonstrates the complete privacy management ecosystem:
 * 1. PrivacyManager - Core GDPR operations
 * 2. Enhanced Privacy Controls - Advanced privacy features
 * 3. Compliance Reporting - Comprehensive reporting and monitoring
 */

// Initialize components
let eventQueue, model, privacyManager, dataClassifier, consentSystem, retentionManager, 
    complianceReporting, impactAssessment, breachManager;

function cleanupDatabases() {
  console.log('🧹 Cleaning up existing databases...');
  
  const databases = [
    'data/privacy-demo-events.sqlite',
    'data/privacy-demo-state.sqlite',
    'data/privacy-demo-keys.sqlite',
    'data/privacy-demo-personal.sqlite',
    'data/consent-management.sqlite',
    'data/retention-policies.sqlite',
    'data/compliance-reporting.sqlite',
    'data/breach-notifications.sqlite'
  ];

  databases.forEach(dbPath => {
    try {
      const db = new Database(dbPath, { create: true });
      db.exec('DROP TABLE IF EXISTS event_queue');
      db.exec('DROP TABLE IF EXISTS users');
      db.exec('DROP TABLE IF EXISTS encryption_keys');
      db.exec('DROP TABLE IF EXISTS personal_data');
      db.exec('DROP TABLE IF EXISTS personal_data_audit');
      db.exec('DROP TABLE IF EXISTS consent_records');
      db.exec('DROP TABLE IF EXISTS consent_definitions');
      db.exec('DROP TABLE IF EXISTS user_consent');
      db.exec('DROP TABLE IF EXISTS consent_preferences');
      db.exec('DROP TABLE IF EXISTS retention_policies');
      db.exec('DROP TABLE IF EXISTS retention_schedules');
      db.exec('DROP TABLE IF EXISTS compliance_events');
      db.exec('DROP TABLE IF EXISTS compliance_metrics');
      db.exec('DROP TABLE IF EXISTS report_generation_log');
      db.exec('DROP TABLE IF EXISTS processing_activities');
      db.exec('DROP TABLE IF EXISTS processing_records');
      db.exec('DROP TABLE IF EXISTS breach_incidents');
      db.exec('DROP TABLE IF EXISTS breach_timeline');
      db.close();
    } catch (e) {
      // Database might not exist yet
    }
  });
  
  console.log('✅ Database cleanup complete\n');
}

function initializeComponents() {
  console.log('🔧 Initializing privacy management components...');

  // Initialize event queue and model
  eventQueue = initQueue({ dbName: 'data/privacy-demo-events.sqlite' });
  model = createPrivacyModel();

  // Initialize PrivacyManager
  privacyManager = new PrivacyManager({
    keyDbPath: 'data/privacy-demo-keys.sqlite',
    personalDbPath: 'data/privacy-demo-personal.sqlite',
    eventQueue,
    model,
    callbacks,
    exportDir: 'data/privacy-exports'
  });

  // Initialize Privacy Controls
  dataClassifier = new AutoDataClassifier();
  consentSystem = new ConsentManagementSystem('data/consent-management.sqlite');
  retentionManager = new DataRetentionPolicyManager('data/retention-policies.sqlite');
  impactAssessment = new PrivacyImpactAssessment();
  breachManager = new DataBreachNotificationManager('data/breach-notifications.sqlite');

  // Initialize Compliance Reporting
  complianceReporting = new ComplianceReportingManager({
    dbPath: 'data/compliance-reporting.sqlite',
    reportDir: 'data/compliance-reports',
    eventQueue,
    privacyManager
  });

  console.log('✅ All components initialized\n');
}

function createPrivacyModel() {
  return modelSetup({
    dbName: 'data/privacy-demo-state.sqlite',
    
    tables(db) {
      db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE,
          account_type TEXT,
          created_at INTEGER,
          profile_ref TEXT,
          encrypted_ref TEXT,
          is_deleted INTEGER DEFAULT 0,
          privacy_score REAL DEFAULT 0
        )
      `).run();

      db.query(`
        CREATE TABLE IF NOT EXISTS privacy_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_data TEXT,
          privacy_impact TEXT,
          timestamp INTEGER DEFAULT (unixepoch())
        )
      `).run();
    },

    queries(db) {
      return {
        insertUser: db.query('INSERT INTO users (id, username, account_type, created_at, profile_ref, encrypted_ref, privacy_score) VALUES ($id, $username, $account_type, $created_at, $profile_ref, $encrypted_ref, $privacy_score)'),
        getUser: db.query('SELECT * FROM users WHERE id = $id'),
        updatePrivacyScore: db.query('UPDATE users SET privacy_score = $privacy_score WHERE id = $id'),
        logPrivacyEvent: db.query('INSERT INTO privacy_events (user_id, event_type, event_data, privacy_impact) VALUES ($user_id, $event_type, $event_data, $privacy_impact)')
      };
    },

    methods(queries) {
      return {
        registerUser(data, metadata) {
          queries.insertUser.run({
            id: data.userId,
            username: data.username,
            account_type: data.accountType,
            created_at: metadata.datetime,
            profile_ref: data.profileRef,
            encrypted_ref: data.encryptedRef,
            privacy_score: data.privacyScore || 0
          });

          queries.logPrivacyEvent.run({
            user_id: data.userId,
            event_type: 'user_registration',
            event_data: JSON.stringify({ accountType: data.accountType }),
            privacy_impact: 'medium'
          });

          return { userId: data.userId, success: true };
        },

        privacyActionCompleted(data, metadata) {
          queries.logPrivacyEvent.run({
            user_id: data.userId,
            event_type: data.actionType,
            event_data: JSON.stringify(data.actionData || {}),
            privacy_impact: data.privacyImpact || 'low'
          });

          return { success: true, actionType: data.actionType };
        }
      };
    }
  });
}

const callbacks = {
  registerUser(result, row) {
    console.log(`📝 User ${row.data.userId} registered successfully`);
    
    // Log compliance event
    complianceReporting.logComplianceEvent({
      type: 'user-registration',
      userId: row.data.userId,
      category: 'data-collection',
      riskLevel: 'medium',
      data: { accountType: row.data.accountType }
    });
  },

  privacyActionCompleted(result, row) {
    console.log(`🔒 Privacy action completed: ${row.data.actionType} for user ${row.data.userId}`);
    
    // Log compliance event
    complianceReporting.logComplianceEvent({
      type: row.data.actionType,
      userId: row.data.userId,
      category: 'privacy-rights',
      riskLevel: row.data.privacyImpact === 'high' ? 'high' : 'low',
      data: row.data.actionData
    });
  },

  gdprExportRequested(result, row) {
    console.log(`📤 GDPR export requested for user ${row.data.userId}`);
  },

  gdprExportCompleted(result, row) {
    console.log(`✅ GDPR export completed for user ${row.data.userId}`);
  },

  gdprExportFailed(result, row) {
    console.log(`❌ GDPR export failed for user ${row.data.userId}: ${row.data.error}`);
  },

  gdprDeletionRequested(result, row) {
    console.log(`🗑️  GDPR deletion requested for user ${row.data.userId}`);
  },

  gdprDeletionCompleted(result, row) {
    console.log(`✅ GDPR deletion completed for user ${row.data.userId}`);
  },

  gdprDeletionFailed(result, row) {
    console.log(`❌ GDPR deletion failed for user ${row.data.userId}: ${row.data.error}`);
  },

  gdprRectificationRequested(result, row) {
    console.log(`✏️  GDPR rectification requested for user ${row.data.userId}`);
  },

  gdprRectificationCompleted(result, row) {
    console.log(`✅ GDPR rectification completed for user ${row.data.userId}`);
  },

  consentWithdrawn(result, row) {
    console.log(`✋ Consent withdrawn: ${row.data.consentType} for user ${row.data.userId}`);
  },

  _error(error) {
    console.error('❌ Error:', error);
  },

  _default(result, row) {
    console.log(`🔄 Processed ${row.cmd} for user ${row.data.userId || 'unknown'}`);
  }
};

async function demonstrateDataClassification() {
  console.log('📊 === Data Classification Demo ===\n');

  const userData = {
    username: 'johndoe123',
    email: 'john.doe@example.com',
    fullName: 'John Doe',
    phone: '+1234567890',
    address: '123 Main St, City, State',
    dateOfBirth: '1990-01-01',
    ssn: '123-45-6789',
    creditCard: '4111111111111111',
    accountType: 'premium',
    preferences: { theme: 'dark', language: 'en' },
    settings: { notifications: true },
    locale: 'en-US'
  };

  console.log('🔍 Classifying user data...');
  const classification = dataClassifier.classifyData(userData);
  
  console.log('📋 Classification Results:');
  console.log(`   Critical: ${Object.keys(classification.critical).length} fields`);
  console.log(`   High: ${Object.keys(classification.high).length} fields`);
  console.log(`   Medium: ${Object.keys(classification.medium).length} fields`);
  console.log(`   Low: ${Object.keys(classification.low).length} fields`);
  console.log(`   Public: ${Object.keys(classification.public).length} fields`);
  console.log(`   Risk Score: ${classification.summary.riskScore}/100\n`);

  // Get data minimization suggestions
  const suggestions = dataClassifier.suggestDataMinimization(classification);
  if (suggestions.length > 0) {
    console.log('💡 Data Minimization Suggestions:');
    suggestions.forEach(suggestion => {
      console.log(`   ${suggestion.type}: ${suggestion.message}`);
    });
    console.log();
  }

  return { classification, suggestions };
}

async function demonstrateConsentManagement() {
  console.log('✋ === Consent Management Demo ===\n');

  // Define consent types
  const marketingConsentId = consentSystem.defineConsent({
    name: 'Marketing Communications',
    description: 'Permission to send marketing emails and notifications',
    purpose: 'marketing',
    legalBasis: 'consent',
    dataCategories: ['email', 'preferences'],
    retentionPeriod: 365 * 24 * 60 * 60, // 1 year
    isRequired: false
  });

  const analyticsConsentId = consentSystem.defineConsent({
    name: 'Analytics and Performance',
    description: 'Collection of usage data for analytics',
    purpose: 'analytics',
    legalBasis: 'legitimate-interest',
    dataCategories: ['usage-data', 'preferences'],
    retentionPeriod: 2 * 365 * 24 * 60 * 60, // 2 years
    isRequired: false
  });

  console.log('📝 Consent definitions created');
  console.log(`   Marketing: ${marketingConsentId}`);
  console.log(`   Analytics: ${analyticsConsentId}\n`);

  // Grant consent for a user
  const userId = 'user-demo-123';
  
  console.log('✅ Granting consents...');
  const marketingConsent = consentSystem.grantConsent(userId, marketingConsentId, {
    method: 'explicit-checkbox',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 Demo Browser'
  });

  const analyticsConsent = consentSystem.grantConsent(userId, analyticsConsentId, {
    method: 'opt-out-available',
    ipAddress: '192.168.1.1'
  });

  console.log('   Marketing consent granted ✓');
  console.log('   Analytics consent granted ✓\n');

  // Check consent status
  const currentConsents = consentSystem.getCurrentConsent(userId);
  console.log(`📋 Current consents for user: ${currentConsents.length} active`);

  // Set user preferences
  consentSystem.setUserPreferences(userId, {
    granularControl: true,
    notificationMethod: 'email',
    reminderFrequency: 180, // 6 months
    autoExpire: false
  });

  console.log('⚙️  User consent preferences set\n');

  return { marketingConsentId, analyticsConsentId, currentConsents };
}

async function demonstrateDataRetention() {
  console.log('📅 === Data Retention Management Demo ===\n');

  // Create retention policies
  const userDataPolicyId = retentionManager.createPolicy({
    name: 'User Profile Data',
    dataCategory: 'personal-data',
    retentionPeriod: 3,
    retentionUnit: 'years',
    legalBasis: 'legitimate-interest',
    automaticDeletion: true
  });

  const analyticsDataPolicyId = retentionManager.createPolicy({
    name: 'Analytics Data',
    dataCategory: 'analytics-data',
    retentionPeriod: 26,
    retentionUnit: 'months',
    legalBasis: 'legitimate-interest',
    automaticDeletion: true
  });

  console.log('📋 Retention policies created:');
  console.log(`   User Data: ${userDataPolicyId} (3 years)`);
  console.log(`   Analytics: ${analyticsDataPolicyId} (26 months)\n`);

  // Schedule data for retention
  const userId = 'user-demo-123';
  
  const userDataSchedule = retentionManager.scheduleRetention(
    userId, 
    userDataPolicyId, 
    'personal-data-profile-123'
  );

  const analyticsSchedule = retentionManager.scheduleRetention(
    userId, 
    analyticsDataPolicyId, 
    'analytics-data-batch-456'
  );

  console.log('⏰ Data scheduled for retention:');
  console.log(`   User data: ${new Date(userDataSchedule.scheduledDeletion).toLocaleDateString()}`);
  console.log(`   Analytics: ${new Date(analyticsSchedule.scheduledDeletion).toLocaleDateString()}\n`);

  return { userDataPolicyId, analyticsDataPolicyId };
}

async function demonstratePrivacyImpactAssessment() {
  console.log('🔍 === Privacy Impact Assessment Demo ===\n');

  const assessment = {
    projectName: 'Enhanced User Analytics Platform',
    dataVolume: 50000, // Number of records
    userCount: 15000, // Number of users
    sensitivityCounts: {
      critical: 2, // SSN, medical data
      high: 5,     // email, phone, address
      medium: 8,   // name, preferences
      low: 12      // usage data, settings
    },
    processingPurposes: [
      'user-experience-improvement',
      'service-personalization',
      'analytics-and-reporting',
      'fraud-prevention'
    ],
    legalBasis: ['consent', 'legitimate-interest'],
    consentMechanism: true,
    retentionPolicy: true,
    securityMeasures: true,
    dataMinimization: true,
    dpoContact: true
  };

  console.log('🔬 Conducting Privacy Impact Assessment...');
  const piaResult = impactAssessment.conductAssessment(assessment);

  console.log(`📊 Assessment Results:`);
  console.log(`   Risk Score: ${piaResult.riskScore}/100 (${piaResult.riskLevel})`);
  console.log(`   DPIA Required: ${piaResult.requiresDPIA ? 'YES' : 'NO'}`);
  console.log(`   Compliance Score: ${piaResult.compliance.score}% (${piaResult.compliance.compliant ? 'COMPLIANT' : 'NON-COMPLIANT'})\n`);

  if (piaResult.recommendations.length > 0) {
    console.log('💡 Recommendations:');
    piaResult.recommendations.forEach(rec => {
      console.log(`   [${rec.priority.toUpperCase()}] ${rec.category}: ${rec.message}`);
    });
    console.log();
  }

  return piaResult;
}

async function demonstrateBreachManagement() {
  console.log('🚨 === Data Breach Management Demo ===\n');

  // Simulate a data breach incident
  const breachIncident = {
    type: 'unauthorized-access',
    description: 'Unauthorized access to user database detected via suspicious API calls',
    affectedUsers: 250,
    dataCategories: ['high', 'medium'], // email, names, preferences
    severity: 'high'
  };

  console.log('⚠️  Reporting data breach incident...');
  const breachResult = breachManager.reportBreach(breachIncident);

  console.log(`📋 Breach Report:`);
  console.log(`   Incident ID: ${breachResult.incidentId}`);
  console.log(`   Severity: ${breachResult.severity}`);
  console.log(`   Authority Notification Required: ${breachResult.notifications.authorityNotification ? 'YES' : 'NO'}`);
  console.log(`   User Notification Required: ${breachResult.notifications.userNotification ? 'YES' : 'NO'}`);
  
  if (breachResult.notifications.timeframes) {
    console.log(`   Notification Timeframes:`);
    if (breachResult.notifications.timeframes.authority) {
      console.log(`     Authority: ${breachResult.notifications.timeframes.authority} hours`);
    }
    if (breachResult.notifications.timeframes.users) {
      console.log(`     Users: ${breachResult.notifications.timeframes.users} hours`);
    }
  }
  console.log();

  // Update breach status
  console.log('📝 Updating breach incident status...');
  breachManager.updateBreach(breachResult.incidentId, {
    reportedToAuthority: true,
    authorityReportDate: Date.now(),
    timelineEvent: {
      type: 'authority-notified',
      description: 'Data protection authority notified within 72 hours'
    }
  });

  console.log('✅ Authority notification completed\n');

  return breachResult;
}

async function demonstratePrivacyOperations() {
  console.log('🛡️  === Privacy Operations Demo ===\n');

  const userId = `user-${randomUUID()}`;
  
  // Classify and register user with privacy-aware data handling
  const { classification } = await demonstrateDataClassification();
  
  console.log('👤 Registering user with privacy controls...');
  
  // Create personal data record first
  const profileRef = await privacyManager.personalStore.create(userId, {
    email: 'demo@example.com',
    fullName: 'Demo User',
    phone: '+1234567890',
    address: '123 Privacy St, Data City',
    dateOfBirth: '1990-01-01'
  });

  // Store user with proper data classification
  await eventQueue.store({
    cmd: 'registerUser',
    data: {
      userId,
      username: 'privacy-demo-user',
      accountType: 'premium',
      profileRef,
      encryptedRef: classification.critical ? `encrypted-${randomUUID()}` : null,
      privacyScore: 100 - classification.summary.riskScore // Higher score = better privacy
    }
  }, model, callbacks);

  console.log('📤 Requesting data export...');
  const exportResult = await privacyManager.requestDataExport(userId, {
    format: 'json',
    metadata: { purpose: 'user-request', source: 'privacy-dashboard' }
  });

  console.log(`   Export completed: ${exportResult.exportPath}`);
  console.log(`   Export size: ${JSON.stringify(exportResult.data).length} bytes\n`);

  console.log('✏️  Requesting data rectification...');
  const rectificationResult = await privacyManager.requestDataRectification(userId, {
    email: 'corrected.email@example.com',
    fullName: 'John Corrected Doe',
    metadata: { reason: 'user-correction-request', verified: true }
  });

  console.log(`   Rectification completed: ${rectificationResult.success ? 'SUCCESS' : 'FAILED'}\n`);

  console.log('🔍 Auditing data processing...');
  const auditResult = await privacyManager.auditDataProcessing(userId);
  
  console.log(`   Processing activities: ${auditResult.processingActivities.events}`);
  console.log(`   Personal data changes: ${auditResult.processingActivities.personalDataChanges}`);
  console.log(`   Consent changes: ${auditResult.processingActivities.consentChanges}\n`);

  // Finally, demonstrate data deletion
  console.log('🗑️  Requesting data deletion...');
  const deletionResult = await privacyManager.requestDataDeletion(userId, {
    verificationMethod: 'email-confirmation',
    reason: 'user-request',
    metadata: { confirmedAt: Date.now() }
  });

  console.log(`   Deletion completed: ${deletionResult.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`   Crypto-shredding: ${deletionResult.deletionResults.encryptionKeys.deleted ? 'COMPLETED' : 'FAILED'}\n`);

  return { userId, exportResult, rectificationResult, auditResult, deletionResult };
}

async function generateComplianceReports() {
  console.log('📊 === Compliance Reporting Demo ===\n');

  console.log('📈 Generating compliance dashboard...');
  const dashboard = await complianceReporting.generateComplianceDashboard({
    period: '30days',
    generatedBy: 'privacy-officer'
  });

  console.log(`📋 Dashboard Summary:`);
  console.log(`   Total Events: ${dashboard.overview.totalEvents}`);
  console.log(`   Active Categories: ${dashboard.overview.categoriesActive}`);
  console.log(`   Risk Score: ${dashboard.riskAssessment.riskScore}/100 (${dashboard.riskAssessment.riskLevel})`);
  console.log(`   Compliance Score: ${dashboard.complianceScore.score}/100 (Grade: ${dashboard.complianceScore.grade})`);
  
  if (dashboard.alerts.length > 0) {
    console.log(`   Active Alerts: ${dashboard.alerts.length}`);
    dashboard.alerts.forEach(alert => {
      console.log(`     [${alert.level.toUpperCase()}] ${alert.message}`);
    });
  }
  console.log();

  console.log('📝 Generating data processing activity report...');
  const processingReport = await complianceReporting.generateDataProcessingReport({
    period: '30days',
    generatedBy: 'compliance-team'
  });

  console.log(`   Report saved: ${processingReport.reportPath}`);
  console.log(`   Processing activities: ${processingReport.activities.length}`);
  console.log(`   Compliance rate: ${processingReport.compliance.complianceRate.toFixed(1)}%\n`);

  console.log('📊 Generating consent tracking report...');
  const consentReport = await complianceReporting.generateConsentReport({
    period: '30days',
    generatedBy: 'privacy-team'
  });

  console.log(`   Report saved: ${consentReport.reportPath}`);
  console.log(`   Total consent events: ${consentReport.summary.total_consent_events || 0}`);
  console.log(`   Consents granted: ${consentReport.summary.consents_granted || 0}`);
  console.log(`   Consents withdrawn: ${consentReport.summary.consents_withdrawn || 0}\n`);

  console.log('🔍 Generating regulatory audit trail...');
  const auditTrail = await complianceReporting.generateAuditTrail({
    period: '90days',
    scope: 'full',
    generatedBy: 'external-auditor'
  });

  console.log(`   Audit trail saved: ${auditTrail.reportPath}`);
  console.log(`   Total events: ${auditTrail.summary.totalEvents}`);
  console.log(`   Data integrity: ${auditTrail.summary.dataIntegrity.completeness && auditTrail.summary.dataIntegrity.consistency ? 'PASSED' : 'ISSUES DETECTED'}`);
  
  if (auditTrail.recommendations.length > 0) {
    console.log(`   Recommendations: ${auditTrail.recommendations.length}`);
  }
  console.log();

  return { dashboard, processingReport, consentReport, auditTrail };
}

async function main() {
  console.log('🎯 === Comprehensive Privacy Management Demo ===\n');
  console.log('This demo showcases the complete privacy management ecosystem for EventLite Sourcing.\n');

  try {
    // Setup
    cleanupDatabases();
    initializeComponents();

    // Core Demonstrations
    await demonstrateDataClassification();
    await demonstrateConsentManagement();
    await demonstrateDataRetention();
    await demonstratePrivacyImpactAssessment();
    await demonstrateBreachManagement();
    await demonstratePrivacyOperations();
    await generateComplianceReports();

    console.log('🎉 === Demo Complete ===\n');
    console.log('✅ All privacy management features demonstrated successfully!');
    console.log('📁 Check the data/ directory for generated reports and exported data');
    console.log('🔍 Review the databases to see the comprehensive audit trails');
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
    throw error;
  }
}

// Run the demo
if (import.meta.main) {
  main().catch(console.error);
}

export {
  demonstrateDataClassification,
  demonstrateConsentManagement,
  demonstrateDataRetention,
  demonstratePrivacyImpactAssessment,
  demonstrateBreachManagement,
  demonstratePrivacyOperations,
  generateComplianceReports
};
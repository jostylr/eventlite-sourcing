# Privacy Management for EventLite Sourcing

This document provides comprehensive guidance on using EventLite Sourcing's privacy management features for GDPR compliance and data protection.

## Table of Contents

1. [Overview](#overview)
2. [Privacy Manager](#privacy-manager)
3. [Enhanced Privacy Controls](#enhanced-privacy-controls)
4. [Compliance Reporting](#compliance-reporting)
5. [Integration Guide](#integration-guide)
6. [Best Practices](#best-practices)
7. [API Reference](#api-reference)

## Overview

EventLite Sourcing provides a complete privacy management ecosystem designed to help you achieve GDPR compliance while maintaining the benefits of event sourcing. The privacy management system is built around three core modules:

### Core Modules

1. **PrivacyManager** - Implements standardized GDPR helper methods for data subject rights
2. **Privacy Controls** - Advanced privacy features like data classification and breach management
3. **Compliance Reporting** - Comprehensive reporting and monitoring for regulatory compliance

### Key Features

- ✅ **Complete GDPR Rights Implementation** (Articles 7, 16, 17, 20, 30)
- 🔐 **Crypto-shredding** for secure data deletion
- 📊 **Automated Data Classification** with risk scoring
- 📋 **Consent Management** with legal basis tracking
- 📈 **Real-time Compliance Dashboard**
- 🔍 **Regulatory Audit Trails**
- 📑 **Data Processing Activity Logs** (Article 30 compliance)

## Privacy Manager

The `PrivacyManager` class provides standardized methods for implementing GDPR data subject rights.

### Quick Start

```javascript
import { PrivacyManager } from 'eventlite-sourcing';
import { initQueue, modelSetup } from 'eventlite-sourcing';

// Initialize your event queue and model
const eventQueue = initQueue({ dbName: 'data/events.sqlite' });
const model = createYourModel();

// Initialize PrivacyManager
const privacyManager = new PrivacyManager({
  keyDbPath: 'data/encryption-keys.sqlite',
  personalDbPath: 'data/personal-data.sqlite',
  eventQueue,
  model,
  callbacks: yourCallbacks,
  exportDir: 'data/exports'
});
```

### Core GDPR Methods

#### Data Export (Article 20 - Data Portability)

```javascript
// Export all user data
const exportResult = await privacyManager.requestDataExport(userId, {
  format: 'json', // 'json', 'csv', 'xml'
  metadata: { 
    purpose: 'user-request',
    source: 'privacy-dashboard' 
  }
});

console.log('Export completed:', exportResult.exportPath);
console.log('Data:', exportResult.data);
```

#### Data Deletion (Article 17 - Right to Erasure)

```javascript
// Delete user data using crypto-shredding
const deletionResult = await privacyManager.requestDataDeletion(userId, {
  verificationMethod: 'email-confirmation',
  reason: 'user-request',
  metadata: { confirmedAt: Date.now() }
});

console.log('Deletion completed:', deletionResult.success);
console.log('Crypto-shredding:', deletionResult.deletionResults.encryptionKeys.deleted);
```

#### Data Rectification (Article 16 - Right to Rectification)

```javascript
// Correct user data
const corrections = {
  email: 'corrected@example.com',
  fullName: 'Corrected Name',
  phone: '+1234567890'
};

const rectificationResult = await privacyManager.requestDataRectification(userId, corrections);
console.log('Rectification completed:', rectificationResult.success);
```

#### Data Portability (Article 20)

```javascript
// Get data in portable format
const portableData = await privacyManager.requestDataPortability(userId, 'json');
console.log('Portable data:', portableData);
// Returns machine-readable format suitable for transfer to another service
```

#### Consent Withdrawal (Article 7)

```javascript
// Withdraw specific consent
const withdrawalResult = await privacyManager.withdrawConsent(userId, 'marketing');
console.log('Consent withdrawn:', withdrawalResult.success);
```

#### Data Processing Audit (Article 30)

```javascript
// Generate comprehensive audit report
const auditReport = await privacyManager.auditDataProcessing(userId);
console.log('Processing activities:', auditReport.processingActivities);
console.log('Personal data history:', auditReport.personalDataHistory);
console.log('Consent history:', auditReport.consentHistory);
```

### Data Classification

The PrivacyManager automatically classifies data into sensitivity levels:

- **Critical** (SSN, credit cards, medical records) - Encrypted with crypto-shredding
- **High** (email, phone, address) - Stored in separate personal data store
- **Medium** (names, preferences) - Can be stored in events with restrictions
- **Low** (settings, locale) - Safe to store in events
- **Public** (username, account type) - No restrictions

## Enhanced Privacy Controls

Advanced privacy management features for comprehensive data protection.

### AutoDataClassifier

Automatically classifies data based on content patterns and predefined rules.

```javascript
import { AutoDataClassifier } from 'eventlite-sourcing';

const classifier = new AutoDataClassifier();

const userData = {
  email: 'user@example.com',
  ssn: '123-45-6789',
  preferences: { theme: 'dark' },
  username: 'user123'
};

const classification = classifier.classifyData(userData);
console.log('Classification:', classification);
console.log('Risk Score:', classification.summary.riskScore);

// Get data minimization suggestions
const suggestions = classifier.suggestDataMinimization(classification);
suggestions.forEach(suggestion => {
  console.log(`${suggestion.type}: ${suggestion.message}`);
});
```

### ConsentManagementSystem

Advanced consent management with legal basis tracking.

```javascript
import { ConsentManagementSystem } from 'eventlite-sourcing';

const consentSystem = new ConsentManagementSystem('data/consent.sqlite');

// Define consent types
const marketingConsentId = consentSystem.defineConsent({
  name: 'Marketing Communications',
  description: 'Permission to send marketing emails',
  purpose: 'marketing',
  legalBasis: 'consent',
  dataCategories: ['email', 'preferences'],
  retentionPeriod: 365 * 24 * 60 * 60, // 1 year in seconds
  isRequired: false
});

// Grant consent
const consentResult = consentSystem.grantConsent(userId, marketingConsentId, {
  method: 'explicit-checkbox',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
});

// Check consent status
const hasConsent = consentSystem.hasConsent(userId, marketingConsentId);
console.log('Has marketing consent:', hasConsent);

// Withdraw consent
consentSystem.withdrawConsent(userId, marketingConsentId);
```

### DataRetentionPolicyManager

Automated data retention policy enforcement.

```javascript
import { DataRetentionPolicyManager } from 'eventlite-sourcing';

const retentionManager = new DataRetentionPolicyManager('data/retention.sqlite');

// Create retention policy
const policyId = retentionManager.createPolicy({
  name: 'User Profile Data',
  dataCategory: 'personal-data',
  retentionPeriod: 3,
  retentionUnit: 'years',
  legalBasis: 'legitimate-interest',
  automaticDeletion: true
});

// Schedule data for retention
const scheduleResult = retentionManager.scheduleRetention(
  userId, 
  policyId, 
  'personal-data-profile-123'
);

console.log('Scheduled for deletion:', new Date(scheduleResult.scheduledDeletion));

// Get items due for deletion
const itemsToDelete = retentionManager.getScheduledDeletions();
itemsToDelete.forEach(item => {
  console.log(`Delete ${item.data_reference} for user ${item.user_id}`);
  // Perform deletion
  retentionManager.markAsDeleted(item.id);
});
```

### PrivacyImpactAssessment

Tools for conducting Data Protection Impact Assessments (DPIAs).

```javascript
import { PrivacyImpactAssessment } from 'eventlite-sourcing';

const pia = new PrivacyImpactAssessment();

const assessment = {
  projectName: 'User Analytics Platform',
  dataVolume: 50000,
  userCount: 15000,
  sensitivityCounts: {
    critical: 2,
    high: 5,
    medium: 8,
    low: 12
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
console.log('Risk Score:', result.riskScore);
console.log('DPIA Required:', result.requiresDPIA);
console.log('Compliance Score:', result.compliance.score);

// Review recommendations
result.recommendations.forEach(rec => {
  console.log(`[${rec.priority}] ${rec.category}: ${rec.message}`);
});
```

### DataBreachNotificationManager

Manage data breach incidents and notifications.

```javascript
import { DataBreachNotificationManager } from 'eventlite-sourcing';

const breachManager = new DataBreachNotificationManager('data/breaches.sqlite');

// Report a breach
const breachResult = breachManager.reportBreach({
  type: 'unauthorized-access',
  description: 'Unauthorized access to user database detected',
  affectedUsers: 250,
  dataCategories: ['high', 'medium'],
  severity: 'high'
});

console.log('Incident ID:', breachResult.incidentId);
console.log('Authority notification required:', breachResult.notifications.authorityNotification);
console.log('Notification timeframe:', breachResult.notifications.timeframes.authority, 'hours');

// Update breach status
breachManager.updateBreach(breachResult.incidentId, {
  reportedToAuthority: true,
  authorityReportDate: Date.now(),
  timelineEvent: {
    type: 'authority-notified',
    description: 'Data protection authority notified within 72 hours'
  }
});
```

## Compliance Reporting

Comprehensive reporting system for regulatory compliance monitoring.

### ComplianceReportingManager

Central reporting orchestrator for all compliance activities.

```javascript
import { ComplianceReportingManager } from 'eventlite-sourcing';

const complianceReporting = new ComplianceReportingManager({
  dbPath: 'data/compliance.sqlite',
  reportDir: 'data/compliance-reports',
  eventQueue,
  privacyManager
});

// Log compliance events
complianceReporting.logComplianceEvent({
  type: 'user-registration',
  userId: 'user-123',
  category: 'data-collection',
  riskLevel: 'medium',
  data: { accountType: 'premium' }
});
```

### Real-time Compliance Dashboard

```javascript
// Generate live compliance dashboard
const dashboard = await complianceReporting.generateComplianceDashboard({
  period: '30days',
  generatedBy: 'privacy-officer'
});

console.log('Total Events:', dashboard.overview.totalEvents);
console.log('Risk Score:', dashboard.riskAssessment.riskScore);
console.log('Compliance Score:', dashboard.complianceScore.score);

// Check for alerts
dashboard.alerts.forEach(alert => {
  console.log(`[${alert.level}] ${alert.message}`);
});
```

### Data Processing Activity Reports (Article 30)

```javascript
// Generate Article 30 compliance report
const processingReport = await complianceReporting.generateDataProcessingReport({
  period: '90days',
  generatedBy: 'compliance-team'
});

console.log('Report saved:', processingReport.reportPath);
console.log('Processing activities:', processingReport.activities.length);
console.log('Compliance rate:', processingReport.compliance.complianceRate);
```

### Regulatory Audit Trail

```javascript
// Generate comprehensive audit trail for regulators
const auditTrail = await complianceReporting.generateAuditTrail({
  period: '1year',
  scope: 'full',
  generatedBy: 'external-auditor'
});

console.log('Total events audited:', auditTrail.summary.totalEvents);
console.log('Data integrity:', auditTrail.summary.dataIntegrity.completeness ? 'PASSED' : 'ISSUES');
console.log('Audit trail saved:', auditTrail.reportPath);
```

## Integration Guide

### Basic Integration

1. **Install Dependencies**
```bash
bun add eventlite-sourcing
```

2. **Initialize Privacy Manager**
```javascript
import { initQueue, modelSetup, PrivacyManager } from 'eventlite-sourcing';

// Set up your event sourcing
const eventQueue = initQueue({ dbName: 'data/events.sqlite' });
const model = createYourModel();
const callbacks = createYourCallbacks();

// Initialize privacy management
const privacyManager = new PrivacyManager({
  keyDbPath: 'data/keys.sqlite',
  personalDbPath: 'data/personal.sqlite',
  eventQueue,
  model,
  callbacks,
  exportDir: 'data/exports'
});
```

3. **Integrate with Your Application**
```javascript
// In your user registration endpoint
app.post('/register', async (req, res) => {
  const { userData } = req.body;
  
  // Create user with privacy-aware data handling
  const userId = generateUserId();
  
  // Create personal data record
  const profileRef = await privacyManager.personalStore.create(userId, {
    email: userData.email,
    fullName: userData.fullName,
    phone: userData.phone
  });
  
  // Store event with reference only
  await eventQueue.store({
    cmd: 'registerUser',
    data: {
      userId,
      username: userData.username,
      accountType: userData.accountType,
      profileRef
    }
  }, model, callbacks);
  
  res.json({ userId, success: true });
});

// In your data export endpoint
app.post('/privacy/export', async (req, res) => {
  const { userId } = req.body;
  
  const exportResult = await privacyManager.requestDataExport(userId);
  
  res.json({
    success: exportResult.success,
    downloadUrl: `/downloads/${path.basename(exportResult.exportPath)}`
  });
});
```

### Advanced Integration with Event Callbacks

```javascript
const privacyCallbacks = {
  // Handle GDPR events
  gdprExportRequested(result, row) {
    console.log(`Data export requested for user ${row.data.userId}`);
    // Trigger email notification
    emailService.send({
      to: getUserEmail(row.data.userId),
      template: 'export-started',
      data: { requestId: row.data.requestId }
    });
  },

  gdprDeletionCompleted(result, row) {
    console.log(`Data deletion completed for user ${row.data.userId}`);
    // Log for audit trail
    auditLogger.log('data-deletion', {
      userId: row.data.userId,
      deletionSummary: row.data.deletionSummary
    });
  },

  // Handle consent events
  consentWithdrawn(result, row) {
    console.log(`Consent withdrawn: ${row.data.consentType} for user ${row.data.userId}`);
    // Update user preferences
    updateUserMarketingPreferences(row.data.userId, row.data.consentType, false);
  }
};
```

### Automated Compliance Monitoring

```javascript
// Set up automated compliance monitoring
class ComplianceMonitor {
  constructor(complianceReporting) {
    this.reporting = complianceReporting;
    this.startMonitoring();
  }

  startMonitoring() {
    // Daily compliance check
    setInterval(async () => {
      const dashboard = await this.reporting.generateComplianceDashboard({
        period: '7days'
      });

      // Check for critical alerts
      const criticalAlerts = dashboard.alerts.filter(alert => alert.level === 'critical');
      if (criticalAlerts.length > 0) {
        this.sendAlertToPrivacyOfficer(criticalAlerts);
      }

      // Check compliance score
      if (dashboard.complianceScore.score < 85) {
        this.scheduleComplianceReview();
      }
    }, 24 * 60 * 60 * 1000); // Daily
  }

  async sendAlertToPrivacyOfficer(alerts) {
    // Send notifications to privacy officer
    await notificationService.send({
      to: 'privacy-officer@company.com',
      subject: 'Critical Privacy Compliance Alert',
      body: `Critical privacy issues detected: ${alerts.map(a => a.message).join(', ')}`
    });
  }

  async scheduleComplianceReview() {
    // Schedule compliance review meeting
    await calendarService.schedule({
      title: 'Privacy Compliance Review',
      attendees: ['privacy-officer@company.com', 'legal@company.com'],
      description: 'Review recent compliance score decline'
    });
  }
}

const monitor = new ComplianceMonitor(complianceReporting);
```

## Best Practices

### Data Classification

1. **Classify Early and Often**
```javascript
// Always classify data before storing
const classifier = new AutoDataClassifier();
const classification = classifier.classifyData(userData);

// Handle each sensitivity level appropriately
if (Object.keys(classification.critical).length > 0) {
  // Encrypt critical data
  const keyId = await cryptoShredder.generateUserKey(userId);
  const encrypted = cryptoShredder.encrypt(classification.critical, keyId);
  // Store reference only
}
```

2. **Implement Data Minimization**
```javascript
// Only collect what you need
const minimizedData = {
  // Required for service
  email: userData.email,
  accountType: userData.accountType,
  // Skip unnecessary fields
  // dateOfBirth: userData.dateOfBirth,  // Not needed for basic service
};
```

### Consent Management

1. **Granular Consent**
```javascript
// Provide granular consent options
const consentTypes = [
  { id: 'essential', name: 'Essential Services', required: true },
  { id: 'analytics', name: 'Analytics', required: false },
  { id: 'marketing', name: 'Marketing Communications', required: false },
  { id: 'personalization', name: 'Personalized Content', required: false }
];

// Allow users to control each type independently
consentTypes.forEach(consent => {
  if (userConsents[consent.id]) {
    consentSystem.grantConsent(userId, consent.id, {
      method: 'granular-checkbox',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
  }
});
```

2. **Consent Verification**
```javascript
// Always verify consent before processing
const hasMarketingConsent = consentSystem.hasConsent(userId, 'marketing');
if (hasMarketingConsent) {
  sendMarketingEmail(userId);
} else {
  console.log('Cannot send marketing email - no consent');
}
```

### Data Retention

1. **Automated Cleanup**
```javascript
// Set up automated data retention enforcement
async function enforceRetentionPolicies() {
  const itemsToDelete = retentionManager.getScheduledDeletions();
  
  for (const item of itemsToDelete) {
    try {
      // Delete the actual data
      await deleteUserData(item.user_id, item.data_reference);
      
      // Mark as deleted in retention system
      retentionManager.markAsDeleted(item.id);
      
      console.log(`Deleted ${item.data_reference} for user ${item.user_id}`);
    } catch (error) {
      console.error(`Failed to delete ${item.data_reference}:`, error);
    }
  }
}

// Run daily
setInterval(enforceRetentionPolicies, 24 * 60 * 60 * 1000);
```

### Security

1. **Crypto-Shredding Implementation**
```javascript
// Use crypto-shredding for sensitive data
async function storeSensitiveData(userId, sensitiveData) {
  // Generate user-specific encryption key
  const keyId = await cryptoShredder.generateUserKey(userId);
  
  // Encrypt the sensitive data
  const encrypted = cryptoShredder.encrypt(sensitiveData, keyId);
  
  // Store only the encrypted reference
  const encryptedRef = `encrypted-${randomUUID()}`;
  await encryptedDataStore.store(encryptedRef, encrypted);
  
  return encryptedRef;
}

// For deletion, simply delete the key
async function deleteUserSensitiveData(userId) {
  await cryptoShredder.deleteUserData(userId);
  // Sensitive data is now unrecoverable
}
```

2. **Access Control**
```javascript
// Implement proper access controls
function requirePrivacyOfficerRole(req, res, next) {
  if (!req.user.roles.includes('privacy-officer')) {
    return res.status(403).json({ error: 'Insufficient privileges' });
  }
  next();
}

// Protect sensitive endpoints
app.get('/admin/compliance-dashboard', requirePrivacyOfficerRole, async (req, res) => {
  const dashboard = await complianceReporting.generateComplianceDashboard();
  res.json(dashboard);
});
```

### Monitoring and Alerting

1. **Real-time Monitoring**
```javascript
// Monitor compliance events in real-time
complianceReporting.logComplianceEvent({
  type: 'data-access',
  userId: req.user.id,
  category: 'data-processing',
  riskLevel: req.path.includes('/admin/') ? 'high' : 'low',
  data: {
    endpoint: req.path,
    method: req.method,
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip
  }
});
```

2. **Automated Reporting**
```javascript
// Generate regular compliance reports
async function generateWeeklyComplianceReport() {
  const reports = await Promise.all([
    complianceReporting.generateComplianceDashboard({ period: '7days' }),
    complianceReporting.generateConsentReport({ period: '7days' }),
    complianceReporting.generateDataSubjectRequestReport({ period: '7days' })
  ]);

  // Send to privacy team
  await emailService.send({
    to: 'privacy-team@company.com',
    subject: 'Weekly Privacy Compliance Report',
    attachments: reports.map(report => ({
      filename: path.basename(report.reportPath),
      path: report.reportPath
    }))
  });
}

// Run every Monday
cron.schedule('0 9 * * 1', generateWeeklyComplianceReport);
```

## API Reference

### PrivacyManager

```typescript
class PrivacyManager {
  constructor(options: PrivacyManagerOptions);
  
  // GDPR Article 20 - Data Portability
  requestDataExport(userId: string, options?: ExportOptions): Promise<ExportResult>;
  requestDataPortability(userId: string, format: string): Promise<PortableData>;
  
  // GDPR Article 17 - Right to Erasure
  requestDataDeletion(userId: string, options?: DeletionOptions): Promise<DeletionResult>;
  
  // GDPR Article 16 - Right to Rectification
  requestDataRectification(userId: string, corrections: DataCorrections): Promise<RectificationResult>;
  
  // GDPR Article 7 - Right to Withdraw Consent
  withdrawConsent(userId: string, consentType: string): Promise<ConsentWithdrawalResult>;
  
  // GDPR Article 30 - Data Processing Audit
  auditDataProcessing(userId: string): Promise<DataProcessingAudit>;
}
```

### AutoDataClassifier

```typescript
class AutoDataClassifier {
  classifyData(data: object): DataClassification;
  suggestDataMinimization(classification: DataClassification): MinimizationSuggestion[];
}

interface DataClassification {
  critical: Record<string, ClassifiedField>;
  high: Record<string, ClassifiedField>;
  medium: Record<string, ClassifiedField>;
  low: Record<string, ClassifiedField>;
  public: Record<string, ClassifiedField>;
  unclassified: Record<string, any>;
  summary: ClassificationSummary;
}
```

### ConsentManagementSystem

```typescript
class ConsentManagementSystem {
  defineConsent(definition: ConsentDefinition): string;
  grantConsent(userId: string, consentId: string, context?: ConsentContext): ConsentResult;
  withdrawConsent(userId: string, consentId: string): ConsentResult;
  hasConsent(userId: string, consentId: string): boolean;
  getCurrentConsent(userId: string): ConsentRecord[];
  getConsentHistory(userId: string): ConsentRecord[];
}
```

### ComplianceReportingManager

```typescript
class ComplianceReportingManager {
  generateComplianceDashboard(options?: DashboardOptions): Promise<ComplianceDashboard>;
  generateDataProcessingReport(options?: ReportOptions): Promise<ProcessingReport>;
  generateConsentReport(options?: ReportOptions): Promise<ConsentReport>;
  generateDataSubjectRequestReport(options?: ReportOptions): Promise<RequestReport>;
  generateAuditTrail(options?: AuditOptions): Promise<AuditTrail>;
  logComplianceEvent(event: ComplianceEvent): void;
}
```

For complete TypeScript definitions, see the `index.d.ts` file in the package.

---

## Conclusion

EventLite Sourcing's privacy management system provides everything you need to build GDPR-compliant applications while maintaining the benefits of event sourcing. The system is designed to be:

- **Comprehensive** - Covers all major GDPR requirements
- **Secure** - Uses crypto-shredding and data segregation
- **Automated** - Reduces manual compliance overhead
- **Auditable** - Provides complete audit trails
- **Extensible** - Easy to customize for your specific needs

For more examples and advanced usage patterns, see the `examples/` directory in the EventLite Sourcing repository.
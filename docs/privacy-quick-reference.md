# Privacy Management Quick Reference

A concise reference for EventLite Sourcing's privacy management features.

## Quick Setup

```javascript
import { 
  PrivacyManager, 
  AutoDataClassifier, 
  ConsentManagementSystem,
  ComplianceReportingManager 
} from 'eventlite-sourcing';

// Basic setup
const privacyManager = new PrivacyManager({
  keyDbPath: 'data/keys.sqlite',
  personalDbPath: 'data/personal.sqlite',
  eventQueue,
  model,
  callbacks,
  exportDir: 'data/exports'
});
```

## GDPR Rights Implementation

### Data Export (Article 20)
```javascript
const exportResult = await privacyManager.requestDataExport(userId, { format: 'json' });
```

### Data Deletion (Article 17)
```javascript
const deletionResult = await privacyManager.requestDataDeletion(userId);
```

### Data Rectification (Article 16)
```javascript
const corrections = { email: 'new@example.com', fullName: 'New Name' };
const rectificationResult = await privacyManager.requestDataRectification(userId, corrections);
```

### Data Portability (Article 20)
```javascript
const portableData = await privacyManager.requestDataPortability(userId, 'json');
```

### Consent Withdrawal (Article 7)
```javascript
const withdrawalResult = await privacyManager.withdrawConsent(userId, 'marketing');
```

### Data Processing Audit (Article 30)
```javascript
const auditReport = await privacyManager.auditDataProcessing(userId);
```

## Data Classification

```javascript
const classifier = new AutoDataClassifier();
const classification = classifier.classifyData(userData);

// Risk levels: critical, high, medium, low, public
console.log('Risk Score:', classification.summary.riskScore);
```

## Consent Management

```javascript
const consentSystem = new ConsentManagementSystem();

// Define consent
const consentId = consentSystem.defineConsent({
  name: 'Marketing',
  purpose: 'marketing',
  legalBasis: 'consent'
});

// Grant consent
consentSystem.grantConsent(userId, consentId, { method: 'checkbox' });

// Check consent
const hasConsent = consentSystem.hasConsent(userId, consentId);
```

## Compliance Reporting

```javascript
const reporting = new ComplianceReportingManager({
  dbPath: 'data/compliance.sqlite',
  reportDir: 'data/reports'
});

// Live dashboard
const dashboard = await reporting.generateComplianceDashboard({ period: '30days' });

// Article 30 report
const processingReport = await reporting.generateDataProcessingReport();

// Audit trail
const auditTrail = await reporting.generateAuditTrail({ period: '1year' });
```

## Common Patterns

### Privacy-Aware User Registration
```javascript
// 1. Classify data
const classification = classifier.classifyData(userData);

// 2. Store personal data separately
const profileRef = await privacyManager.personalStore.create(userId, classification.mediumSensitive);

// 3. Encrypt critical data
let encryptedRef = null;
if (Object.keys(classification.critical).length > 0) {
  const keyId = await privacyManager.cryptoShredder.generateUserKey(userId);
  const encrypted = privacyManager.cryptoShredder.encrypt(classification.critical, keyId);
  encryptedRef = `encrypted-${randomUUID()}`;
}

// 4. Store event with references only
await eventQueue.store({
  cmd: 'registerUser',
  data: {
    userId,
    ...classification.lowSensitive,
    ...classification.nonPersonal,
    profileRef,
    encryptedRef
  }
}, model, callbacks);
```

### Automated Retention Enforcement
```javascript
const retentionManager = new DataRetentionPolicyManager();

// Check for expired data daily
setInterval(async () => {
  const itemsToDelete = retentionManager.getScheduledDeletions();
  for (const item of itemsToDelete) {
    // Delete actual data
    await deleteData(item.user_id, item.data_reference);
    // Mark as deleted
    retentionManager.markAsDeleted(item.id);
  }
}, 24 * 60 * 60 * 1000);
```

### Breach Response
```javascript
const breachManager = new DataBreachNotificationManager();

// Report breach
const breachResult = breachManager.reportBreach({
  type: 'unauthorized-access',
  affectedUsers: 250,
  dataCategories: ['high', 'medium']
});

// Authority notification required?
if (breachResult.notifications.authorityNotification) {
  console.log(`Notify authority within ${breachResult.notifications.timeframes.authority} hours`);
}
```

## Data Sensitivity Levels

| Level | Examples | Storage | Retention |
|-------|----------|---------|-----------|
| **Critical** | SSN, Credit Cards, Medical | Encrypted with crypto-shredding | Delete on user request |
| **High** | Email, Phone, Address | Separate personal store | 2-3 years max |
| **Medium** | Name, Preferences | Events (with care) | 1-2 years |
| **Low** | Settings, Theme | Events | 6 months - 1 year |
| **Public** | Username, Account Type | Events | No restriction |

## Compliance Checklist

### GDPR Article 30 (Data Processing Activities)
- [ ] Document all processing activities
- [ ] Define legal basis for each activity
- [ ] Specify data categories processed
- [ ] Set retention periods
- [ ] Generate regular reports

### GDPR Articles 15-22 (Data Subject Rights)
- [ ] Data export functionality
- [ ] Data deletion (with crypto-shredding)
- [ ] Data rectification
- [ ] Data portability
- [ ] Consent withdrawal
- [ ] Processing restriction
- [ ] Data processing audit

### GDPR Articles 33-34 (Breach Notification)
- [ ] Breach detection and logging
- [ ] Authority notification (72 hours)
- [ ] User notification (when required)
- [ ] Breach impact assessment
- [ ] Timeline tracking

### General Compliance
- [ ] Privacy by design implementation
- [ ] Data minimization practices
- [ ] Consent management
- [ ] Regular compliance monitoring
- [ ] Audit trail maintenance
- [ ] Staff training documentation

## Error Handling

```javascript
try {
  const result = await privacyManager.requestDataExport(userId);
  console.log('Export successful:', result.exportPath);
} catch (error) {
  if (error.message.includes('User not found')) {
    // Handle non-existent user
  } else if (error.message.includes('Export failed')) {
    // Handle export failure
    console.error('Export error:', error);
  }
}
```

## Testing Privacy Features

```javascript
// Example test
import { test, expect } from 'bun:test';

test('should export user data', async () => {
  const userId = 'test-user';
  
  // Create test data
  await privacyManager.personalStore.create(userId, {
    email: 'test@example.com',
    fullName: 'Test User'
  });
  
  // Test export
  const result = await privacyManager.requestDataExport(userId);
  
  expect(result.success).toBe(true);
  expect(result.data.personalData.email).toBe('test@example.com');
});
```

## Performance Considerations

- **Indexing**: Create indexes on user_id columns in personal data tables
- **Batch Operations**: Use batch processing for large data exports
- **Caching**: Cache classification results for repeated operations
- **Cleanup**: Regular cleanup of expired reports and logs
- **Monitoring**: Monitor export/deletion operation performance

## Security Best Practices

1. **Encrypt sensitive data** using crypto-shredding
2. **Validate all inputs** before processing
3. **Log all privacy operations** for audit trails
4. **Use secure file storage** for exports
5. **Implement access controls** for admin functions
6. **Regular security reviews** of privacy components

---

For detailed documentation, see [Privacy Management Guide](privacy-management.md)
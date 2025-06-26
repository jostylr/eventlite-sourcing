# EventLite Sourcing - Development TODO

This document outlines planned enhancements and missing features for the EventLite Sourcing library.

## File Handling & Storage Features

### 1. File Storage Helper Class
- [ ] Create `FileStorageManager` utility class
  - [ ] Support for multiple storage backends (local filesystem, cloud storage)
  - [ ] File upload/download with progress tracking
  - [ ] File metadata management (size, type, checksum)
  - [ ] File reference generation for event storage
  - [ ] File cleanup and garbage collection utilities
  - [ ] Binary file handling (images, documents, archives)

### 2. File Reference Management
- [ ] Standardized file reference format in events
- [ ] File versioning and history tracking
- [ ] File access permission integration
- [ ] File expiration and retention policies
- [ ] Orphaned file detection and cleanup

### 3. File Processing Pipeline
- [ ] Image processing (resize, compress, format conversion)
- [ ] Document parsing and text extraction
- [ ] Virus scanning integration hooks
- [ ] File validation and type verification
- [ ] Thumbnail generation for media files

## Pre-Event Action Framework

### 4. Pre-Event Processor Middleware
- [ ] Generic pre-processing hook system
- [ ] Action chain builder for pre-event operations
- [ ] Conditional processing based on event type
- [ ] Error handling and rollback mechanisms
- [ ] Performance monitoring for pre-event actions

### 5. External Service Integration
- [ ] API call utilities before event storage
- [ ] Service response caching and validation
- [ ] Retry logic and failure handling
- [ ] Rate limiting for external calls
- [ ] Service health monitoring integration

### 6. Data Generation Utilities
- [ ] UUID generation strategies
- [ ] Secure random password generation
- [ ] Token and API key generation
- [ ] Data anonymization helpers
- [ ] Test data generation utilities

## GDPR & Privacy Features

### 7. Standardized GDPR Helper Methods
- [ ] `PrivacyManager` utility class with standard methods:
  - [ ] `requestDataExport(userId)` - Export all user data
  - [ ] `requestDataDeletion(userId)` - Delete user data (crypto-shredding)
  - [ ] `requestDataPortability(userId)` - Data portability format
  - [ ] `requestDataRectification(userId, corrections)` - Data correction
  - [ ] `withdrawConsent(userId, consentType)` - Consent withdrawal
  - [ ] `auditDataProcessing(userId)` - Show processing activities

### 8. Enhanced Privacy Controls
- [ ] Data classification automation
- [ ] Consent management integration
- [ ] Data retention policy enforcement
- [ ] Privacy impact assessment helpers
- [ ] Data breach notification utilities
- [ ] Right to be forgotten automation

### 9. Compliance Reporting
- [ ] GDPR compliance dashboard
- [ ] Data processing activity logs
- [ ] Consent tracking and reporting
- [ ] Data subject request tracking
- [ ] Regulatory audit trail generation

## Event Relationship & Querying Features

### 10. Root Event Detection
- [ ] `getRootEvents()` - Get all events with no causation_id (external events)
- [ ] `getRootEventsInTimeRange(start, end)` - Time-bounded root events
- [ ] `getRootEventsByType(eventType)` - Filter root events by type
- [ ] `getRootEventsByUser(userId)` - User-initiated root events

### 11. Enhanced Child Event Methods
- [ ] Verify existing `getChildEvents(eventId)` method
- [ ] `getDescendantEvents(eventId)` - All descendants (recursive)
- [ ] `getDirectChildren(eventId)` - Only immediate children
- [ ] `getChildrenByType(eventId, eventType)` - Filtered children

### 12. Cousin Event Detection
- [ ] `getCousinEvents(eventId)` - Events sharing same correlation_id but different causation chain
- [ ] `getSiblingEvents(eventId)` - Events with same causation_id
- [ ] `getRelatedEvents(eventId)` - All events in same correlation group
- [ ] `getEventFamily(eventId)` - Complete family tree (ancestors, descendants, cousins)

### 13. Advanced Event Relationship Queries
- [ ] `getEventDepth(eventId)` - How deep in causation chain
- [ ] `getEventBranches(correlationId)` - All causation branches in transaction
- [ ] `findOrphanedEvents()` - Events with invalid causation_ids
- [ ] `getEventInfluence(eventId)` - Count of all descendants
- [ ] `getCriticalPath(correlationId)` - Longest causation chain in transaction

## Performance & Scalability

### 14. Query Optimization
- [ ] Additional database indexes for relationship queries
- [ ] Query result caching for expensive operations
- [ ] Pagination support for large result sets
- [ ] Streaming support for large event exports

### 15. Bulk Operations
- [ ] Bulk event insertion utilities
- [ ] Bulk data export/import tools
- [ ] Batch processing for large datasets
- [ ] Background job integration

## Developer Experience

### 16. Enhanced Testing Utilities
- [ ] Event relationship testing helpers
- [ ] GDPR compliance testing framework
- [ ] File handling test utilities
- [ ] Performance benchmarking tools

### 17. Documentation & Examples
- [ ] File handling usage examples
- [ ] GDPR implementation guide
- [ ] Event relationship pattern examples
- [ ] Performance optimization guide

### 18. Developer Tools
- [ ] Event relationship visualizer
- [ ] GDPR compliance checker
- [ ] Event sourcing debugger
- [ ] Schema migration helpers

## Integration Features


### 19. External Service Connectors
- [ ] AWS S3 file storage integration
- [ ] Google Cloud Storage connector
- [ ] Email service integration (SendGrid, etc.)
- [ ] Analytics service connectors
- [ ] Monitoring service integration

---

## Priority Levels

**High Priority:**
- File Storage Helper Class (#1)
- Standardized GDPR Helper Methods (#7)
- Root Event Detection (#10)
- Cousin Event Detection (#12)

**Medium Priority:**
- Pre-Event Processor Middleware (#4)
- Enhanced Child Event Methods (#11)
- Advanced Event Relationship Queries (#13)

**Low Priority:**
- External Service Connectors (#19)
- Developer Tools (#18)

---

*Last updated: 2025-06-26*
*Version: 0.2.0+*

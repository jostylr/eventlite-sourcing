# EventLite Sourcing - Development TODO

This document outlines planned enhancements and missing features for the EventLite Sourcing library.

## File Handling & Storage Features

### 1. File Storage Helper Class
- [x] Create `FileStorageManager` utility class
  - [x] Support for multiple storage backends (local filesystem, cloud storage)
  - [x] File upload/download with progress tracking
  - [x] File metadata management (size, type, checksum)
  - [x] File reference generation for event storage
  - [x] File cleanup and garbage collection utilities
  - [x] Binary file handling (images, documents, archives)

### 2. File Reference Management
- [x] Standardized file reference format in events
- [x] File versioning and history tracking
- [x] File access permission integration
- [x] File expiration and retention policies
- [x] Orphaned file detection and cleanup

### 3. File Processing Pipeline
- [x] Image processing (resize, compress, format conversion)
- [x] Document parsing and text extraction
- [x] Virus scanning integration hooks
- [x] File validation and type verification
- [x] Thumbnail generation for media files

## Pre-Event Action Framework

### 4. Pre-Event Processor Middleware
- [x] Generic pre-processing hook system
- [x] Action chain builder for pre-event operations
- [x] Conditional processing based on event type
- [x] Error handling and rollback mechanisms
- [x] Performance monitoring for pre-event actions

### 5. External Service Integration
- [x] API call utilities before event storage
- [x] Service response caching and validation
- [x] Retry logic and failure handling
- [x] Rate limiting for external calls
- [x] Service health monitoring integration

### 6. Data Generation Utilities
- [x] UUID generation strategies
- [x] Secure random password generation
- [x] Token and API key generation
- [x] Data anonymization helpers
- [x] Test data generation utilities

## GDPR & Privacy Features

### 7. Standardized GDPR Helper Methods
- [x] `PrivacyManager` utility class with standard methods:
  - [x] `requestDataExport(userId)` - Export all user data
  - [x] `requestDataDeletion(userId)` - Delete user data (crypto-shredding)
  - [x] `requestDataPortability(userId)` - Data portability format
  - [x] `requestDataRectification(userId, corrections)` - Data correction
  - [x] `withdrawConsent(userId, consentType)` - Consent withdrawal
  - [x] `auditDataProcessing(userId)` - Show processing activities

### 8. Enhanced Privacy Controls
- [x] Data classification automation
- [x] Consent management integration
- [x] Data retention policy enforcement
- [x] Privacy impact assessment helpers
- [x] Data breach notification utilities
- [x] Right to be forgotten automation

### 9. Compliance Reporting
- [x] GDPR compliance dashboard
- [x] Data processing activity logs
- [x] Consent tracking and reporting
- [x] Data subject request tracking
- [x] Regulatory audit trail generation

## Event Relationship & Querying Features

### 10. Root Event Detection
- [x] `getRootEvents()` - Get all events with no causation_id (external events)
- [x] `getRootEventsInTimeRange(start, end)` - Time-bounded root events
- [x] `getRootEventsByType(eventType)` - Filter root events by type
- [x] `getRootEventsByUser(userId)` - User-initiated root events

### 11. Enhanced Child Event Methods
- [x] Verify existing `getChildEvents(eventId)` method
- [x] `getDescendantEvents(eventId)` - All descendants (recursive)
- [x] `getDirectChildren(eventId)` - Only immediate children
- [x] `getChildrenByType(eventId, eventType)` - Filtered children

### 12. Cousin Event Detection
- [x] `getCousinEvents(eventId)` - Events sharing same correlation_id but different causation chain
- [x] `getSiblingEvents(eventId)` - Events with same causation_id
- [x] `getRelatedEvents(eventId)` - All events in same correlation group
- [x] `getEventFamily(eventId)` - Complete family tree (ancestors, descendants, cousins)

### 13. Advanced Event Relationship Queries
- [x] `getEventDepth(eventId)` - How deep in causation chain
- [x] `getEventBranches(correlationId)` - All causation branches in transaction
- [x] `findOrphanedEvents()` - Events with invalid causation_ids
- [x] `getEventInfluence(eventId)` - Count of all descendants
- [x] `getCriticalPath(correlationId)` - Longest causation chain in transaction

### Event Visualization & Reporting (Bonus Feature)
- [x] `generateEventReport(options)` - Generate comprehensive event reports in text, JSON, or markdown format
- [x] `generateVisualEventTree(correlationId)` - Create ASCII visual representation of event trees
- [x] `getEventsByCorrelationId(correlationId)` - Get all events in a correlation group
- [x] Event metrics calculation (total events, types, depth analysis, etc.)
- [x] Event relationship analysis (chains, branch points, leaf events)
- [x] Real-world use case examples for debugging and performance analysis

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

import { initQueue, eventCallbacks } from "./lib/event-source.js";
import { modelSetup } from "./lib/model.js";
import { initSnapshots, SnapshotManager } from "./lib/snapshot.js";
import { FileStorageManager } from "./lib/file-storage.js";
import { FileProcessor } from "./lib/file-processor.js";
import { EventQueryEngine } from "./lib/event-querying.js";
import { PreEventProcessor, PreEventChainBuilder, commonProcessors, PreEventProcessorWrapper } from "./lib/pre-event-processor.js";
import { ExternalServiceIntegration, servicePresets } from "./lib/external-service-integration.js";
import { DataGenerator, dataGenerators, defaultDataGenerator } from "./lib/data-generation.js";
import { PrivacyManager, CryptoShredder, PersonalDataStore, ConsentManager, DataClassifier } from "./lib/privacy-manager.js";
import { AutoDataClassifier, ConsentManagementSystem, DataRetentionPolicyManager, PrivacyImpactAssessment, DataBreachNotificationManager } from "./lib/privacy-controls.js";
import ComplianceReportingManager, { ComplianceDashboard, DataProcessingActivityLogger, ConsentTrackingReporter, DataSubjectRequestTracker, RegulatoryAuditTrail } from "./lib/compliance-reporting.js";
import { BulkOperations } from "./lib/bulk-operations.js";
import { BackgroundJobQueue, EventJobProcessor } from "./lib/background-jobs.js";

export {
  initQueue,
  eventCallbacks,
  modelSetup,
  initSnapshots,
  SnapshotManager,
  FileStorageManager,
  FileProcessor,
  EventQueryEngine,
  PreEventProcessor,
  PreEventChainBuilder,
  commonProcessors,
  PreEventProcessorWrapper,
  ExternalServiceIntegration,
  servicePresets,
  DataGenerator,
  dataGenerators,
  defaultDataGenerator,
  // Privacy Management
  PrivacyManager,
  CryptoShredder,
  PersonalDataStore,
  ConsentManager,
  DataClassifier,
  // Enhanced Privacy Controls
  AutoDataClassifier,
  ConsentManagementSystem,
  DataRetentionPolicyManager,
  PrivacyImpactAssessment,
  DataBreachNotificationManager,
  // Compliance Reporting
  ComplianceReportingManager,
  ComplianceDashboard,
  DataProcessingActivityLogger,
  ConsentTrackingReporter,
  DataSubjectRequestTracker,
  RegulatoryAuditTrail,
  // Performance & Bulk Operations
  BulkOperations,
  BackgroundJobQueue,
  EventJobProcessor,
};

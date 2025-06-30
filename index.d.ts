// Type definitions for eventlite-sourcing
// Project: https://github.com/jostylr/eventlite-sourcing

import { Database } from "bun:sqlite";

// Event Data Types
export interface EventData {
  user?: string;
  ip?: string;
  cmd: string;
  data?: Record<string, any>;
  version?: number;
  correlationId?: string;
  causationId?: number;
  metadata?: Record<string, any>;
}

export interface EventRow {
  id: number;
  version: number;
  datetime: number;
  user: string;
  ip: string;
  cmd: string;
  data: Record<string, any>;
  correlation_id: string;
  causation_id: number | null;
  metadata: Record<string, any>;
}

export interface EventMetadata {
  datetime: number;
  user: string;
  ip: string;
  cmd: string;
  id: number;
  version: number;
  correlationId: string;
  causationId: number | null;
  metadata: Record<string, any>;
}

// Error Types
export interface ErrorObject {
  msg: string;
  error?: Error;
  cmd: string;
  data: Record<string, any>;
  user: string;
  ip: string;
  datetime: number;
  id: number;
  version: number;
  correlation_id: string;
  causation_id: number | null;
  metadata: Record<string, any>;
  res?: any;
}

// Callback Types
export type CommandCallback = (result: any, row: EventRow) => void;
export type ErrorCallback = (error: ErrorObject) => void;

export interface CallbackObject {
  [commandName: string]: CommandCallback;
  _default: CommandCallback;
  _error: ErrorCallback;
}

export interface EventCallbacks {
  stub: CallbackObject;
  void: CallbackObject;
  error: CallbackObject;
  done: () => void;
}

// Queue Options
export interface IndexConfiguration {
  correlation_id?: boolean;
  causation_id?: boolean;
  cmd?: boolean;
  user?: boolean;
  datetime?: boolean;
  version?: boolean;
  correlation_cmd?: boolean;
  user_datetime?: boolean;
}

export interface QueueOptions {
  dbName?: string;
  init?: {
    create?: boolean;
    strict?: boolean;
  };
  hash?: {
    algorithm?: "argon2id" | "argon2i" | "argon2d" | "bcrypt";
    memoryCost?: number;
    timeCost?: number;
  };
  noWAL?: boolean;
  WAL?: boolean;
  risky?: boolean;
  reset?: boolean;
  datetime?: () => number;
  cache?: CacheOptions;
  indexes?: IndexConfiguration;
}

// Event Context for storeWithContext
export interface EventContext {
  correlationId?: string;
  causationId?: number;
  parentEventId?: number;
  metadata?: Record<string, any>;
}

// Event Lineage
export interface EventLineage {
  event: EventRow;
  parent: EventRow | null;
  children: EventRow[];
}

// Event Queue
export interface EventQueue {
  _queries: Record<string, any>;
  store(event: EventData, model: Model, callback: CallbackObject): Promise<any>;
  execute(row: EventRow, model: Model, callback: CallbackObject): any;
  retrieveByID(id: number): EventRow | undefined;
  cycleThrough(
    model: Model,
    doneCB?: () => void,
    whileCB?: CallbackObject,
    options?: { start?: number; stop?: number | null },
  ): void;
  getTransaction(correlationId: string): EventRow[];
  getChildEvents(eventId: number): EventRow[];
  getEventLineage(eventId: number): EventLineage | null;
  storeWithContext(
    eventData: EventData,
    context: EventContext,
    model: Model,
    callback: CallbackObject,
  ): Promise<any>;
  reset?: () => void; // Only available when risky: true
}

// Model Types
export type ModelMethod = (
  data: Record<string, any>,
  metadata: EventMetadata,
) => any;

export type MigrationFunction = (
  data: Record<string, any>,
) => Record<string, any>;

export interface ModelMigrations {
  [commandName: string]: MigrationFunction[];
}

export interface ModelOptions {
  dbName?: string;
  init?: {
    create?: boolean;
    strict?: boolean;
  };
  noWAL?: boolean;
  tables?: (db: Database) => void;
  queries?: (db: Database) => Record<string, any>;
  methods?: (
    queries: Record<string, any>,
    db: Database,
  ) => Record<string, ModelMethod>;
  migrations?: () => ModelMigrations;
  reset?:
    | string[]
    | ["move"]
    | ["rename"]
    | ["delete"]
    | ["move", string]
    | [string, string];
  done?: (row: EventRow, result: any) => void;
  error?: (error: ErrorObject) => void;
  stub?: boolean;
  default?: (data: Record<string, any>, metadata: EventMetadata) => any;
}

export interface Model {
  _db: Database;
  _queries: Record<string, any>;
  _default: (data: Record<string, any>, metadata: EventMetadata) => any;
  _done: (row: EventRow, result: any) => void;
  _error: (error: ErrorObject) => void;
  _migrations: ModelMigrations;
  get(cmd: string, data: Record<string, any>): any;
  all(cmd: string, data: Record<string, any>): any[];
  [methodName: string]: any;
}

// Snapshot Types
export interface SnapshotOptions {
  dbName?: string;
  init?: {
    create?: boolean;
    strict?: boolean;
  };
  noWAL?: boolean;
}

export interface SnapshotMetadata {
  [key: string]: any;
}

export interface SnapshotInfo {
  id: number;
  event_id: number;
  model_name: string;
  created_at: number;
  metadata: SnapshotMetadata;
}

export interface CreateSnapshotResult {
  success: boolean;
  snapshotId?: number;
  eventId?: number;
  modelName?: string;
  error?: string;
}

export interface RestoreSnapshotResult {
  success: boolean;
  snapshotId?: number;
  eventId?: number;
  replayFrom: number;
  metadata?: SnapshotMetadata;
  error?: string;
}

export interface ModelState {
  tables: {
    [tableName: string]: {
      schema: any[];
      data: any[];
    };
  };
  version: number;
}

export declare class SnapshotManager {
  constructor(options?: SnapshotOptions);

  createSnapshot(
    modelName: string,
    eventId: number,
    model: Model,
    metadata?: SnapshotMetadata,
  ): Promise<CreateSnapshotResult>;

  restoreSnapshot(
    modelName: string,
    eventId: number,
    model: Model,
  ): Promise<RestoreSnapshotResult>;

  extractModelState(model: Model): Promise<ModelState>;

  restoreModelState(model: Model, state: ModelState): Promise<void>;

  listSnapshots(
    modelName: string,
    limit?: number,
    offset?: number,
  ): SnapshotInfo[];

  deleteSnapshot(modelName: string, eventId: number): boolean;

  deleteOldSnapshots(modelName: string, eventId: number): number;

  close(): void;
}

// File Storage Types
export interface FileStorageOptions {
  baseDir?: string;
  backend?: "local";
  maxFileSize?: number;
  allowedTypes?: string[] | null;
  dbName?: string;
}

export interface FileMetadata {
  originalName: string;
  mimeType: string;
  additionalMetadata?: Record<string, any>;
  ownerId?: string;
  expiresAt?: number;
  retentionPolicy?: string;
}

export interface FileReference {
  id: string;
  path: string;
  size: number;
  mimeType: string;
  checksum: string;
  createdAt: number;
  originalName: string;
  version: number;
  parentId?: string;
  isDuplicate?: boolean;
  ownerId?: string;
  expiresAt?: number;
  retentionPolicy?: string;
}

export interface EventFileReference {
  type: "file_reference";
  fileId: string;
  originalName: string;
  size: number;
  mimeType: string;
  checksum: string;
  version: number;
}

export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  uniqueFiles: number;
  duplicateFiles: number;
  backend: string;
  baseDir: string;
}

export interface FilePermission {
  id: number;
  file_id: string;
  user_id?: string;
  group_id?: string;
  permission_type: string;
  granted_at: number;
  granted_by?: string;
  expires_at?: number;
}

export interface PermissionOptions {
  groupId?: string;
  grantedBy?: string;
  expiresAt?: number;
}

export interface ExpirationResult {
  deletedCount: number;
  totalExpired: number;
}

// File Processing Types
export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  detectedType: string | null;
  actualSize: number;
}

export interface TextExtractionResult {
  success: boolean;
  text: string;
  metadata: Record<string, any>;
  error: string | null;
}

export interface ImageProcessingResult {
  success: boolean;
  originalSize: { width: number; height: number };
  processedBuffer: Buffer | null;
  metadata: Record<string, any>;
  error: string | null;
}

export interface SecurityValidationResult {
  safe: boolean;
  risks: string[];
  recommendations: string[];
}

export interface FileHashes {
  md5: string;
  sha1: string;
  sha256: string;
  sha512: string;
}

export interface VirusScanResult {
  clean: boolean;
  scanTime: number;
  engine: string;
  threats: string[];
}

export interface ProcessingResult {
  fileId: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface FileProcessorOptions {
  maxFileSize?: number;
  allowedTypes?: string[] | null;
  virusScanEnabled?: boolean;
  enableDeepValidation?: boolean;
}

export declare class FileProcessor {
  constructor(options?: FileProcessorOptions);

  validateFile(buffer: Buffer, metadata: FileMetadata): Promise<FileValidationResult>;
  detectFileType(buffer: Buffer): string | null;
  extractTextContent(buffer: Buffer, mimeType: string): Promise<TextExtractionResult>;
  processImage(buffer: Buffer, options?: any): Promise<ImageProcessingResult>;
  generateThumbnail(buffer: Buffer, mimeType: string, options?: any): Promise<ImageProcessingResult>;
  validateContentSecurity(buffer: Buffer, metadata: FileMetadata): Promise<SecurityValidationResult>;
  calculateFileHash(buffer: Buffer, algorithm?: string): string;
  generateFileHashes(buffer: Buffer): FileHashes;
  performVirusScan(buffer: Buffer): Promise<VirusScanResult>;
}

export declare class FileStorageManager {
  baseDir: string;
  backend: string;
  maxFileSize: number;
  allowedTypes: string[] | null;

  constructor(options?: FileStorageOptions);

  storeFile(buffer: Buffer, metadata: FileMetadata): Promise<FileReference>;
  getFile(fileId: string): Promise<Buffer>;
  getFileMetadata(fileId: string): Promise<FileReference>;
  deleteFile(fileId: string): Promise<boolean>;
  
  storeFileVersion(parentId: string, buffer: Buffer, metadata: FileMetadata): Promise<FileReference>;
  getFileVersions(fileId: string): Promise<FileReference[]>;
  getFileHistory(fileId: string): Promise<FileReference[]>;
  
  createEventFileReference(fileRef: FileReference): EventFileReference;
  resolveEventFileReference(eventRef: EventFileReference): Promise<Buffer>;
  extractFileReferences(eventData: any): EventFileReference[];
  
  findOrphanedFiles(referencedFileIds?: string[]): Promise<FileReference[]>;
  cleanupOrphanedFiles(referencedFileIds?: string[]): Promise<number>;
  getStorageStats(): Promise<StorageStats>;
  
  // Permission Management
  grantFilePermission(fileId: string, userId: string, permissionType: string, options?: PermissionOptions): Promise<boolean>;
  revokeFilePermission(permissionId: number): Promise<boolean>;
  checkFilePermission(fileId: string, userId: string, permissionType: string): Promise<boolean>;
  getUserFilePermissions(userId: string): Promise<FilePermission[]>;
  getFilePermissions(fileId: string): Promise<FilePermission[]>;
  canUserAccessFile(fileId: string, userId: string, action?: string): Promise<boolean>;
  getAccessibleFiles(userId: string, permissionType?: string): Promise<FileReference[]>;
  
  // Retention and Expiration
  getExpiredFiles(): Promise<FileReference[]>;
  cleanupExpiredFiles(): Promise<ExpirationResult>;
  applyRetentionPolicy(fileId: string, policy: string | number): Promise<number | null>;
  getFilesByRetentionPolicy(policy: string): Promise<FileReference[]>;
  
  // File Processing
  validateFileContent(fileId: string): Promise<FileValidationResult>;
  extractTextContent(fileId: string): Promise<TextExtractionResult>;
  generateThumbnail(fileId: string, options?: any): Promise<ImageProcessingResult & { thumbnailFileId?: string }>;
  processImage(fileId: string, options?: any): Promise<ImageProcessingResult>;
  validateContentSecurity(fileId: string): Promise<SecurityValidationResult>;
  generateFileHashes(fileId: string): Promise<FileHashes>;
  detectFileType(fileId: string): Promise<string | null>;
  processMultipleFiles(fileIds: string[], operation: string, options?: any): Promise<ProcessingResult[]>;
  
  close(): void;
}

// Event Querying Types
export interface EventQueryOptions {
  correlationId?: string;
  eventId?: string;
  includeMetrics?: boolean;
  includeRelationships?: boolean;
  format?: 'text' | 'json' | 'markdown';
}

export interface EventMetrics {
  totalEvents: number;
  rootEvents: number;
  childEvents: number;
  uniqueEventTypes: number;
  eventTypeDistribution: Record<string, number>;
  timeSpan: number;
  averageDepth: string;
}

export interface EventRelationships {
  chains: Array<{
    startEvent: number;
    length: number;
    events: Array<{ id: number; cmd: string }>;
  }>;
  branchPoints: Array<{
    eventId: number;
    eventCmd: string;
    childCount: number;
    children: Array<{ id: number; cmd: string }>;
  }>;
  leafEvents: Array<{
    eventId: number;
    eventCmd: string;
  }>;
}

export interface EventReportData {
  title: string;
  events: Array<{
    id: number;
    cmd: string;
    causationId: number | null;
    correlationId: string;
    timestamp: string;
    data: any;
    isRoot: boolean;
  }>;
  metrics: EventMetrics;
  relationships: EventRelationships;
  generatedAt: string;
  error?: string;
}

export interface EventBranch {
  id: number;
  cmd: string;
  data: string;
  correlation_id: string;
  causation_id: number | null;
  version: number;
  timestamp: string;
  root_id: number;
  branch_path: string;
  branch_depth: number;
}

export interface CriticalPath {
  id: number;
  cmd: string;
  correlation_id: string;
  causation_id: number | null;
  path_length: number;
  path: string;
}

export declare class EventQueryEngine {
  constructor(dbPath: string);

  // Root Event Detection (#10)
  getRootEvents(): EventRow[];
  getRootEventsInTimeRange(startId: number, endId: number): EventRow[];
  getRootEventsByType(eventType: string): EventRow[];
  getRootEventsByUser(userId: string): EventRow[];

  // Enhanced Child Event Methods (#11)
  getChildEvents(eventId: number): EventRow[];
  getDescendantEvents(eventId: number): EventRow[];
  getDirectChildren(eventId: number): EventRow[];
  getChildrenByType(eventId: number, eventType: string): EventRow[];

  // Cousin Event Detection (#12)
  getCousinEvents(eventId: number): EventRow[];
  getSiblingEvents(eventId: number): EventRow[];
  getRelatedEvents(eventId: number): EventRow[];
  getEventFamily(eventId: number): EventRow[];

  // Advanced Event Relationship Queries (#13)
  getEventDepth(eventId: number): number;
  getEventBranches(correlationId: string): EventBranch[];
  findOrphanedEvents(): EventRow[];
  getEventInfluence(eventId: number): number;
  getCriticalPath(correlationId: string): CriticalPath | null;

  // Event Visualization and Reporting
  generateEventReport(options?: EventQueryOptions): string;
  generateVisualEventTree(correlationId: string): string;
  getEventsByCorrelationId(correlationId: string): EventRow[];

  close(): void;
}

// Performance and Pagination Types
export interface PaginatedResult<T> {
  events: T[];
  totalCount: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface CacheOptions {
  enabled?: boolean;
  maxSize?: number;
  ttl?: number;
}

export interface CacheStats {
  enabled: boolean;
  size?: number;
  maxSize?: number;
  ttl?: number;
}

export interface StreamingOptions {
  batchSize?: number;
  startId?: number;
  endId?: number | null;
  correlationId?: string | null;
  user?: string | null;
  cmd?: string | null;
}

// Bulk Operations Types
export interface BulkExportOptions {
  batchSize?: number;
  startId?: number;
  endId?: number | null;
  correlationId?: string | null;
  user?: string | null;
  cmd?: string | null;
  includeMetadata?: boolean;
  includeHeaders?: boolean;
}

export interface BulkImportOptions {
  batchSize?: number;
  validate?: boolean;
  skipErrors?: boolean;
  model?: Model | null;
  callbacks?: EventCallbacks | null;
}

export interface BulkImportResult {
  success: boolean;
  totalImported: number;
  totalErrors: number;
  errors: Array<{ line?: string; batch?: number; error: string }>;
}

export interface BatchProcessingOptions {
  batchSize?: number;
  startId?: number;
  endId?: number | null;
  correlationId?: string | null;
  user?: string | null;
  cmd?: string | null;
  parallel?: boolean;
  maxConcurrency?: number;
}

export interface BatchProcessingResult {
  success: boolean;
  totalProcessed: number;
  totalErrors: number;
  errors: Array<{ batch: number; error: string }>;
}

export interface ProcessingStats {
  totalEvents: number;
  eventsByCommand: Record<string, number>;
  eventsByUser: Record<string, number>;
  eventsByVersion: Record<string, number>;
  dateRange: { min: number | null; max: number | null };
  uniqueCorrelations: number;
  rootEvents: number;
  childEvents: number;
}

// Background Job Types
export interface JobOptions {
  delay?: number;
  maxAttempts?: number;
  priority?: number;
  timeout?: number;
}

export interface JobWorkerOptions {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface Job {
  id: string;
  type: string;
  data: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  scheduledAt: number;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  attempts: number;
  maxAttempts: number;
  priority: number;
  timeout: number;
  result?: any;
  error?: string;
  recurringId?: NodeJS.Timeout;
}

export interface JobStatus {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  scheduledAt: number;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  error?: string;
}

export interface QueueStats {
  total: number;
  pending: number;
  running: number;
  byType: Record<string, number>;
  oldestPending: number | null;
  recentCompletion: {
    completed: number;
    failed: number;
    averageDuration: number;
  };
}

// Enhanced EventQueue interface with performance methods
export interface EventQueue {
  // Existing methods...
  retrieveByID(id: number): EventRow | null;
  store(event: EventData, model?: Model, callbacks?: EventCallbacks): EventRow;
  execute(row: EventRow, model: Model, callbacks: EventCallbacks): any;
  cycleThrough(
    model: Model,
    doneCB: () => void,
    whileCB?: EventCallbacks,
    options?: { start?: number; stop?: number | null }
  ): void;
  getTransaction(correlationId: string): EventRow[];
  getChildEvents(eventId: number): EventRow[];
  getEventLineage(eventId: number): any;
  storeWithContext(
    eventData: EventData,
    context: Record<string, any>,
    model?: Model,
    callbacks?: EventCallbacks
  ): EventRow;

  // Cached methods
  retrieveByIDCached(id: number): EventRow | null;
  getTransactionCached(correlationId: string): EventRow[];

  // Paginated methods
  getByCorrelationIdPaginated(
    correlationId: string,
    options?: PaginationOptions
  ): PaginatedResult<EventRow>;
  getChildEventsPaginated(
    eventId: number,
    options?: PaginationOptions
  ): PaginatedResult<EventRow>;
  getEventsByUserPaginated(
    user: string,
    options?: PaginationOptions
  ): PaginatedResult<EventRow>;
  getEventsByCmdPaginated(
    cmd: string,
    options?: PaginationOptions
  ): PaginatedResult<EventRow>;
  getEventsInTimeRangePaginated(
    start: number,
    end: number,
    options?: PaginationOptions
  ): PaginatedResult<EventRow>;

  // Bulk operations
  storeBulk(
    events: EventData[],
    model?: Model,
    callbacks?: EventCallbacks
  ): Array<{ row: EventRow; result: any }>;

  // Streaming
  streamEvents(options?: StreamingOptions): AsyncGenerator<EventRow[], void, unknown>;

  // Cache management
  clearCache(): void;
  getCacheStats(): CacheStats;
}

// Bulk Operations Class
export class BulkOperations {
  constructor(eventQueue: EventQueue);

  exportToJSONL(filePath: string, options?: BulkExportOptions): Promise<{ success: boolean; totalExported: number }>;
  importFromJSONL(filePath: string, options?: BulkImportOptions): Promise<BulkImportResult>;
  exportToCSV(filePath: string, options?: BulkExportOptions): Promise<{ success: boolean; totalExported: number }>;
  batchProcess(
    processorFn: (batch: EventRow[]) => Promise<any>,
    options?: BatchProcessingOptions
  ): Promise<BatchProcessingResult>;
  migrateEvents(
    migrationFn: (event: EventRow, targetVersion: number) => Promise<EventRow>,
    options?: { batchSize?: number; targetVersion?: number; dryRun?: boolean }
  ): Promise<{
    totalProcessed: number;
    totalMigrated: number;
    errors: Array<{ eventId: number; error: string }>;
    dryRun: boolean;
  }>;
  getProcessingStats(options?: {
    startId?: number;
    endId?: number | null;
    timeRange?: { start: number; end: number } | null;
  }): Promise<ProcessingStats>;
}

// Background Job Classes
export class BackgroundJobQueue {
  constructor(options?: {
    maxHistorySize?: number;
    defaultTimeout?: number;
    processingIntervalMs?: number;
  });

  registerWorker(
    jobType: string,
    workerFn: (data: Record<string, any>, job: Job) => Promise<any>,
    options?: JobWorkerOptions
  ): void;

  addJob(
    jobType: string,
    data?: Record<string, any>,
    options?: JobOptions
  ): string;

  scheduleJob(
    jobType: string,
    data: Record<string, any>,
    scheduledTime: number,
    options?: JobOptions
  ): string;

  scheduleRecurringJob(
    jobType: string,
    data: Record<string, any>,
    intervalMs: number,
    options?: JobOptions
  ): string;

  start(): void;
  stop(): void;
  getJobStatus(jobId: string): JobStatus | null;
  getQueueStats(): QueueStats;
  cancelJob(jobId: string): boolean;
  clearHistory(): void;
}

export class EventJobProcessor {
  constructor(eventQueue: EventQueue, jobQueue: BackgroundJobQueue);

  onEvent(
    eventCmd: string,
    jobType: string,
    dataMapper?: (eventData: Record<string, any>, eventRow: EventRow) => Record<string, any>
  ): void;

  processEvent(eventData: Record<string, any>, eventRow: EventRow): string[];
  createEventCallback(): EventCallbacks;
}

// Developer Tools Types
export interface VisualizationOptions {
  format?: 'tree' | 'graph' | 'timeline' | 'flowchart';
  includeData?: boolean;
  showDepth?: boolean;
  showMetrics?: boolean;
  groupByType?: boolean;
}

export interface EventVisualization {
  correlationId: string;
  format: string;
  events: number;
  generatedAt: string;
  content: string;
}

export interface ComplianceCheckOptions {
  userId?: string | null;
  checkDataIntegrity?: boolean;
  checkRetentionPolicies?: boolean;
  checkConsentTracking?: boolean;
  checkDataClassification?: boolean;
  generateReport?: boolean;
}

export interface ComplianceIssue {
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  recommendation?: string;
  component?: string;
}

export interface ComplianceCheckResult {
  passed: boolean;
  issues: ComplianceIssue[];
  details?: Record<string, any>;
}

export interface ComplianceResults {
  timestamp: string;
  userId?: string | null;
  overallCompliance: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'UNKNOWN';
  checks: {
    dataIntegrity: ComplianceCheckResult | null;
    retentionPolicies: ComplianceCheckResult | null;
    consentTracking: ComplianceCheckResult | null;
    dataClassification: ComplianceCheckResult | null;
    cryptoShredding: ComplianceCheckResult | null;
    auditTrail: ComplianceCheckResult | null;
  };
  issues: ComplianceIssue[];
  recommendations: Array<{
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    category: string;
    title: string;
    description: string;
    steps?: string[];
  }>;
  summary: {
    complianceScore: number;
    passedChecks: number;
    totalChecks: number;
    issueCount: number;
    recommendationCount: number;
  };
}

export interface DebugSessionOptions {
  correlationId?: string | null;
  eventId?: number | null;
  timeRange?: { start: number; end: number } | null;
  trackPerformance?: boolean;
  verboseLogging?: boolean;
}

export interface DebugSession {
  id: string;
  startTime: Date;
  options: DebugSessionOptions;
  events: EventRow[];
  analysis: Record<string, any>;
  performance: Record<string, any>;
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
  status: 'ACTIVE' | 'COMPLETED';
}

export interface ChainAnalysis {
  chains: Array<{
    rootEvent: number;
    events: EventRow[];
    length: number;
    truncated: boolean;
    issues: string[];
  }>;
  issues: Array<{
    type: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    message: string;
    recommendation: string;
  }>;
  recommendations: Array<{
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    category: string;
    message: string;
    actions: string[];
  }>;
  statistics: {
    totalChains: number;
    averageChainLength: number;
    longestChain: number;
    totalIssues: number;
    branchingFactor: number;
  };
}

export interface ReplayAnomalies {
  stateInconsistencies: any[];
  orderingIssues: Array<{
    type: string;
    eventId: number;
    causationId: number;
    message: string;
  }>;
  missingEvents: Array<{
    type: string;
    eventId: number;
    missingCausationId: number;
    message: string;
  }>;
  duplicateEvents: Array<{
    type: string;
    eventIds: number[];
    signature: string;
    message: string;
  }>;
  recommendations: Array<{
    category: string;
    message: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
}

export interface Migration {
  id: string;
  name: string;
  description: string;
  created: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  up: {
    sql: Array<{ id: string; sql: string; timestamp: string }>;
    eventMigrations: Array<{
      id: string;
      fromVersion: number | null;
      toVersion: number | null;
      eventType: string | null;
      transformation: ((data: any) => any) | null;
      validator: ((data: any) => boolean) | null;
      timestamp: string;
    }>;
    dataTransformations: any[];
  };
  down: {
    sql: Array<{ id: string; sql: string; timestamp: string }>;
    eventMigrations: Array<{
      id: string;
      fromVersion: number | null;
      toVersion: number | null;
      eventType: string | null;
      transformation: ((data: any) => any) | null;
      validator: ((data: any) => boolean) | null;
      timestamp: string;
    }>;
    dataTransformations: any[];
  };
}

export interface MigrationExecution {
  migrationId: string;
  direction: 'up' | 'down';
  dryRun: boolean;
  startTime: Date;
  endTime?: Date;
  steps: Array<{
    type: 'SQL' | 'EVENT_MIGRATION' | 'DATA_TRANSFORMATION';
    id: string;
    success: boolean;
    dryRun: boolean;
    timestamp: string;
    message?: string;
    error?: any;
  }>;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  errors: any[];
}

export interface HealthCheck {
  timestamp: string;
  overall: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'ERROR' | 'UNKNOWN';
  checks: Record<string, any>;
  recommendations: string[];
}

// Developer Tools Classes
export class EventVisualizerPro {
  constructor(dbPath: string);
  
  generateInteractiveEventMap(correlationId: string, options?: VisualizationOptions): EventVisualization;
  close(): void;
}

export class GDPRComplianceChecker {
  constructor(dbPath: string);
  
  runComplianceCheck(options?: ComplianceCheckOptions): Promise<ComplianceResults | string>;
  close(): void;
}

export class EventSourcingDebugger {
  constructor(dbPath: string);
  
  startDebugSession(sessionId: string, options?: DebugSessionOptions): DebugSession;
  analyzeCausationChains(sessionId: string): ChainAnalysis;
  detectReplayAnomalies(sessionId: string, expectedState?: any): ReplayAnomalies;
  generateDebugReport(sessionId: string, format?: 'text' | 'json'): string;
  endDebugSession(sessionId: string): DebugSession | undefined;
  close(): void;
}

export class SchemaMigrationHelper {
  constructor(dbPath: string);
  
  createMigration(name: string, description?: string): Migration;
  addSQLMigration(migration: Migration, direction: 'up' | 'down', sql: string): Migration;
  addEventMigration(migration: Migration, direction: 'up' | 'down', config: {
    fromVersion?: number | null;
    toVersion?: number | null;
    eventType?: string | null;
    transformation?: ((data: any) => any) | null;
    validator?: ((data: any) => boolean) | null;
  }): Migration;
  executeMigration(migration: Migration, direction?: 'up' | 'down', dryRun?: boolean): Promise<MigrationExecution>;
  getMigrationStatus(): {
    applied: any[];
    pending: any[];
    total: number;
    lastMigration: any | null;
  };
  rollbackLastMigration(dryRun?: boolean): Promise<any>;
  generateMigrationTemplate(name: string, type?: 'schema' | 'event'): string;
  close(): void;
}

export class DeveloperToolsSuite {
  constructor(dbPath: string);
  
  visualizer: EventVisualizerPro;
  complianceChecker: GDPRComplianceChecker;
  debugger: EventSourcingDebugger;
  migrationHelper: SchemaMigrationHelper;
  
  quickHealthCheck(): Promise<HealthCheck>;
  close(): void;
}

// Main exports
export function initQueue(options?: QueueOptions): EventQueue;
export function modelSetup(options?: ModelOptions): Model;
export function initSnapshots(options?: SnapshotOptions): SnapshotManager;
export declare const eventCallbacks: EventCallbacks;

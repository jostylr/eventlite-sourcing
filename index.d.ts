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
  risky?: boolean;
  reset?: boolean;
  datetime?: () => number;
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

// Main exports
export function initQueue(options?: QueueOptions): EventQueue;
export function modelSetup(options?: ModelOptions): Model;
export function initSnapshots(options?: SnapshotOptions): SnapshotManager;
export declare const eventCallbacks: EventCallbacks;

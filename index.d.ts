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

// Main exports
export function initQueue(options?: QueueOptions): EventQueue;
export function modelSetup(options?: ModelOptions): Model;
export function initSnapshots(options?: SnapshotOptions): SnapshotManager;
export declare const eventCallbacks: EventCallbacks;

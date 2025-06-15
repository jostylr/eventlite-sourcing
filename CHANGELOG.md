# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2025-01-15

### Added

- **Event Versioning & Migrations** - Handle evolving event schemas with automatic migrations
  - Events now include a `version` field (defaults to 1)
  - Models can define migration functions to upgrade old event data
  - Migrations are applied automatically during event execution
  - Supports multiple migration steps between versions

- **Snapshot Support** - Efficient state restoration for large event stores
  - New `initSnapshots()` function creates a snapshot manager
  - Save complete model state at any point with `createSnapshot()`
  - Restore state from snapshots with `restoreSnapshot()`
  - List, delete, and manage snapshot lifecycle
  - Dramatically improves performance for systems with many events

- **Correlation & Causation IDs** - Track relationships between events
  - `correlationId` groups related events across a business transaction
  - `causationId` links events to their direct cause
  - Auto-generates correlation IDs for new transactions
  - Automatically inherits correlation IDs from parent events
  - New query methods: `getTransaction()`, `getChildEvents()`, `getEventLineage()`
  - Helper method `storeWithContext()` for easy context propagation

- **Enhanced Metadata** - Additional context for every event
  - New `metadata` field on all events for arbitrary data
  - Preserved during replay and available in event handlers
  - Useful for tracking service names, versions, reasons, etc.

- **TypeScript Support** - Full type definitions included
  - Complete type definitions in `index.d.ts`
  - IntelliSense support in VS Code and other IDEs
  - Type checking for all public APIs
  - Exported types for `EventData`, `EventRow`, `Model`, etc.

### Changed

- Event queue table schema now includes `version`, `correlation_id`, `causation_id`, and `metadata` columns
- Added indexes on `correlation_id` and `causation_id` for efficient querying
- Event metadata passed to methods now includes all new fields
- Updated all examples to demonstrate new features

### Migration Guide

See [MIGRATION-v0.2.0.md](docs/MIGRATION-v0.2.0.md) for detailed upgrade instructions. The update is backward compatible - existing code will continue to work without modifications.

### Added
- Comprehensive documentation including Getting Started guide and API reference
- Example applications demonstrating various use cases
- Contributing guidelines for new contributors
- GitHub Actions workflow for automated testing
- Support for multiple database reset strategies (move, rename, delete)

### Changed
- Improved error messages for better debugging experience
- Enhanced test coverage to 97.83%
- Updated README with clearer structure and examples

### Fixed
- Password hashing now properly handles async operations
- Event replay correctly processes events from specified starting points

## [0.1.0] - 2024-01-20

### Added
- Initial release of EventLite Sourcing
- Core event sourcing functionality with SQLite backend
- Event queue initialization with `initQueue()`
- Model setup with `modelSetup()`
- Automatic password hashing for `user_password` fields
- Event storage and execution
- Event replay capability with `cycleThrough()`
- Built-in callback handlers (stub, void, error, done)
- Write-Ahead Logging (WAL) support
- User and IP tracking for all events
- Comprehensive test suite with high coverage
- Basic examples and documentation

### Security
- Prepared statements to prevent SQL injection
- Automatic password hashing using Bun.password
- Support for argon2id and bcrypt algorithms

[Unreleased]: https://github.com/yourusername/eventlite-sourcing/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/yourusername/eventlite-sourcing/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/yourusername/eventlite-sourcing/releases/tag/v0.1.0
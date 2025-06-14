# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/yourusername/eventlite-sourcing/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/eventlite-sourcing/releases/tag/v0.1.0
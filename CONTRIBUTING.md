# Contributing to EventLite Sourcing

First off, thank you for considering contributing to EventLite Sourcing! It's people like you that make EventLite Sourcing such a great tool.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Your First Code Contribution](#your-first-code-contribution)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Style Guidelines](#style-guidelines)
  - [JavaScript Style Guide](#javascript-style-guide)
  - [Commit Messages](#commit-messages)
  - [Documentation Style](#documentation-style)
- [Testing Guidelines](#testing-guidelines)
- [Project Structure](#project-structure)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to [project-email@example.com].

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment (see [Development Setup](#development-setup))
4. Create a branch for your feature or fix
5. Make your changes
6. Run tests to ensure everything works
7. Push to your fork and submit a pull request

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

**Bug Report Template:**

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Initialize event queue with '...'
2. Store event '....'
3. Execute '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Code Example**
```javascript
// Minimal code example that reproduces the issue
```

**Environment:**
 - OS: [e.g. macOS, Ubuntu]
 - Bun version: [e.g. 1.1.0]
 - EventLite version: [e.g. 0.1.0]

**Additional context**
Add any other context about the problem here.
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a step-by-step description** of the suggested enhancement
- **Provide specific examples** to demonstrate the steps
- **Describe the current behavior** and **explain which behavior you expected to see instead**
- **Explain why this enhancement would be useful**

### Your First Code Contribution

Unsure where to begin contributing? You can start by looking through these issues:

- Issues labeled `good first issue` - issues which should only require a few lines of code
- Issues labeled `help wanted` - issues which should be a bit more involved than `good first issue`

### Pull Requests

1. Follow the [style guidelines](#style-guidelines)
2. Include tests for new functionality
3. Update documentation as needed
4. Ensure all tests pass
5. Make sure your code lints
6. Issue that pull request!

**Pull Request Template:**

```markdown
**Description**
Brief description of what this PR does.

**Related Issue**
Fixes #(issue number)

**Type of Change**
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

**Checklist:**
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published
```

## Development Setup

1. **Install Bun**
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/eventlite-sourcing.git
   cd eventlite-sourcing
   ```

3. **Install dependencies**
   ```bash
   bun install
   ```

4. **Run tests**
   ```bash
   bun test
   ```

5. **Run examples**
   ```bash
   bun run examples/user-management.js
   ```

## Style Guidelines

### JavaScript Style Guide

We follow these conventions:

- **Indentation**: 2 spaces (no tabs)
- **Semicolons**: Use semicolons
- **Quotes**: Use single quotes for strings except to avoid escaping
- **Variables**: Use `const` by default, `let` when needed, never `var`
- **Functions**: Use arrow functions for callbacks, regular functions for methods
- **Async**: Use async/await over promises when possible

**Example:**

```javascript
// Good
const eventQueue = initQueue({
  dbName: 'events.sqlite'
});

async function processEvent(event) {
  try {
    const result = await eventQueue.store(event, model, callbacks);
    return result;
  } catch (error) {
    console.error('Failed to process event:', error);
    throw error;
  }
}

// Bad
var event_queue = initQueue({
    dbName: "events.sqlite"
})

function processEvent(event) {
  return eventQueue.store(event, model, callbacks)
    .then(result => result)
    .catch(error => {
      console.error("Failed to process event:", error)
      throw error
    })
}
```

### Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line
- Consider starting the commit message with an applicable emoji:
  - 🎨 `:art:` when improving the format/structure of the code
  - 🐛 `:bug:` when fixing a bug
  - 🔥 `:fire:` when removing code or files
  - 📝 `:memo:` when writing docs
  - 🚀 `:rocket:` when improving performance
  - ✅ `:white_check_mark:` when adding tests
  - 🔒 `:lock:` when dealing with security

**Example:**
```
🐛 Fix event replay starting from specific ID

Previously, cycleThrough would skip the first event when starting
from a specific rowid. This commit fixes the off-by-one error.

Fixes #123
```

### Documentation Style

- Use Markdown for all documentation
- Include code examples for all new features
- Keep language clear and concise
- Use proper headings hierarchy
- Include JSDoc comments for public APIs

**Example:**
```javascript
/**
 * Store and execute an event
 * @param {Object} event - The event to store
 * @param {string} event.cmd - Command name
 * @param {Object} event.data - Command data
 * @param {string} [event.user] - User identifier
 * @param {string} [event.ip] - IP address
 * @param {Object} model - The model to execute against
 * @param {Object} callbacks - Event callbacks
 * @returns {Promise<void>}
 */
async function store(event, model, callbacks) {
  // Implementation
}
```

## Testing Guidelines

### Writing Tests

- Write tests for all new functionality
- Follow the existing test structure
- Use descriptive test names
- Test both success and failure cases
- Include edge cases

**Test Structure:**
```javascript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

describe('Feature Name', () => {
  let eventQueue;
  let model;
  
  beforeEach(() => {
    // Setup
    eventQueue = initQueue({ dbName: ':memory:' });
    model = modelSetup({ dbName: ':memory:' });
  });
  
  afterEach(() => {
    // Cleanup
  });
  
  test('should handle normal case', async () => {
    // Arrange
    const event = { cmd: 'test', data: { value: 42 } };
    
    // Act
    await eventQueue.store(event, model, callbacks);
    
    // Assert
    const stored = eventQueue.retrieveByID(1);
    expect(stored.data.value).toBe(42);
  });
  
  test('should handle error case', () => {
    // Test error scenarios
    expect(() => {
      eventQueue.store({ cmd: 'invalid' }, model, callbacks);
    }).toThrow('Command invalid not found');
  });
});
```

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage

# Run specific test file
bun test tests/event-source.test.js
```

### Test Coverage

We aim for high test coverage (>95%). New features should include tests that maintain or improve coverage.

## Project Structure

```
event-sourcing/
├── index.js                 # Main entry point
├── event-source.js          # Core event sourcing logic
├── model.js                 # Model setup utilities
├── package.json            # Project metadata
├── README.md               # Main documentation
├── CONTRIBUTING.md         # This file
├── LICENSE                 # MIT license
├── docs/                   # Documentation
│   ├── API.md             # API reference
│   └── getting-started.md  # Getting started guide
├── examples/               # Example implementations
│   ├── README.md          # Examples overview
│   ├── user-management.js  # User system example
│   └── ...                # Other examples
├── tests/                  # Test suite
│   ├── README.md          # Test documentation
│   ├── event-source.test.js
│   ├── model.test.js
│   └── ...                # Other tests
└── sample/                 # Basic sample code
    └── sample.js
```

## Questions?

Feel free to:
- Open an issue for questions
- Start a discussion in GitHub Discussions
- Reach out to maintainers

Thank you for contributing! 🎉
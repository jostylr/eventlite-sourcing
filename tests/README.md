# Event Sourcing Tests

This directory contains comprehensive tests for the event sourcing library. The test suite is built using Bun's built-in test runner and achieves 97.83% code coverage.

## Test Structure

The test suite is organized into several files:

### `event-source.test.js`
Tests the core event sourcing functionality:
- Queue initialization with various options
- Event storage and execution
- Event retrieval by ID
- Cycling through events for replay
- Error handling and edge cases
- Event callbacks (stub, void, error)

### `model.test.js`
Tests the model setup and management:
- Model initialization with different configurations
- Database reset functionality (move, rename, delete)
- Query and method setup
- Get and all query operations
- Integration with event sourcing
- Error handling scenarios
- Default method behavior

### `integration.test.js`
Tests the complete system working together:
- End-to-end event sourcing workflows
- State rebuilding from events
- Complex scenarios like user authentication tracking
- Partial replay from specific points
- Callback integration with different command types
- Error propagation through the system

### `sample.test.js`
Tests the sample implementation:
- Validates the sample code runs correctly
- Tests variable storage and arithmetic operations
- Tests event replay functionality
- Tests direct query passthrough

### `index.test.js`
Tests the module exports:
- Verifies all expected functions are exported
- Checks eventCallbacks structure
- Ensures exports match direct imports

## Running Tests

### Run all tests
```bash
bun test
```

### Run tests in watch mode
```bash
bun test --watch
```

### Run tests with coverage
```bash
bun test --coverage
```

### Run a specific test file
```bash
bun test event-source.test.js
```

### Run tests matching a pattern
```bash
bun test -t "should store and execute"
```

## Test Database Management

Tests create temporary SQLite databases in the `tests/data/` directory. These are automatically cleaned up after each test run. The tests handle:

- Creating test databases with proper isolation
- Cleaning up databases after tests
- Testing database reset functionality
- Handling missing or corrupted databases

## Key Testing Patterns

### 1. Setup and Teardown
Each test file uses `beforeEach` and `afterEach` hooks to ensure clean state:

```javascript
beforeEach(() => {
  // Clean up any existing test databases
  if (existsSync(testDbPath)) {
    rmSync(testDbPath);
  }
});

afterEach(() => {
  // Clean up test databases after each test
  if (existsSync(testDbPath)) {
    rmSync(testDbPath);
  }
});
```

### 2. Mock Objects
Tests use mock models and callbacks to isolate functionality:

```javascript
const mockModel = {
  testCmd: (data) => ({ result: "success", value: data.value }),
  _done: () => {},
  _error: () => {}
};

const mockCb = {
  _default: (res, row) => {
    results.push({ res, row });
  },
  _error: (err) => {
    errors.push(err);
  }
};
```

### 3. Async Testing
The event sourcing system supports async operations (like password hashing). Tests handle this appropriately.

### 4. Error Scenarios
Tests include comprehensive error handling:
- Missing commands
- Database errors
- Invalid queries
- Model errors
- Callback errors

## Coverage Goals

The test suite aims for high coverage while focusing on meaningful tests:
- Current line coverage: 97.83%
- Current function coverage: 92.31%
- All critical paths are tested
- Edge cases are covered

## Writing New Tests

When adding new functionality:

1. Add unit tests in the appropriate test file
2. Add integration tests if the feature affects multiple components
3. Ensure error cases are tested
4. Run coverage to verify new code is tested
5. Keep tests focused and independent

Example test structure:
```javascript
describe("Feature Name", () => {
  test("should handle normal case", () => {
    // Arrange
    const input = setupTestData();
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    expect(result).toBe(expectedValue);
  });
  
  test("should handle error case", () => {
    expect(() => {
      functionUnderTest(invalidInput);
    }).toThrow("Expected error message");
  });
});
```

## Debugging Tests

To debug failing tests:

1. Run the specific failing test in isolation
2. Add console.log statements to trace execution
3. Check test database files aren't corrupted
4. Verify mock objects have all required methods
5. Use Bun's built-in debugger: `bun test --inspect`

## CI/CD Integration

The test suite is designed to run in CI/CD pipelines:
- No external dependencies required
- Creates its own test databases
- Cleans up after itself
- Exits with appropriate codes
- Provides detailed failure information
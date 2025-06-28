# Test Helpers

This directory contains utilities to make testing cleaner and more consistent.

## Silencing "unknown to model" Warnings

### The Problem
EventLite logs helpful warnings when events don't have corresponding model methods:
```
createUserProfile is unknown to model. The data is { userId: "user1" }
```

This is expected behavior that helps with debugging, but can clutter test output.

### The Solutions

#### Option 1: Use Test Helper Functions (Recommended)
```javascript
import { createTestModel, createSilentEventCallbacks } from "./helpers/test-helpers.js";

const model = createTestModel({
  methods: () => ({
    knownCommand: (data) => ({ result: "success" })
  })
});

await eventQueue.store(event, model, createSilentEventCallbacks());
```

#### Option 2: Add Silent Default to Your Model
```javascript
const model = {
  methods: () => ({ /* your methods */ }),
  default: () => "", // Silent handler for unknown commands
  _error: () => {},
  _done: () => {}
};
```

#### Option 3: Mock Console (Nuclear Option)
```javascript
import { mockConsole } from "./helpers/test-helpers.js";

test("my test", () => {
  const restoreConsole = mockConsole();
  
  // Your test code here - no console output
  
  restoreConsole(); // Restore console at end
});
```

## Available Functions

- `createSilentModelDefault()` - Creates a silent default handler
- `createTestModel(config)` - Creates a test model with silent defaults
- `mockConsole()` - Mocks console methods, returns restore function
- `createSilentEventCallbacks(callbacks)` - Creates silent event callbacks

## When to Use

- **Always in unit tests** - to keep output clean
- **Sometimes in integration tests** - when you want to focus on specific outputs
- **Never in examples/demos** - users should see the normal behavior
- **Optionally in development** - if the warnings become noisy

The warnings are helpful in development but unnecessary noise in automated tests.
/**
 * Test helpers for silencing console output and providing clean test environments
 * 
 * ABOUT "unknown to model" WARNINGS:
 * ===================================
 * The EventLite system logs warnings when events are processed that don't have 
 * corresponding model methods. This is expected behavior and helps with debugging
 * in development. The warning looks like:
 * 
 *   "commandName is unknown to model. The data is { ... }"
 * 
 * In tests, these warnings can clutter the output. This file provides helpers
 * to create silent model configurations for clean test runs.
 * 
 * SOLUTIONS:
 * - Use createTestModel() for test models with silent default handlers
 * - Add a custom 'default' property to your model that returns empty string
 * - Use mockConsole() to temporarily silence all console output
 */

/**
 * Creates a silent default handler for model setup to suppress "unknown to model" warnings
 */
export function createSilentModelDefault() {
  return (data, meta) => {
    // Silently ignore unknown commands in tests
    return "";
  };
}

/**
 * Creates a test model with silent default handler
 */
export function createTestModel(config = {}) {
  const {
    setup = () => ({}),
    methods = () => ({}),
    tables = () => {},
    ...otherConfig
  } = config;

  return {
    setup,
    methods,
    tables,
    default: createSilentModelDefault(),
    _error: () => {}, // Silent error handler
    _done: () => {},  // Silent done handler
    ...otherConfig
  };
}

/**
 * Mocks console methods to suppress output during tests
 */
export function mockConsole() {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };

  // Mock console methods to be silent
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};

  // Return restore function
  return () => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  };
}

/**
 * Creates eventCallbacks with silent error handling for tests
 */
export function createSilentEventCallbacks(callbacks = {}) {
  return {
    _error: () => {}, // Silent error callback
    _default: () => {}, // Silent default callback
    ...callbacks
  };
}
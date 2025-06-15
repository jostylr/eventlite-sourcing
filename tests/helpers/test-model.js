import { modelSetup } from "../../lib/model.js";

/**
 * Creates a test model with a silent default handler that returns acknowledgements
 * instead of logging to console.
 *
 * @param {Object} options - Options to pass to modelSetup
 * @param {boolean} options.stub - Whether to create a stub model
 * @param {string} options.dbName - Database name (defaults to ":memory:")
 * @param {boolean} options.enableLogging - If true, uses the default logging behavior
 * @returns {Object} Model instance
 */
export function createTestModel(options = {}) {
  const { enableLogging = false, ...modelOptions } = options;

  // Default to in-memory database for tests
  const defaults = {
    dbName: ":memory:",
    stub: true,
  };

  // If logging is not explicitly enabled, provide a silent default handler
  if (!enableLogging && !modelOptions.default) {
    modelOptions.default = (data, meta) => {
      // Return an acknowledgement object that tests can verify
      return {
        acknowledged: true,
        cmd: meta.cmd,
        timestamp: new Date().toISOString(),
        data: data,
      };
    };
  }

  return modelSetup({ ...defaults, ...modelOptions });
}

/**
 * Creates a test event queue and model pair with sensible defaults
 * @param {Object} options - Options for both queue and model
 * @returns {Object} Object with { queue, model }
 */
export function createTestEnvironment(options = {}) {
  const { queueOptions = {}, modelOptions = {} } = options;

  // Import here to avoid circular dependencies
  const { initQueue } = require("../../index.js");

  const queue = initQueue({
    dbName: ":memory:",
    risky: true,
    ...queueOptions,
  });

  const model = createTestModel(modelOptions);

  return { queue, model };
}

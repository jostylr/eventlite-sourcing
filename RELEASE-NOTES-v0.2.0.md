# EventLite Sourcing v0.2.0 Release Notes

We're excited to announce the release of EventLite Sourcing v0.2.0! This release brings powerful new features while maintaining full backward compatibility with existing applications.

## 🎉 New Features

### 📌 Event Versioning & Migrations
Handle evolving event schemas with confidence. Events now include a version field and models can define migration functions to automatically upgrade old event data.

```javascript
migrations() {
  return {
    updateStatus: [
      // Version 1 -> 2: Rename status values
      (data) => ({
        ...data,
        status: data.status === 'inactive' ? 'disabled' : data.status
      })
    ]
  };
}
```

### 💾 Snapshot Support
Dramatically improve performance for systems with many events. Save and restore complete model state at any point.

```javascript
const snapshots = initSnapshots({ dbName: 'data/snapshots.sqlite' });

// Create snapshot after processing events
await snapshots.createSnapshot('my-model', 1000, model);

// Restore and replay only recent events
const result = await snapshots.restoreSnapshot('my-model', 2000, freshModel);
```

### 🔗 Correlation & Causation IDs
Track relationships between events across your system. Perfect for distributed tracing, debugging, and implementing saga patterns.

```javascript
// Events in the same business transaction share a correlation ID
await eventQueue.store({
  cmd: 'createOrder',
  data: { customerId: 'CUST001' }
}, model, callbacks);

// Related events can reference their cause
await eventQueue.storeWithContext({
  cmd: 'processPayment',
  data: { orderId: 1 }
}, {
  parentEventId: 1,
  metadata: { paymentMethod: 'credit_card' }
}, model, callbacks);
```

### 📘 TypeScript Support
Full type definitions are now included for a better development experience with IntelliSense and type checking.

### 🏷️ Enhanced Metadata
Add arbitrary metadata to events for tracking service names, versions, reasons for changes, and more.

## 🚀 Performance Improvements

- Indexed correlation_id and causation_id columns for fast querying
- Efficient snapshot storage and restoration
- Optimized event replay with snapshot support

## 📚 Documentation

- Comprehensive [Migration Guide](docs/MIGRATION-v0.2.0.md) for upgrading from v0.1.0
- Updated [API Documentation](docs/API.md) with all new methods
- New examples demonstrating versioning and snapshots
- Detailed guide on [Correlation and Causation IDs](docs/correlation-causation-ids.md)

## 🔧 Migration

Version 0.2.0 is fully backward compatible! Your existing code will continue to work without modifications. To take advantage of new features:

1. Update your package:
   ```bash
   bun update eventlite-sourcing
   ```

2. Optionally adopt new features as needed:
   - Add migrations for evolving schemas
   - Implement snapshots for performance
   - Use correlation IDs for better tracking

See the [Migration Guide](docs/MIGRATION-v0.2.0.md) for detailed instructions.

## 📊 By the Numbers

- **5 major new features** added
- **97.59%** test coverage maintained
- **90 tests** ensuring reliability
- **0 breaking changes** - full backward compatibility

## 🙏 Acknowledgments

Thank you to all contributors and users who provided feedback and suggestions. Your input has been invaluable in shaping these new features.

## 📞 Get Involved

- Report issues or suggest features on [GitHub](https://github.com/yourusername/eventlite-sourcing/issues)
- Read the [Contributing Guide](CONTRIBUTING.md) to get started
- Join the discussion in our community channels

## 🚀 What's Next

We're already planning v0.3.0 with features like:
- Event streaming and subscriptions
- Built-in projections
- Multi-database support
- Performance optimizations for very large event stores

Stay tuned for more exciting updates!

---

**Full Changelog**: https://github.com/yourusername/eventlite-sourcing/compare/v0.1.0...v0.2.0
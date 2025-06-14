# EventLite Sourcing Examples

This directory contains practical examples demonstrating how to use EventLite Sourcing in various scenarios.

## Examples Overview

### 1. [Simple Todo App](./todo-app.js)
A basic todo list application showing:
- Creating and completing todos
- Event storage and replay
- Basic callbacks

### 2. [User Management System](./user-management.js)
A user registration and authentication system featuring:
- Password hashing
- User registration/login events
- Role management
- Account updates

### 3. [E-commerce Shopping Cart](./shopping-cart.js)
An e-commerce cart implementation with:
- Add/remove items
- Price calculations
- Checkout process
- Order history

### 4. [Bank Account Ledger](./bank-ledger.js)
A financial ledger system demonstrating:
- Account creation
- Deposits and withdrawals
- Balance calculations
- Transaction history
- Audit trails

### 5. [Real-time Chat Application](./chat-app.js)
A chat system showing:
- Message events
- Room management
- User presence
- Message history

### 6. [Blog Publishing System](./blog-cms.js)
A content management system with:
- Post creation/editing
- Publishing workflow
- Comment system
- Version history

### 7. [Inventory Management](./inventory.js)
A warehouse inventory system featuring:
- Stock movements
- Multiple warehouses
- Low stock alerts
- Audit trail

### 8. [Event Replay Demo](./replay-demo.js)
Advanced replay scenarios:
- Point-in-time recovery
- Partial replay
- Event filtering
- State comparison

## Running the Examples

Each example can be run independently:

```bash
# Install dependencies (if not already done)
bun install

# Run an example
bun run examples/todo-app.js
```

## Common Patterns

### Event Structure
All examples follow a consistent event structure:
```javascript
{
  cmd: 'commandName',
  data: { /* command data */ },
  user: 'userId',
  ip: 'ipAddress'
}
```

### Model Structure
Each example defines:
- `tables()` - Database schema
- `queries()` - Prepared SQL statements
- `methods()` - Event handlers

### Callback Patterns
Examples demonstrate various callback strategies:
- Logging callbacks
- Notification callbacks
- Analytics callbacks
- Error handling

## Learning Path

1. **Start with**: [todo-app.js](./todo-app.js) - Learn the basics
2. **Then try**: [user-management.js](./user-management.js) - Add authentication
3. **Explore**: [shopping-cart.js](./shopping-cart.js) - Complex state management
4. **Advanced**: [bank-ledger.js](./bank-ledger.js) - Financial accuracy
5. **Master**: [replay-demo.js](./replay-demo.js) - Time travel debugging

## Key Concepts Demonstrated

### Event Sourcing Fundamentals
- Storing events instead of state
- Event replay and reconstruction
- Immutable event log

### Practical Patterns
- Command validation
- Error handling
- Event enrichment
- Aggregate calculations

### Advanced Features
- Password hashing
- Multi-model systems
- Event versioning
- Performance optimization

## Creating Your Own Example

To add a new example:

1. Create a new file: `examples/your-example.js`
2. Follow the structure:
   ```javascript
   import { initQueue, modelSetup, eventCallbacks } from 'eventlite-sourcing';
   
   // 1. Initialize event queue
   const eventQueue = initQueue({ /* options */ });
   
   // 2. Define your model
   const model = modelSetup({ /* schema and handlers */ });
   
   // 3. Define callbacks
   const callbacks = { /* event handlers */ };
   
   // 4. Demo function
   async function demo() {
     // Your example logic
   }
   
   // 5. Run the demo
   demo().catch(console.error);
   ```
3. Document what your example demonstrates
4. Submit a PR!

## Tips for Examples

- Keep examples focused on one concept
- Add plenty of comments
- Show both success and error cases
- Include console output for clarity
- Demonstrate event replay when relevant

## Questions?

If you have questions about any example:
- Check the inline comments
- Read the [Getting Started Guide](../docs/getting-started.md)
- Consult the [API Documentation](../docs/API.md)
- Open an issue on GitHub
# Getting Started with EventLite Sourcing

This guide will walk you through setting up EventLite Sourcing in your project, from installation to building your first event-sourced application.

## Prerequisites

- [Bun](https://bun.sh) installed (v1.0.0 or later)
- Basic knowledge of JavaScript/TypeScript
- Understanding of SQLite basics (helpful but not required)

## Installation

Create a new project and install EventLite Sourcing:

```bash
# Create a new directory
mkdir my-event-app
cd my-event-app

# Initialize a new project
bun init

# Install EventLite Sourcing
bun add eventlite-sourcing
```

## Your First Event-Sourced Application

Let's build a simple task management system to demonstrate the core concepts.

### Step 1: Set up the Event Queue

Create a file called `app.js`:

```javascript
import { initQueue, modelSetup, eventCallbacks } from 'eventlite-sourcing';

// Initialize the event queue
// This creates a SQLite database to store all events
const eventQueue = initQueue({
  dbName: 'data/task-events.sqlite'
});

console.log('Event queue initialized!');
```

### Step 2: Define Your Model

The model represents the current state of your application:

```javascript
// Set up the model (current state database)
const taskModel = modelSetup({
  dbName: 'data/tasks.sqlite',
  
  // Define the database schema
  tables(db) {
    db.query(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT 0,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `).run();
  },
  
  // Define prepared queries
  queries(db) {
    return {
      createTask: db.query('INSERT INTO tasks (title, created_at) VALUES ($title, $created_at)'),
      completeTask: db.query('UPDATE tasks SET completed = 1, completed_at = $completed_at WHERE id = $id'),
      getTask: db.query('SELECT * FROM tasks WHERE id = $id'),
      getAllTasks: db.query('SELECT * FROM tasks ORDER BY created_at DESC')
    };
  },
  
  // Define event handlers
  methods(queries) {
    return {
      createTask({ title }, queries, { datetime }) {
        const result = queries.createTask.run({
          title,
          created_at: Date.parse(datetime)
        });
        return {
          id: result.lastInsertRowid,
          title,
          message: `Task "${title}" created`
        };
      },
      
      completeTask({ taskId }, queries, { datetime }) {
        const task = queries.getTask.get({ id: taskId });
        if (!task) {
          throw new Error(`Task ${taskId} not found`);
        }
        
        queries.completeTask.run({
          id: taskId,
          completed_at: Date.parse(datetime)
        });
        
        return {
          id: taskId,
          message: `Task "${task.title}" completed`
        };
      }
    };
  }
});

console.log('Task model initialized!');
```

### Step 3: Process Events

Now let's create and process some events:

```javascript
// Define callbacks to handle event results
const callbacks = {
  createTask(result, row) {
    console.log(`✅ ${result.message}`);
    console.log(`   Created by: ${row.user || 'system'} at ${row.datetime}`);
  },
  
  completeTask(result, row) {
    console.log(`✅ ${result.message}`);
  },
  
  _default(result, row) {
    console.log(`Event processed: ${row.cmd}`);
  },
  
  _error({ msg, cmd, data }) {
    console.error(`❌ Error in ${cmd}: ${msg}`);
  }
};

// Create some tasks
async function demo() {
  // Create tasks
  await eventQueue.store({
    cmd: 'createTask',
    data: { title: 'Learn EventLite Sourcing' },
    user: 'alice'
  }, taskModel, callbacks);
  
  await eventQueue.store({
    cmd: 'createTask',
    data: { title: 'Build an event-sourced app' },
    user: 'alice'
  }, taskModel, callbacks);
  
  // Complete a task
  await eventQueue.store({
    cmd: 'completeTask',
    data: { taskId: 1 },
    user: 'alice'
  }, taskModel, callbacks);
}

// Run the demo
demo().catch(console.error);
```

### Step 4: Query the Current State

Let's add a function to view the current state:

```javascript
function showAllTasks() {
  const tasks = taskModel.queries.getAllTasks.all();
  console.log('\n📋 Current Tasks:');
  tasks.forEach(task => {
    const status = task.completed ? '✓' : '○';
    console.log(`${status} [${task.id}] ${task.title}`);
  });
}

// Update the demo function
async function demo() {
  // ... previous code ...
  
  // Show current state
  showAllTasks();
}
```

### Step 5: Time Travel with Event Replay

One of the most powerful features of event sourcing is the ability to rebuild state from events:

```javascript
// Function to rebuild state from scratch
function rebuildFromEvents() {
  console.log('\n🔄 Rebuilding state from events...');
  
  // Reset the model database
  const newModel = modelSetup({
    dbName: 'data/tasks-rebuilt.sqlite',
    reset: ['delete'], // Delete existing database
    // ... same configuration as before ...
  });
  
  // Replay all events
  eventQueue.cycleThrough(
    newModel,
    () => {
      console.log('✅ State rebuilt successfully!');
      // You could now query the rebuilt database
    },
    eventCallbacks.void // Silent during replay
  );
}
```

## Complete Example

Here's the complete application:

```javascript
import { initQueue, modelSetup, eventCallbacks } from 'eventlite-sourcing';

// Initialize event queue
const eventQueue = initQueue({
  dbName: 'data/task-events.sqlite'
});

// Set up model
const taskModel = modelSetup({
  dbName: 'data/tasks.sqlite',
  
  tables(db) {
    db.query(`
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT 0,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `).run();
  },
  
  queries(db) {
    return {
      createTask: db.query('INSERT INTO tasks (title, created_at) VALUES ($title, $created_at)'),
      completeTask: db.query('UPDATE tasks SET completed = 1, completed_at = $completed_at WHERE id = $id'),
      getTask: db.query('SELECT * FROM tasks WHERE id = $id'),
      getAllTasks: db.query('SELECT * FROM tasks ORDER BY created_at DESC')
    };
  },
  
  methods(queries) {
    return {
      createTask({ title }, queries, { datetime }) {
        const result = queries.createTask.run({
          title,
          created_at: Date.parse(datetime)
        });
        return {
          id: result.lastInsertRowid,
          title,
          message: `Task "${title}" created`
        };
      },
      
      completeTask({ taskId }, queries, { datetime }) {
        const task = queries.getTask.get({ id: taskId });
        if (!task) {
          throw new Error(`Task ${taskId} not found`);
        }
        
        queries.completeTask.run({
          id: taskId,
          completed_at: Date.parse(datetime)
        });
        
        return {
          id: taskId,
          message: `Task "${task.title}" completed`
        };
      }
    };
  }
});

// Callbacks
const callbacks = {
  createTask(result, row) {
    console.log(`✅ ${result.message}`);
  },
  
  completeTask(result, row) {
    console.log(`✅ ${result.message}`);
  },
  
  _error({ msg, cmd }) {
    console.error(`❌ Error in ${cmd}: ${msg}`);
  }
};

// Helper functions
function showAllTasks() {
  const tasks = taskModel.queries.getAllTasks.all();
  console.log('\n📋 Current Tasks:');
  tasks.forEach(task => {
    const status = task.completed ? '✓' : '○';
    console.log(`${status} [${task.id}] ${task.title}`);
  });
}

// Main demo
async function main() {
  console.log('🚀 Task Manager Demo\n');
  
  // Create tasks
  await eventQueue.store({
    cmd: 'createTask',
    data: { title: 'Learn EventLite Sourcing' },
    user: 'alice'
  }, taskModel, callbacks);
  
  await eventQueue.store({
    cmd: 'createTask',
    data: { title: 'Build an event-sourced app' },
    user: 'bob'
  }, taskModel, callbacks);
  
  await eventQueue.store({
    cmd: 'createTask',
    data: { title: 'Deploy to production' },
    user: 'alice'
  }, taskModel, callbacks);
  
  // Complete a task
  await eventQueue.store({
    cmd: 'completeTask',
    data: { taskId: 1 },
    user: 'alice'
  }, taskModel, callbacks);
  
  // Show current state
  showAllTasks();
}

main().catch(console.error);
```

## Understanding the Flow

1. **Events are stored**: Each action (create task, complete task) is stored as an event
2. **Events are executed**: The model methods process the events and update the state
3. **Callbacks fire**: Side effects happen (logging, notifications, etc.)
4. **State is queryable**: You can query the current state at any time
5. **History is preserved**: All events remain in the event queue for replay

## Next Steps

### 1. Add More Features

Try adding these commands to your task manager:
- `updateTask` - Change task title
- `deleteTask` - Mark task as deleted
- `assignTask` - Assign to a user
- `addComment` - Add comments to tasks

### 2. Implement Security

Add user authentication and authorization:

```javascript
const eventQueue = initQueue({
  dbName: 'data/events.sqlite',
  hash: { algorithm: 'argon2id' } // Enable password hashing
});

// In your methods, check authorization
methods(queries) {
  return {
    deleteTask({ taskId }, queries, { user }) {
      if (!user) {
        throw new Error('Authentication required');
      }
      // ... rest of implementation
    }
  };
}
```

### 3. Add Event Replay Features

Implement point-in-time recovery:

```javascript
// Replay events up to a specific date
function replayUntil(targetDate) {
  const targetTimestamp = Date.parse(targetDate);
  
  eventQueue.cycleThrough(
    taskModel,
    () => console.log(`State at ${targetDate} rebuilt`),
    {
      _default(result, row) {
        // Stop if we've reached the target date
        if (Date.parse(row.datetime) > targetTimestamp) {
          return false; // Stop processing
        }
      },
      _error() {}
    }
  );
}
```

### 4. Build a Web API

Use EventLite with your favorite web framework:

```javascript
import { Elysia } from 'elysia';

const app = new Elysia()
  .post('/tasks', async ({ body, request }) => {
    const result = await eventQueue.store({
      cmd: 'createTask',
      data: body,
      user: request.headers.get('user-id'),
      ip: request.headers.get('x-forwarded-for')
    }, taskModel, callbacks);
    
    return { success: true, result };
  })
  .get('/tasks', () => {
    return taskModel.queries.getAllTasks.all();
  })
  .listen(3000);
```

## Common Patterns

### 1. Command Validation

Always validate commands before processing:

```javascript
methods(queries) {
  return {
    createTask({ title }) {
      // Validation
      if (!title || title.trim().length === 0) {
        throw new Error('Task title is required');
      }
      if (title.length > 200) {
        throw new Error('Task title too long');
      }
      // ... rest of implementation
    }
  };
}
```

### 2. Event Enrichment

Add metadata to events:

```javascript
await eventQueue.store({
  cmd: 'createTask',
  data: { 
    title: 'Important task',
    priority: 'high',
    tags: ['urgent', 'client']
  },
  user: userId,
  ip: request.ip
}, taskModel, callbacks);
```

### 3. Aggregate Calculations

Calculate derived state:

```javascript
queries(db) {
  return {
    // ... other queries ...
    getStats: db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(completed) as completed,
        COUNT(*) - SUM(completed) as pending
      FROM tasks
    `)
  };
}
```

### 4. Event Versioning

Plan for schema evolution:

```javascript
methods(queries) {
  return {
    createTask_v2({ title, description, dueDate }) {
      // New version with more fields
    },
    
    // Keep old version for compatibility
    createTask({ title }) {
      // Delegate to new version
      return this.createTask_v2({ title, description: '', dueDate: null });
    }
  };
}
```

## Troubleshooting

### Database Locked Error

If you see "database is locked" errors:
- Ensure you're not opening multiple connections
- Enable WAL mode (default)
- Close database connections properly

### Events Not Replaying

If events aren't replaying correctly:
- Check that model methods are idempotent
- Verify the starting rowid is correct
- Ensure callbacks aren't throwing errors

### Performance Issues

For better performance:
- Use prepared queries (already done by default)
- Index frequently queried columns
- Consider archiving old events
- Use event batching for bulk operations

## Resources

- [API Documentation](./API.md) - Complete API reference
- [Examples](../examples/) - More example applications
- [Tests](../tests/) - Test examples and patterns
- [GitHub Repository](https://github.com/yourusername/eventlite-sourcing) - Source code and issues

## Getting Help

- Check the [FAQ](./FAQ.md)
- Browse [GitHub Issues](https://github.com/yourusername/eventlite-sourcing/issues)
- Ask questions in [Discussions](https://github.com/yourusername/eventlite-sourcing/discussions)

Happy event sourcing! 🚀
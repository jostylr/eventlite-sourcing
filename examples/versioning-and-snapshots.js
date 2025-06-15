import { initQueue, modelSetup, eventCallbacks, initSnapshots } from '../index.js';

// Example: E-commerce order system with event versioning and snapshots

// Initialize the event queue
const eventQueue = initQueue({
  dbName: 'data/versioned-events.sqlite',
  reset: true // Clear for demo
});

// Initialize snapshot manager
const snapshots = initSnapshots({
  dbName: 'data/order-snapshots.sqlite'
});

// Set up the order model with migrations
const orderModel = modelSetup({
  dbName: 'data/orders-v2.sqlite',
  reset: ['delete'], // Start fresh for demo

  tables(db) {
    // Version 2 schema - includes shipping address
    db.query(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        total REAL DEFAULT 0,
        items TEXT DEFAULT '[]',
        shipping_address TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )
    `).run();

    db.query(`
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        product_id TEXT,
        quantity INTEGER,
        price REAL,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      )
    `).run();
  },

  queries(db) {
    return {
      createOrder: db.query('INSERT INTO orders (customer_id, created_at) VALUES ($customerId, $createdAt)'),
      getOrder: db.query('SELECT * FROM orders WHERE id = $id'),
      updateOrderTotal: db.query('UPDATE orders SET total = $total, updated_at = $updatedAt WHERE id = $id'),
      updateOrderStatus: db.query('UPDATE orders SET status = $status, updated_at = $updatedAt WHERE id = $id'),
      addOrderItem: db.query('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($orderId, $productId, $quantity, $price)'),
      getOrderItems: db.query('SELECT * FROM order_items WHERE order_id = $orderId'),
      updateShippingAddress: db.query('UPDATE orders SET shipping_address = $address, updated_at = $updatedAt WHERE id = $id'),
      getAllOrders: db.query('SELECT * FROM orders ORDER BY id DESC LIMIT 100')
    };
  },

  methods(queries) {
    return {
      createOrder({ customerId }, metadata) {
        const result = queries.createOrder.run({
          customerId,
          createdAt: metadata.datetime
        });
        return { orderId: result.lastInsertRowid, customerId };
      },

      addItem({ orderId, productId, quantity, price }, metadata) {
        // Add item
        queries.addOrderItem.run({ orderId, productId, quantity, price });

        // Update order total
        const items = queries.getOrderItems.all({ orderId });
        const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        queries.updateOrderTotal.run({
          total,
          updatedAt: metadata.datetime,
          id: orderId
        });

        return { orderId, productId, quantity, price, newTotal: total };
      },

      updateStatus({ orderId, status }, metadata) {
        queries.updateOrderStatus.run({
          status,
          updatedAt: metadata.datetime,
          id: orderId
        });
        return { orderId, status };
      },

      // New in version 2
      setShippingAddress({ orderId, address }, metadata) {
        queries.updateShippingAddress.run({
          address: JSON.stringify(address),
          updatedAt: metadata.datetime,
          id: orderId
        });
        return { orderId, address };
      }
    };
  },

  // Migrations for handling different event versions
  migrations() {
    return {
      addItem: [
        // Version 1 -> Version 2: Add default shipping info if missing
        (data) => {
          if (!data.shippingInfo) {
            return { ...data, shippingInfo: { method: 'standard' } };
          }
          return data;
        }
      ],

      updateStatus: [
        // Version 1 -> Version 2: Map old status values to new ones
        (data) => {
          const statusMap = {
            'completed': 'delivered',  // Old terminology
            'in-progress': 'processing'
          };
          if (statusMap[data.status]) {
            return { ...data, status: statusMap[data.status] };
          }
          return data;
        }
      ]
    };
  }
});

// Demonstration
async function demo() {
  console.log('=== Event Versioning and Snapshots Demo ===\n');

  // Create some orders with version 1 events
  console.log('1. Creating orders with version 1 events...');

  await eventQueue.store({
    cmd: 'createOrder',
    data: { customerId: 'CUST001' },
    version: 1
  }, orderModel, eventCallbacks.void);

  await eventQueue.store({
    cmd: 'addItem',
    data: {
      orderId: 1,
      productId: 'PROD001',
      quantity: 2,
      price: 29.99
    },
    version: 1  // Old version without shipping info
  }, orderModel, eventCallbacks.void);

  await eventQueue.store({
    cmd: 'updateStatus',
    data: { orderId: 1, status: 'completed' },  // Old status value
    version: 1
  }, orderModel, eventCallbacks.void);

  // Create more orders
  for (let i = 2; i <= 5; i++) {
    await eventQueue.store({
      cmd: 'createOrder',
      data: { customerId: `CUST00${i}` },
      version: 2
    }, orderModel, eventCallbacks.void);

    await eventQueue.store({
      cmd: 'addItem',
      data: {
        orderId: i,
        productId: `PROD00${i}`,
        quantity: 1,
        price: 19.99 * i,
        shippingInfo: { method: 'express' }  // New field in v2
      },
      version: 2
    }, orderModel, eventCallbacks.void);
  }

  console.log('✓ Created 5 orders with mixed version events\n');

  // Show current state
  console.log('2. Current order state:');
  const orders = orderModel._queries.getAllOrders.all();
  orders.forEach(order => {
    console.log(`   Order #${order.id}: Customer ${order.customer_id}, Status: ${order.status}, Total: $${order.total}`);
  });

  // Create a snapshot after 5 events
  console.log('\n3. Creating snapshot after event #5...');
  const snapshotResult = await snapshots.createSnapshot('orders', 5, orderModel, {
    description: 'After initial orders',
    orderCount: 5
  });
  console.log(`✓ Snapshot created: ID ${snapshotResult.snapshotId}\n`);

  // Add more events with version 2
  console.log('4. Adding more events (version 2)...');

  await eventQueue.store({
    cmd: 'setShippingAddress',
    data: {
      orderId: 1,
      address: {
        street: '123 Main St',
        city: 'Example City',
        zip: '12345'
      }
    },
    version: 2
  }, orderModel, eventCallbacks.void);

  await eventQueue.store({
    cmd: 'updateStatus',
    data: { orderId: 2, status: 'processing' },
    version: 2
  }, orderModel, eventCallbacks.void);

  console.log('✓ Added shipping address and status updates\n');

  // Create another snapshot
  console.log('5. Creating snapshot after event #7...');
  const snapshot2Result = await snapshots.createSnapshot('orders', 7, orderModel, {
    description: 'After shipping updates',
    orderCount: 5
  });
  console.log(`✓ Snapshot created: ID ${snapshot2Result.snapshotId}\n`);

  // List available snapshots
  console.log('6. Available snapshots:');
  const snapshotList = snapshots.listSnapshots('orders');
  snapshotList.forEach(snap => {
    console.log(`   - Event #${snap.event_id}: ${snap.metadata.description} (${new Date(snap.created_at).toLocaleString()})`);
  });

  // Demonstrate restoration
  console.log('\n7. Demonstrating snapshot restoration...');
  console.log('   Resetting model and restoring from first snapshot...');

  // Reset the model
  const freshModel = modelSetup({
    dbName: 'data/orders-restored.sqlite',
    reset: ['delete'],
    ...orderModel._db.constructor.arguments[0] // Copy original config
  });

  // Restore from first snapshot
  const restoreResult = await snapshots.restoreSnapshot('orders', 5, freshModel);
  console.log(`✓ Restored from snapshot at event #${restoreResult.eventId}`);
  console.log(`   Need to replay from event #${restoreResult.replayFrom}\n`);

  // Replay remaining events
  console.log('8. Replaying events from snapshot...');
  let replayCount = 0;
  eventQueue.methods.cycleThrough(
    freshModel,
    () => console.log(`✓ Replayed ${replayCount} events after snapshot`),
    {
      _default: () => { replayCount++; },
      _error: (err) => console.error('Replay error:', err.msg)
    },
    { start: restoreResult.replayFrom }
  );

  // Show migration in action
  console.log('\n9. Migration example:');
  console.log('   Original v1 event: { status: "completed" }');
  console.log('   After migration: { status: "delivered" }');
  const order1 = orderModel._queries.getOrder.get({ id: 1 });
  console.log(`   Order #1 status in database: "${order1.status}"`);

  // Cleanup old snapshots
  console.log('\n10. Cleaning up old snapshots...');
  const deleted = snapshots.deleteOldSnapshots('orders', 7);
  console.log(`✓ Deleted ${deleted} old snapshot(s)\n`);

  console.log('=== Demo Complete ===');

  // Close connections
  snapshots.close();
}

// Run the demo
demo().catch(console.error);

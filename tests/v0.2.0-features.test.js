import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import {
  initQueue,
  modelSetup,
  eventCallbacks,
  initSnapshots,
} from "../index.js";
import { unlinkSync } from "fs";

describe("v0.2.0 Features Integration", () => {
  let eventQueue;
  let snapshots;
  let model;

  beforeEach(() => {
    eventQueue = initQueue({ dbName: ":memory:", risky: true });
    snapshots = initSnapshots({ dbName: ":memory:" });
  });

  afterEach(() => {
    if (eventQueue.reset) {
      eventQueue.reset();
    }
    if (snapshots) {
      snapshots.close();
    }
  });

  test("should integrate all new features in a real-world scenario", async () => {
    // Setup model with versioning and migrations
    const orderModel = modelSetup({
      dbName: ":memory:",
      tables(db) {
        db.query(
          `
          CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            total REAL DEFAULT 0,
            shipping_address TEXT,
            created_at INTEGER,
            updated_at INTEGER
          )
        `,
        ).run();

        db.query(
          `
          CREATE TABLE order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            product_id TEXT,
            quantity INTEGER,
            price REAL,
            discount REAL DEFAULT 0,
            FOREIGN KEY (order_id) REFERENCES orders(id)
          )
        `,
        ).run();

        db.query(
          `
          CREATE TABLE audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER,
            correlation_id TEXT,
            action TEXT,
            timestamp INTEGER
          )
        `,
        ).run();
      },

      queries(db) {
        return {
          createOrder: db.query(
            "INSERT INTO orders (customer_id, created_at) VALUES ($customerId, $createdAt)",
          ),
          getOrder: db.query("SELECT * FROM orders WHERE id = $id"),
          updateOrderStatus: db.query(
            "UPDATE orders SET status = $status, updated_at = $updatedAt WHERE id = $id",
          ),
          updateOrderTotal: db.query(
            "UPDATE orders SET total = $total WHERE id = $id",
          ),
          addOrderItem: db.query(
            "INSERT INTO order_items (order_id, product_id, quantity, price, discount) VALUES ($orderId, $productId, $quantity, $price, $discount)",
          ),
          getOrderItems: db.query(
            "SELECT * FROM order_items WHERE order_id = $orderId",
          ),
          addAuditLog: db.query(
            "INSERT INTO audit_log (event_id, correlation_id, action, timestamp) VALUES ($eventId, $correlationId, $action, $timestamp)",
          ),
          getAuditLogs: db.query(
            "SELECT * FROM audit_log WHERE correlation_id = $correlationId ORDER BY timestamp",
          ),
          getAllOrders: db.query("SELECT * FROM orders"),
          updateShippingAddress: db.query(
            "UPDATE orders SET shipping_address = $address WHERE id = $id",
          ),
        };
      },

      methods(queries) {
        return {
          createOrder({ customerId }, metadata) {
            const result = queries.createOrder.run({
              customerId,
              createdAt: metadata.datetime,
            });

            // Log the action
            queries.addAuditLog.run({
              eventId: metadata.id,
              correlationId: metadata.correlationId,
              action: "order_created",
              timestamp: metadata.datetime,
            });

            return {
              orderId: result.lastInsertRowid,
              customerId,
              correlationId: metadata.correlationId,
            };
          },

          addItem({ orderId, productId, quantity, price, discount }, metadata) {
            const discountValue = discount || 0;

            queries.addOrderItem.run({
              orderId,
              productId,
              quantity,
              price,
              discount: discountValue,
            });

            // Update order total
            const items = queries.getOrderItems.all({ orderId });
            const total = items.reduce((sum, item) => {
              const itemTotal =
                item.price * item.quantity * (1 - item.discount);
              return sum + itemTotal;
            }, 0);

            queries.updateOrderTotal.run({ total, id: orderId });

            // Log the action
            queries.addAuditLog.run({
              eventId: metadata.id,
              correlationId: metadata.correlationId,
              action: "item_added",
              timestamp: metadata.datetime,
            });

            return {
              orderId,
              productId,
              quantity,
              price,
              discount: discountValue,
              newTotal: total,
            };
          },

          updateStatus({ orderId, status }, metadata) {
            queries.updateOrderStatus.run({
              status,
              updatedAt: metadata.datetime,
              id: orderId,
            });

            queries.addAuditLog.run({
              eventId: metadata.id,
              correlationId: metadata.correlationId,
              action: `status_changed_to_${status}`,
              timestamp: metadata.datetime,
            });

            return { orderId, status };
          },

          setShippingAddress({ orderId, address }, metadata) {
            queries.updateShippingAddress.run({
              address: JSON.stringify(address),
              id: orderId,
            });

            return { orderId, address };
          },
        };
      },

      migrations() {
        return {
          addItem: [
            // v1 -> v2: Add default discount if missing
            (data) => {
              if (data.discount === undefined) {
                return { ...data, discount: 0 };
              }
              return data;
            },
            // v2 -> v3: Convert percentage to decimal
            (data) => {
              if (data.discount > 1) {
                return { ...data, discount: data.discount / 100 };
              }
              return data;
            },
          ],
          updateStatus: [
            // v1 -> v2: Map old status values
            (data) => {
              const statusMap = {
                completed: "delivered",
                cancelled: "refunded",
              };
              return {
                ...data,
                status: statusMap[data.status] || data.status,
              };
            },
          ],
        };
      },
    });

    // Scenario: Complete order workflow with all features
    const correlationId = crypto.randomUUID();
    const events = [];
    const callbacks = {
      _default: (result, row) => {
        events.push({ result, row });
      },
      _error: (error) => {
        console.error("Error:", error);
      },
    };

    // 1. Create order (new correlation ID)
    const orderResult = await eventQueue.store(
      {
        cmd: "createOrder",
        data: { customerId: "CUST001" },
        metadata: { source: "web", userAgent: "Mozilla/5.0" },
      },
      orderModel,
      callbacks,
    );

    const orderId = orderResult.orderId;
    const orderCorrelationId = orderResult.correlationId;

    // 2. Add items with different versions (testing migrations)
    await eventQueue.store(
      {
        cmd: "addItem",
        data: {
          orderId,
          productId: "PROD001",
          quantity: 2,
          price: 49.99,
          // v1: no discount field (will be migrated)
        },
        version: 1,
        causationId: 1,
      },
      orderModel,
      callbacks,
    );

    await eventQueue.store(
      {
        cmd: "addItem",
        data: {
          orderId,
          productId: "PROD002",
          quantity: 1,
          price: 29.99,
          discount: 10, // v2: percentage (will be converted to 0.1)
        },
        version: 2,
        causationId: 1,
      },
      orderModel,
      callbacks,
    );

    await eventQueue.store(
      {
        cmd: "addItem",
        data: {
          orderId,
          productId: "PROD003",
          quantity: 3,
          price: 19.99,
          discount: 0.05, // v3: already decimal
        },
        version: 3,
        causationId: 1,
      },
      orderModel,
      callbacks,
    );

    // 3. Create snapshot after initial items
    const snapshot1 = await snapshots.createSnapshot(
      "order-model",
      4,
      orderModel,
      { stage: "items_added", orderId },
    );
    expect(snapshot1.success).toBe(true);

    // 4. Update status with old terminology (will be migrated)
    await eventQueue.storeWithContext(
      {
        cmd: "updateStatus",
        data: { orderId, status: "completed" }, // Old status
        version: 1,
      },
      {
        parentEventId: 1,
        metadata: { reason: "payment_confirmed" },
      },
      orderModel,
      callbacks,
    );

    // 5. Add shipping address
    await eventQueue.storeWithContext(
      {
        cmd: "setShippingAddress",
        data: {
          orderId,
          address: {
            street: "123 Main St",
            city: "Example City",
            zip: "12345",
          },
        },
      },
      {
        correlationId: orderCorrelationId,
        causationId: 5,
        metadata: { validated: true },
      },
      orderModel,
      callbacks,
    );

    // Verify the complete transaction
    const transaction = eventQueue.getTransaction(orderCorrelationId);
    expect(transaction).toHaveLength(6);
    expect(transaction[0].cmd).toBe("createOrder");
    expect(transaction[1].cmd).toBe("addItem");
    expect(transaction[4].cmd).toBe("updateStatus");

    // Verify event lineage
    const orderLineage = eventQueue.getEventLineage(1);
    expect(orderLineage.children).toHaveLength(4); // 3 items + 1 status update

    const statusLineage = eventQueue.getEventLineage(5);
    expect(statusLineage.parent.id).toBe(1);
    expect(statusLineage.children).toHaveLength(1); // shipping address

    // Verify migrations worked correctly
    const order = orderModel._queries.getOrder.get({ id: orderId });
    expect(order.status).toBe("delivered"); // Migrated from "completed"

    const items = orderModel._queries.getOrderItems.all({ orderId });
    expect(items[0].discount).toBe(0); // Added by migration
    expect(items[1].discount).toBe(0.1); // Converted from 10%
    expect(items[2].discount).toBe(0.05); // Already correct

    // Verify audit trail
    const auditLogs = orderModel._queries.getAuditLogs.all({
      correlationId: orderCorrelationId,
    });
    expect(auditLogs).toHaveLength(5);
    expect(auditLogs.map((log) => log.action)).toEqual([
      "order_created",
      "item_added",
      "item_added",
      "item_added",
      "status_changed_to_delivered",
    ]);

    // Test snapshot restoration
    const freshModel = modelSetup({
      dbName: ":memory:",
      tables(db) {
        db.query(
          `
          CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            total REAL DEFAULT 0,
            shipping_address TEXT,
            created_at INTEGER,
            updated_at INTEGER
          )
        `,
        ).run();

        db.query(
          `
          CREATE TABLE order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            product_id TEXT,
            quantity INTEGER,
            price REAL,
            discount REAL DEFAULT 0,
            FOREIGN KEY (order_id) REFERENCES orders(id)
          )
        `,
        ).run();

        db.query(
          `
          CREATE TABLE audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER,
            correlation_id TEXT,
            action TEXT,
            timestamp INTEGER
          )
        `,
        ).run();
      },
      queries(db) {
        return {
          getOrder: db.query("SELECT * FROM orders WHERE id = $id"),
          getOrderItems: db.query(
            "SELECT * FROM order_items WHERE order_id = $orderId",
          ),
          getAuditLogs: db.query(
            "SELECT * FROM audit_log WHERE correlation_id = $correlationId ORDER BY timestamp",
          ),
        };
      },
    });

    // Restore from snapshot
    const restoreResult = await snapshots.restoreSnapshot(
      "order-model",
      10,
      freshModel,
    );
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.eventId).toBe(4);
    expect(restoreResult.replayFrom).toBe(5);

    // Verify restored state
    const restoredOrder = freshModel._queries.getOrder.get({ id: orderId });
    expect(restoredOrder).toBeDefined();
    expect(restoredOrder.customer_id).toBe("CUST001");

    const restoredItems = freshModel._queries.getOrderItems.all({ orderId });
    expect(restoredItems).toHaveLength(3);

    // Replay remaining events
    let replayedCount = 0;
    eventQueue.cycleThrough(
      freshModel,
      () => {},
      {
        _default: () => {
          replayedCount++;
        },
        _error: (err) => {
          throw new Error(err.msg);
        },
      },
      { start: restoreResult.replayFrom },
    );

    expect(replayedCount).toBe(2); // Status update and shipping address

    // Create a second snapshot
    const snapshot2 = await snapshots.createSnapshot(
      "order-model",
      6,
      orderModel,
      { stage: "complete", orderId },
    );

    // List snapshots
    const snapshotList = snapshots.listSnapshots("order-model");
    expect(snapshotList).toHaveLength(2);
    expect(snapshotList[0].metadata.stage).toBe("complete");
    expect(snapshotList[1].metadata.stage).toBe("items_added");

    // Clean up old snapshots
    const deletedCount = snapshots.deleteOldSnapshots("order-model", 5);
    expect(deletedCount).toBe(1);

    const remainingSnapshots = snapshots.listSnapshots("order-model");
    expect(remainingSnapshots).toHaveLength(1);
    expect(remainingSnapshots[0].event_id).toBe(6);

    // Test TypeScript types (compile-time check, runtime verification of structure)
    const typedEvent = {
      cmd: "createOrder",
      data: { customerId: "CUST002" },
      version: 1,
      correlationId: "test-123",
      causationId: null,
      metadata: { test: true },
    };

    const typedResult = await eventQueue.store(
      typedEvent,
      orderModel,
      callbacks,
    );

    expect(typedResult).toBeDefined();
    expect(typedResult.orderId).toBeDefined();

    // Verify all features work together
    expect(events.length).toBeGreaterThan(0);
    expect(transaction.length).toBeGreaterThan(0);
    expect(orderLineage).toBeDefined();
    expect(snapshot1.success).toBe(true);
    expect(restoreResult.success).toBe(true);
  });

  test("should handle complex event trees with correlations", async () => {
    const model = modelSetup({ dbName: ":memory:", stub: true });

    // Create a complex scenario: Order -> Payment -> (Email, Inventory) -> Shipping
    const orderEvent = await eventQueue.store(
      { cmd: "createOrder", data: { orderId: 1 } },
      model,
      eventCallbacks.void,
    );

    const correlationId = eventQueue.retrieveByID(1).correlation_id;

    // Payment caused by order
    await eventQueue.store(
      {
        cmd: "processPayment",
        data: { orderId: 1, amount: 100 },
        causationId: 1,
      },
      model,
      eventCallbacks.void,
    );

    // Email and inventory check caused by payment
    await eventQueue.store(
      {
        cmd: "sendConfirmationEmail",
        data: { orderId: 1 },
        causationId: 2,
      },
      model,
      eventCallbacks.void,
    );

    await eventQueue.store(
      {
        cmd: "updateInventory",
        data: { orderId: 1 },
        causationId: 2,
      },
      model,
      eventCallbacks.void,
    );

    // Shipping caused by inventory update
    await eventQueue.store(
      {
        cmd: "createShipment",
        data: { orderId: 1 },
        causationId: 4,
      },
      model,
      eventCallbacks.void,
    );

    // Verify the entire transaction
    const fullTransaction = eventQueue.getTransaction(correlationId);
    expect(fullTransaction).toHaveLength(5);
    expect(
      fullTransaction.every((e) => e.correlation_id === correlationId),
    ).toBe(true);

    // Verify payment lineage
    const paymentLineage = eventQueue.getEventLineage(2);
    expect(paymentLineage.parent.cmd).toBe("createOrder");
    expect(paymentLineage.children).toHaveLength(2);
    expect(paymentLineage.children.map((c) => c.cmd).sort()).toEqual([
      "sendConfirmationEmail",
      "updateInventory",
    ]);

    // Verify causation chain
    const shipmentEvent = eventQueue.retrieveByID(5);
    expect(shipmentEvent.causation_id).toBe(4);

    const inventoryEvent = eventQueue.retrieveByID(4);
    expect(inventoryEvent.causation_id).toBe(2);

    const paymentEvent = eventQueue.retrieveByID(2);
    expect(paymentEvent.causation_id).toBe(1);
  });
});

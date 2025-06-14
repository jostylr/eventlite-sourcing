/**
 * User Management System Example
 *
 * This example demonstrates:
 * - User registration with password hashing
 * - Login tracking
 * - Profile updates
 * - Password changes
 * - Account deletion
 * - Role management
 * - Audit trail
 */

import { initQueue, modelSetup, eventCallbacks } from '../index.js';

// Initialize the event queue with password hashing
const eventQueue = initQueue({
  dbName: 'data/user-events.sqlite',
  hash: {
    algorithm: 'argon2id',  // Secure password hashing
    memoryCost: 19456,      // 19 MB
    timeCost: 2             // 2 iterations
  }
});

// Set up the user model
const userModel = modelSetup({
  dbName: 'data/users.sqlite',

  // Define database schema
  tables(db) {
    // Users table
    db.query(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        role TEXT DEFAULT 'user',
        active BOOLEAN DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login INTEGER
      )
    `).run();

    // Login history table
    db.query(`
      CREATE TABLE login_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        ip_address TEXT,
        success BOOLEAN,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `).run();

    // Create indexes for performance
    db.query('CREATE INDEX idx_username ON users(username)').run();
    db.query('CREATE INDEX idx_email ON users(email)').run();
    db.query('CREATE INDEX idx_login_history_user ON login_history(user_id)').run();
  },

  // Define prepared queries
  queries(db) {
    return {
      // User queries
      createUser: db.query(`
        INSERT INTO users (username, email, password_hash, full_name, role, created_at, updated_at)
        VALUES ($username, $email, $password_hash, $full_name, $role, $created_at, $updated_at)
      `),

      getUserByUsername: db.query('SELECT * FROM users WHERE username = $username'),
      getUserByEmail: db.query('SELECT * FROM users WHERE email = $email'),
      getUserById: db.query('SELECT * FROM users WHERE id = $id'),

      updateProfile: db.query(`
        UPDATE users
        SET full_name = $full_name, email = $email, updated_at = $updated_at
        WHERE id = $id
      `),

      updatePassword: db.query(`
        UPDATE users
        SET password_hash = $password_hash, updated_at = $updated_at
        WHERE id = $id
      `),

      updateLastLogin: db.query(`
        UPDATE users SET last_login = $last_login WHERE id = $id
      `),

      updateRole: db.query(`
        UPDATE users SET role = $role, updated_at = $updated_at WHERE id = $id
      `),

      deactivateUser: db.query(`
        UPDATE users SET active = 0, updated_at = $updated_at WHERE id = $id
      `),

      // Login history queries
      recordLogin: db.query(`
        INSERT INTO login_history (user_id, ip_address, success, timestamp)
        VALUES ($user_id, $ip_address, $success, $timestamp)
      `),

      getLoginHistory: db.query(`
        SELECT * FROM login_history
        WHERE user_id = $user_id
        ORDER BY timestamp DESC
        LIMIT $limit
      `),

      // Analytics queries
      getUserStats: db.query(`
        SELECT
          COUNT(*) as total_users,
          SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_users,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_users
        FROM users
      `)
    };
  },

  // Define event handlers
  methods(queries) {
    return {
      // Register a new user
      registerUser({ username, email, user_password, full_name }, queries, { datetime, ip }) {
        // Check if username exists
        const existingUsername = queries.getUserByUsername.get({ username });
        if (existingUsername) {
          throw new Error(`Username '${username}' is already taken`);
        }

        // Check if email exists
        const existingEmail = queries.getUserByEmail.get({ email });
        if (existingEmail) {
          throw new Error(`Email '${email}' is already registered`);
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          throw new Error('Invalid email format');
        }

        // Create user (password is already hashed by EventLite)
        const timestamp = Date.parse(datetime);
        const result = queries.createUser.run({
          username,
          email,
          password_hash: user_password, // This is the hashed password
          full_name: full_name || username,
          role: 'user',
          created_at: timestamp,
          updated_at: timestamp
        });

        return {
          userId: result.lastInsertRowid,
          username,
          email,
          message: `User '${username}' registered successfully`
        };
      },

      // User login
      loginUser({ username, user_password }, queries, { datetime, ip }) {
        const user = queries.getUserByUsername.get({ username });
        const timestamp = Date.parse(datetime);

        if (!user) {
          // Record failed login attempt (user doesn't exist)
          queries.recordLogin.run({
            user_id: 0,
            ip_address: ip,
            success: false,
            timestamp
          });
          throw new Error('Invalid username or password');
        }

        if (!user.active) {
          throw new Error('Account is deactivated');
        }

        // Password verification would happen here in a real app
        // For this example, we'll assume the password is correct
        // In production, you'd use Bun.password.verify()

        // Update last login
        queries.updateLastLogin.run({
          id: user.id,
          last_login: timestamp
        });

        // Record successful login
        queries.recordLogin.run({
          user_id: user.id,
          ip_address: ip,
          success: true,
          timestamp
        });

        return {
          userId: user.id,
          username: user.username,
          role: user.role,
          message: `Welcome back, ${user.full_name}!`
        };
      },

      // Update user profile
      updateProfile({ userId, email, full_name }, queries, { datetime, user }) {
        const existingUser = queries.getUserById.get({ id: userId });
        if (!existingUser) {
          throw new Error('User not found');
        }

        // Check if user is updating their own profile or is admin
        if (user !== existingUser.username && user !== 'admin') {
          throw new Error('Unauthorized to update this profile');
        }

        // Check if new email is already taken
        if (email && email !== existingUser.email) {
          const emailTaken = queries.getUserByEmail.get({ email });
          if (emailTaken) {
            throw new Error('Email is already in use');
          }
        }

        queries.updateProfile.run({
          id: userId,
          email: email || existingUser.email,
          full_name: full_name || existingUser.full_name,
          updated_at: Date.parse(datetime)
        });

        return {
          userId,
          message: 'Profile updated successfully'
        };
      },

      // Change password
      changePassword({ userId, user_password }, queries, { datetime, user }) {
        const existingUser = queries.getUserById.get({ id: userId });
        if (!existingUser) {
          throw new Error('User not found');
        }

        // Check authorization
        if (user !== existingUser.username && user !== 'admin') {
          throw new Error('Unauthorized to change this password');
        }

        queries.updatePassword.run({
          id: userId,
          password_hash: user_password, // Already hashed by EventLite
          updated_at: Date.parse(datetime)
        });

        return {
          userId,
          message: 'Password changed successfully'
        };
      },

      // Update user role (admin only)
      updateUserRole({ userId, role }, queries, { datetime, user }) {
        // Check if requester is admin
        const requester = queries.getUserByUsername.get({ username: user });
        if (!requester || requester.role !== 'admin') {
          throw new Error('Only admins can change user roles');
        }

        const targetUser = queries.getUserById.get({ id: userId });
        if (!targetUser) {
          throw new Error('User not found');
        }

        const validRoles = ['user', 'moderator', 'admin'];
        if (!validRoles.includes(role)) {
          throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
        }

        queries.updateRole.run({
          id: userId,
          role,
          updated_at: Date.parse(datetime)
        });

        return {
          userId,
          username: targetUser.username,
          oldRole: targetUser.role,
          newRole: role,
          message: `Role updated from ${targetUser.role} to ${role}`
        };
      },

      // Deactivate user account
      deactivateUser({ userId }, queries, { datetime, user }) {
        const targetUser = queries.getUserById.get({ id: userId });
        if (!targetUser) {
          throw new Error('User not found');
        }

        // Check authorization
        const requester = queries.getUserByUsername.get({ username: user });
        if (!requester || (requester.id !== userId && requester.role !== 'admin')) {
          throw new Error('Unauthorized to deactivate this account');
        }

        queries.deactivateUser.run({
          id: userId,
          updated_at: Date.parse(datetime)
        });

        return {
          userId,
          username: targetUser.username,
          message: 'Account deactivated successfully'
        };
      },

      // Get user stats (admin only)
      getUserStats(data, queries, { user }) {
        const requester = queries.getUserByUsername.get({ username: user });
        if (!requester || requester.role !== 'admin') {
          throw new Error('Admin access required');
        }

        const stats = queries.getUserStats.get();
        return stats;
      }
    };
  }
});

// Define callbacks for different events
const userCallbacks = {
  registerUser(result, row) {
    console.log(`✅ ${result.message}`);
    console.log(`   New user ID: ${result.userId}, Email: ${result.email}`);

    // In a real app, you might:
    // - Send welcome email
    // - Create default preferences
    // - Log to analytics
  },

  loginUser(result, row) {
    console.log(`✅ ${result.message}`);
    console.log(`   User ${result.username} (${result.role}) logged in from ${row.ip}`);

    // In a real app, you might:
    // - Generate JWT token
    // - Update session
    // - Log to security monitoring
  },

  updateProfile(result, row) {
    console.log(`✅ ${result.message}`);
  },

  changePassword(result, row) {
    console.log(`✅ ${result.message}`);
    console.log(`   Security alert: Password changed for user ID ${result.userId}`);

    // In a real app, you might:
    // - Send security email
    // - Invalidate existing sessions
    // - Log to security audit
  },

  updateUserRole(result, row) {
    console.log(`✅ ${result.message}`);
    console.log(`   Admin ${row.user} changed ${result.username}'s role: ${result.oldRole} → ${result.newRole}`);
  },

  deactivateUser(result, row) {
    console.log(`✅ ${result.message}`);
    console.log(`   Account ${result.username} deactivated by ${row.user}`);
  },

  getUserStats(result, row) {
    console.log(`📊 User Statistics:`);
    console.log(`   Total users: ${result.total_users}`);
    console.log(`   Active users: ${result.active_users}`);
    console.log(`   Admin users: ${result.admin_users}`);
  },

  _default(result, row) {
    console.log(`Event processed: ${row.cmd}`);
  },

  _error({ msg, cmd, data, user, ip, error }) {
    console.error(`❌ Error in ${cmd}: ${msg}`);
    if (error) console.error(`   Details:`, error.message);

    // In a real app, you might:
    // - Log to error tracking service
    // - Send alerts for critical errors
    // - Rate limit failed attempts
  }
};

// Demo function to showcase the system
async function demo() {
  console.log('👥 User Management System Demo\n');

  try {
    // 1. Register some users
    console.log('1️⃣ Registering users...\n');

    await eventQueue.store({
      cmd: 'registerUser',
      data: {
        username: 'alice',
        email: 'alice@example.com',
        user_password: 'AlicePass123!',
        full_name: 'Alice Johnson'
      },
      ip: '192.168.1.100'
    }, userModel, userCallbacks);

    await eventQueue.store({
      cmd: 'registerUser',
      data: {
        username: 'bob',
        email: 'bob@example.com',
        user_password: 'BobSecure456!',
        full_name: 'Bob Smith'
      },
      ip: '192.168.1.101'
    }, userModel, userCallbacks);

    // 2. Make alice an admin
    console.log('\n2️⃣ Setting up admin user...\n');

    // First, manually set alice as admin (bootstrap)
    const db = userModel.queries.getUserByUsername.source;
    db.query("UPDATE users SET role = 'admin' WHERE username = 'alice'").run();

    // 3. Login attempts
    console.log('\n3️⃣ Login attempts...\n');

    await eventQueue.store({
      cmd: 'loginUser',
      data: {
        username: 'alice',
        user_password: 'AlicePass123!'
      },
      user: 'alice',
      ip: '192.168.1.100'
    }, userModel, userCallbacks);

    await eventQueue.store({
      cmd: 'loginUser',
      data: {
        username: 'bob',
        user_password: 'BobSecure456!'
      },
      user: 'bob',
      ip: '192.168.1.101'
    }, userModel, userCallbacks);

    // 4. Profile updates
    console.log('\n4️⃣ Profile updates...\n');

    await eventQueue.store({
      cmd: 'updateProfile',
      data: {
        userId: 2,
        full_name: 'Robert Smith',
        email: 'robert.smith@example.com'
      },
      user: 'bob',
      ip: '192.168.1.101'
    }, userModel, userCallbacks);

    // 5. Role management
    console.log('\n5️⃣ Role management...\n');

    await eventQueue.store({
      cmd: 'updateUserRole',
      data: {
        userId: 2,
        role: 'moderator'
      },
      user: 'alice',
      ip: '192.168.1.100'
    }, userModel, userCallbacks);

    // 6. Get statistics
    console.log('\n6️⃣ User statistics...\n');

    await eventQueue.store({
      cmd: 'getUserStats',
      data: {},
      user: 'alice',
      ip: '192.168.1.100'
    }, userModel, userCallbacks);

    // 7. Show login history
    console.log('\n7️⃣ Login History...\n');

    const loginHistory = userModel.queries.getLoginHistory.all({
      user_id: 1,
      limit: 5
    });

    console.log('Recent login attempts for Alice:');
    loginHistory.forEach(login => {
      const status = login.success ? '✓' : '✗';
      const time = new Date(login.timestamp).toLocaleString();
      console.log(`   ${status} ${time} from ${login.ip_address}`);
    });

    // 8. Demonstrate error handling
    console.log('\n8️⃣ Error handling examples...\n');

    // Try to register duplicate username
    try {
      await eventQueue.store({
        cmd: 'registerUser',
        data: {
          username: 'alice',
          email: 'alice2@example.com',
          user_password: 'password123'
        },
        ip: '192.168.1.200'
      }, userModel, userCallbacks);
    } catch (e) {
      // Error will be handled by callback
    }

    // Try unauthorized role change
    try {
      await eventQueue.store({
        cmd: 'updateUserRole',
        data: {
          userId: 1,
          role: 'admin'
        },
        user: 'bob',
        ip: '192.168.1.101'
      }, userModel, userCallbacks);
    } catch (e) {
      // Error will be handled by callback
    }

  } catch (error) {
    console.error('Demo error:', error);
  }
}

// Show replay capability
async function demonstrateReplay() {
  console.log('\n\n🔄 Demonstrating Event Replay...\n');

  // Create a new model instance with a different database
  const replayModel = modelSetup({
    dbName: 'data/users-replay.sqlite',
    reset: ['delete'], // Start fresh
    tables: userModel.tables,
    queries: userModel.queries,
    methods: userModel.methods
  });

  console.log('Replaying all user management events...');

  let eventCount = 0;
  eventQueue.cycleThrough(
    replayModel,
    () => {
      console.log(`\n✅ Replay complete! Processed ${eventCount} events.`);

      // Show rebuilt state
      const stats = replayModel.queries.getUserStats.get();
      console.log('\nRebuilt user statistics:');
      console.log(`   Total users: ${stats.total_users}`);
      console.log(`   Active users: ${stats.active_users}`);
      console.log(`   Admin users: ${stats.admin_users}`);
    },
    {
      _default() { eventCount++; },
      _error() { eventCount++; }
    }
  );
}

// Run the demo
console.log('🚀 Starting User Management Demo...\n');

demo()
  .then(() => demonstrateReplay())
  .catch(console.error);

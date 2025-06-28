/**
 * Background Job System for EventLite Sourcing
 * Provides simple background job processing capabilities
 */

class BackgroundJobQueue {
  constructor(options = {}) {
    this.jobs = new Map();
    this.workers = new Map();
    this.jobHistory = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.defaultTimeout = options.defaultTimeout || 30000; // 30 seconds
    this.isRunning = false;
    this.processingInterval = null;
    this.processingIntervalMs = options.processingIntervalMs || 1000; // 1 second
  }

  /**
   * Register a job worker function
   */
  registerWorker(jobType, workerFn, options = {}) {
    this.workers.set(jobType, {
      fn: workerFn,
      timeout: options.timeout || this.defaultTimeout,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
    });
  }

  /**
   * Add a job to the queue
   */
  addJob(jobType, data = {}, options = {}) {
    const jobId = this.generateJobId();
    const job = {
      id: jobId,
      type: jobType,
      data,
      status: 'pending',
      createdAt: Date.now(),
      scheduledAt: options.delay ? Date.now() + options.delay : Date.now(),
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      priority: options.priority || 0, // Higher number = higher priority
      timeout: options.timeout || this.defaultTimeout,
      result: null,
      error: null,
    };

    this.jobs.set(jobId, job);
    return jobId;
  }

  /**
   * Schedule a job to run at a specific time
   */
  scheduleJob(jobType, data = {}, scheduledTime, options = {}) {
    const delay = scheduledTime - Date.now();
    return this.addJob(jobType, data, { ...options, delay });
  }

  /**
   * Schedule a recurring job
   */
  scheduleRecurringJob(jobType, data = {}, intervalMs, options = {}) {
    const jobId = this.addJob(jobType, data, options);
    
    // Set up recurring schedule
    const recurringJobId = setInterval(() => {
      if (this.isRunning) {
        this.addJob(jobType, data, options);
      }
    }, intervalMs);

    // Store the interval ID for cleanup
    this.jobs.get(jobId).recurringId = recurringJobId;
    
    return jobId;
  }

  /**
   * Start processing jobs
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.processingInterval = setInterval(() => {
      this.processNextJob();
    }, this.processingIntervalMs);
  }

  /**
   * Stop processing jobs
   */
  stop() {
    this.isRunning = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Clear recurring jobs
    for (const job of this.jobs.values()) {
      if (job.recurringId) {
        clearInterval(job.recurringId);
      }
    }
  }

  /**
   * Process the next available job
   */
  async processNextJob() {
    const job = this.getNextJob();
    if (!job) {
      return;
    }

    const worker = this.workers.get(job.type);
    if (!worker) {
      this.markJobFailed(job, new Error(`No worker registered for job type: ${job.type}`));
      return;
    }

    job.status = 'running';
    job.startedAt = Date.now();
    job.attempts++;

    try {
      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Job timeout')), job.timeout);
      });

      // Execute job with timeout
      const jobPromise = worker.fn(job.data, job);
      const result = await Promise.race([jobPromise, timeoutPromise]);

      this.markJobCompleted(job, result);
    } catch (error) {
      await this.handleJobError(job, error, worker);
    }
  }

  /**
   * Get the next job to process (highest priority, then FIFO)
   */
  getNextJob() {
    const now = Date.now();
    const eligibleJobs = Array.from(this.jobs.values())
      .filter(job => 
        job.status === 'pending' && 
        job.scheduledAt <= now &&
        job.attempts < job.maxAttempts
      )
      .sort((a, b) => {
        // Sort by priority (higher first), then by creation time (older first)
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.createdAt - b.createdAt;
      });

    return eligibleJobs[0] || null;
  }

  /**
   * Mark job as completed
   */
  markJobCompleted(job, result) {
    job.status = 'completed';
    job.result = result;
    job.completedAt = Date.now();
    job.duration = job.completedAt - job.startedAt;

    this.addToHistory(job);
    this.jobs.delete(job.id);
  }

  /**
   * Mark job as failed
   */
  markJobFailed(job, error) {
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = Date.now();
    
    if (job.startedAt) {
      job.duration = job.completedAt - job.startedAt;
    }

    this.addToHistory(job);
    this.jobs.delete(job.id);
  }

  /**
   * Handle job errors and retries
   */
  async handleJobError(job, error, worker) {
    if (job.attempts < job.maxAttempts && worker.retryAttempts > 0) {
      // Retry the job
      job.status = 'pending';
      job.scheduledAt = Date.now() + (worker.retryDelay * job.attempts); // Exponential backoff
      job.error = error.message;
    } else {
      // Mark as failed
      this.markJobFailed(job, error);
    }
  }

  /**
   * Add job to history
   */
  addToHistory(job) {
    this.jobHistory.unshift({ ...job });
    
    // Keep history size under limit
    if (this.jobHistory.length > this.maxHistorySize) {
      this.jobHistory = this.jobHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (job) {
      return {
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        createdAt: job.createdAt,
        scheduledAt: job.scheduledAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        duration: job.duration,
        error: job.error,
      };
    }

    // Check history
    const historicalJob = this.jobHistory.find(h => h.id === jobId);
    if (historicalJob) {
      return {
        id: historicalJob.id,
        type: historicalJob.type,
        status: historicalJob.status,
        attempts: historicalJob.attempts,
        maxAttempts: historicalJob.maxAttempts,
        createdAt: historicalJob.createdAt,
        scheduledAt: historicalJob.scheduledAt,
        startedAt: historicalJob.startedAt,
        completedAt: historicalJob.completedAt,
        duration: historicalJob.duration,
        error: historicalJob.error,
      };
    }

    return null;
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const jobs = Array.from(this.jobs.values());
    const stats = {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      running: jobs.filter(j => j.status === 'running').length,
      byType: {},
      oldestPending: null,
    };

    // Count by type
    for (const job of jobs) {
      stats.byType[job.type] = (stats.byType[job.type] || 0) + 1;
    }

    // Find oldest pending job
    const pendingJobs = jobs.filter(j => j.status === 'pending');
    if (pendingJobs.length > 0) {
      stats.oldestPending = Math.min(...pendingJobs.map(j => j.createdAt));
    }

    // Historical stats
    const recentHistory = this.jobHistory.slice(0, 100); // Last 100 jobs
    stats.recentCompletion = {
      completed: recentHistory.filter(j => j.status === 'completed').length,
      failed: recentHistory.filter(j => j.status === 'failed').length,
      averageDuration: recentHistory
        .filter(j => j.duration)
        .reduce((sum, j) => sum + j.duration, 0) / recentHistory.length || 0,
    };

    return stats;
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'pending') {
      job.status = 'cancelled';
      job.completedAt = Date.now();
      this.addToHistory(job);
      this.jobs.delete(jobId);
      return true;
    }
    return false;
  }

  /**
   * Clear completed jobs from history
   */
  clearHistory() {
    this.jobHistory = [];
  }

  /**
   * Generate unique job ID
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Event-driven background job integration for EventLite
 */
class EventJobProcessor {
  constructor(eventQueue, jobQueue) {
    this.eventQueue = eventQueue;
    this.jobQueue = jobQueue;
    this.eventJobMappings = new Map();
  }

  /**
   * Register an event to automatically trigger a background job
   */
  onEvent(eventCmd, jobType, dataMapper = (eventData) => eventData) {
    if (!this.eventJobMappings.has(eventCmd)) {
      this.eventJobMappings.set(eventCmd, []);
    }
    
    this.eventJobMappings.get(eventCmd).push({
      jobType,
      dataMapper,
    });
  }

  /**
   * Process an event and trigger background jobs if configured
   */
  processEvent(eventData, eventRow) {
    const mappings = this.eventJobMappings.get(eventData.cmd);
    if (!mappings) {
      return [];
    }

    const jobIds = [];
    for (const mapping of mappings) {
      try {
        const jobData = mapping.dataMapper(eventData, eventRow);
        const jobId = this.jobQueue.addJob(mapping.jobType, jobData, {
          priority: 1, // Event-triggered jobs get higher priority
        });
        jobIds.push(jobId);
      } catch (error) {
        console.error(`Failed to create background job for event ${eventData.cmd}:`, error);
      }
    }

    return jobIds;
  }

  /**
   * Create event callback that processes background jobs
   */
  createEventCallback() {
    return {
      _default: (result, row) => {
        this.processEvent(row.data, row);
      },
      _error: () => {}, // No background jobs on errors
    };
  }
}

export { BackgroundJobQueue, EventJobProcessor };
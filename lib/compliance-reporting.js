import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Compliance Reporting for EventLite Sourcing
 * 
 * Provides comprehensive GDPR compliance reporting including:
 * - GDPR compliance dashboard
 * - Data processing activity logs
 * - Consent tracking and reporting
 * - Data subject request tracking
 * - Regulatory audit trail generation
 */

/**
 * ComplianceReportingManager - Main reporting orchestrator
 */
export class ComplianceReportingManager {
  constructor(options = {}) {
    this.options = {
      dbPath: options.dbPath || 'data/compliance-reporting.sqlite',
      reportDir: options.reportDir || 'data/compliance-reports',
      eventQueue: options.eventQueue,
      privacyManager: options.privacyManager,
      ...options
    };

    this.db = new Database(this.options.dbPath, { create: true });
    this._initializeTables();

    // Initialize sub-components
    this.dashboard = new ComplianceDashboard(this.db, this.options);
    this.activityLogger = new DataProcessingActivityLogger(this.db, this.options);
    this.consentReporter = new ConsentTrackingReporter(this.db, this.options);
    this.requestTracker = new DataSubjectRequestTracker(this.db, this.options);
    this.auditTrail = new RegulatoryAuditTrail(this.db, this.options);

    // Ensure report directory exists
    if (!existsSync(this.options.reportDir)) {
      mkdirSync(this.options.reportDir, { recursive: true });
    }
  }

  _initializeTables() {
    // Main compliance events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS compliance_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        user_id TEXT,
        event_data TEXT,
        timestamp INTEGER DEFAULT (unixepoch()),
        compliance_category TEXT,
        risk_level TEXT,
        automated BOOLEAN DEFAULT FALSE
      )
    `);

    // Compliance metrics summary
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS compliance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        metric_date INTEGER DEFAULT (unixepoch()),
        metric_category TEXT,
        aggregation_period TEXT DEFAULT 'daily'
      )
    `);

    // Report generation log
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS report_generation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_type TEXT NOT NULL,
        generated_at INTEGER DEFAULT (unixepoch()),
        generated_by TEXT,
        report_path TEXT,
        parameters TEXT
      )
    `);

    this.queries = {
      logEvent: this.db.prepare(`
        INSERT INTO compliance_events (event_type, user_id, event_data, compliance_category, risk_level, automated)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      getEvents: this.db.prepare(`
        SELECT * FROM compliance_events 
        WHERE timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp DESC
      `),
      recordMetric: this.db.prepare(`
        INSERT INTO compliance_metrics (metric_name, metric_value, metric_category, aggregation_period)
        VALUES (?, ?, ?, ?)
      `),
      logReport: this.db.prepare(`
        INSERT INTO report_generation_log (report_type, generated_by, report_path, parameters)
        VALUES (?, ?, ?, ?)
      `)
    };
  }

  /**
   * Generate comprehensive compliance dashboard
   * @param {Object} options - Dashboard options
   * @returns {Object} Dashboard data
   */
  async generateComplianceDashboard(options = {}) {
    const period = options.period || '30days';
    const dashboard = await this.dashboard.generate(period);
    
    this.queries.logReport.run(
      'compliance-dashboard',
      options.generatedBy || 'system',
      null,
      JSON.stringify({ period })
    );

    return dashboard;
  }

  /**
   * Generate data processing activity report (GDPR Article 30)
   * @param {Object} options - Report options
   * @returns {Object} Activity report
   */
  async generateDataProcessingReport(options = {}) {
    const report = await this.activityLogger.generateReport(options);
    
    const filename = `data-processing-${Date.now()}.json`;
    const reportPath = join(this.options.reportDir, filename);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.queries.logReport.run(
      'data-processing-activity',
      options.generatedBy || 'system',
      reportPath,
      JSON.stringify(options)
    );

    return { ...report, reportPath };
  }

  /**
   * Generate consent tracking report
   * @param {Object} options - Report options
   * @returns {Object} Consent report
   */
  async generateConsentReport(options = {}) {
    const report = await this.consentReporter.generateReport(options);
    
    const filename = `consent-tracking-${Date.now()}.json`;
    const reportPath = join(this.options.reportDir, filename);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.queries.logReport.run(
      'consent-tracking',
      options.generatedBy || 'system',
      reportPath,
      JSON.stringify(options)
    );

    return { ...report, reportPath };
  }

  /**
   * Generate data subject request tracking report
   * @param {Object} options - Report options
   * @returns {Object} Request tracking report
   */
  async generateDataSubjectRequestReport(options = {}) {
    const report = await this.requestTracker.generateReport(options);
    
    const filename = `data-subject-requests-${Date.now()}.json`;
    const reportPath = join(this.options.reportDir, filename);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.queries.logReport.run(
      'data-subject-requests',
      options.generatedBy || 'system',
      reportPath,
      JSON.stringify(options)
    );

    return { ...report, reportPath };
  }

  /**
   * Generate regulatory audit trail
   * @param {Object} options - Audit options
   * @returns {Object} Audit trail
   */
  async generateAuditTrail(options = {}) {
    const trail = await this.auditTrail.generateTrail(options);
    
    const filename = `audit-trail-${Date.now()}.json`;
    const reportPath = join(this.options.reportDir, filename);
    writeFileSync(reportPath, JSON.stringify(trail, null, 2));

    this.queries.logReport.run(
      'regulatory-audit-trail',
      options.generatedBy || 'system',
      reportPath,
      JSON.stringify(options)
    );

    return { ...trail, reportPath };
  }

  /**
   * Log compliance event
   * @param {Object} event - Compliance event
   */
  logComplianceEvent(event) {
    this.queries.logEvent.run(
      event.type,
      event.userId,
      JSON.stringify(event.data || {}),
      event.category || 'general',
      event.riskLevel || 'low',
      event.automated || false
    );

    // Update metrics
    this._updateMetrics(event);
  }

  /**
   * Get compliance events for period
   * @param {number} startTime - Start timestamp
   * @param {number} endTime - End timestamp
   * @returns {Array} Compliance events
   */
  getComplianceEvents(startTime, endTime) {
    return this.queries.getEvents.all(startTime, endTime);
  }

  _updateMetrics(event) {
    // Update daily event count
    this.queries.recordMetric.run(
      'compliance_events_daily',
      1,
      event.category || 'general',
      'daily'
    );

    // Update risk level metrics
    if (event.riskLevel === 'high') {
      this.queries.recordMetric.run(
        'high_risk_events_daily',
        1,
        'risk',
        'daily'
      );
    }
  }
}

/**
 * ComplianceDashboard - Real-time compliance status dashboard
 */
class ComplianceDashboard {
  constructor(db, options) {
    this.db = db;
    this.options = options;
  }

  async generate(period = '30days') {
    const timeRange = this._getTimeRange(period);
    
    return {
      overview: await this._getOverview(timeRange),
      riskAssessment: await this._getRiskAssessment(timeRange),
      complianceScore: await this._calculateComplianceScore(timeRange),
      keyMetrics: await this._getKeyMetrics(timeRange),
      recentActivities: await this._getRecentActivities(timeRange),
      alerts: await this._getComplianceAlerts(timeRange),
      generatedAt: Date.now(),
      period
    };
  }

  async _getOverview(timeRange) {
    const stmt = this.db.prepare(`
      SELECT 
        compliance_category,
        COUNT(*) as event_count,
        AVG(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) as high_risk_ratio
      FROM compliance_events 
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY compliance_category
    `);

    const results = stmt.all(timeRange.start, timeRange.end);
    
    return {
      totalEvents: results.reduce((sum, r) => sum + r.event_count, 0),
      categoriesActive: results.length,
      highRiskRatio: results.reduce((sum, r) => sum + r.high_risk_ratio, 0) / results.length || 0,
      categories: results
    };
  }

  async _getRiskAssessment(timeRange) {
    const stmt = this.db.prepare(`
      SELECT 
        risk_level,
        COUNT(*) as count,
        compliance_category
      FROM compliance_events 
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY risk_level, compliance_category
    `);

    const risks = stmt.all(timeRange.start, timeRange.end);
    
    const assessment = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    risks.forEach(risk => {
      assessment[risk.risk_level] = (assessment[risk.risk_level] || 0) + risk.count;
    });

    const total = Object.values(assessment).reduce((sum, count) => sum + count, 0);
    const riskScore = total > 0 ? 
      (assessment.critical * 4 + assessment.high * 3 + assessment.medium * 2 + assessment.low * 1) / total * 25 : 0;

    return {
      ...assessment,
      total,
      riskScore: Math.round(riskScore),
      riskLevel: this._getRiskLevel(riskScore)
    };
  }

  async _calculateComplianceScore(timeRange) {
    // Simplified compliance scoring
    const metrics = await this._getKeyMetrics(timeRange);
    let score = 100;

    // Deduct points for high-risk events
    score -= metrics.highRiskEvents * 2;

    // Deduct points for incomplete data subject requests
    if (metrics.dataSubjectRequests > 0) {
      const completionRate = metrics.completedRequests / metrics.dataSubjectRequests;
      score -= (1 - completionRate) * 20;
    }

    // Deduct points for consent violations
    score -= metrics.consentViolations * 5;

    return {
      score: Math.max(0, Math.round(score)),
      grade: this._getComplianceGrade(score),
      factors: {
        riskEvents: metrics.highRiskEvents,
        requestCompletion: metrics.dataSubjectRequests > 0 ? 
          Math.round((metrics.completedRequests / metrics.dataSubjectRequests) * 100) : 100,
        consentCompliance: 100 - (metrics.consentViolations * 5)
      }
    };
  }

  async _getKeyMetrics(timeRange) {
    const eventQuery = this.db.prepare(`
      SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) as high_risk_events,
        SUM(CASE WHEN event_type LIKE '%consent%violation%' THEN 1 ELSE 0 END) as consent_violations,
        SUM(CASE WHEN event_type LIKE 'gdpr%Request%' THEN 1 ELSE 0 END) as data_subject_requests,
        SUM(CASE WHEN event_type LIKE 'gdpr%Completed%' THEN 1 ELSE 0 END) as completed_requests
      FROM compliance_events 
      WHERE timestamp >= ? AND timestamp <= ?
    `);

    const metrics = eventQuery.get(timeRange.start, timeRange.end) || {};

    return {
      totalEvents: metrics.total_events || 0,
      highRiskEvents: metrics.high_risk_events || 0,
      consentViolations: metrics.consent_violations || 0,
      dataSubjectRequests: metrics.data_subject_requests || 0,
      completedRequests: metrics.completed_requests || 0
    };
  }

  async _getRecentActivities(timeRange) {
    const stmt = this.db.prepare(`
      SELECT * FROM compliance_events 
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC 
      LIMIT 20
    `);

    return stmt.all(timeRange.start, timeRange.end);
  }

  async _getComplianceAlerts(timeRange) {
    const alerts = [];
    const metrics = await this._getKeyMetrics(timeRange);

    if (metrics.highRiskEvents > 10) {
      alerts.push({
        level: 'high',
        type: 'risk-threshold',
        message: `High number of risk events detected: ${metrics.highRiskEvents}`,
        timestamp: Date.now()
      });
    }

    if (metrics.consentViolations > 0) {
      alerts.push({
        level: 'critical',
        type: 'consent-violation',
        message: `Consent violations detected: ${metrics.consentViolations}`,
        timestamp: Date.now()
      });
    }

    const requestCompletionRate = metrics.dataSubjectRequests > 0 ? 
      metrics.completedRequests / metrics.dataSubjectRequests : 1;

    if (requestCompletionRate < 0.9) {
      alerts.push({
        level: 'medium',
        type: 'request-completion',
        message: `Low data subject request completion rate: ${Math.round(requestCompletionRate * 100)}%`,
        timestamp: Date.now()
      });
    }

    return alerts;
  }

  _getTimeRange(period) {
    const end = Math.floor(Date.now() / 1000);
    let start;

    switch (period) {
      case '7days':
        start = end - (7 * 24 * 60 * 60);
        break;
      case '30days':
        start = end - (30 * 24 * 60 * 60);
        break;
      case '90days':
        start = end - (90 * 24 * 60 * 60);
        break;
      case '1year':
        start = end - (365 * 24 * 60 * 60);
        break;
      default:
        start = end - (30 * 24 * 60 * 60);
    }

    return { start, end };
  }

  _getRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  _getComplianceGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}

/**
 * DataProcessingActivityLogger - GDPR Article 30 compliance
 */
class DataProcessingActivityLogger {
  constructor(db, options) {
    this.db = db;
    this.options = options;
    this._initializeTables();
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processing_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_name TEXT NOT NULL,
        controller_name TEXT,
        processor_name TEXT,
        purposes TEXT,
        categories_of_data TEXT,
        categories_of_recipients TEXT,
        third_country_transfers TEXT,
        retention_periods TEXT,
        security_measures TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processing_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER,
        user_id TEXT,
        data_processed TEXT,
        processing_purpose TEXT,
        legal_basis TEXT,
        processed_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (activity_id) REFERENCES processing_activities(id)
      )
    `);
  }

  async generateReport(options = {}) {
    const timeRange = this._getTimeRange(options.period || '30days');
    
    return {
      reportType: 'Data Processing Activities (GDPR Article 30)',
      generatedAt: Date.now(),
      period: options.period || '30days',
      summary: await this._getProcessingSummary(timeRange),
      activities: await this._getProcessingActivities(),
      records: await this._getProcessingRecords(timeRange, options.limit || 1000),
      compliance: await this._checkProcessingCompliance()
    };
  }

  async _getProcessingSummary(timeRange) {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT processing_purpose) as purposes_count,
        COUNT(DISTINCT legal_basis) as legal_bases_count
      FROM processing_records 
      WHERE processed_at >= ? AND processed_at <= ?
    `);

    return stmt.get(timeRange.start, timeRange.end) || {};
  }

  async _getProcessingActivities() {
    const stmt = this.db.prepare('SELECT * FROM processing_activities ORDER BY updated_at DESC');
    return stmt.all();
  }

  async _getProcessingRecords(timeRange, limit) {
    const stmt = this.db.prepare(`
      SELECT pr.*, pa.activity_name 
      FROM processing_records pr
      LEFT JOIN processing_activities pa ON pr.activity_id = pa.id
      WHERE pr.processed_at >= ? AND pr.processed_at <= ?
      ORDER BY pr.processed_at DESC
      LIMIT ?
    `);

    return stmt.all(timeRange.start, timeRange.end, limit);
  }

  async _checkProcessingCompliance() {
    const activitiesStmt = this.db.prepare('SELECT * FROM processing_activities');
    const activities = activitiesStmt.all();

    const compliance = {
      totalActivities: activities.length,
      compliantActivities: 0,
      issues: []
    };

    activities.forEach(activity => {
      let isCompliant = true;

      if (!activity.purposes) {
        compliance.issues.push({
          activityId: activity.id,
          activityName: activity.activity_name,
          issue: 'Missing processing purposes'
        });
        isCompliant = false;
      }

      if (!activity.legal_basis) {
        compliance.issues.push({
          activityId: activity.id,
          activityName: activity.activity_name,
          issue: 'Missing legal basis'
        });
        isCompliant = false;
      }

      if (!activity.categories_of_data) {
        compliance.issues.push({
          activityId: activity.id,
          activityName: activity.activity_name,
          issue: 'Missing data categories'
        });
        isCompliant = false;
      }

      if (isCompliant) {
        compliance.compliantActivities++;
      }
    });

    compliance.complianceRate = activities.length > 0 ? 
      (compliance.compliantActivities / activities.length) * 100 : 100;

    return compliance;
  }

  _getTimeRange(period) {
    const end = Math.floor(Date.now() / 1000);
    let start;

    switch (period) {
      case '7days':
        start = end - (7 * 24 * 60 * 60);
        break;
      case '30days':
        start = end - (30 * 24 * 60 * 60);
        break;
      case '90days':
        start = end - (90 * 24 * 60 * 60);
        break;
      case '1year':
        start = end - (365 * 24 * 60 * 60);
        break;
      default:
        start = end - (30 * 24 * 60 * 60);
    }

    return { start, end };
  }
}

/**
 * ConsentTrackingReporter - Consent management reporting
 */
class ConsentTrackingReporter {
  constructor(db, options) {
    this.db = db;
    this.options = options;
  }

  async generateReport(options = {}) {
    const timeRange = this._getTimeRange(options.period || '30days');
    
    return {
      reportType: 'Consent Tracking and Management',
      generatedAt: Date.now(),
      period: options.period || '30days',
      summary: await this._getConsentSummary(timeRange),
      consentMetrics: await this._getConsentMetrics(timeRange),
      violations: await this._getConsentViolations(timeRange),
      expiringConsents: await this._getExpiringConsents(),
      recommendations: await this._getConsentRecommendations()
    };
  }

  async _getConsentSummary(timeRange) {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_consent_events,
        SUM(CASE WHEN event_type LIKE '%consent%granted%' THEN 1 ELSE 0 END) as consents_granted,
        SUM(CASE WHEN event_type LIKE '%consent%withdrawn%' THEN 1 ELSE 0 END) as consents_withdrawn,
        COUNT(DISTINCT user_id) as users_with_consent_activity
      FROM compliance_events 
      WHERE (event_type LIKE '%consent%' OR compliance_category = 'consent')
        AND timestamp >= ? AND timestamp <= ?
    `);

    return stmt.get(timeRange.start, timeRange.end) || {};
  }

  async _getConsentMetrics(timeRange) {
    // This would integrate with ConsentManagementSystem if available
    return {
      activeConsents: 0,
      expiredConsents: 0,
      withdrawnConsents: 0,
      consentTypes: [],
      averageConsentDuration: 0
    };
  }

  async _getConsentViolations(timeRange) {
    const stmt = this.db.prepare(`
      SELECT * FROM compliance_events 
      WHERE event_type LIKE '%consent%violation%'
        AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
    `);

    return stmt.all(timeRange.start, timeRange.end);
  }

  async _getExpiringConsents() {
    // Placeholder for consent expiration logic
    return [];
  }

  async _getConsentRecommendations() {
    return [
      {
        type: 'consent-renewal',
        priority: 'medium',
        message: 'Review consent renewal processes for better user experience'
      },
      {
        type: 'granular-consent',
        priority: 'low',
        message: 'Consider implementing more granular consent options'
      }
    ];
  }

  _getTimeRange(period) {
    const end = Math.floor(Date.now() / 1000);
    let start;

    switch (period) {
      case '7days':
        start = end - (7 * 24 * 60 * 60);
        break;
      case '30days':
        start = end - (30 * 24 * 60 * 60);
        break;
      case '90days':
        start = end - (90 * 24 * 60 * 60);
        break;
      default:
        start = end - (30 * 24 * 60 * 60);
    }

    return { start, end };
  }
}

/**
 * DataSubjectRequestTracker - Track GDPR data subject requests
 */
class DataSubjectRequestTracker {
  constructor(db, options) {
    this.db = db;
    this.options = options;
  }

  async generateReport(options = {}) {
    const timeRange = this._getTimeRange(options.period || '30days');
    
    return {
      reportType: 'Data Subject Request Tracking',
      generatedAt: Date.now(),
      period: options.period || '30days',
      summary: await this._getRequestSummary(timeRange),
      requestsByType: await this._getRequestsByType(timeRange),
      processingTimes: await this._getProcessingTimes(timeRange),
      overdue: await this._getOverdueRequests(),
      compliance: await this._getRequestCompliance(timeRange)
    };
  }

  async _getRequestSummary(timeRange) {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN event_type LIKE '%Requested%' THEN 1 ELSE 0 END) as new_requests,
        SUM(CASE WHEN event_type LIKE '%Completed%' THEN 1 ELSE 0 END) as completed_requests,
        COUNT(DISTINCT user_id) as unique_requesters
      FROM compliance_events 
      WHERE event_type LIKE 'gdpr%'
        AND timestamp >= ? AND timestamp <= ?
    `);

    return stmt.get(timeRange.start, timeRange.end) || {};
  }

  async _getRequestsByType(timeRange) {
    const stmt = this.db.prepare(`
      SELECT 
        CASE 
          WHEN event_type LIKE '%Export%' THEN 'Data Export'
          WHEN event_type LIKE '%Deletion%' THEN 'Data Deletion'
          WHEN event_type LIKE '%Rectification%' THEN 'Data Rectification'
          ELSE 'Other'
        END as request_type,
        COUNT(*) as count
      FROM compliance_events 
      WHERE event_type LIKE 'gdpr%Requested%'
        AND timestamp >= ? AND timestamp <= ?
      GROUP BY request_type
    `);

    return stmt.all(timeRange.start, timeRange.end);
  }

  async _getProcessingTimes(timeRange) {
    // This would require more sophisticated event correlation
    return {
      averageProcessingTime: 0,
      medianProcessingTime: 0,
      maxProcessingTime: 0,
      processingTimeDistribution: []
    };
  }

  async _getOverdueRequests() {
    // 30-day GDPR compliance deadline
    const overdueThreshold = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    
    const stmt = this.db.prepare(`
      SELECT * FROM compliance_events 
      WHERE event_type LIKE 'gdpr%Requested%'
        AND timestamp < ?
        AND user_id NOT IN (
          SELECT user_id FROM compliance_events 
          WHERE event_type LIKE 'gdpr%Completed%'
        )
      ORDER BY timestamp ASC
    `);

    return stmt.all(overdueThreshold);
  }

  async _getRequestCompliance(timeRange) {
    const summary = await this._getRequestSummary(timeRange);
    const overdue = await this._getOverdueRequests();

    const complianceRate = summary.new_requests > 0 ? 
      ((summary.new_requests - overdue.length) / summary.new_requests) * 100 : 100;

    return {
      totalRequests: summary.total_requests,
      completedOnTime: summary.new_requests - overdue.length,
      overdueRequests: overdue.length,
      complianceRate: Math.round(complianceRate),
      grade: complianceRate >= 95 ? 'A' : complianceRate >= 85 ? 'B' : complianceRate >= 75 ? 'C' : 'D'
    };
  }

  _getTimeRange(period) {
    const end = Math.floor(Date.now() / 1000);
    let start;

    switch (period) {
      case '7days':
        start = end - (7 * 24 * 60 * 60);
        break;
      case '30days':
        start = end - (30 * 24 * 60 * 60);
        break;
      case '90days':
        start = end - (90 * 24 * 60 * 60);
        break;
      default:
        start = end - (30 * 24 * 60 * 60);
    }

    return { start, end };
  }
}

/**
 * RegulatoryAuditTrail - Generate comprehensive audit trails for regulators
 */
class RegulatoryAuditTrail {
  constructor(db, options) {
    this.db = db;
    this.options = options;
  }

  async generateTrail(options = {}) {
    const timeRange = this._getTimeRange(options.period || '1year');
    
    return {
      auditTrailType: 'Regulatory Compliance Audit Trail',
      generatedAt: Date.now(),
      period: options.period || '1year',
      auditScope: options.scope || 'full',
      complianceEvents: await this._getComplianceEvents(timeRange),
      systemEvents: await this._getSystemEvents(timeRange),
      userEvents: await this._getUserEvents(timeRange),
      dataProcessingEvents: await this._getDataProcessingEvents(timeRange),
      securityEvents: await this._getSecurityEvents(timeRange),
      summary: await this._generateAuditSummary(timeRange),
      certifications: await this._getCertificationStatus(),
      recommendations: await this._getAuditRecommendations()
    };
  }

  async _getComplianceEvents(timeRange) {
    const stmt = this.db.prepare(`
      SELECT * FROM compliance_events 
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(timeRange.start, timeRange.end);
  }

  async _getSystemEvents(timeRange) {
    // System-level events for audit
    return [];
  }

  async _getUserEvents(timeRange) {
    // User-related events for audit
    const stmt = this.db.prepare(`
      SELECT * FROM compliance_events 
      WHERE user_id IS NOT NULL
        AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC, user_id
    `);

    return stmt.all(timeRange.start, timeRange.end);
  }

  async _getDataProcessingEvents(timeRange) {
    // Data processing specific events
    const stmt = this.db.prepare(`
      SELECT * FROM compliance_events 
      WHERE compliance_category = 'data-processing'
        AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(timeRange.start, timeRange.end);
  }

  async _getSecurityEvents(timeRange) {
    // Security-related events
    const stmt = this.db.prepare(`
      SELECT * FROM compliance_events 
      WHERE compliance_category = 'security' OR risk_level = 'high'
        AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(timeRange.start, timeRange.end);
  }

  async _generateAuditSummary(timeRange) {
    const allEvents = await this._getComplianceEvents(timeRange);
    
    const summary = {
      totalEvents: allEvents.length,
      eventsByCategory: {},
      eventsByRiskLevel: {},
      timelineCoverage: {
        startDate: new Date(timeRange.start * 1000).toISOString(),
        endDate: new Date(timeRange.end * 1000).toISOString()
      },
      dataIntegrity: await this._checkDataIntegrity(allEvents)
    };

    // Group by category
    allEvents.forEach(event => {
      const category = event.compliance_category || 'unclassified';
      summary.eventsByCategory[category] = (summary.eventsByCategory[category] || 0) + 1;

      const riskLevel = event.risk_level || 'unknown';
      summary.eventsByRiskLevel[riskLevel] = (summary.eventsByRiskLevel[riskLevel] || 0) + 1;
    });

    return summary;
  }

  async _checkDataIntegrity(events) {
    // Basic data integrity checks
    const integrity = {
      completeness: true,
      consistency: true,
      chronologicalOrder: true,
      issues: []
    };

    // Check chronological order
    for (let i = 1; i < events.length; i++) {
      if (events[i].timestamp < events[i-1].timestamp) {
        integrity.chronologicalOrder = false;
        integrity.issues.push({
          type: 'chronological-order',
          eventIds: [events[i-1].id, events[i].id],
          description: 'Events not in chronological order'
        });
      }
    }

    // Check for required fields
    events.forEach(event => {
      if (!event.event_type || !event.timestamp) {
        integrity.completeness = false;
        integrity.issues.push({
          type: 'missing-required-fields',
          eventId: event.id,
          description: 'Missing required fields in event'
        });
      }
    });

    return integrity;
  }

  async _getCertificationStatus() {
    return {
      gdprCompliant: true,
      iso27001: false,
      soc2: false,
      lastAuditDate: null,
      nextAuditDue: null,
      certificationIssues: []
    };
  }

  async _getAuditRecommendations() {
    return [
      {
        priority: 'high',
        category: 'data-retention',
        recommendation: 'Implement automated data retention policy enforcement',
        impact: 'Reduce compliance risk and storage costs'
      },
      {
        priority: 'medium',
        category: 'monitoring',
        recommendation: 'Enhance real-time compliance monitoring',
        impact: 'Faster detection of compliance issues'
      }
    ];
  }

  _getTimeRange(period) {
    const end = Math.floor(Date.now() / 1000);
    let start;

    switch (period) {
      case '30days':
        start = end - (30 * 24 * 60 * 60);
        break;
      case '90days':
        start = end - (90 * 24 * 60 * 60);
        break;
      case '1year':
        start = end - (365 * 24 * 60 * 60);
        break;
      case '2years':
        start = end - (2 * 365 * 24 * 60 * 60);
        break;
      default:
        start = end - (365 * 24 * 60 * 60);
    }

    return { start, end };
  }
}

export default ComplianceReportingManager;
export {
  ComplianceDashboard,
  DataProcessingActivityLogger,
  ConsentTrackingReporter,
  DataSubjectRequestTracker,
  RegulatoryAuditTrail
};
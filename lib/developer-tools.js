import { Database } from "bun:sqlite";
import { EventQueryEngine } from "./event-querying.js";
import { PrivacyManager } from "./privacy-manager.js";
import PrivacyControlsModule from "./privacy-controls.js";
import ComplianceReportingManager from "./compliance-reporting.js";

/**
 * EventLite Developer Tools
 * Comprehensive debugging, analysis, and migration utilities for event sourcing applications
 */
export class EventVisualizerPro {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.queryEngine = new EventQueryEngine(dbPath);
  }

  /**
   * Enhanced event relationship visualizer with multiple formats
   */
  generateInteractiveEventMap(correlationId, options = {}) {
    const {
      format = 'tree', // 'tree', 'graph', 'timeline', 'flowchart'
      includeData = false,
      showDepth = true,
      showMetrics = true,
      groupByType = false
    } = options;

    const events = this.queryEngine.getEventsByCorrelationId(correlationId);
    if (events.length === 0) {
      return { error: `No events found for correlation ID: ${correlationId}` };
    }

    const visualization = {
      correlationId,
      format,
      events: events.length,
      generatedAt: new Date().toISOString(),
      content: ''
    };

    switch (format) {
      case 'graph':
        visualization.content = this._generateGraphVisualization(events, { includeData, showDepth });
        break;
      case 'timeline':
        visualization.content = this._generateTimelineVisualization(events, { includeData, showMetrics });
        break;
      case 'flowchart':
        visualization.content = this._generateFlowchartVisualization(events, { includeData, groupByType });
        break;
      case 'tree':
      default:
        visualization.content = this._generateEnhancedTreeVisualization(events, correlationId, { includeData, showDepth, showMetrics });
        break;
    }

    return visualization;
  }

  _generateEnhancedTreeVisualization(events, correlationId, options) {
    const { includeData, showDepth, showMetrics } = options;
    const branches = this.queryEngine.getEventBranches(correlationId);
    const tree = this._buildEnhancedEventTree(branches, events, includeData);
    
    let output = `╔═══════════════════════════════════════════════════════════════╗\n`;
    output += `║                    EVENT RELATIONSHIP TREE                   ║\n`;
    output += `║                Correlation ID: ${correlationId.toString().padEnd(25)}║\n`;
    output += `╚═══════════════════════════════════════════════════════════════╝\n\n`;

    if (showMetrics) {
      const metrics = this.queryEngine._calculateEventMetrics(events);
      output += `📊 METRICS:\n`;
      output += `   Total Events: ${metrics.totalEvents} | Root: ${metrics.rootEvents} | Children: ${metrics.childEvents}\n`;
      output += `   Avg Depth: ${metrics.averageDepth} | Types: ${metrics.uniqueEventTypes} | Span: ${metrics.timeSpan}\n\n`;
    }

    const rootNodes = Object.values(tree);
    rootNodes.forEach((node, index) => {
      const isLastRoot = index === rootNodes.length - 1;
      output += this._renderEnhancedNode(node, '', isLastRoot, { includeData, showDepth });
    });
    
    return output;
  }

  _generateGraphVisualization(events, options) {
    const { includeData, showDepth } = options;
    let output = "GRAPH VISUALIZATION (DOT Format)\n";
    output += "==================================\n\n";
    output += "digraph EventGraph {\n";
    output += "  rankdir=TB;\n";
    output += "  node [shape=box, style=rounded];\n\n";

    // Add nodes
    events.forEach(event => {
      const isRoot = !event.causation_id;
      const nodeColor = isRoot ? 'lightblue' : 'lightgreen';
      const nodeLabel = includeData ? 
        `${event.id}: ${event.cmd}\\n${JSON.stringify(this.queryEngine._safeParse(event.data)).substring(0, 30)}...` :
        `${event.id}: ${event.cmd}`;
      
      output += `  event_${event.id} [label="${nodeLabel}", fillcolor="${nodeColor}", style="filled"];\n`;
    });

    output += "\n  // Causation relationships\n";
    events.forEach(event => {
      if (event.causation_id) {
        output += `  event_${event.causation_id} -> event_${event.id};\n`;
      }
    });

    output += "}\n\n";
    output += "// To render: save as .dot file and use Graphviz: dot -Tpng events.dot -o events.png\n";
    
    return output;
  }

  _generateTimelineVisualization(events, options) {
    const { includeData, showMetrics } = options;
    const sortedEvents = [...events].sort((a, b) => a.id - b.id);
    
    let output = "EVENT TIMELINE\n";
    output += "══════════════\n\n";

    if (showMetrics) {
      const timeSpan = sortedEvents.length > 1 ? 
        sortedEvents[sortedEvents.length - 1].id - sortedEvents[0].id : 0;
      output += `Timeline Span: ${timeSpan} event IDs | Duration: ${sortedEvents.length} events\n\n`;
    }

    sortedEvents.forEach((event, index) => {
      const isRoot = !event.causation_id;
      const marker = isRoot ? '🚀' : '⚡';
      const depth = this.queryEngine.getEventDepth(event.id);
      const indent = '  '.repeat(depth);
      
      output += `${marker} ${indent}[${event.id}] ${event.cmd}`;
      
      if (event.causation_id) {
        output += ` ← ${event.causation_id}`;
      }
      
      if (includeData) {
        const data = this.queryEngine._safeParse(event.data);
        output += `\n${indent}   Data: ${JSON.stringify(data)}`;
      }
      
      output += '\n';
      
      if (index < sortedEvents.length - 1) {
        output += '   |\n';
      }
    });
    
    return output;
  }

  _generateFlowchartVisualization(events, options) {
    const { includeData, groupByType } = options;
    
    let output = "FLOWCHART VISUALIZATION (Mermaid Format)\n";
    output += "========================================\n\n";
    output += "```mermaid\n";
    output += "flowchart TD\n";

    if (groupByType) {
      const eventsByType = {};
      events.forEach(event => {
        if (!eventsByType[event.cmd]) eventsByType[event.cmd] = [];
        eventsByType[event.cmd].push(event);
      });

      Object.entries(eventsByType).forEach(([type, typeEvents]) => {
        output += `\n  subgraph ${type.replace(/[^a-zA-Z0-9]/g, '')}_group["${type} Events"]\n`;
        typeEvents.forEach(event => {
          const nodeLabel = includeData ? 
            `${event.id}: ${event.cmd}<br/>${JSON.stringify(this.queryEngine._safeParse(event.data)).substring(0, 30)}...` :
            `${event.id}: ${event.cmd}`;
          output += `    ${event.id}["${nodeLabel}"]\n`;
        });
        output += "  end\n";
      });
    } else {
      events.forEach(event => {
        const isRoot = !event.causation_id;
        const nodeShape = isRoot ? '([%s])' : '[%s]';
        const nodeLabel = includeData ? 
          `${event.id}: ${event.cmd}<br/>${JSON.stringify(this.queryEngine._safeParse(event.data)).substring(0, 30)}...` :
          `${event.id}: ${event.cmd}`;
        
        output += `  ${event.id}${nodeShape.replace('%s', nodeLabel)}\n`;
      });
    }

    output += "\n  %% Causation relationships\n";
    events.forEach(event => {
      if (event.causation_id) {
        output += `  ${event.causation_id} --> ${event.id}\n`;
      }
    });

    output += "```\n\n";
    output += "// To render: copy to mermaid.live or use mermaid CLI\n";
    
    return output;
  }

  _buildEnhancedEventTree(branches, events, includeData) {
    const tree = {};
    const eventMap = new Map(events.map(e => [e.id, e]));
    
    branches.forEach(branch => {
      const pathParts = branch.branch_path.split('->');
      let current = tree;
      
      pathParts.forEach((eventId, index) => {
        const id = parseInt(eventId);
        const event = eventMap.get(id);
        if (!current[id]) {
          current[id] = {
            id: id,
            cmd: event?.cmd || 'unknown',
            data: includeData ? this.queryEngine._safeParse(event?.data || '{}') : null,
            causationId: event?.causation_id,
            datetime: event?.datetime,
            children: {},
            depth: index,
            influence: this.queryEngine.getEventInfluence(id)
          };
        }
        current = current[id].children;
      });
    });
    
    return tree;
  }

  _renderEnhancedNode(node, prefix, isLast, options) {
    const { includeData, showDepth } = options;
    let output = '';
    const connector = isLast ? '└── ' : '├── ';
    
    const isRoot = !node.causationId;
    const rootMarker = isRoot ? '🚀 ' : '⚡ ';
    const depthInfo = showDepth ? ` (depth: ${node.depth}, influence: ${node.influence})` : '';
    const nodeInfo = `${rootMarker}[${node.id}] ${node.cmd}${depthInfo}`;
    
    output += prefix + connector + nodeInfo + '\n';
    
    if (includeData && node.data) {
      const dataStr = JSON.stringify(node.data, null, 2)
        .split('\n')
        .map(line => prefix + (isLast ? '    ' : '│   ') + '    ' + line)
        .join('\n');
      output += dataStr + '\n';
    }
    
    const children = Object.values(node.children);
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    
    children.forEach((child, index) => {
      const isLastChild = index === children.length - 1;
      output += this._renderEnhancedNode(child, newPrefix, isLastChild, options);
    });
    
    return output;
  }

  close() {
    this.queryEngine.close();
    this.db.close();
  }
}

export class GDPRComplianceChecker {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    // Only initialize privacy modules if needed for specific checks
    this.privacyManager = null;
    this.privacyControls = PrivacyControlsModule;
    this.complianceReporting = null;
  }
  
  _initPrivacyManager() {
    if (!this.privacyManager) {
      try {
        this.privacyManager = new PrivacyManager(this.db.filename);
      } catch (error) {
        // If privacy manager initialization fails, we'll work without it
        console.warn('Privacy manager initialization failed:', error.message);
      }
    }
  }
  
  _initComplianceReporting() {
    if (!this.complianceReporting) {
      try {
        this.complianceReporting = new ComplianceReportingManager(this.db.filename);
      } catch (error) {
        // If compliance reporting initialization fails, we'll work without it
        console.warn('Compliance reporting initialization failed:', error.message);
      }
    }
  }

  /**
   * Comprehensive GDPR compliance assessment
   */
  async runComplianceCheck(options = {}) {
    const {
      userId = null,
      checkDataIntegrity = true,
      checkRetentionPolicies = true,
      checkConsentTracking = true,
      checkDataClassification = true,
      generateReport = true
    } = options;

    const results = {
      timestamp: new Date().toISOString(),
      userId,
      overallCompliance: 'UNKNOWN',
      checks: {
        dataIntegrity: null,
        retentionPolicies: null,
        consentTracking: null,
        dataClassification: null,
        cryptoShredding: null,
        auditTrail: null
      },
      issues: [],
      recommendations: [],
      summary: {}
    };

    try {
      // Data Integrity Check
      if (checkDataIntegrity) {
        results.checks.dataIntegrity = await this._checkDataIntegrity(userId);
        if (!results.checks.dataIntegrity.passed) {
          results.issues.push(...results.checks.dataIntegrity.issues);
        }
      }

      // Retention Policy Check
      if (checkRetentionPolicies) {
        results.checks.retentionPolicies = await this._checkRetentionPolicies(userId);
        if (!results.checks.retentionPolicies.passed) {
          results.issues.push(...results.checks.retentionPolicies.issues);
        }
      }

      // Consent Tracking Check
      if (checkConsentTracking) {
        results.checks.consentTracking = await this._checkConsentTracking(userId);
        if (!results.checks.consentTracking.passed) {
          results.issues.push(...results.checks.consentTracking.issues);
        }
      }

      // Data Classification Check
      if (checkDataClassification) {
        results.checks.dataClassification = await this._checkDataClassification(userId);
        if (!results.checks.dataClassification.passed) {
          results.issues.push(...results.checks.dataClassification.issues);
        }
      }

      // Crypto-shredding Capabilities
      results.checks.cryptoShredding = await this._checkCryptoShredding(userId);
      if (!results.checks.cryptoShredding.passed) {
        results.issues.push(...results.checks.cryptoShredding.issues);
      }

      // Audit Trail Completeness
      results.checks.auditTrail = await this._checkAuditTrail(userId);
      if (!results.checks.auditTrail.passed) {
        results.issues.push(...results.checks.auditTrail.issues);
      }

      // Calculate overall compliance
      const passedChecks = Object.values(results.checks).filter(check => check?.passed).length;
      const totalChecks = Object.values(results.checks).filter(check => check !== null).length;
      const complianceScore = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0;

      if (complianceScore >= 90) results.overallCompliance = 'EXCELLENT';
      else if (complianceScore >= 75) results.overallCompliance = 'GOOD';
      else if (complianceScore >= 50) results.overallCompliance = 'FAIR';
      else results.overallCompliance = 'POOR';

      results.summary = {
        complianceScore: Math.round(complianceScore),
        passedChecks,
        totalChecks,
        issueCount: results.issues.length,
        recommendationCount: results.recommendations.length
      };

      // Generate recommendations
      this._generateRecommendations(results);

    } catch (error) {
      results.issues.push({
        type: 'SYSTEM_ERROR',
        severity: 'HIGH',
        message: `Compliance check failed: ${error.message}`,
        component: 'GDPRComplianceChecker'
      });
    }

    return generateReport ? this._formatComplianceReport(results) : results;
  }

  async _checkDataIntegrity(userId) {
    const issues = [];
    
    try {
      // Check for orphaned events
      const orphanedEvents = this.db.prepare(`
        SELECT COUNT(*) as count FROM queue 
        WHERE causation_id IS NOT NULL 
        AND causation_id NOT IN (SELECT id FROM queue)
        ${userId ? 'AND data LIKE ?' : ''}
      `).get(userId ? `%"userId":"${userId}"%` : undefined);

      if (orphanedEvents.count > 0) {
        issues.push({
          type: 'DATA_INTEGRITY',
          severity: 'MEDIUM',
          message: `Found ${orphanedEvents.count} orphaned events with invalid causation references`,
          recommendation: 'Review and fix causation_id references or remove orphaned events'
        });
      }

      // Check for correlation ID consistency
      const inconsistentCorrelations = this.db.prepare(`
        WITH correlation_stats AS (
          SELECT correlation_id, COUNT(*) as event_count,
                 COUNT(CASE WHEN causation_id IS NULL THEN 1 END) as root_count
          FROM queue
          ${userId ? 'WHERE data LIKE ?' : ''}
          GROUP BY correlation_id
        )
        SELECT COUNT(*) as count FROM correlation_stats WHERE root_count = 0
      `).get(userId ? `%"userId":"${userId}"%` : undefined);

      if (inconsistentCorrelations.count > 0) {
        issues.push({
          type: 'DATA_INTEGRITY',
          severity: 'HIGH',
          message: `Found ${inconsistentCorrelations.count} correlation groups without root events`,
          recommendation: 'Every correlation ID should have at least one root event (causation_id = NULL)'
        });
      }

      return {
        passed: issues.length === 0,
        issues,
        details: {
          orphanedEvents: orphanedEvents.count,
          inconsistentCorrelations: inconsistentCorrelations.count
        }
      };
    } catch (error) {
      return {
        passed: false,
        issues: [{
          type: 'DATA_INTEGRITY',
          severity: 'HIGH',
          message: `Data integrity check failed: ${error.message}`,
          recommendation: 'Investigate database connection and query structure'
        }]
      };
    }
  }

  async _checkRetentionPolicies(userId) {
    const issues = [];
    
    try {
      // Check if retention policies are defined
      const retentionPolicyExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='retention_policies'
      `).get();

      if (!retentionPolicyExists) {
        issues.push({
          type: 'RETENTION_POLICY',
          severity: 'HIGH',
          message: 'No retention policies table found',
          recommendation: 'Implement retention policies for GDPR compliance (Article 5(1)(e))'
        });
        return { passed: false, issues };
      }

      // Check for expired data
      const expiredDataQuery = userId ? 
        `SELECT COUNT(*) as count FROM queue WHERE data LIKE ? AND datetime < date('now', '-7 years')` :
        `SELECT COUNT(*) as count FROM queue WHERE datetime < date('now', '-7 years')`;
      
      const expiredData = this.db.prepare(expiredDataQuery)
        .get(userId ? `%"userId":"${userId}"%` : undefined);

      if (expiredData.count > 0) {
        issues.push({
          type: 'RETENTION_POLICY',
          severity: 'MEDIUM',
          message: `Found ${expiredData.count} events older than 7 years`,
          recommendation: 'Review and apply data retention policies to old events'
        });
      }

      return {
        passed: issues.length === 0,
        issues,
        details: {
          retentionPolicyTableExists: !!retentionPolicyExists,
          expiredEvents: expiredData.count
        }
      };
    } catch (error) {
      return {
        passed: false,
        issues: [{
          type: 'RETENTION_POLICY',
          severity: 'HIGH',
          message: `Retention policy check failed: ${error.message}`,
          recommendation: 'Ensure proper database schema and retention policy implementation'
        }]
      };
    }
  }

  async _checkConsentTracking(userId) {
    const issues = [];
    
    try {
      // Check if consent tracking table exists
      const consentTableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='user_consent'
      `).get();

      if (!consentTableExists) {
        issues.push({
          type: 'CONSENT_TRACKING',
          severity: 'HIGH',
          message: 'No consent tracking table found',
          recommendation: 'Implement consent tracking for GDPR compliance (Article 7)'
        });
        return { passed: false, issues };
      }

      // Check for users without consent records
      if (userId) {
        const userConsent = this.db.prepare(`
          SELECT COUNT(*) as count FROM user_consent WHERE user_id = ?
        `).get(userId);

        if (userConsent.count === 0) {
          issues.push({
            type: 'CONSENT_TRACKING',
            severity: 'HIGH',
            message: `User ${userId} has no consent records`,
            recommendation: 'Ensure all users have proper consent tracking'
          });
        }
      }

      return {
        passed: issues.length === 0,
        issues,
        details: {
          consentTableExists: !!consentTableExists
        }
      };
    } catch (error) {
      return {
        passed: false,
        issues: [{
          type: 'CONSENT_TRACKING',
          severity: 'HIGH',
          message: `Consent tracking check failed: ${error.message}`,
          recommendation: 'Implement proper consent tracking system'
        }]
      };
    }
  }

  async _checkDataClassification(userId) {
    const issues = [];
    
    try {
      // Check for potentially sensitive data in events
      const sensitiveDataPatterns = [
        { pattern: 'email', type: 'EMAIL' },
        { pattern: 'password', type: 'PASSWORD' },
        { pattern: 'ssn', type: 'SSN' },
        { pattern: 'phone', type: 'PHONE' },
        { pattern: 'address', type: 'ADDRESS' }
      ];

      const baseQuery = userId ? 
        `SELECT data FROM queue WHERE data LIKE ? AND` :
        `SELECT data FROM queue WHERE`;
      
      for (const { pattern, type } of sensitiveDataPatterns) {
        const query = `${baseQuery} data LIKE '%${pattern}%'`;
        const params = userId ? [`%"userId":"${userId}"%`] : [];
        
        const sensitiveEvents = this.db.prepare(query).all(...params);
        
        if (sensitiveEvents.length > 0) {
          issues.push({
            type: 'DATA_CLASSIFICATION',
            severity: 'MEDIUM',
            message: `Found ${sensitiveEvents.length} events potentially containing ${type} data`,
            recommendation: `Review and properly classify ${type} data, consider encryption or segregation`
          });
        }
      }

      return {
        passed: issues.length === 0,
        issues,
        details: {
          checkedPatterns: sensitiveDataPatterns.length
        }
      };
    } catch (error) {
      return {
        passed: false,
        issues: [{
          type: 'DATA_CLASSIFICATION',
          severity: 'HIGH',
          message: `Data classification check failed: ${error.message}`,
          recommendation: 'Implement proper data classification and scanning'
        }]
      };
    }
  }

  async _checkCryptoShredding(userId) {
    const issues = [];
    
    try {
      // Check if crypto-shredding capabilities exist
      const encryptionTableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='encrypted_data'
      `).get();

      if (!encryptionTableExists) {
        issues.push({
          type: 'CRYPTO_SHREDDING',
          severity: 'MEDIUM',
          message: 'No encrypted data table found for crypto-shredding',
          recommendation: 'Consider implementing crypto-shredding for sensitive data deletion'
        });
      }

      return {
        passed: issues.length === 0,
        issues,
        details: {
          encryptionTableExists: !!encryptionTableExists
        }
      };
    } catch (error) {
      return {
        passed: false,
        issues: [{
          type: 'CRYPTO_SHREDDING',
          severity: 'HIGH',
          message: `Crypto-shredding check failed: ${error.message}`,
          recommendation: 'Implement crypto-shredding capabilities for GDPR compliance'
        }]
      };
    }
  }

  async _checkAuditTrail(userId) {
    const issues = [];
    
    try {
      // Check if all events have proper audit information
      const missingAuditInfo = this.db.prepare(`
        SELECT COUNT(*) as count FROM queue 
        WHERE datetime IS NULL OR correlation_id IS NULL
        ${userId ? 'AND data LIKE ?' : ''}
      `).get(userId ? `%"userId":"${userId}"%` : undefined);

      if (missingAuditInfo.count > 0) {
        issues.push({
          type: 'AUDIT_TRAIL',
          severity: 'HIGH',
          message: `Found ${missingAuditInfo.count} events with incomplete audit information`,
          recommendation: 'Ensure all events have complete datetime and correlation_id information'
        });
      }

      return {
        passed: issues.length === 0,
        issues,
        details: {
          incompleteAuditEvents: missingAuditInfo.count
        }
      };
    } catch (error) {
      return {
        passed: false,
        issues: [{
          type: 'AUDIT_TRAIL',
          severity: 'HIGH',
          message: `Audit trail check failed: ${error.message}`,
          recommendation: 'Ensure proper audit trail implementation'
        }]
      };
    }
  }

  _generateRecommendations(results) {
    const { issues, summary } = results;
    
    if (summary.complianceScore < 75) {
      results.recommendations.push({
        priority: 'HIGH',
        category: 'GENERAL',
        title: 'Improve Overall Compliance',
        description: 'Your GDPR compliance score is below 75%. Focus on addressing high-severity issues first.',
        steps: [
          'Review all HIGH severity issues',
          'Implement missing compliance features',
          'Regular compliance monitoring',
          'Staff training on GDPR requirements'
        ]
      });
    }

    const highSeverityIssues = issues.filter(issue => issue.severity === 'HIGH');
    if (highSeverityIssues.length > 0) {
      results.recommendations.push({
        priority: 'HIGH',
        category: 'CRITICAL_FIXES',
        title: 'Address Critical Issues',
        description: `${highSeverityIssues.length} high-severity issues require immediate attention.`,
        steps: highSeverityIssues.map(issue => issue.recommendation)
      });
    }

    if (!results.checks.consentTracking?.passed) {
      results.recommendations.push({
        priority: 'HIGH',
        category: 'CONSENT_MANAGEMENT',
        title: 'Implement Consent Tracking',
        description: 'Proper consent management is essential for GDPR compliance.',
        steps: [
          'Create user_consent table',
          'Track consent changes with timestamps',
          'Implement consent withdrawal mechanisms',
          'Regular consent audits'
        ]
      });
    }

    if (!results.checks.retentionPolicies?.passed) {
      results.recommendations.push({
        priority: 'MEDIUM',
        category: 'DATA_RETENTION',
        title: 'Implement Data Retention Policies',
        description: 'Data minimization and retention policies are required by GDPR Article 5.',
        steps: [
          'Define retention periods for different data types',
          'Implement automated data cleanup',
          'Document retention policies',
          'Regular retention policy reviews'
        ]
      });
    }
  }

  _formatComplianceReport(results) {
    let report = `╔═══════════════════════════════════════════════════════════════╗\n`;
    report += `║                    GDPR COMPLIANCE REPORT                    ║\n`;
    report += `╚═══════════════════════════════════════════════════════════════╝\n\n`;
    
    report += `🕐 Generated: ${results.timestamp}\n`;
    if (results.userId) report += `👤 User ID: ${results.userId}\n`;
    report += `📊 Overall Compliance: ${results.overallCompliance} (${results.summary.complianceScore}%)\n\n`;

    // Summary
    report += `📈 SUMMARY\n`;
    report += `${'─'.repeat(50)}\n`;
    report += `✅ Passed Checks: ${results.summary.passedChecks}/${results.summary.totalChecks}\n`;
    report += `⚠️  Issues Found: ${results.summary.issueCount}\n`;
    report += `💡 Recommendations: ${results.summary.recommendationCount}\n\n`;

    // Check Results
    report += `🔍 CHECK RESULTS\n`;
    report += `${'─'.repeat(50)}\n`;
    Object.entries(results.checks).forEach(([checkName, result]) => {
      if (result) {
        const status = result.passed ? '✅' : '❌';
        const name = checkName.replace(/([A-Z])/g, ' $1').toLowerCase();
        report += `${status} ${name.charAt(0).toUpperCase() + name.slice(1)}\n`;
      }
    });
    report += '\n';

    // Issues
    if (results.issues.length > 0) {
      report += `⚠️  ISSUES FOUND\n`;
      report += `${'─'.repeat(50)}\n`;
      results.issues.forEach((issue, index) => {
        const severityIcon = issue.severity === 'HIGH' ? '🔴' : 
                           issue.severity === 'MEDIUM' ? '🟡' : '🟢';
        report += `${index + 1}. ${severityIcon} ${issue.type}\n`;
        report += `   ${issue.message}\n`;
        if (issue.recommendation) {
          report += `   💡 ${issue.recommendation}\n`;
        }
        report += '\n';
      });
    }

    // Recommendations
    if (results.recommendations.length > 0) {
      report += `💡 RECOMMENDATIONS\n`;
      report += `${'─'.repeat(50)}\n`;
      results.recommendations.forEach((rec, index) => {
        const priorityIcon = rec.priority === 'HIGH' ? '🔴' : 
                           rec.priority === 'MEDIUM' ? '🟡' : '🟢';
        report += `${index + 1}. ${priorityIcon} ${rec.title}\n`;
        report += `   ${rec.description}\n`;
        if (rec.steps && rec.steps.length > 0) {
          rec.steps.forEach((step, stepIndex) => {
            report += `   ${stepIndex + 1}. ${step}\n`;
          });
        }
        report += '\n';
      });
    }

    report += `${'═'.repeat(65)}\n`;
    report += `End of GDPR Compliance Report\n`;
    
    return report;
  }

  close() {
    if (this.privacyManager) {
      this.privacyManager.close();
    }
    if (this.complianceReporting) {
      this.complianceReporting.close();
    }
    this.db.close();
  }
}

export class EventSourcingDebugger {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.queryEngine = new EventQueryEngine(dbPath);
    this.debugSessions = new Map();
  }

  /**
   * Start a debugging session for event analysis
   */
  startDebugSession(sessionId, options = {}) {
    const {
      correlationId = null,
      eventId = null,
      timeRange = null,
      trackPerformance = true,
      verboseLogging = false
    } = options;

    const session = {
      id: sessionId,
      startTime: new Date(),
      options,
      events: [],
      analysis: {},
      performance: {},
      logs: [],
      status: 'ACTIVE'
    };

    if (correlationId) {
      session.events = this.queryEngine.getEventsByCorrelationId(correlationId);
      session.analysis.correlationId = correlationId;
    } else if (eventId) {
      const mainEvent = this.db.prepare('SELECT * FROM queue WHERE id = ?').get(eventId);
      if (mainEvent) {
        session.events = this.queryEngine.getEventsByCorrelationId(mainEvent.correlation_id);
        session.analysis.eventId = eventId;
        session.analysis.correlationId = mainEvent.correlation_id;
      }
    }

    if (trackPerformance) {
      session.performance = this._initPerformanceTracking(session);
    }

    this.debugSessions.set(sessionId, session);
    this._log(session, 'info', `Debug session ${sessionId} started with ${session.events.length} events`);

    return session;
  }

  /**
   * Analyze event causation chains for issues
   */
  analyzeCausationChains(sessionId) {
    const session = this.debugSessions.get(sessionId);
    if (!session) throw new Error(`Debug session ${sessionId} not found`);

    const analysis = {
      chains: [],
      issues: [],
      recommendations: [],
      statistics: {}
    };

    // Find all causation chains
    const rootEvents = session.events.filter(e => !e.causation_id);
    
    for (const rootEvent of rootEvents) {
      const chain = this._traceEventChain(rootEvent, session.events);
      analysis.chains.push(chain);

      // Analyze chain for issues
      const chainIssues = this._analyzeChainIssues(chain);
      analysis.issues.push(...chainIssues);
    }

    // Calculate statistics
    analysis.statistics = {
      totalChains: analysis.chains.length,
      averageChainLength: analysis.chains.reduce((sum, chain) => sum + chain.length, 0) / analysis.chains.length || 0,
      longestChain: Math.max(...analysis.chains.map(chain => chain.length), 0),
      totalIssues: analysis.issues.length,
      branchingFactor: this._calculateBranchingFactor(analysis.chains)
    };

    // Generate recommendations
    analysis.recommendations = this._generateChainRecommendations(analysis);

    session.analysis.causationChains = analysis;
    this._log(session, 'info', `Causation chain analysis complete: ${analysis.chains.length} chains, ${analysis.issues.length} issues`);

    return analysis;
  }

  /**
   * Detect event replay anomalies
   */
  detectReplayAnomalies(sessionId, expectedState = null) {
    const session = this.debugSessions.get(sessionId);
    if (!session) throw new Error(`Debug session ${sessionId} not found`);

    const anomalies = {
      stateInconsistencies: [],
      orderingIssues: [],
      missingEvents: [],
      duplicateEvents: [],
      recommendations: []
    };

    // Check event ordering
    const sortedEvents = [...session.events].sort((a, b) => a.id - b.id);
    for (let i = 1; i < sortedEvents.length; i++) {
      const prev = sortedEvents[i - 1];
      const curr = sortedEvents[i];
      
      if (curr.causation_id && curr.causation_id >= curr.id) {
        anomalies.orderingIssues.push({
          type: 'FUTURE_CAUSATION',
          eventId: curr.id,
          causationId: curr.causation_id,
          message: `Event ${curr.id} has causation_id ${curr.causation_id} from the future`
        });
      }
    }

    // Check for duplicate events (same cmd, data, correlation_id)
    const eventSignatures = new Map();
    session.events.forEach(event => {
      const signature = `${event.cmd}-${event.data}-${event.correlation_id}`;
      if (eventSignatures.has(signature)) {
        anomalies.duplicateEvents.push({
          type: 'DUPLICATE_EVENT',
          eventIds: [eventSignatures.get(signature), event.id],
          signature,
          message: `Events ${eventSignatures.get(signature)} and ${event.id} appear to be duplicates`
        });
      } else {
        eventSignatures.set(signature, event.id);
      }
    });

    // Check for missing causation events
    session.events.forEach(event => {
      if (event.causation_id && !session.events.find(e => e.id === event.causation_id)) {
        anomalies.missingEvents.push({
          type: 'MISSING_CAUSATION',
          eventId: event.id,
          missingCausationId: event.causation_id,
          message: `Event ${event.id} references missing causation event ${event.causation_id}`
        });
      }
    });

    // Generate recommendations
    if (anomalies.orderingIssues.length > 0) {
      anomalies.recommendations.push({
        category: 'ORDERING',
        message: 'Fix event ordering issues - causation_id should always reference earlier events',
        impact: 'HIGH'
      });
    }

    if (anomalies.duplicateEvents.length > 0) {
      anomalies.recommendations.push({
        category: 'DUPLICATES',
        message: 'Review and remove duplicate events to prevent state corruption',
        impact: 'MEDIUM'
      });
    }

    session.analysis.replayAnomalies = anomalies;
    this._log(session, 'warning', `Replay anomaly detection found ${Object.values(anomalies).flat().length} total issues`);

    return anomalies;
  }

  /**
   * Generate debugging report
   */
  generateDebugReport(sessionId, format = 'text') {
    const session = this.debugSessions.get(sessionId);
    if (!session) throw new Error(`Debug session ${sessionId} not found`);

    const report = {
      sessionId,
      startTime: session.startTime,
      endTime: new Date(),
      duration: new Date() - session.startTime,
      eventCount: session.events.length,
      analysis: session.analysis,
      performance: session.performance,
      logs: session.logs,
      summary: this._generateDebugSummary(session)
    };

    return format === 'json' ? JSON.stringify(report, null, 2) : this._formatDebugReport(report);
  }

  _traceEventChain(rootEvent, allEvents, depth = 0, maxDepth = 50) {
    if (depth > maxDepth) {
      return {
        rootEvent: rootEvent.id,
        events: [rootEvent],
        length: 1,
        truncated: true,
        issues: ['MAX_DEPTH_EXCEEDED']
      };
    }

    const chain = {
      rootEvent: rootEvent.id,
      events: [rootEvent],
      length: 1,
      truncated: false,
      issues: []
    };

    const children = allEvents.filter(e => e.causation_id === rootEvent.id);
    
    for (const child of children) {
      const childChain = this._traceEventChain(child, allEvents, depth + 1, maxDepth);
      chain.events.push(...childChain.events);
      chain.length += childChain.length;
      chain.issues.push(...childChain.issues);
      if (childChain.truncated) chain.truncated = true;
    }

    return chain;
  }

  _analyzeChainIssues(chain) {
    const issues = [];

    // Check for excessive chain length
    if (chain.length > 20) {
      issues.push({
        type: 'EXCESSIVE_CHAIN_LENGTH',
        chainRoot: chain.rootEvent,
        length: chain.length,
        severity: 'MEDIUM',
        message: `Chain starting from event ${chain.rootEvent} is ${chain.length} events long`,
        recommendation: 'Consider breaking down complex operations into smaller transactions'
      });
    }

    // Check for circular references
    const eventIds = new Set();
    for (const event of chain.events) {
      if (eventIds.has(event.id)) {
        issues.push({
          type: 'CIRCULAR_REFERENCE',
          eventId: event.id,
          chainRoot: chain.rootEvent,
          severity: 'HIGH',
          message: `Circular reference detected in chain starting from ${chain.rootEvent}`,
          recommendation: 'Fix causation logic to prevent circular event dependencies'
        });
        break;
      }
      eventIds.add(event.id);
    }

    return issues;
  }

  _calculateBranchingFactor(chains) {
    if (chains.length === 0) return 0;
    
    let totalBranches = 0;
    chains.forEach(chain => {
      const eventMap = new Map(chain.events.map(e => [e.id, e]));
      chain.events.forEach(event => {
        const children = chain.events.filter(e => e.causation_id === event.id);
        if (children.length > 1) {
          totalBranches += children.length;
        }
      });
    });
    
    return totalBranches / chains.length;
  }

  _generateChainRecommendations(analysis) {
    const recommendations = [];
    
    const highSeverityIssues = analysis.issues.filter(issue => issue.severity === 'HIGH');
    if (highSeverityIssues.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'CRITICAL_ISSUES',
        message: `${highSeverityIssues.length} critical issues found in causation chains`,
        actions: ['Fix circular references', 'Validate causation logic', 'Review event ordering']
      });
    }

    if (analysis.statistics.averageChainLength > 15) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'PERFORMANCE',
        message: 'Average chain length is high, consider transaction boundaries',
        actions: ['Break complex operations into smaller transactions', 'Use correlation IDs more effectively']
      });
    }

    return recommendations;
  }

  _initPerformanceTracking(session) {
    return {
      startTime: new Date(),
      queryTimes: [],
      memoryUsage: process.memoryUsage(),
      eventProcessingRate: 0
    };
  }

  _log(session, level, message) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    };
    session.logs.push(logEntry);
    
    if (session.options.verboseLogging) {
      console.log(`[${level.toUpperCase()}] ${message}`);
    }
  }

  _generateDebugSummary(session) {
    const summary = {
      eventCount: session.events.length,
      duration: new Date() - session.startTime,
      issuesFound: 0,
      recommendations: 0,
      status: 'COMPLETED'
    };

    if (session.analysis.causationChains) {
      summary.issuesFound += session.analysis.causationChains.issues.length;
      summary.recommendations += session.analysis.causationChains.recommendations.length;
    }

    if (session.analysis.replayAnomalies) {
      const anomalies = session.analysis.replayAnomalies;
      summary.issuesFound += Object.values(anomalies).flat().length;
      summary.recommendations += anomalies.recommendations.length;
    }

    return summary;
  }

  _formatDebugReport(report) {
    let output = `╔═══════════════════════════════════════════════════════════════╗\n`;
    output += `║                EVENT SOURCING DEBUG REPORT                   ║\n`;
    output += `╚═══════════════════════════════════════════════════════════════╝\n\n`;
    
    output += `🔍 Session ID: ${report.sessionId}\n`;
    output += `⏱️  Duration: ${Math.round(report.duration / 1000)}s\n`;
    output += `📊 Events Analyzed: ${report.eventCount}\n`;
    output += `⚠️  Issues Found: ${report.summary.issuesFound}\n`;
    output += `💡 Recommendations: ${report.summary.recommendations}\n\n`;

    if (report.analysis.causationChains) {
      const chains = report.analysis.causationChains;
      output += `🔗 CAUSATION CHAIN ANALYSIS\n`;
      output += `${'─'.repeat(50)}\n`;
      output += `Total Chains: ${chains.statistics.totalChains}\n`;
      output += `Average Length: ${chains.statistics.averageChainLength.toFixed(2)}\n`;
      output += `Longest Chain: ${chains.statistics.longestChain}\n`;
      output += `Branching Factor: ${chains.statistics.branchingFactor.toFixed(2)}\n\n`;
    }

    if (report.analysis.replayAnomalies) {
      const anomalies = report.analysis.replayAnomalies;
      output += `🚨 REPLAY ANOMALIES\n`;
      output += `${'─'.repeat(50)}\n`;
      output += `Ordering Issues: ${anomalies.orderingIssues.length}\n`;
      output += `Duplicate Events: ${anomalies.duplicateEvents.length}\n`;
      output += `Missing Events: ${anomalies.missingEvents.length}\n\n`;
    }

    return output;
  }

  endDebugSession(sessionId) {
    const session = this.debugSessions.get(sessionId);
    if (session) {
      session.status = 'COMPLETED';
      session.endTime = new Date();
      this._log(session, 'info', `Debug session ${sessionId} completed`);
    }
    return session;
  }

  close() {
    this.queryEngine.close();
    this.db.close();
  }
}

export class SchemaMigrationHelper {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this._ensureMigrationTable();
  }

  /**
   * Create and manage database migrations
   */
  createMigration(name, description = '') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const migrationId = `${timestamp}_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    const migration = {
      id: migrationId,
      name,
      description,
      created: new Date().toISOString(),
      status: 'PENDING',
      up: {
        sql: [],
        eventMigrations: [],
        dataTransformations: []
      },
      down: {
        sql: [],
        eventMigrations: [],
        dataTransformations: []
      }
    };

    return migration;
  }

  /**
   * Add SQL migration steps
   */
  addSQLMigration(migration, direction, sql) {
    if (!migration[direction]) {
      throw new Error(`Invalid migration direction: ${direction}`);
    }
    
    migration[direction].sql.push({
      id: Date.now().toString(),
      sql,
      timestamp: new Date().toISOString()
    });

    return migration;
  }

  /**
   * Add event data migration
   */
  addEventMigration(migration, direction, eventMigrationConfig) {
    const {
      fromVersion = null,
      toVersion = null,
      eventType = null,
      transformation = null,
      validator = null
    } = eventMigrationConfig;

    migration[direction].eventMigrations.push({
      id: Date.now().toString(),
      fromVersion,
      toVersion,
      eventType,
      transformation,
      validator,
      timestamp: new Date().toISOString()
    });

    return migration;
  }

  /**
   * Execute migration with rollback capability
   */
  async executeMigration(migration, direction = 'up', dryRun = false) {
    const execution = {
      migrationId: migration.id,
      direction,
      dryRun,
      startTime: new Date(),
      steps: [],
      status: 'RUNNING',
      errors: []
    };

    try {
      if (!dryRun) {
        this.db.run('BEGIN TRANSACTION');
      }

      // Execute SQL migrations
      for (const sqlStep of migration[direction].sql) {
        const stepExecution = await this._executeSQLStep(sqlStep, dryRun);
        execution.steps.push(stepExecution);
        
        if (!stepExecution.success) {
          execution.errors.push(stepExecution.error);
          if (!dryRun) {
            this.db.run('ROLLBACK');
          }
          execution.status = 'FAILED';
          return execution;
        }
      }

      // Execute event migrations
      for (const eventStep of migration[direction].eventMigrations) {
        const stepExecution = await this._executeEventMigrationStep(eventStep, dryRun);
        execution.steps.push(stepExecution);
        
        if (!stepExecution.success) {
          execution.errors.push(stepExecution.error);
          if (!dryRun) {
            this.db.run('ROLLBACK');
          }
          execution.status = 'FAILED';
          return execution;
        }
      }

      // Execute data transformations
      for (const transformStep of migration[direction].dataTransformations) {
        const stepExecution = await this._executeDataTransformationStep(transformStep, dryRun);
        execution.steps.push(stepExecution);
        
        if (!stepExecution.success) {
          execution.errors.push(stepExecution.error);
          if (!dryRun) {
            this.db.run('ROLLBACK');
          }
          execution.status = 'FAILED';
          return execution;
        }
      }

      if (!dryRun) {
        // Record migration in database
        this.db.prepare(`
          INSERT INTO migrations (id, name, description, direction, executed_at, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          migration.id,
          migration.name,
          migration.description,
          direction,
          new Date().toISOString(),
          'COMPLETED'
        );

        this.db.run('COMMIT');
      }

      execution.status = 'COMPLETED';
      execution.endTime = new Date();

    } catch (error) {
      execution.errors.push({
        type: 'EXECUTION_ERROR',
        message: error.message,
        stack: error.stack
      });
      execution.status = 'FAILED';
      
      if (!dryRun) {
        this.db.run('ROLLBACK');
      }
    }

    return execution;
  }

  /**
   * Get migration status and history
   */
  getMigrationStatus() {
    const appliedMigrations = this.db.prepare(`
      SELECT * FROM migrations ORDER BY executed_at DESC
    `).all();

    const pendingMigrations = []; // Would come from filesystem in real implementation

    return {
      applied: appliedMigrations,
      pending: pendingMigrations,
      total: appliedMigrations.length + pendingMigrations.length,
      lastMigration: appliedMigrations[0] || null
    };
  }

  /**
   * Rollback last migration
   */
  async rollbackLastMigration(dryRun = false) {
    const lastMigration = this.db.prepare(`
      SELECT * FROM migrations 
      WHERE direction = 'up' 
      ORDER BY executed_at DESC 
      LIMIT 1
    `).get();

    if (!lastMigration) {
      throw new Error('No migrations to rollback');
    }

    // In a real implementation, you'd load the migration definition
    // and execute its 'down' direction
    const rollbackResult = {
      migrationId: lastMigration.id,
      migrationName: lastMigration.name,
      originalExecutionDate: lastMigration.executed_at,
      rollbackDate: new Date().toISOString(),
      dryRun,
      status: 'COMPLETED'
    };

    if (!dryRun) {
      this.db.prepare(`
        INSERT INTO migrations (id, name, description, direction, executed_at, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `rollback_${lastMigration.id}`,
        `Rollback: ${lastMigration.name}`,
        `Rollback of migration ${lastMigration.id}`,
        'down',
        new Date().toISOString(),
        'COMPLETED'
      );
    }

    return rollbackResult;
  }

  /**
   * Generate migration template
   */
  generateMigrationTemplate(name, type = 'schema') {
    const templates = {
      schema: `
// Schema Migration: ${name}
// Generated: ${new Date().toISOString()}

export function up(migration) {
  // Add your forward migration steps here
  migration.addSQLMigration('up', \`
    -- Add your SQL here
    -- Example: ALTER TABLE queue ADD COLUMN new_field TEXT;
  \`);
}

export function down(migration) {
  // Add your rollback migration steps here
  migration.addSQLMigration('down', \`
    -- Add your rollback SQL here
    -- Example: ALTER TABLE queue DROP COLUMN new_field;
  \`);
}
`,
      event: `
// Event Migration: ${name}
// Generated: ${new Date().toISOString()}

export function up(migration) {
  // Migrate events from old format to new format
  migration.addEventMigration('up', {
    eventType: 'your_event_type',
    fromVersion: 1,
    toVersion: 2,
    transformation: (eventData) => {
      // Transform event data
      return {
        ...eventData,
        // Add your transformations here
      };
    },
    validator: (eventData) => {
      // Validate transformed data
      return true; // or false if invalid
    }
  });
}

export function down(migration) {
  // Rollback event migration
  migration.addEventMigration('down', {
    eventType: 'your_event_type',
    fromVersion: 2,
    toVersion: 1,
    transformation: (eventData) => {
      // Reverse transformation
      return {
        ...eventData,
        // Add your reverse transformations here
      };
    }
  });
}
`
    };

    return templates[type] || templates.schema;
  }

  _ensureMigrationTable() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
        executed_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'FAILED'))
      )
    `);
  }

  async _executeSQLStep(sqlStep, dryRun) {
    const execution = {
      type: 'SQL',
      id: sqlStep.id,
      sql: sqlStep.sql,
      success: false,
      dryRun,
      timestamp: new Date().toISOString()
    };

    try {
      if (dryRun) {
        // Validate SQL syntax without executing
        this.db.prepare(sqlStep.sql);
        execution.success = true;
        execution.message = 'SQL syntax validation passed';
      } else {
        const result = this.db.run(sqlStep.sql);
        execution.success = true;
        execution.result = {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid
        };
      }
    } catch (error) {
      execution.error = {
        message: error.message,
        code: error.code
      };
    }

    return execution;
  }

  async _executeEventMigrationStep(eventStep, dryRun) {
    const execution = {
      type: 'EVENT_MIGRATION',
      id: eventStep.id,
      eventType: eventStep.eventType,
      success: false,
      dryRun,
      timestamp: new Date().toISOString(),
      affectedEvents: 0
    };

    try {
      // Find events to migrate
      const events = this.db.prepare(`
        SELECT * FROM queue 
        WHERE cmd = ? AND version = ?
      `).all(eventStep.eventType, eventStep.fromVersion);

      execution.affectedEvents = events.length;

      if (dryRun) {
        execution.success = true;
        execution.message = `Would migrate ${events.length} events`;
      } else {
        // Execute transformation for each event
        for (const event of events) {
          const eventData = JSON.parse(event.data);
          const transformedData = eventStep.transformation(eventData);
          
          if (eventStep.validator && !eventStep.validator(transformedData)) {
            throw new Error(`Validation failed for event ${event.id}`);
          }

          this.db.prepare(`
            UPDATE queue 
            SET data = ?, version = ? 
            WHERE id = ?
          `).run(
            JSON.stringify(transformedData),
            eventStep.toVersion,
            event.id
          );
        }
        
        execution.success = true;
        execution.message = `Successfully migrated ${events.length} events`;
      }
    } catch (error) {
      execution.error = {
        message: error.message,
        stack: error.stack
      };
    }

    return execution;
  }

  async _executeDataTransformationStep(transformStep, dryRun) {
    return {
      type: 'DATA_TRANSFORMATION',
      id: transformStep.id,
      success: true,
      dryRun,
      timestamp: new Date().toISOString(),
      message: 'Data transformation placeholder - implement as needed'
    };
  }

  close() {
    this.db.close();
  }
}

// Export all developer tools as a unified interface
export class DeveloperToolsSuite {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.visualizer = new EventVisualizerPro(dbPath);
    this.complianceChecker = new GDPRComplianceChecker(dbPath);
    this.debugger = new EventSourcingDebugger(dbPath);
    this.migrationHelper = new SchemaMigrationHelper(dbPath);
  }

  /**
   * Quick health check of event sourcing system
   */
  async quickHealthCheck() {
    const health = {
      timestamp: new Date().toISOString(),
      overall: 'UNKNOWN',
      checks: {},
      recommendations: []
    };

    try {
      // Basic database connectivity
      const db = new Database(this.dbPath);
      const eventCount = db.prepare('SELECT COUNT(*) as count FROM queue').get();
      health.checks.database = { status: 'OK', eventCount: eventCount.count };
      db.close();

      // Quick compliance check
      const complianceResult = await this.complianceChecker.runComplianceCheck({
        checkDataIntegrity: true,
        checkRetentionPolicies: false,
        checkConsentTracking: false,
        checkDataClassification: false,
        generateReport: false
      });
      health.checks.compliance = {
        status: complianceResult.overallCompliance,
        score: complianceResult.summary.complianceScore
      };

      // Overall health assessment
      const scores = [
        health.checks.database.status === 'OK' ? 100 : 0,
        health.checks.compliance.score || 0
      ];
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      if (avgScore >= 80) health.overall = 'EXCELLENT';
      else if (avgScore >= 60) health.overall = 'GOOD';
      else if (avgScore >= 40) health.overall = 'FAIR';
      else health.overall = 'POOR';

      if (health.overall !== 'EXCELLENT') {
        health.recommendations.push('Run full compliance check for detailed analysis');
        health.recommendations.push('Consider running event sourcing debugger for deeper insights');
      }

    } catch (error) {
      health.checks.error = error.message;
      health.overall = 'ERROR';
    }

    return health;
  }

  close() {
    this.visualizer.close();
    this.complianceChecker.close();
    this.debugger.close();
    this.migrationHelper.close();
  }
}
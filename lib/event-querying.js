import { Database } from "bun:sqlite";

export class EventQueryEngine {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this._prepareQueries();
  }

  _prepareQueries() {
    // Root event queries
    this._queries = {
      // Root Event Detection (#10)
      getRootEvents: this.db.prepare(`
        SELECT * FROM queue 
        WHERE causation_id IS NULL 
        ORDER BY id ASC
      `),
      
      getRootEventsInTimeRange: this.db.prepare(`
        SELECT * FROM queue 
        WHERE causation_id IS NULL 
        AND id BETWEEN ? AND ?
        ORDER BY id ASC
      `),
      
      getRootEventsByType: this.db.prepare(`
        SELECT * FROM queue 
        WHERE causation_id IS NULL 
        AND cmd = ?
        ORDER BY id ASC
      `),
      
      getRootEventsByUser: this.db.prepare(`
        SELECT * FROM queue 
        WHERE causation_id IS NULL 
        AND data LIKE ?
        ORDER BY id ASC
      `),

      // Enhanced Child Event Methods (#11)
      getChildEvents: this.db.prepare(`
        SELECT * FROM queue 
        WHERE causation_id = ?
        ORDER BY id ASC
      `),
      
      getDescendantEvents: this.db.prepare(`
        WITH RECURSIVE descendants(id, cmd, data, correlation_id, causation_id, version, datetime, depth) AS (
          SELECT id, cmd, data, correlation_id, causation_id, version, datetime, 0 as depth
          FROM queue 
          WHERE id = ?
          
          UNION ALL
          
          SELECT e.id, e.cmd, e.data, e.correlation_id, e.causation_id, e.version, e.datetime, d.depth + 1
          FROM queue e
          INNER JOIN descendants d ON e.causation_id = d.id
        )
        SELECT * FROM descendants 
        WHERE depth > 0
        ORDER BY depth ASC, id ASC
      `),
      
      getDirectChildren: this.db.prepare(`
        SELECT * FROM queue 
        WHERE causation_id = ?
        ORDER BY id ASC
      `),
      
      getChildrenByType: this.db.prepare(`
        SELECT * FROM queue 
        WHERE causation_id = ? AND cmd = ?
        ORDER BY id ASC
      `),

      // Cousin Event Detection (#12)
      getCousinEvents: this.db.prepare(`
        WITH target_event AS (
          SELECT * FROM queue WHERE id = ?
        ),
        -- Get all events in same correlation
        same_correlation AS (
          SELECT e2.* FROM queue e2, target_event e1
          WHERE e2.correlation_id = e1.correlation_id 
          AND e2.id != e1.id
          AND e2.causation_id IS NOT NULL
        ),
        -- Get ancestors of target event
        ancestors AS (
          WITH RECURSIVE anc(id) AS (
            SELECT causation_id FROM target_event WHERE causation_id IS NOT NULL
            UNION ALL
            SELECT e.causation_id FROM queue e
            INNER JOIN anc a ON e.id = a.id
            WHERE e.causation_id IS NOT NULL
          )
          SELECT id FROM anc
        ),
        -- Get descendants of target event  
        descendants AS (
          WITH RECURSIVE desc(id) AS (
            SELECT id FROM queue WHERE causation_id = (SELECT id FROM target_event)
            UNION ALL
            SELECT e.id FROM queue e
            INNER JOIN desc d ON e.causation_id = d.id
          )
          SELECT id FROM desc
        )
        -- Cousins are in same correlation but not ancestors, descendants, or siblings
        SELECT sc.* FROM same_correlation sc, target_event te
        WHERE sc.id NOT IN (SELECT id FROM ancestors WHERE id IS NOT NULL)
        AND sc.id NOT IN (SELECT id FROM descendants)
        AND sc.causation_id != te.causation_id  -- Not siblings
        ORDER BY sc.id ASC
      `),
      
      getSiblingEvents: this.db.prepare(`
        SELECT * FROM queue 
        WHERE causation_id = (SELECT causation_id FROM queue WHERE id = ?)
        AND causation_id IS NOT NULL
        AND id != ?
        ORDER BY id ASC
      `),
      
      getRelatedEvents: this.db.prepare(`
        SELECT * FROM queue 
        WHERE correlation_id = (SELECT correlation_id FROM queue WHERE id = ?)
        AND id != ?
        ORDER BY id ASC
      `),
      
      getEventFamily: this.db.prepare(`
        WITH RECURSIVE 
        ancestors(id, cmd, data, correlation_id, causation_id, version, datetime, relation) AS (
          SELECT id, cmd, data, correlation_id, causation_id, version, datetime, 'self' as relation
          FROM queue WHERE id = ?
          
          UNION ALL
          
          SELECT e.id, e.cmd, e.data, e.correlation_id, e.causation_id, e.version, e.datetime, 'ancestor'
          FROM queue e
          INNER JOIN ancestors a ON e.id = a.causation_id
        ),
        descendants(id, cmd, data, correlation_id, causation_id, version, datetime, relation) AS (
          SELECT id, cmd, data, correlation_id, causation_id, version, datetime, 'self' as relation
          FROM queue WHERE id = ?
          
          UNION ALL
          
          SELECT e.id, e.cmd, e.data, e.correlation_id, e.causation_id, e.version, e.datetime, 'descendant'
          FROM queue e
          INNER JOIN descendants d ON e.causation_id = d.id
        ),
        cousins AS (
          SELECT DISTINCT e2.id, e2.cmd, e2.data, e2.correlation_id, e2.causation_id, e2.version, e2.datetime, 'cousin' as relation
          FROM queue e1
          JOIN queue e2 ON e1.correlation_id = e2.correlation_id
          WHERE e1.id = ? 
          AND e2.id != ?
          AND e2.id NOT IN (SELECT id FROM ancestors)
          AND e2.id NOT IN (SELECT id FROM descendants)
        )
        SELECT * FROM ancestors WHERE relation != 'self'
        UNION ALL
        SELECT * FROM descendants WHERE relation != 'self'
        UNION ALL
        SELECT * FROM cousins
        ORDER BY id ASC
      `),

      // Advanced Event Relationship Queries (#13)
      getEventDepth: this.db.prepare(`
        WITH RECURSIVE ancestors(id, depth) AS (
          SELECT id, 0 as depth FROM queue WHERE id = ?
          
          UNION ALL
          
          SELECT e.causation_id, a.depth + 1
          FROM queue e
          INNER JOIN ancestors a ON e.id = a.id
          WHERE e.causation_id IS NOT NULL
        )
        SELECT MAX(depth) as depth FROM ancestors
      `),
      
      getEventBranches: this.db.prepare(`
        WITH RECURSIVE branches(id, cmd, data, correlation_id, causation_id, version, datetime, root_id, branch_path) AS (
          SELECT id, cmd, data, correlation_id, causation_id, version, datetime, id as root_id, CAST(id AS TEXT) as branch_path
          FROM queue 
          WHERE correlation_id = ? AND causation_id IS NULL
          
          UNION ALL
          
          SELECT e.id, e.cmd, e.data, e.correlation_id, e.causation_id, e.version, e.datetime, b.root_id, b.branch_path || '->' || CAST(e.id AS TEXT)
          FROM queue e
          INNER JOIN branches b ON e.causation_id = b.id
          WHERE e.correlation_id = ?
        )
        SELECT *, 
               root_id,
               branch_path,
               (LENGTH(branch_path) - LENGTH(REPLACE(branch_path, '->', ''))) / 2 as branch_depth
        FROM branches 
        ORDER BY root_id, id ASC
      `),
      
      findOrphanedEvents: this.db.prepare(`
        SELECT * FROM queue 
        WHERE causation_id IS NOT NULL 
        AND causation_id NOT IN (SELECT id FROM queue)
        ORDER BY id ASC
      `),
      
      getEventInfluence: this.db.prepare(`
        WITH RECURSIVE descendants(id) AS (
          SELECT id FROM queue WHERE causation_id = ?
          
          UNION ALL
          
          SELECT e.id FROM queue e
          INNER JOIN descendants d ON e.causation_id = d.id
        )
        SELECT COUNT(*) as influence_count FROM descendants
      `),
      
      getCriticalPath: this.db.prepare(`
        WITH RECURSIVE paths(id, cmd, correlation_id, causation_id, path_length, path) AS (
          SELECT id, cmd, correlation_id, causation_id, 1 as path_length, CAST(id AS TEXT) as path
          FROM queue 
          WHERE correlation_id = ? AND causation_id IS NULL
          
          UNION ALL
          
          SELECT e.id, e.cmd, e.correlation_id, e.causation_id, p.path_length + 1, p.path || '->' || CAST(e.id AS TEXT)
          FROM queue e
          INNER JOIN paths p ON e.causation_id = p.id
          WHERE e.correlation_id = ?
        )
        SELECT * FROM paths 
        WHERE path_length = (SELECT MAX(path_length) FROM paths)
        ORDER BY id ASC
        LIMIT 1
      `),

      // Helper queries
      getEventById: this.db.prepare(`SELECT * FROM queue WHERE id = ?`),
      getEventsByCorrelationId: this.db.prepare(`
        SELECT * FROM queue 
        WHERE correlation_id = ? 
        ORDER BY id ASC
      `)
    };
  }

  // Root Event Detection Methods (#10)
  getRootEvents() {
    return this._queries.getRootEvents.all();
  }

  getRootEventsInTimeRange(startId, endId) {
    return this._queries.getRootEventsInTimeRange.all(startId, endId);
  }

  getRootEventsByType(eventType) {
    return this._queries.getRootEventsByType.all(eventType);
  }

  getRootEventsByUser(userId) {
    // Search for userId in the data JSON field
    const searchPattern = `%"userId":"${userId}"%`;
    return this._queries.getRootEventsByUser.all(searchPattern);
  }

  // Enhanced Child Event Methods (#11)
  getChildEvents(eventId) {
    return this._queries.getChildEvents.all(eventId);
  }

  getDescendantEvents(eventId) {
    return this._queries.getDescendantEvents.all(eventId);
  }

  getDirectChildren(eventId) {
    return this._queries.getDirectChildren.all(eventId);
  }

  getChildrenByType(eventId, eventType) {
    return this._queries.getChildrenByType.all(eventId, eventType);
  }

  // Cousin Event Detection Methods (#12)
  getCousinEvents(eventId) {
    return this._queries.getCousinEvents.all(eventId);
  }

  getSiblingEvents(eventId) {
    return this._queries.getSiblingEvents.all(eventId, eventId);
  }

  getRelatedEvents(eventId) {
    return this._queries.getRelatedEvents.all(eventId, eventId);
  }

  getEventFamily(eventId) {
    return this._queries.getEventFamily.all(eventId, eventId, eventId, eventId);
  }

  // Advanced Event Relationship Queries (#13)
  getEventDepth(eventId) {
    const result = this._queries.getEventDepth.get(eventId);
    return result && result.depth !== null ? result.depth : 0;
  }

  getEventBranches(correlationId) {
    return this._queries.getEventBranches.all(correlationId, correlationId);
  }

  findOrphanedEvents() {
    return this._queries.findOrphanedEvents.all();
  }

  getEventInfluence(eventId) {
    const result = this._queries.getEventInfluence.get(eventId);
    return result ? result.influence_count : 0;
  }

  getCriticalPath(correlationId) {
    return this._queries.getCriticalPath.get(correlationId, correlationId);
  }

  // Event Visualization and Reporting
  generateEventReport(options = {}) {
    const {
      correlationId = null,
      eventId = null,
      includeMetrics = true,
      includeRelationships = true,
      format = 'text'
    } = options;

    let events = [];
    let reportData = {
      title: '',
      events: [],
      metrics: {},
      relationships: {},
      generatedAt: new Date().toISOString()
    };

    if (correlationId) {
      events = this.getEventsByCorrelationId(correlationId);
      reportData.title = `Event Report for Correlation ID: ${correlationId}`;
    } else if (eventId) {
      const mainEvent = this._queries.getEventById.get(eventId);
      if (mainEvent) {
        events = this.getEventsByCorrelationId(mainEvent.correlation_id);
        reportData.title = `Event Report for Event ID: ${eventId} (Correlation: ${mainEvent.correlation_id})`;
      }
    }

    if (events.length === 0) {
      return this._formatReport({ ...reportData, error: 'No events found' }, format);
    }

    reportData.events = events.map(event => ({
      id: event.id,
      cmd: event.cmd,
      causationId: event.causation_id,
      correlationId: event.correlation_id,
      datetime: event.datetime,
      data: this._safeParse(event.data),
      isRoot: !event.causation_id
    }));

    if (includeMetrics) {
      reportData.metrics = this._calculateEventMetrics(events);
    }

    if (includeRelationships) {
      reportData.relationships = this._analyzeEventRelationships(events);
    }

    return this._formatReport(reportData, format);
  }

  generateVisualEventTree(correlationId) {
    const events = this.getEventsByCorrelationId(correlationId);
    if (events.length === 0) {
      return 'No events found for correlation ID: ' + correlationId;
    }

    const branches = this.getEventBranches(correlationId);
    const tree = this._buildEventTree(branches);
    
    return this._renderEventTree(tree, correlationId);
  }

  // Helper methods
  getEventsByCorrelationId(correlationId) {
    return this._queries.getEventsByCorrelationId.all(correlationId);
  }

  _safeParse(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch {
      return jsonString;
    }
  }

  _calculateEventMetrics(events) {
    const rootEvents = events.filter(e => !e.causation_id);
    const childEvents = events.filter(e => e.causation_id);
    const eventTypes = {};
    
    events.forEach(event => {
      eventTypes[event.cmd] = (eventTypes[event.cmd] || 0) + 1;
    });

    const timeSpan = events.length > 1 ? 
      Math.max(...events.map(e => e.id)) - Math.min(...events.map(e => e.id)) : 0;

    return {
      totalEvents: events.length,
      rootEvents: rootEvents.length,
      childEvents: childEvents.length,
      uniqueEventTypes: Object.keys(eventTypes).length,
      eventTypeDistribution: eventTypes,
      timeSpan: timeSpan,
      averageDepth: this._calculateAverageDepth(events)
    };
  }

  _analyzeEventRelationships(events) {
    const relationships = {
      chains: [],
      branchPoints: [],
      leafEvents: []
    };

    // Find causation chains
    const eventMap = new Map(events.map(e => [e.id, e]));
    
    events.forEach(event => {
      const children = events.filter(e => e.causation_id === event.id);
      
      if (children.length > 1) {
        relationships.branchPoints.push({
          eventId: event.id,
          eventCmd: event.cmd,
          childCount: children.length,
          children: children.map(c => ({ id: c.id, cmd: c.cmd }))
        });
      }
      
      if (children.length === 0 && event.causation_id) {
        relationships.leafEvents.push({
          eventId: event.id,
          eventCmd: event.cmd
        });
      }
    });

    // Find longest chains
    const rootEvents = events.filter(e => !e.causation_id);
    rootEvents.forEach(root => {
      const chain = this._findLongestChain(root.id, eventMap);
      if (chain.length > 1) {
        relationships.chains.push({
          startEvent: root.id,
          length: chain.length,
          events: chain
        });
      }
    });

    return relationships;
  }

  _findLongestChain(eventId, eventMap, visited = new Set()) {
    if (visited.has(eventId)) return [];
    
    visited.add(eventId);
    const event = eventMap.get(eventId);
    if (!event) return [];

    const children = Array.from(eventMap.values()).filter(e => e.causation_id === eventId);
    
    if (children.length === 0) {
      return [{ id: eventId, cmd: event.cmd }];
    }

    let longestChain = [];
    children.forEach(child => {
      const childChain = this._findLongestChain(child.id, eventMap, new Set(visited));
      if (childChain.length > longestChain.length) {
        longestChain = childChain;
      }
    });

    return [{ id: eventId, cmd: event.cmd }, ...longestChain];
  }

  _calculateAverageDepth(events) {
    if (events.length === 0) return 0;
    
    let totalDepth = 0;
    events.forEach(event => {
      const depth = this.getEventDepth(event.id);
      totalDepth += depth;
    });
    
    return (totalDepth / events.length).toFixed(2);
  }

  _buildEventTree(branches) {
    const tree = {};
    
    branches.forEach(branch => {
      const pathParts = branch.branch_path.split('->');
      let current = tree;
      
      pathParts.forEach((eventId, index) => {
        const id = parseInt(eventId);
        if (!current[id]) {
          current[id] = {
            id: id,
            cmd: branch.cmd,
            children: {},
            depth: index
          };
        }
        current = current[id].children;
      });
    });
    
    return tree;
  }

  _renderEventTree(tree, correlationId, prefix = '', isLast = true) {
    let output = `Event Tree for Correlation ID: ${correlationId}\n`;
    output += '═'.repeat(50) + '\n\n';
    
    const rootNodes = Object.values(tree);
    rootNodes.forEach((node, index) => {
      const isLastRoot = index === rootNodes.length - 1;
      output += this._renderNode(node, '', isLastRoot);
    });
    
    return output;
  }

  _renderNode(node, prefix, isLast) {
    let output = '';
    const connector = isLast ? '└── ' : '├── ';
    const nodeInfo = `[${node.id}] ${node.cmd}`;
    
    output += prefix + connector + nodeInfo + '\n';
    
    const children = Object.values(node.children);
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    
    children.forEach((child, index) => {
      const isLastChild = index === children.length - 1;
      output += this._renderNode(child, newPrefix, isLastChild);
    });
    
    return output;
  }

  _formatReport(reportData, format) {
    switch (format) {
      case 'json':
        return JSON.stringify(reportData, null, 2);
      
      case 'markdown':
        return this._formatMarkdownReport(reportData);
      
      case 'text':
      default:
        return this._formatTextReport(reportData);
    }
  }

  _formatTextReport(data) {
    if (data.error) {
      return `Error: ${data.error}`;
    }

    let output = '';
    output += `${data.title}\n`;
    output += '='.repeat(data.title.length) + '\n\n';
    output += `Generated: ${data.generatedAt}\n\n`;

    if (data.metrics && Object.keys(data.metrics).length > 0) {
      output += 'METRICS\n';
      output += '-------\n';
      output += `Total Events: ${data.metrics.totalEvents}\n`;
      output += `Root Events: ${data.metrics.rootEvents}\n`;
      output += `Child Events: ${data.metrics.childEvents}\n`;
      output += `Unique Event Types: ${data.metrics.uniqueEventTypes}\n`;
      output += `Average Depth: ${data.metrics.averageDepth}\n`;
      output += `Time Span: ${data.metrics.timeSpan} event IDs\n\n`;

      if (data.metrics.eventTypeDistribution) {
        output += 'Event Type Distribution:\n';
        Object.entries(data.metrics.eventTypeDistribution).forEach(([type, count]) => {
          output += `  ${type}: ${count}\n`;
        });
        output += '\n';
      }
    }

    if (data.relationships && Object.keys(data.relationships).length > 0) {
      output += 'RELATIONSHIPS\n';
      output += '-------------\n';
      
      if (data.relationships.branchPoints?.length > 0) {
        output += `Branch Points: ${data.relationships.branchPoints.length}\n`;
        data.relationships.branchPoints.forEach(bp => {
          output += `  Event ${bp.eventId} (${bp.eventCmd}) -> ${bp.childCount} children\n`;
        });
        output += '\n';
      }

      if (data.relationships.chains?.length > 0) {
        output += 'Longest Chains:\n';
        data.relationships.chains.forEach(chain => {
          output += `  ${chain.length} events: ${chain.events.map(e => `${e.id}(${e.cmd})`).join(' -> ')}\n`;
        });
        output += '\n';
      }

      if (data.relationships.leafEvents?.length > 0) {
        output += `Leaf Events: ${data.relationships.leafEvents.length}\n`;
        data.relationships.leafEvents.forEach(leaf => {
          output += `  ${leaf.eventId} (${leaf.eventCmd})\n`;
        });
        output += '\n';
      }
    }

    output += 'EVENTS\n';
    output += '------\n';
    data.events.forEach(event => {
      const rootMarker = event.isRoot ? ' [ROOT]' : '';
      const causationInfo = event.causationId ? ` <- ${event.causationId}` : '';
      output += `${event.id}: ${event.cmd}${rootMarker}${causationInfo}\n`;
    });

    return output;
  }

  _formatMarkdownReport(data) {
    if (data.error) {
      return `# Error\n\n${data.error}`;
    }

    let output = '';
    output += `# ${data.title}\n\n`;
    output += `*Generated: ${data.generatedAt}*\n\n`;

    if (data.metrics && Object.keys(data.metrics).length > 0) {
      output += '## Metrics\n\n';
      output += `- **Total Events:** ${data.metrics.totalEvents}\n`;
      output += `- **Root Events:** ${data.metrics.rootEvents}\n`;
      output += `- **Child Events:** ${data.metrics.childEvents}\n`;
      output += `- **Unique Event Types:** ${data.metrics.uniqueEventTypes}\n`;
      output += `- **Average Depth:** ${data.metrics.averageDepth}\n`;
      output += `- **Time Span:** ${data.metrics.timeSpan} event IDs\n\n`;

      if (data.metrics.eventTypeDistribution) {
        output += '### Event Type Distribution\n\n';
        Object.entries(data.metrics.eventTypeDistribution).forEach(([type, count]) => {
          output += `- **${type}:** ${count}\n`;
        });
        output += '\n';
      }
    }

    if (data.relationships && Object.keys(data.relationships).length > 0) {
      output += '## Relationships\n\n';
      
      if (data.relationships.branchPoints?.length > 0) {
        output += '### Branch Points\n\n';
        data.relationships.branchPoints.forEach(bp => {
          output += `- Event **${bp.eventId}** (${bp.eventCmd}) branches to ${bp.childCount} children\n`;
        });
        output += '\n';
      }

      if (data.relationships.chains?.length > 0) {
        output += '### Longest Chains\n\n';
        data.relationships.chains.forEach(chain => {
          const chainStr = chain.events.map(e => `**${e.id}**(${e.cmd})`).join(' → ');
          output += `- ${chain.length} events: ${chainStr}\n`;
        });
        output += '\n';
      }
    }

    output += '## Events\n\n';
    output += '| ID | Command | Root | Causation |\n';
    output += '|----|---------|------|----------|\n';
    data.events.forEach(event => {
      const isRoot = event.isRoot ? '✓' : '';
      const causation = event.causationId || '';
      output += `| ${event.id} | ${event.cmd} | ${isRoot} | ${causation} |\n`;
    });

    return output;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
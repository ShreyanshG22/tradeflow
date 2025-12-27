const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Define test execution order for better reliability
    const testOrder = [
      // 1. Setup and basic functionality tests first
      'setup',
      'auth',
      'database',
      'redis',
      
      // 2. Core functionality tests
      'market-data',
      'order',
      'portfolio',
      'risk',
      
      // 3. Integration tests
      'e2e',
      'trading-flow',
      'market-data-flow',
      'portfolio-flow',
      
      // 4. Performance tests
      'performance',
      'api-performance',
      'websocket-performance',
      'database-performance',
      
      // 5. Security tests
      'security',
      'authentication-security',
      'data-protection',
      'risk-compliance',
      
      // 6. System integration tests last
      'system',
      'full-system-integration'
    ];

    // Sort tests based on the defined order
    return tests.sort((testA, testB) => {
      const pathA = testA.path;
      const pathB = testB.path;
      
      // Get priority based on test type
      const getPriority = (path) => {
        for (let i = 0; i < testOrder.length; i++) {
          if (path.includes(testOrder[i])) {
            return i;
          }
        }
        return testOrder.length; // Unknown tests go last
      };
      
      const priorityA = getPriority(pathA);
      const priorityB = getPriority(pathB);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // If same priority, sort alphabetically
      return pathA.localeCompare(pathB);
    });
  }
}

module.exports = CustomSequencer;
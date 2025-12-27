const Sequencer = require('@jest/test-sequencer').default;

class FunctionalTestSequencer extends Sequencer {
  sort(tests) {
    // Sort tests to run in a specific order for functional tests
    const testOrder = [
      'database.integration.test.ts',
      'redis.integration.test.ts', 
      'auth.functional.test.ts',
      'api.functional.test.ts',
      'websocket.functional.test.ts'
    ];

    return tests.sort((testA, testB) => {
      const aIndex = testOrder.findIndex(name => testA.path.includes(name));
      const bIndex = testOrder.findIndex(name => testB.path.includes(name));
      
      // If both tests are in our order list, sort by order
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      
      // If only one is in the list, prioritize it
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      
      // If neither is in the list, sort alphabetically
      return testA.path.localeCompare(testB.path);
    });
  }
}

module.exports = FunctionalTestSequencer;
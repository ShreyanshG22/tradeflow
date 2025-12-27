module.exports = async () => {
  console.log('Cleaning up integration test environment...');
  
  try {
    // Clean up any global test data
    // Note: Individual test cleanup is handled in test files
    
    console.log('Integration test environment cleanup complete');
    
  } catch (error) {
    console.error('Failed to cleanup integration test environment:', error.message);
    // Don't throw error in teardown to avoid masking test failures
  }
};
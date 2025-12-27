# Zerodha Components Tests

This directory contains tests for the Zerodha integration frontend components.

## Test Structure

The tests are organized by component and cover the following areas:

### Authentication Components
- `ZerodhaAuthStatus.test.tsx` - Tests authentication status display and user profile information

### Trading Components  
- `ZerodhaOrderForm.test.tsx` - Tests order placement form validation and submission
- `ZerodhaPositions.test.tsx` - Tests positions display and square-off functionality

### Portfolio Components
- Tests for holdings, portfolio summary, and P&L calculations

## Running Tests

### Prerequisites

First, install the required testing dependencies:

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

### Running All Tests

```bash
npm run test
```

### Running Specific Test Files

```bash
npx vitest src/components/zerodha/__tests__/ZerodhaAuthStatus.test.tsx
```

### Running Tests in Watch Mode

```bash
npx vitest --watch
```

### Running Tests with Coverage

```bash
npx vitest --coverage
```

## Test Coverage

The tests cover the following functionality:

### Authentication Flow Tests
- ✅ Loading states during authentication check
- ✅ Not connected state display
- ✅ Connected state with user profile
- ✅ Compact view rendering
- ✅ Logout functionality
- ✅ Trading access information display

### Order Form Tests
- ✅ Form rendering with default values
- ✅ Form population with props
- ✅ Conditional field display (price, trigger price)
- ✅ Order estimate calculations
- ✅ Successful order submission
- ✅ Error handling
- ✅ Form validation
- ✅ MIS warning display
- ✅ Symbol uppercase conversion
- ✅ Loading states

### Positions Tests
- ✅ Loading state display
- ✅ Positions data rendering
- ✅ Position type indicators (LONG/SHORT)
- ✅ P&L color coding
- ✅ Summary statistics calculation
- ✅ Square-off functionality
- ✅ MIS position warnings
- ✅ Error handling
- ✅ Empty state display
- ✅ Data refresh functionality
- ✅ Zero quantity filtering

## Test Utilities

### Mocks

The test setup includes comprehensive mocks for:
- React Router navigation
- React Hook Form
- Zod validation
- UI components (shadcn/ui)
- Lucide React icons
- Sonner toast notifications
- Browser APIs (localStorage, fetch, etc.)

### Custom Matchers

Tests use standard Jest/Vitest matchers along with Testing Library queries:
- `screen.getByText()` - Find elements by text content
- `screen.getByLabelText()` - Find form elements by label
- `screen.getByRole()` - Find elements by ARIA role
- `waitFor()` - Wait for async operations
- `userEvent` - Simulate user interactions

## Writing New Tests

When adding new Zerodha components, follow these patterns:

### 1. Component Rendering Tests
```typescript
it('should render component with default props', () => {
  render(<YourComponent />);
  expect(screen.getByText('Expected Text')).toBeInTheDocument();
});
```

### 2. User Interaction Tests
```typescript
it('should handle user interaction', async () => {
  const user = userEvent.setup();
  render(<YourComponent />);
  
  const button = screen.getByRole('button');
  await user.click(button);
  
  expect(mockFunction).toHaveBeenCalled();
});
```

### 3. API Integration Tests
```typescript
it('should handle API responses', async () => {
  (fetch as any).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, data: mockData }),
  });
  
  render(<YourComponent />);
  
  await waitFor(() => {
    expect(screen.getByText('Expected Result')).toBeInTheDocument();
  });
});
```

### 4. Error Handling Tests
```typescript
it('should handle API errors', async () => {
  (fetch as any).mockRejectedValueOnce(new Error('Network error'));
  
  render(<YourComponent />);
  
  await waitFor(() => {
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });
});
```

## Best Practices

1. **Test Behavior, Not Implementation** - Focus on what the user sees and does
2. **Use Descriptive Test Names** - Clearly describe what is being tested
3. **Mock External Dependencies** - Keep tests isolated and fast
4. **Test Error States** - Ensure components handle errors gracefully
5. **Test Loading States** - Verify loading indicators work correctly
6. **Test User Interactions** - Simulate real user behavior
7. **Keep Tests Simple** - One assertion per test when possible
8. **Use Setup/Teardown** - Clean up between tests

## Troubleshooting

### Common Issues

1. **Component Not Rendering**
   - Check if all required props are provided
   - Verify mocks are set up correctly
   - Ensure test setup file is loaded

2. **Async Operations Failing**
   - Use `waitFor()` for async operations
   - Mock API responses properly
   - Check timing issues

3. **Mock Not Working**
   - Verify mock is defined before component import
   - Check mock implementation matches usage
   - Clear mocks between tests

### Debug Tips

1. Use `screen.debug()` to see rendered HTML
2. Add `console.log()` in components during testing
3. Check browser console for errors
4. Use `--reporter=verbose` for detailed output

## Integration with CI/CD

Add test scripts to package.json:

```json
{
  "scripts": {
    "test": "vitest --run",
    "test:watch": "vitest",
    "test:coverage": "vitest --coverage",
    "test:ui": "vitest --ui"
  }
}
```

The tests can be integrated into GitHub Actions or other CI/CD pipelines for automated testing on pull requests and deployments.
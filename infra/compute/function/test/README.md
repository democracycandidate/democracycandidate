# Azure Function Unit Tests

This directory contains unit tests for the candidate submission Azure Function.

## Running Tests

```bash
# Install dependencies first
npm install

# Run all tests
npm test

# Run tests in watch mode (auto-rerun on changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

### `submitCandidate.test.ts`
Comprehensive unit tests covering:

- **Frontmatter Generation**: Tests Hugo YAML frontmatter creation with various field combinations
- **Turnstile Verification**: Mocked tests for Cloudflare Turnstile token validation
- **Input Validation**: Tests for required field validation and error messages
- **GitHub Operations**: Tests for branch naming, slug generation, and path construction
- **Image Processing**: Tests for base64 extraction and image filename generation
- **Contact Record Storage**: Tests for contact info record creation
- **Error Handling**: Tests for various error scenarios

### Test Data

- `submitCandidatePayload.json`: Example payload for manual testing with the function

## Key Features

✅ **No External Dependencies**: All tests use mocks and don't hit real infrastructure
✅ **Fast Execution**: Pure unit tests run in milliseconds
✅ **Comprehensive Coverage**: Tests cover all critical paths and edge cases
✅ **Isolated**: Each test is independent and can run in any order

## Test Philosophy

These are **true unit tests** that:
- Mock all external dependencies (Azure Storage, GitHub API, Turnstile)
- Test business logic in isolation
- Run without requiring any infrastructure (local or cloud)
- Execute quickly (entire suite < 1 second)

For **integration tests** or **E2E tests** that exercise the full stack:
- Use Azurite for local Azure Storage emulation
- Use test GitHub repositories
- Use Turnstile test keys
- Run these separately from CI to avoid rate limits

## Adding New Tests

When adding new functionality to `submitCandidate.ts`:

1. Add corresponding test cases to `submitCandidate.test.ts`
2. Mock any new external dependencies
3. Test both success and failure scenarios
4. Ensure test remains fast (< 100ms per test)

## Coverage Goals

Target coverage:
- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

Current coverage can be viewed by running `npm run test:coverage`.

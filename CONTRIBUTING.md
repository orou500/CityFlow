# Contributing to CityFlow

Thank you for your interest in contributing to CityFlow! This guide outlines the standards and workflow for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies (see [README.md](README.md#getting-started))
4. Create a feature branch from `main`
5. Make your changes
6. Run tests and linting
7. Submit a pull request

## Branching Strategy

Use descriptive branch names with a type prefix:

| Type | Purpose | Example |
|------|---------|---------|
| `feature/` | New functionality | `feature/add-property-history` |
| `bugfix/` | Bug fixes | `bugfix/fix-market-demand` |
| `hotfix/` | Critical production fixes | `hotfix/login-redirect` |
| `docs/` | Documentation changes | `docs/update-readme` |
| `refactor/` | Code restructuring | `refactor/property-service` |

Always branch from `main`. Never commit directly to `main`.

## Commit Messages

Use clear, descriptive commit messages with a type prefix:

| Type | Purpose | Example |
|------|---------|---------|
| `feat:` | New feature | `feat: add property development details page` |
| `fix:` | Bug fix | `fix: resolve market demand calculation bug` |
| `docs:` | Documentation | `docs: update installation instructions` |
| `test:` | Tests | `test: add authentication tests` |
| `refactor:` | Code restructuring | `refactor: simplify property pricing engine` |
| `chore:` | Maintenance | `chore: update dependencies` |
| `style:` | Formatting (no code change) | `style: fix prettier warnings` |

Keep commit messages under 72 characters. Use the body for additional context when needed.

## Pull Request Process

### Before Submitting

- [ ] Code follows the project's style guidelines
- [ ] All existing tests pass (`npm test` in both `backend/` and `frontend/`)
- [ ] Linting passes (`npm run lint`)
- [ ] Formatting is correct (`npm run format`)
- [ ] New features include tests when possible
- [ ] Documentation is updated if applicable

### PR Template

```markdown
## Summary

Brief explanation of changes.

## Related Issue

Closes #123

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactoring
- [ ] Documentation
- [ ] Other (describe)

## Testing

Describe testing performed.

## Screenshots

If applicable (UI changes).
```

### Review Process

- All PRs require at least one review before merging
- Reviewers will check functionality, readability, maintainability, security, and performance
- Address review feedback promptly
- Squash commits before merging to keep history clean

## Code Quality Standards

### General

- Write clear, readable code with meaningful variable and function names
- Keep functions focused and small
- Handle errors appropriately with user-friendly messages
- Validate inputs at API boundaries
- Follow existing patterns and conventions in the codebase

### Frontend (React)

- Use functional components with hooks
- Keep components small and reusable
- Use Zustand stores for state management
- Support both English and Hebrew (RTL) via react-i18next
- Ensure responsive design across screen sizes
- Test components when practical

### Backend (Node.js / Express)

- Separate concerns: routes, models, engine logic
- Validate request inputs
- Return consistent error response formats
- Use Mongoose middleware for model-level logic
- Keep route handlers thin — delegate to engine/service functions
- Handle database errors gracefully

### Database (MongoDB)

- Use Mongoose schemas with proper validation
- Add indexes for frequently queried fields
- Reference related documents with ObjectId refs
- Use bulk operations for batch updates
- Maintain backward compatibility with existing data

## Testing

- **Backend**: Tests are in `backend/src/**/__tests__/` and run with Vitest
- **Frontend**: Tests are in `frontend/src/**/__tests__/` and run with Vitest
- Run `npm test` in the relevant directory before submitting
- New features should include tests when practical
- All existing tests must continue passing
- No broken builds may be merged

## Documentation

Update documentation when:

- Adding new features or API endpoints
- Changing existing behavior
- Modifying deployment or configuration
- Updating environment variables

Relevant files to keep updated:

- `README.md` — project overview, features, API reference
- `DEPLOY.md` — deployment instructions
- `CODE_OF_CONDUCT.md` — community standards

## Issue Guidelines

### Bug Reports

Include:

- **Description**: What happened
- **Steps to reproduce**: How to trigger the bug
- **Expected behavior**: What should have happened
- **Actual behavior**: What actually happened
- **Environment**: Browser, OS, relevant versions
- **Screenshots/logs**: If applicable

### Feature Requests

Include:

- **Problem statement**: What problem does this solve
- **Proposed solution**: How you think it should work
- **Alternatives considered**: Other approaches
- **Expected benefits**: Why this is valuable

## Security

Do not create public issues for security vulnerabilities. Contact the project maintainer directly at the email listed in the repository profile. See [SECURITY.md](SECURITY.md) for the full vulnerability disclosure process.

## License

This project is licensed under the [Apache License 2.0](LICENSE). By submitting a pull request or other contribution, you agree that your contributions will be licensed under the same terms.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold its standards.

## Questions?

Open a discussion or issue, or reach out to the maintainers directly.

## Contributor Recognition

Once your pull request is approved and merged, you can add yourself to the contributors list:

1. Open `contributors.json` in the repository root
2. Add your entry to the array:

```json
[
  {
    "name": "Your Name",
    "github": "your-username",
    "role": "Contributor",
    "joinedAt": "2026-07-13"
  }
]
```

3. Submit a pull request with this change

Your entry will appear on the [Contributors](/contributors) page after the PR is merged. Only approved and merged contributions qualify for recognition.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-10

### Added

- OAuth2 authentication with GitHub, GitLab, and Bitbucket
- Repository connection and management across multiple Git providers
- AI-powered repository scanning for bugs, security issues, and code quality improvements
- Automated task creation from scan results with type, priority, and status tracking
- Task planning with iterative AI-driven clarifying questions
- Autonomous task execution via Claude Agent SDK with branch creation and pull request generation
- GitHub-style file browser with syntax highlighting
- Project grouping to organize repositories with shared context documents
- External service integrations: Linear, Jira, Asana, Azure DevOps, Sentry, GitHub Issues
- Embeddable widget for collecting external feature requests and bug reports
- Embed submission screening and automatic task conversion
- API key management with per-repository usage and cost tracking
- Background job queue powered by pg-boss with 5 job types
- Activity event stream and audit trail
- Job queue monitoring dashboard
- Docker multi-stage build with nginx reverse proxy
- Docker Compose configurations for development and production

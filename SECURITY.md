# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to **security@autosoftware.dev**.

Include the following information in your report:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment:** Within 48 hours of receiving your report
- **Triage:** Within 7 days, we will assess severity and confirm the vulnerability
- **Fix:** Critical vulnerabilities will be patched within 30 days; lower-severity issues will be addressed in the next scheduled release

You will be kept informed of progress throughout the process.

## Disclosure Policy

- We follow coordinated disclosure. Please allow us reasonable time to address the issue before making any public disclosure.
- We will credit reporters in the release notes (unless you prefer to remain anonymous).

## Self-Hosting Security Tips

If you are self-hosting AutoSoftware, please ensure:

- **Strong secrets:** Generate `SESSION_SECRET` and `API_KEY_ENCRYPTION_SECRET` with `openssl rand -hex 32`. Never use default or weak values.
- **TLS termination:** Always run behind a reverse proxy with HTTPS in production.
- **Database access:** Restrict PostgreSQL access to only the application services. Do not expose the database port publicly.
- **Environment variables:** Never commit `.env` files. Use your platform's secret management (Docker secrets, Kubernetes secrets, etc.).
- **Keep updated:** Regularly pull the latest version and run `npm audit` to check for dependency vulnerabilities.

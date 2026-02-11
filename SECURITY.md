# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Instead, please report them responsibly:

1. **Email**: Send details to `security@your-domain.com` (replace with your actual contact)
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

You will receive an acknowledgment within **48 hours** and a detailed response within **5 business days**.

## Security Measures

This project implements the following security controls:

- **Password hashing**: Argon2id via Bun's native `Bun.password` API
- **JWT signing**: HMAC-SHA256 via Web Crypto API (no external dependencies)
- **Rate limiting**: Per-IP sliding window rate limiter
- **Security headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Strict-Transport-Security, Content-Security-Policy, Referrer-Policy, Permissions-Policy
- **CORS**: Configurable origin allowlist
- **Input validation**: All request bodies validated with Zod schemas
- **No `eval()` or `Function()`**: No dynamic code execution
- **Fail-fast config**: Invalid environment variables crash the process at startup

## Disclosure Policy

- We will acknowledge receipt within 48 hours
- We will confirm the vulnerability and determine its impact
- We will release a fix as soon as possible
- We will credit the reporter (unless they wish to remain anonymous)

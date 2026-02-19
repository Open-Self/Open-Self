# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in OpenSelf, please report it responsibly.

**DO NOT** open a public issue for security vulnerabilities.

Instead, please email the maintainers or use GitHub's private vulnerability reporting feature.

## Scope

OpenSelf processes sensitive user data (chat history, personality profiles). Security issues we take seriously include:

- **Data leakage** — Chat history or personality data being exposed
- **AI safety bypass** — Clone revealing it's an AI when it shouldn't
- **Unauthorized access** — Access to review queue or SOUL.md without permission
- **Injection attacks** — Malicious chat exports causing code execution

## Best Practices for Users

- Keep your `.env` file private (never commit API keys)
- Review your `data/SOUL.md` before sharing it
- Use the review queue for unknown contacts
- Keep OpenSelf updated to the latest version

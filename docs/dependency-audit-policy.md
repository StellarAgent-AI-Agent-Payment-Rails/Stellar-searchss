# Dependency audit policy

CI runs `npm audit --audit-level=high` for pull requests and on a weekly schedule. High- and critical-severity advisories are blocking; do not hide them by lowering the threshold, using `|| true`, or silently suppressing an advisory.

When an advisory is reported:

1. Review the affected dependency path and advisory details with `npm audit`.
2. Apply the available compatible fix (for example, `npm audit fix`), then run the build and relevant tests and commit the lockfile change.
3. If no fix is available, open a tracking issue that records the advisory ID, affected package/path, impact and exposure assessment, why no fix is currently usable, mitigation, owner, and review date. Notify maintainers; do not treat an unfixed high/critical advisory as resolved.
4. Any exceptional temporary acceptance requires explicit maintainer approval, a linked tracking issue, a documented mitigation and expiry/review date, and a reviewed change to the audit policy. The default workflow has no blanket allowlist, and exceptions must not disappear from CI without that review.

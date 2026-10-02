# Accessibility findings

`a11y-allowlist.json` tracks existing axe findings by page, rule, and affected DOM target. It starts empty because the current page smoke checks found no violations after the dashboard refresh control received an accessible name.

The tests fail on every unlisted finding (including all critical findings). If a known issue must remain temporarily, add its exact rule/target signature to the page-specific allowlist and document its remediation plan; avoid broad rule-level suppressions. Color-contrast is disabled in jsdom because its canvas implementation cannot evaluate axe's contrast calculations reliably. Contrast still requires browser/manual review.

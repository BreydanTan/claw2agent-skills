# NPM Audit / Snyk [L1]

Scan dependencies for security vulnerabilities via npm audit or Snyk.

## Actions

### `audit_deps`
| Param | Req | Type |
|-------|-----|------|
| packageJson | ✅ | string |

### `get_advisories`
| Param | Req | Type |
|-------|-----|------|
| package | ✅ | string |

### `check_license`
| Param | Req | Type |
|-------|-----|------|
| packageJson | ✅ | string |

### `fix_vulnerabilities`
| Param | Req | Type |
|-------|-----|------|
| packageJson | ✅ | string |
| dryRun | ❌ | boolean |

## Testing

```bash
node --test skills/npm-audit-snyk/__tests__/handler.test.js
```

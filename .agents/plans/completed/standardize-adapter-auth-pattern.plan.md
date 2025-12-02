# Plan: Standardize Adapter Authorization Pattern

**GitHub Issue**: #21
**Status**: Completed
**Branch**: `feature/standardize-adapter-auth`

## Summary

Standardize the authorization pattern across all platform adapters:
- Auth checks happen INSIDE adapters (encapsulation)
- All adapters use `onMessage` callback pattern
- Consistent logging with masked user IDs

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Create Discord auth utilities (`src/utils/discord-auth.ts`) | ✅ |
| 2 | Add auth to Discord adapter with `DISCORD_ALLOWED_USER_IDS` | ✅ |
| 3 | Refactor Telegram adapter to handle auth internally | ✅ |
| 4 | Add `onMessage` callback pattern to Telegram adapter | ✅ |
| 5 | Update `index.ts` to use callback pattern for Telegram | ✅ |
| 6 | Update `.env.example` with Discord whitelist | ✅ |
| 7 | Document the pattern in `CLAUDE.md` | ✅ |

## Files Changed

- **Created**: `src/utils/discord-auth.ts` - Discord user authorization utilities
- **Modified**: `src/adapters/discord.ts` - Added internal auth checking
- **Modified**: `src/adapters/telegram.ts` - Added `onMessage` callback + internal auth
- **Modified**: `src/index.ts` - Updated Telegram to use callback pattern
- **Modified**: `.env.example` - Added `DISCORD_ALLOWED_USER_IDS`
- **Modified**: `CLAUDE.md` - Documented authorization pattern

## Validation Results

| Check | Result |
|-------|--------|
| TypeScript type-check | ✅ |
| ESLint (0 errors) | ✅ |
| All tests pass | ✅ |
| Prettier formatting | ✅ |

## Pattern Summary

### Authorization Pattern (all adapters)
1. Parse whitelist from env var in constructor
2. Check authorization inside message handler (before callback)
3. Silent rejection for unauthorized users
4. Log with masked user ID for privacy

### Message Handler Pattern
- Adapters expose `onMessage(handler)` callback registration
- `index.ts` only registers the callback
- Auth happens inside adapter before callback invocation

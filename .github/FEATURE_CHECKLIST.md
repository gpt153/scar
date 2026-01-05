# Feature Completion Checklist

Use this checklist before marking any feature as "complete" or "done".

## Code Verification

### File Existence
- [ ] All claimed files actually exist
  ```bash
  # Verify each file mentioned in PR/commit:
  ls -la <file-path>
  wc -l <file-path>  # Should show actual code lines
  ```

### No Mock Data
- [ ] No mock data in production code
  ```bash
  # Search for mock patterns:
  grep -r "mock" src/ --exclude-dir=test
  grep -r "placeholder" src/ --exclude-dir=test
  grep -r "MOCK" src/ --exclude-dir=test
  grep -r "fake" src/ --exclude-dir=test
  ```
- [ ] No placeholder URLs or APIs
  ```bash
  grep -r "example.com" src/
  grep -r "placeholder" src/
  ```

### Code Quality
- [ ] No TODO/FIXME in critical paths
  ```bash
  grep -r "TODO" src/ --exclude-dir=test
  grep -r "FIXME" src/ --exclude-dir=test
  ```
- [ ] Real API calls (not simulated)
- [ ] Real database connections (not hardcoded data)

## Testing

### Local Execution
- [ ] Application runs locally without errors
  ```bash
  npm install
  npm run dev  # Should start successfully
  ```

### Real Credentials
- [ ] Tested with actual test credentials
- [ ] Login works (if applicable)
- [ ] Data loads from real database
- [ ] API calls reach real backend

### End-to-End User Flows
- [ ] Tested at least 3 complete user workflows
- [ ] All buttons/links work
- [ ] Navigation works correctly
- [ ] Forms submit successfully

### Browser Testing
- [ ] No console errors in browser DevTools
- [ ] Network tab shows real API calls (not mocks)
- [ ] All requests go to correct backend URL

## Documentation

### Accuracy
- [ ] README updated (if needed)
- [ ] Status documents match reality
- [ ] API documentation accurate
- [ ] Code comments reflect actual implementation

### Documentation/Code Ratio
- [ ] Documentation lines < 3x actual code lines
  ```bash
  # Check ratio:
  wc -l docs/*.md src/**/*  # Compare totals
  ```

## Evidence Requirements

Before marking complete, provide:

### 1. Code Location
- [ ] File path with line numbers
  - Example: `src/pages/Login.tsx` (lines 45-67 handle authentication)

### 2. API Testing
- [ ] Working curl command
  ```bash
  curl -X POST http://localhost:4000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"password123"}'
  ```
- [ ] Actual response (not mocked)
  ```json
  {"token":"eyJhbGc...","user":{"id":1,"email":"test@example.com"}}
  ```

### 3. Screenshot
- [ ] Screenshot showing feature working
- [ ] Browser Network tab showing real API calls

### 4. Database Verification
- [ ] Sample database query showing real data
  ```sql
  SELECT * FROM users WHERE email = 'test@example.com';
  ```

## Red Flags to Avoid

🚩 Writing comprehensive docs without implementing code
🚩 Using mock data "temporarily" (it becomes permanent)
🚩 Claiming "100% complete" without running the application
🚩 Marking task done when only scaffolding exists
🚩 Documentation lines >> actual code lines (e.g., 1000 line doc, 50 line code)

## Final Verification

### Success Criteria (ALL must be true)
- [ ] I ran `npm install && npm run dev` successfully
- [ ] I opened the application in a browser
- [ ] I tested the feature with real user actions
- [ ] All API calls in Network tab go to real backend
- [ ] No mock/placeholder data visible to users
- [ ] No console errors or warnings
- [ ] Feature works exactly as specified

### Sign-off
- [ ] I personally verified this feature works end-to-end
- [ ] I can demonstrate it working to another person
- [ ] All evidence (screenshots, curl outputs) is authentic

---

**Remember**: "Complete" means the feature actually works, not just that code was written.

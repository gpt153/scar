# Comprehensive End-to-End Validation

Run complete end-to-end validation of the Remote Agentic Coding Platform including Docker, Test Adapter, Database, and GitHub integration testing.

**Prerequisites:**
- ✅ ngrok running and exposing port 3000 (for GitHub webhooks)
- ✅ `.env` file configured with all required credentials
- ✅ GitHub CLI (`gh`) authenticated
- ✅ PostgreSQL accessible via `DATABASE_URL`

---

## Phase 1: Foundation Validation

Execute basic validation commands first to ensure codebase health.

### 1.1 Type Checking
```bash
npm run type-check
```
**Expected:** No TypeScript errors

### 1.2 Linting
```bash
npm run lint
```
**Expected:** No ESLint errors or warnings

### 1.3 Unit Tests
```bash
npm test
```
**Expected:** All tests pass

### 1.4 Build
```bash
npm run build
```
**Expected:** Clean build, output in `dist/`

**If any step fails, STOP and report the issue immediately.**

---

## Phase 2: Test Repository Setup

Create a private GitHub repository from a minimal React template for end-to-end testing.

### 2.1 Generate Repository Name
```bash
# Create timestamp-based repo name
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TEST_REPO_NAME="remote-coding-test-${TIMESTAMP}"
echo "Test repository: ${TEST_REPO_NAME}"
```

### 2.2 Create Next.js App from Official Template
```bash
# Create Next.js app using official template (136k+ stars on GitHub)
cd workspace
npx create-next-app@latest ${TEST_REPO_NAME} --typescript --tailwind --app --no-src-dir --import-alias "@/*"
cd ${TEST_REPO_NAME}
```

**Note:** This uses the official Next.js starter (https://github.com/vercel/next.js - 136k stars)

### 2.3 Initialize and Push to Private Repository
```bash
# create-next-app already initializes git, so just add and commit
git add .
git commit -m "Initial commit from Next.js official template"

# Create private GitHub repository
gh repo create ${TEST_REPO_NAME} --private --source=. --push

# Store repo URL for later use
TEST_REPO_URL=$(gh repo view --json url -q .url)
echo "Repository created: ${TEST_REPO_URL}"
```

**Validation:** Verify repository is created and private
```bash
gh repo view ${TEST_REPO_NAME} --json isPrivate -q .isPrivate
# Expected: true
```

---

## Phase 3: Docker Container Validation

Rebuild and verify Docker container startup.

### 3.1 Tear Down Existing Container
```bash
cd ../..  # Return to project root
docker-compose down
```

### 3.2 Rebuild and Start Container
```bash
docker-compose up -d --build
```

### 3.3 Verify Startup (Wait 10 seconds)
```bash
sleep 10
docker-compose logs app | tail -50
```

**Check for:**
- ✅ `[ConversationLock] Initialized { maxConcurrent: 10 }`
- ✅ `[Database] Connected successfully`
- ✅ `[App] Remote Coding Agent is ready!`
- ❌ No error stack traces

### 3.4 Health Check Endpoints
```bash
# Basic health
curl http://localhost:3000/health

# Database health
curl http://localhost:3000/health/db

# Concurrency health
curl http://localhost:3000/health/concurrency | jq
```

**Expected:** All return `{"status":"ok",...}`

---

## Phase 4: Test Adapter Validation

Test full orchestrator flow using HTTP API endpoints (no external platforms needed).

### 4.1 Clear Test Adapter State
```bash
curl -X DELETE http://localhost:3000/test/messages/test-e2e
```

### 4.2 Send Clone Command
```bash
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\":\"test-e2e\",\"message\":\"/clone https://github.com/${GITHUB_USERNAME}/${TEST_REPO_NAME}\"}"
```

**Wait 5 seconds for clone to complete**
```bash
sleep 5
```

### 4.3 Verify Clone Response
```bash
curl http://localhost:3000/test/messages/test-e2e | jq
```

**Check for:** "Repository cloned successfully" or "Codebase created" message

### 4.4 Send Simple Implementation Request
```bash
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId":"test-e2e",
    "message":"Update the README.md file to add a new section called \"Testing\" with the text \"This repository is used for automated testing.\" Then create a pull request with the title \"Add Testing section to README\"."
  }'
```

**Wait 30 seconds for AI processing**
```bash
sleep 30
```

### 4.5 Check Docker Logs for Processing
```bash
docker-compose logs app | grep -E "Orchestrator|ConversationLock|Tool" | tail -30
```

**Look for:**
- ✅ `[ConversationLock] Starting test-e2e`
- ✅ `[Orchestrator] Starting AI conversation`
- ✅ Tool calls (Read, Edit, Bash for git commands)
- ✅ `[ConversationLock] Completed test-e2e`

### 4.6 Verify Test Adapter Response
```bash
curl http://localhost:3000/test/messages/test-e2e | jq '.messages | last'
```

**Check for:** Summary of changes or confirmation of PR creation

---

## Phase 5: Database Validation

Verify database records are created correctly.

### 5.1 Connect to Database
```bash
# Extract DATABASE_URL from .env
source .env
```

### 5.2 Check Codebase Record
```bash
psql $DATABASE_URL -c "
SELECT id, name, repository_url, default_cwd
FROM remote_agent_codebases
WHERE name LIKE '%${TEST_REPO_NAME}%'
ORDER BY created_at DESC
LIMIT 1;
"
```

**Expected:** 1 row with repository details

### 5.3 Check Conversation Record
```bash
psql $DATABASE_URL -c "
SELECT id, platform_type, platform_conversation_id, cwd, ai_assistant_type
FROM remote_agent_conversations
WHERE platform_conversation_id = 'test-e2e';
"
```

**Expected:** 1 row with platform_type='test', codebase_id set

### 5.4 Check Session Records
```bash
psql $DATABASE_URL -c "
SELECT id, ai_assistant_type, active, assistant_session_id, metadata
FROM remote_agent_sessions
WHERE conversation_id IN (
  SELECT id FROM remote_agent_conversations WHERE platform_conversation_id = 'test-e2e'
)
ORDER BY started_at DESC;
"
```

**Expected:** At least 1 session record, active=true for latest

---

## Phase 6: GitHub Issue Integration

Test GitHub webhook integration with issue creation and @remote-agent mention.

### 6.1 Create GitHub Issue
```bash
cd workspace/${TEST_REPO_NAME}

ISSUE_URL=$(gh issue create \
  --title "Update README with validation section" \
  --body "We need to add a \"Validation\" section to the README explaining the testing process." \
  | grep -o 'https://.*')

ISSUE_NUMBER=$(echo $ISSUE_URL | grep -o '[0-9]*$')
echo "Issue created: ${ISSUE_URL}"
echo "Issue number: ${ISSUE_NUMBER}"
```

### 6.2 Add @remote-agent Comment
```bash
gh issue comment ${ISSUE_NUMBER} \
  --body "@remote-agent Please address this issue by adding a \"Validation\" section to the README.md file. Create a new branch for this change and open a pull request when done. Include details about our testing approach in the validation section."
```

### 6.3 Monitor Webhook Processing
```bash
# Watch logs for GitHub webhook activity (wait 60 seconds)
sleep 5
docker-compose logs -f app | grep -E "GitHub|Webhook|Orchestrator" &
LOG_PID=$!
sleep 60
kill $LOG_PID
```

**Look for:**
- ✅ `[GitHub] Received webhook event`
- ✅ `[GitHub] Found @remote-agent mention`
- ✅ `[Orchestrator] Starting AI conversation`
- ✅ `[GitHub] Posting comment to issue`

### 6.4 Verify Issue Comment (Batch Mode)
```bash
gh issue view ${ISSUE_NUMBER} --comments
```

**Expected:**
- ✅ Single comment from @remote-agent (batch mode, not streaming)
- ✅ Comment describes implementation plan or confirms action
- ❌ NOT multiple small comments (would indicate streaming mode)

### 6.5 Wait for Pull Request Creation
```bash
# Wait up to 90 seconds for PR to be created
echo "Waiting for pull request creation..."
sleep 90
```

---

## Phase 7: GitHub Pull Request Integration

Test @remote-agent mention in pull request comments.

### 7.1 Find Created Pull Request
```bash
PR_NUMBER=$(gh pr list --state open --limit 1 --json number -q '.[0].number')

if [ -z "$PR_NUMBER" ]; then
  echo "⚠️  No pull request found. Check logs for errors."
  docker-compose logs app | grep -E "ERROR|Error" | tail -20
else
  echo "Pull request found: #${PR_NUMBER}"
  PR_URL=$(gh pr view ${PR_NUMBER} --json url -q .url)
  echo "PR URL: ${PR_URL}"
fi
```

### 7.2 Request PR Review via @remote-agent
```bash
gh pr comment ${PR_NUMBER} \
  --body "@remote-agent Please review this pull request. Check for code quality, completeness, and adherence to best practices."
```

### 7.3 Monitor PR Review Processing
```bash
# Watch logs (wait 45 seconds)
sleep 5
docker-compose logs -f app | grep -E "GitHub|Orchestrator" &
LOG_PID=$!
sleep 45
kill $LOG_PID
```

### 7.4 Verify PR Review Comment
```bash
gh pr view ${PR_NUMBER} --comments
```

**Expected:**
- ✅ @remote-agent comment with review feedback
- ✅ Single batch comment (not streaming)
- ✅ Review content mentions code quality or provides feedback

---

## Phase 8: Concurrency Validation (Optional Quick Test)

Verify concurrent conversation handling works correctly.

### 8.1 Send 3 Concurrent Requests
```bash
for i in {1..3}; do
  curl -X POST http://localhost:3000/test/message \
    -H "Content-Type: application/json" \
    -d "{\"conversationId\":\"concurrent-${i}\",\"message\":\"/help\"}" &
done
```

### 8.2 Check Concurrency Stats
```bash
sleep 2
curl http://localhost:3000/health/concurrency | jq
```

**Expected:**
- ✅ `active` shows 1-3 (depending on timing)
- ✅ `maxConcurrent: 10`
- ✅ `activeConversationIds` array populated

### 8.3 Verify Logs Show Concurrent Processing
```bash
docker-compose logs app | grep -E "ConversationLock.*concurrent" | tail -10
```

**Look for:** Multiple "Starting concurrent-X" entries

---

## Phase 9: Final Summary

Generate comprehensive validation report.

### 9.1 Collect Validation Results

**Foundation Validation:**
- ✅/❌ Type checking passed
- ✅/❌ Linting passed
- ✅/❌ Unit tests passed
- ✅/❌ Build succeeded

**Docker Validation:**
- ✅/❌ Container started without errors
- ✅/❌ Health endpoints responding
- ✅/❌ Lock manager initialized

**Test Adapter Validation:**
- ✅/❌ Clone command successful
- ✅/❌ Implementation request processed
- ✅/❌ PR created via test adapter
- ✅/❌ Logs show proper tool usage

**Database Validation:**
- ✅/❌ Codebase record created
- ✅/❌ Conversation record created
- ✅/❌ Session records present and active

**GitHub Integration:**
- ✅/❌ Issue webhook processed
- ✅/❌ @remote-agent comment responded (batch mode)
- ✅/❌ Pull request created by bot
- ✅/❌ PR review comment processed

**Concurrency Validation:**
- ✅/❌ Multiple conversations processed simultaneously
- ✅/❌ Stats endpoint accurate

### 9.2 Repository Information
```bash
echo "====================================="
echo "VALIDATION COMPLETE"
echo "====================================="
echo ""
echo "Test Repository: ${TEST_REPO_URL}"
echo "Issue #${ISSUE_NUMBER}: ${ISSUE_URL}"
echo "Pull Request #${PR_NUMBER}: ${PR_URL}"
echo ""
echo "Repository Name: ${TEST_REPO_NAME}"
echo ""
```

### 9.3 Issue Detection
```bash
# Check for errors in logs
ERROR_COUNT=$(docker-compose logs app | grep -c -E "ERROR|Error:")
echo "Error count in logs: ${ERROR_COUNT}"

if [ $ERROR_COUNT -gt 0 ]; then
  echo ""
  echo "⚠️  ERRORS DETECTED - Sample:"
  docker-compose logs app | grep -E "ERROR|Error:" | tail -5
fi
```

### 9.4 Summary Report Format

Provide a formatted summary to the user:

```
=======================================
VALIDATION SUMMARY
=======================================

FOUNDATION:
  Type Checking: ✅/❌
  Linting: ✅/❌
  Unit Tests: ✅/❌
  Build: ✅/❌

DOCKER:
  Container Startup: ✅/❌
  Health Checks: ✅/❌
  Lock Manager: ✅/❌

TEST ADAPTER:
  Clone Command: ✅/❌
  Implementation: ✅/❌
  Tool Usage: ✅/❌

DATABASE:
  Codebase Record: ✅/❌
  Conversation Record: ✅/❌
  Session Records: ✅/❌

GITHUB INTEGRATION:
  Issue Webhook: ✅/❌
  Issue Response (batch): ✅/❌
  PR Creation: ✅/❌
  PR Review: ✅/❌

CONCURRENCY:
  Concurrent Processing: ✅/❌
  Stats Accuracy: ✅/❌

LINKS:
  Repository: ${TEST_REPO_URL}
  Issue: ${ISSUE_URL}
  Pull Request: ${PR_URL}

ERRORS: ${ERROR_COUNT} found in logs

OVERALL: ✅ PASS / ❌ FAIL
=======================================
```

---

## Phase 10: Cleanup Information

**Test repository is preserved for manual inspection.**

Repository: ${TEST_REPO_URL}
Issue: ${ISSUE_URL}
Pull Request: ${PR_URL}

You can delete the test repository when ready:
```bash
gh repo delete ${GITHUB_USERNAME}/${TEST_REPO_NAME} --yes
rm -rf workspace/${TEST_REPO_NAME}
```

---

## Important Notes

- **Ngrok**: Must be running before starting validation (GitHub webhooks require public endpoint)
- **Timing**: AI operations may take 30-90 seconds, adjust sleep times if needed
- **Batch Mode**: GitHub responses should be single comments, not streaming
- **Database**: Ensure DATABASE_URL in .env is accessible from your shell
- **Cleanup**: Repository is NOT auto-deleted for safety (manual confirmation required)

**If any critical step fails, STOP and report the issue immediately with logs.**

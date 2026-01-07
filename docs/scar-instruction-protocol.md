# SCAR Instruction Protocol

**WHEN TO USE:** Every time you post instructions to SCAR via GitHub comments.

**PROBLEM:** In the past, we've wasted hours waiting for SCAR to start work, only to discover SCAR never received the instruction or misunderstood it.

**SOLUTION:** Always verify SCAR acknowledges and starts working.

---

## Mandatory Verification Steps

**After posting ANY instruction to SCAR via GitHub comment:**

1. **Wait 20 seconds** for SCAR to acknowledge
2. **Check for acknowledgment** - Look for "SCAR is on the case..." comment
3. **If NO acknowledgment:**
   - Check GitHub webhook logs
   - Re-post with @scar mention
   - Use simpler, more direct language
4. **Wait 30 seconds** for work to start
5. **Verify file creation/activity:**
   ```bash
   # Check for new files in worktree
   find /home/samuel/.archon/worktrees/<project>/issue-<N>/ -type f -newer <reference-file>

   # Or check specific expected files
   ls -la /home/samuel/.archon/worktrees/<project>/issue-<N>/path/to/expected/file
   ```
6. **If NO activity detected:**
   - SCAR may have gone into "planning mode" instead of "implementation mode"
   - Re-post with: "Skip planning. Implement directly. Start NOW."
   - Verify again with steps 1-5

---

## Example Workflow

```bash
# 1. Post instruction to GitHub
gh issue comment 43 --repo gpt153/openhorizon.cc --body "..."

# 2. Wait and verify acknowledgment (20s)
sleep 20
gh issue view 43 --repo gpt153/openhorizon.cc --comments --json comments \
  --jq '.comments[-1].body' | grep "SCAR is on the case"

# 3. If no acknowledgment, re-post with @mention
if [ $? -ne 0 ]; then
  gh issue comment 43 --repo gpt153/openhorizon.cc --body "@scar - Please begin..."
  sleep 20
fi

# 4. Wait and verify file creation (30s)
sleep 30
find /home/samuel/.archon/worktrees/openhorizon.cc/issue-43/ -type f -name "*.spec.ts"

# 5. Report status to user
echo "✅ SCAR is working - files being created"
# OR
echo "❌ SCAR not responding - investigating..."
```

---

## Red Flags

**If you see these, SCAR is NOT implementing:**
- 🚩 No "SCAR is on the case..." comment after 30+ seconds
- 🚩 SCAR posts a long "implementation plan" instead of code
- 🚩 No new files created after 60+ seconds
- 🚩 SCAR asks clarifying questions (usually means unclear instruction)

**Immediate Actions:**
1. Re-post with simpler, more direct instructions
2. Add "Skip planning. Implement directly."
3. Use @scar mention to trigger webhook
4. Break down into smaller, concrete tasks

---

## Success Criteria

**You know SCAR is working when:**
- ✅ "SCAR is on the case..." comment appears within 20s
- ✅ New files appear in worktree within 60s
- ✅ File timestamps match current time
- ✅ SCAR posts progress updates as files are created

---

**This protocol saves hours of waiting. Always follow it.**

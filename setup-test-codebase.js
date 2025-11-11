const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function setup() {
  try {
    // Create or get codebase
    let cbResult = await pool.query(
      `SELECT id FROM remote_agent_codebases WHERE name = $1`,
      ['ai-for-print-success']
    );

    let codebaseId;
    if (cbResult.rows.length > 0) {
      codebaseId = cbResult.rows[0].id;
      console.log('Found existing codebase ID:', codebaseId);
    } else {
      cbResult = await pool.query(
        `INSERT INTO remote_agent_codebases (name, repository_url, default_cwd, commands)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING id`,
        ['ai-for-print-success', 'https://github.com/test/repo', '/workspace/ai-for-print-success', '{}']
      );
      codebaseId = cbResult.rows[0].id;
      console.log('Created new codebase ID:', codebaseId);
    }

    // Update test conversation
    await pool.query(
      `UPDATE remote_agent_conversations
       SET codebase_id = $1, cwd = $2
       WHERE platform_conversation_id = $3`,
      [codebaseId, '/workspace/ai-for-print-success', 'test-commands']
    );

    console.log('Test conversation updated with codebase!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

setup();

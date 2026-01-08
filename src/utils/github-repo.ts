/**
 * GitHub repository management utilities
 */
import { Octokit } from '@octokit/rest';

export interface CreateRepoOptions {
  name: string;
  description?: string;
  private: boolean;
  autoInit: boolean; // Initialize with README
}

export interface CreateRepoResult {
  fullName: string; // owner/repo
  htmlUrl: string; // https://github.com/owner/repo
  cloneUrl: string; // https://github.com/owner/repo.git
  defaultBranch: string; // main
}

export interface WebhookConfig {
  url: string; // Webhook URL (e.g., https://code.153.se/webhooks/github)
  secret: string; // Webhook secret for signature verification
  events?: string[]; // Events to trigger webhook (default: issues, issue_comment, pull_request)
}

/**
 * Create a new GitHub repository for authenticated user
 */
export async function createRepository(
  token: string,
  options: CreateRepoOptions
): Promise<CreateRepoResult> {
  const octokit = new Octokit({ auth: token });

  try {
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name: options.name,
      description: options.description,
      private: options.private,
      auto_init: options.autoInit,
    });

    return {
      fullName: data.full_name,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      defaultBranch: data.default_branch,
    };
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to create GitHub repository: ${err.message}`);
  }
}

/**
 * Configure webhook for a GitHub repository
 * Automatically sets up webhook for SCAR bot mentions and issue management
 */
export async function configureWebhook(
  token: string,
  repoFullName: string, // e.g., "gpt153/my-repo"
  config: WebhookConfig
): Promise<void> {
  const octokit = new Octokit({ auth: token });
  const [owner, repo] = repoFullName.split('/');

  // Default events for SCAR: issues, issue comments, pull requests
  const events = config.events ?? [
    'issues',
    'issue_comment',
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
  ];

  try {
    await octokit.rest.repos.createWebhook({
      owner,
      repo,
      config: {
        url: config.url,
        content_type: 'json',
        secret: config.secret,
        insecure_ssl: '0', // Require SSL verification
      },
      events,
      active: true,
    });

    console.log(`[GitHub] Webhook configured for ${repoFullName}`);
  } catch (error) {
    const err = error as Error;
    // Don't fail project creation if webhook setup fails - can be done manually
    console.error(`[GitHub] Warning: Failed to configure webhook for ${repoFullName}:`, err.message);
    console.error('[GitHub] Webhook can be configured manually in repository settings');
  }
}

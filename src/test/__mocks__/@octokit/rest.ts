/**
 * Mock for @octokit/rest
 */

export class Octokit {
  repos = {
    createInOrg: jest.fn(),
    get: jest.fn(),
    createOrUpdateFileContents: jest.fn(),
  };

  rest = {
    repos: this.repos,
  };
}

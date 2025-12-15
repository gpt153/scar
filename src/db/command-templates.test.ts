import { createQueryResult } from '../test/mocks/database';
import { CommandTemplate } from '../types';

const mockQuery = jest.fn();

jest.mock('./connection', () => ({
  pool: {
    query: mockQuery,
  },
}));

import {
  createTemplate,
  getTemplate,
  getAllTemplates,
  deleteTemplate,
  upsertTemplate,
} from './command-templates';

describe('command-templates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockTemplate: CommandTemplate = {
    id: 'template-123',
    name: 'plan',
    description: 'Create implementation plan',
    content: '# Plan\n\n**Input**: $ARGUMENTS',
    created_at: new Date(),
    updated_at: new Date(),
  };

  describe('createTemplate', () => {
    test('creates template with all fields', async () => {
      mockQuery.mockResolvedValueOnce(createQueryResult([mockTemplate]));

      const result = await createTemplate({
        name: 'plan',
        description: 'Create implementation plan',
        content: '# Plan\n\n**Input**: $ARGUMENTS',
      });

      expect(result).toEqual(mockTemplate);
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO remote_agent_command_templates (name, description, content) VALUES ($1, $2, $3) RETURNING *',
        ['plan', 'Create implementation plan', '# Plan\n\n**Input**: $ARGUMENTS']
      );
    });

    test('creates template without description', async () => {
      const templateWithoutDesc = { ...mockTemplate, description: null };
      mockQuery.mockResolvedValueOnce(createQueryResult([templateWithoutDesc]));

      await createTemplate({
        name: 'plan',
        content: '# Plan',
      });

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['plan', null, '# Plan']);
    });
  });

  describe('getTemplate', () => {
    test('returns existing template', async () => {
      mockQuery.mockResolvedValueOnce(createQueryResult([mockTemplate]));

      const result = await getTemplate('plan');

      expect(result).toEqual(mockTemplate);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM remote_agent_command_templates WHERE name = $1',
        ['plan']
      );
    });

    test('returns null for non-existent template', async () => {
      mockQuery.mockResolvedValueOnce(createQueryResult([]));

      const result = await getTemplate('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getAllTemplates', () => {
    test('returns all templates ordered by name', async () => {
      const templates = [mockTemplate, { ...mockTemplate, id: 'template-456', name: 'commit' }];
      mockQuery.mockResolvedValueOnce(createQueryResult(templates));

      const result = await getAllTemplates();

      expect(result).toEqual(templates);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM remote_agent_command_templates ORDER BY name'
      );
    });

    test('returns empty array when no templates', async () => {
      mockQuery.mockResolvedValueOnce(createQueryResult([]));

      const result = await getAllTemplates();

      expect(result).toEqual([]);
    });
  });

  describe('deleteTemplate', () => {
    test('returns true when template deleted', async () => {
      mockQuery.mockResolvedValueOnce(createQueryResult([], 1));

      const result = await deleteTemplate('plan');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM remote_agent_command_templates WHERE name = $1',
        ['plan']
      );
    });

    test('returns false when template not found', async () => {
      mockQuery.mockResolvedValueOnce(createQueryResult([], 0));

      const result = await deleteTemplate('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('upsertTemplate', () => {
    test('inserts new template', async () => {
      mockQuery.mockResolvedValueOnce(createQueryResult([mockTemplate]));

      const result = await upsertTemplate({
        name: 'plan',
        description: 'Create implementation plan',
        content: '# Plan',
      });

      expect(result).toEqual(mockTemplate);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), [
        'plan',
        'Create implementation plan',
        '# Plan',
      ]);
    });
  });
});

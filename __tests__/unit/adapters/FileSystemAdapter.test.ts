import fs from 'fs'
import path from 'path'
import { FileSystemAdapter } from '@/lib/adapters/FileSystemAdapter'
import { RuleModification } from '@/lib/adapters/types'

// Mock fs module
jest.mock('fs')

describe('FileSystemAdapter', () => {
  let adapter: FileSystemAdapter
  const mockContentPath = 'content/portal/rule-modifications'
  const mockBasePath = path.join(process.cwd(), mockContentPath)

  beforeEach(() => {
    adapter = new FileSystemAdapter(mockContentPath)
    jest.clearAllMocks()
  })

  describe('getRuleModifications', () => {
    it('should return empty array when directory does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false)

      const result = await adapter.getRuleModifications()

      expect(result).toEqual([])
      expect(fs.existsSync).toHaveBeenCalledWith(mockBasePath)
    })

    it('should return rule modifications from markdown files', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['rule1.md', 'rule2.md', 'not-markdown.txt']);
      (fs.readFileSync as jest.Mock)
        .mockReturnValueOnce(`---
title: Rule 1
category: School League
summary: Summary 1
date: 2024-01-15
---
# Content 1`)
        .mockReturnValueOnce(`---
title: Rule 2
category: Club Tournament
summary: Summary 2
date: 2024-01-10
---
# Content 2`)

      const result = await adapter.getRuleModifications()

      expect(result).toHaveLength(2)
      expect(result[0].title).toBe('Rule 1')
      expect(result[0].category).toBe('School League')
      expect(result[0].content).toBe('# Content 1')
      expect(result[1].title).toBe('Rule 2')
    })

    it('should sort rules by date in descending order', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['rule1.md', 'rule2.md']);
      (fs.readFileSync as jest.Mock)
        .mockReturnValueOnce(`---
title: Older Rule
date: 2024-01-10
---
Content`)
        .mockReturnValueOnce(`---
title: Newer Rule
date: 2024-01-20
---
Content`)

      const result = await adapter.getRuleModifications()

      expect(result[0].title).toBe('Newer Rule')
      expect(result[1].title).toBe('Older Rule')
    })
  })

  describe('getRuleModification', () => {
    it('should return null when file does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false)

      const result = await adapter.getRuleModification('non-existent')

      expect(result).toBeNull()
    })

    it('should return rule modification when file exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        `---
title: Test Rule
category: Adult
summary: Test Summary
date: 2024-01-15
---
# Test Content`
      )

      const result = await adapter.getRuleModification('test-rule')

      expect(result).not.toBeNull()
      expect(result?.title).toBe('Test Rule')
      expect(result?.category).toBe('Adult')
      expect(result?.content).toBe('# Test Content')
      expect(result?.slug).toBe('test-rule')
    })
  })

  describe('createRuleModification', () => {
    it('should create a new rule modification file', async () => {
      const mockRule: Omit<RuleModification, 'id' | 'createdAt' | 'updatedAt'> = {
        title: 'New Rule',
        category: 'School League',
        summary: 'New Summary',
        content: '# New Content',
        date: '2024-01-15',
        slug: 'new-rule',
      };

      (fs.writeFileSync as jest.Mock).mockImplementation(() => {})

      const result = await adapter.createRuleModification(mockRule)

      expect(result.title).toBe('New Rule')
      expect(result.id).toBe('new-rule')
      expect(result.createdAt).toBeDefined()
      expect(result.updatedAt).toBeDefined()
      expect(fs.writeFileSync).toHaveBeenCalled()
    })

    it('should generate slug from title if not provided', async () => {
      const mockRule: Omit<RuleModification, 'id' | 'createdAt' | 'updatedAt'> = {
        title: 'Rule With Spaces & Special!',
        category: 'School League',
        summary: 'Summary',
        content: 'Content',
        date: '2024-01-15',
        slug: '',
      };

      (fs.writeFileSync as jest.Mock).mockImplementation(() => {})

      const result = await adapter.createRuleModification(mockRule)

      expect(result.slug).toBe('rule-with-spaces-special')
    })
  })

  describe('updateRuleModification', () => {
    it('should throw error when rule does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false)

      await expect(
        adapter.updateRuleModification('non-existent', { title: 'Updated' })
      ).rejects.toThrow('Rule modification non-existent not found')
    })

    it('should update existing rule modification', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        `---
title: Original Rule
category: Adult
---
Original Content`
      );
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});

      const result = await adapter.updateRuleModification('test-rule', {
        title: 'Updated Rule',
        category: 'School Tournament',
      })

      expect(result.title).toBe('Updated Rule')
      expect(result.category).toBe('School Tournament')
      expect(result.updatedAt).toBeDefined()
      expect(fs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('deleteRuleModification', () => {
    it('should delete existing file', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {});

      await adapter.deleteRuleModification('test-rule')

      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join(mockBasePath, 'test-rule.md')
      )
    })

    it('should not throw error when file does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false)

      await expect(
        adapter.deleteRuleModification('non-existent')
      ).resolves.not.toThrow()
    })
  })
})
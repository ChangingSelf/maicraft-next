/**
 * 模板引擎测试
 */

import { TemplateEngine } from '../TemplateEngine'
import { TokenType } from '../Lexer'
import { PromptErrorType } from '../../errors/PromptError'

describe('TemplateEngine', () => {
  let engine: TemplateEngine

  beforeEach(() => {
    engine = new TemplateEngine()
  })

  describe('基本渲染功能', () => {
    it('应该渲染简单的文本', () => {
      const result = engine.render('Hello, World!')
      expect(result.result).toBe('Hello, World!')
      expect(result.error).toBeUndefined()
    })

    it('应该替换简单变量', () => {
      const result = engine.render('Hello, ${name}!', { name: 'Alice' })
      expect(result.result).toBe('Hello, Alice!')
      expect(result.usedVariables).toContain('name')
    })

    it('应该处理多个变量', () => {
      const result = engine.render('${greeting}, ${name}! Today is ${day}.', {
        greeting: 'Hello',
        name: 'Bob',
        day: 'Monday'
      })
      expect(result.result).toBe('Hello, Bob! Today is Monday.')
      expect(result.usedVariables).toEqual(['greeting', 'name', 'day'])
    })

    it('应该处理未定义的变量', () => {
      const result = engine.render('Hello, ${name}!')
      expect(result.result).toBe('Hello, !')
      expect(result.missingVariables).toContain('name')
    })

    it('应该处理嵌套对象属性', () => {
      const result = engine.render('Hello, ${user.name}!', {
        user: { name: 'Charlie' }
      })
      expect(result.result).toBe('Hello, Charlie!')
      expect(result.usedVariables).toContain('user.name')
    })
  })

  describe('条件渲染', () => {
    it('应该处理简单的条件', () => {
      const result1 = engine.render('${#if show}Visible${/if}', { show: true })
      expect(result1.result).toBe('Visible')

      const result2 = engine.render('${#if show}Visible${/if}', { show: false })
      expect(result2.result).toBe('')
    })

    it('应该处理条件else分支', () => {
      const result1 = engine.render('${#if show}Yes${else}No${/if}', { show: true })
      expect(result1.result).toBe('Yes')

      const result2 = engine.render('${#if show}Yes${else}No${/if}', { show: false })
      expect(result2.result).toBe('No')
    })

    it('应该处理复杂条件表达式', () => {
      const result = engine.render('${#if user.age >= 18}Adult${else}Minor${/if}', {
        user: { age: 20 }
      })
      expect(result.result).toBe('Adult')
    })
  })

  describe('循环渲染', () => {
    it('应该处理简单数组循环', () => {
      const result = engine.render(
        '${#each items}${this}${/each}',
        { items: ['apple', 'banana', 'cherry'] }
      )
      expect(result.result).toBe('applebananacherry')
    })

    it('应该处理带变量的循环', () => {
      const result = engine.render(
        '${#each items in list}${item}: ${item}${/each}',
        { list: ['apple', 'banana'] }
      )
      expect(result.result).toBe('apple: applebanana: banana')
    })

    it('应该处理循环索引变量', () => {
      const result = engine.render(
        '${#each items}${item_index}: ${this}${/each}',
        { items: ['a', 'b', 'c'] }
      )
      expect(result.result).toBe('0: a1: b2: c')
    })

    it('应该处理空数组', () => {
      const result = engine.render(
        '${#each items}Nothing${/each}',
        { items: [] }
      )
      expect(result.result).toBe('')
    })
  })

  describe('过滤器', () => {
    it('应该应用upper过滤器', () => {
      const result = engine.render('${name | upper}', { name: 'alice' })
      expect(result.result).toBe('ALICE')
    })

    it('应该应用lower过滤器', () => {
      const result = engine.render('${name | lower}', { name: 'ALICE' })
      expect(result.result).toBe('alice')
    })

    it('应该应用capitalize过滤器', () => {
      const result = engine.render('${name | capitalize}', { name: 'alice' })
      expect(result.result).toBe('Alice')
    })

    it('应该应用truncate过滤器', () => {
      const result = engine.render('${text | truncate:5}', { text: 'Hello World' })
      expect(result.result).toBe('Hello...')
    })

    it('应该链式应用多个过滤器', () => {
      const result = engine.render('${name | capitalize | truncate:3}', { name: 'alice' })
      expect(result.result).toBe('Ali...')
    })

    it('应该支持自定义过滤器', () => {
      engine.addFilter('reverse', (value: string) => String(value).split('').reverse().join(''))
      const result = engine.render('${text | reverse}', { text: 'hello' })
      expect(result.result).toBe('olleh')
    })
  })

  describe('内置函数', () => {
    it('应该支持now函数', () => {
      const result = engine.render('${now()}')
      expect(result.result).toMatch(/\d{4}-\d{2}-\d{2}/)
    })

    it('应该支持random函数', () => {
      const result = engine.render('${random(1, 10)}')
      const num = parseInt(result.result)
      expect(num).toBeGreaterThanOrEqual(1)
      expect(num).toBeLessThanOrEqual(10)
    })

    it('应该支持uuid函数', () => {
      const result = engine.render('${uuid()}')
      expect(result.result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })
  })

  describe('模板验证', () => {
    it('应该验证有效的模板', () => {
      const validation = engine.validate('Hello, ${name}!')
      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('应该检测未闭合的变量', () => {
      const validation = engine.validate('Hello, ${name')
      expect(validation.valid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
    })

    it('应该检测未闭合的条件块', () => {
      const validation = engine.validate('${#if true}Hello')
      expect(validation.valid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
    })

    it('应该检测未闭合的循环块', () => {
      const validation = engine.validate('${#each items}${this}')
      expect(validation.valid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
    })

    it('应该检测不匹配的块', () => {
      const validation = engine.validate('${#if true}Hello${/each}')
      expect(validation.valid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
    })
  })

  describe('缓存功能', () => {
    it('应该缓存编译结果', () => {
      const template = 'Hello, ${name}!'

      // 第一次渲染
      const start1 = Date.now()
      const result1 = engine.render(template, { name: 'Alice' })
      const time1 = Date.now() - start1

      // 第二次渲染（应该使用缓存）
      const start2 = Date.now()
      const result2 = engine.render(template, { name: 'Bob' })
      const time2 = Date.now() - start2

      expect(result1.result).toBe('Hello, Alice!')
      expect(result2.result).toBe('Hello, Bob!')

      // 第二次应该更快（使用了缓存）
      expect(time2).toBeLessThanOrEqual(time1)
    })

    it('应该能够清除缓存', () => {
      engine.render('Hello, ${name}!', { name: 'Alice' })
      expect(engine.getCacheStatistics().size).toBeGreaterThan(0)

      engine.clearCache()
      expect(engine.getCacheStatistics().size).toBe(0)
    })
  })

  describe('错误处理', () => {
    it('应该处理语法错误', () => {
      const result = engine.render('${#if true}Hello')
      expect(result.error).toBeDefined()
      expect(result.result).toBe('')
    })

    it('应该处理未知过滤器', () => {
      const result = engine.render('${name | unknown}', { name: 'test' })
      expect(result.error).toBeDefined()
    })

    it('应该处理渲染超时', () => {
      const slowEngine = new TemplateEngine({
        renderer: { maxRenderTime: 1 } // 1ms超时
      })
      const result = slowEngine.render('Hello, ${name}!', { name: 'test' })
      expect(result.error).toBeDefined()
    })
  })

  describe('性能测试', () => {
    it('应该能处理大型模板', () => {
      const largeTemplate = Array(1000).fill('${name}').join(' ')
      const result = engine.render(largeTemplate, { name: 'test' })
      expect(result.result).toContain('test')
      expect(result.result.length).toBeGreaterThan(1000)
    })

    it('应该能处理复杂嵌套结构', () => {
      const complexTemplate = `
        \${#if user.isAdmin}
          \${#each items}
            \${#if this.active}
              \${this.name}
            \${/if}
          \${/each}
        \${/if}
      `
      const result = engine.render(complexTemplate, {
        user: { isAdmin: true },
        items: [
          { name: 'Item 1', active: true },
          { name: 'Item 2', active: false },
          { name: 'Item 3', active: true }
        ]
      })
      expect(result.result).toContain('Item 1')
      expect(result.result).toContain('Item 3')
      expect(result.result).not.toContain('Item 2')
    })
  })

  describe('配置选项', () => {
    it('应该支持自定义语法标记', () => {
      const customEngine = new TemplateEngine({
        lexer: {
          variableStart: '{{',
          variableEnd: '}}'
        }
      })
      const result = customEngine.render('Hello, {{name}}!', { name: 'Alice' })
      expect(result.result).toBe('Hello, Alice!')
    })

    it('应该支持严格模式', () => {
      const strictEngine = new TemplateEngine({
        renderer: { strict: true }
      })
      const result = strictEngine.render('Hello, ${name}!')
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Undefined variable')
    })
  })

  describe('统计信息', () => {
    it('应该提供引擎统计信息', () => {
      const stats = engine.getEngineStatistics()
      expect(stats.filterCount).toBeGreaterThan(0)
      expect(stats.functionCount).toBeGreaterThan(0)
      expect(stats.cacheSize).toBe(0)
    })

    it('应该提供处理统计信息', () => {
      const processResult = engine.process('Hello, ${name}!')
      expect(processResult.statistics.compileTime).toBeGreaterThanOrEqual(0)
      expect(processResult.statistics.dependencyCount).toBe(1)
    })
  })
})
/**
 * 提示词引擎使用示例
 *
 * 演示如何使用模板引擎进行提示词渲染
 */

import { TemplateEngine } from '../prompt/engine/TemplateEngine'

async function demonstratePromptEngine() {
  console.log('=== 提示词引擎演示 ===\n')

  // 创建模板引擎实例
  const engine = new TemplateEngine()

  // 示例1: 基本变量替换
  console.log('1. 基本变量替换:')
  const basicTemplate = '你好，${name}！今天是${day}。'
  const result1 = engine.render(basicTemplate, {
    name: 'Alice',
    day: 'Monday'
  })
  console.log(`模板: ${basicTemplate}`)
  console.log(`变量: { name: "Alice", day: "Monday" }`)
  console.log(`结果: ${result1.result}\n`)

  // 示例2: 条件渲染
  console.log('2. 条件渲染:')
  const conditionalTemplate = '${#if user.isAdmin}管理员${else}普通用户${/if}'
  const result2a = engine.render(conditionalTemplate, { user: { isAdmin: true } })
  const result2b = engine.render(conditionalTemplate, { user: { isAdmin: false } })
  console.log(`模板: ${conditionalTemplate}`)
  console.log(`管理员: ${result2a.result}`)
  console.log(`普通用户: ${result2b.result}\n`)

  // 示例3: 循环渲染
  console.log('3. 循环渲染:')
  const loopTemplate = '${#each items in tasks}任务${item_index + 1}: ${item.name} - ${item.status}\n${/each}'
  const result3 = engine.render(loopTemplate, {
    tasks: [
      { name: '挖掘钻石', status: '进行中' },
      { name: '建造房屋', status: '已完成' },
      { name: '探索洞穴', status: '待开始' }
    ]
  })
  console.log(`模板: ${loopTemplate}`)
  console.log(`结果:\n${result3.result}`)

  // 示例4: 过滤器使用
  console.log('4. 过滤器使用:')
  const filterTemplate = '玩家: ${player.name | upper} | 等级: ${player.level | default:1} | 加入时间: ${player.joinDate | date:YYYY-MM-DD}'
  const result4 = engine.render(filterTemplate, {
    player: {
      name: 'steve',
      level: 15,
      joinDate: new Date('2024-01-15')
    }
  })
  console.log(`模板: ${filterTemplate}`)
  console.log(`结果: ${result4.result}\n`)

  // 示例5: 复杂组合模板
  console.log('5. 复杂组合模板:')
  const complexTemplate = `服务器状态报告
================
生成时间: \${now() | date:YYYY-MM-DD HH:mm:ss}

管理员列表:
\${#each admins in server.admins}  - \${admin.name} (\${admin.role})
\${/each}

在线玩家: \${#each player in server.players}\${player.name}\${#if !player_last}, \${/if}\${/each}

\${#if server.warning}
⚠️ 警告: \${server.warning}
\${/if}`

  const result5 = engine.render(complexTemplate, {
    server: {
      admins: [
        { name: 'Admin1', role: '主管理员' },
        { name: 'Admin2', role: '副管理员' }
      ],
      players: [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' }
      ],
      warning: '服务器将在1小时后重启'
    }
  })
  console.log(`模板: ${complexTemplate}`)
  console.log(`结果:\n${result5.result}\n`)

  // 示例6: 模板验证
  console.log('6. 模板验证:')
  const invalidTemplate = 'Hello, \\${name' // 缺少闭合括号
  const validation = engine.validate(invalidTemplate)
  console.log(`模板: ${invalidTemplate}`)
  console.log(`验证结果: ${validation.valid ? '有效' : '无效'}`)
  if (!validation.valid) {
    console.log(`错误信息: ${validation.errors.join(', ')}`)
  }
  console.log()

  // 示例7: 引擎统计信息
  console.log('7. 引擎统计信息:')
  const stats = engine.getEngineStatistics()
  console.log(`可用过滤器数量: ${stats.filterCount}`)
  console.log(`可用函数数量: ${stats.functionCount}`)
  console.log(`缓存大小: ${stats.cacheSize}`)
  console.log()

  // 示例8: 自定义过滤器
  console.log('8. 自定义过滤器:')
  engine.addFilter('minecraftTime', (ticks: number) => {
    // Minecraft时间转换 (0-24000 ticks -> 24小时制)
    const hours = Math.floor((ticks / 1000 + 6) % 24)
    const minutes = Math.floor((ticks % 1000) * 60 / 1000)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  })

  const timeTemplate = '游戏时间: \\${gameTime | minecraftTime}'
  const result8 = engine.render(timeTemplate, { gameTime: 6000 }) // 6:00 AM
  console.log(`自定义过滤器 - Minecraft时间转换:`)
  console.log(`模板: ${timeTemplate}`)
  console.log(`输入: 6000 ticks`)
  console.log(`结果: ${result8.result}\n`)

  console.log('=== 演示结束 ===')
}

// 运行演示
if (require.main === module) {
  demonstratePromptEngine().catch(console.error)
}

export { demonstratePromptEngine }
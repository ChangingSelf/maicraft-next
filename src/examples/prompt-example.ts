/**
 * 提示词管理系统使用示例
 *
 * 展示如何使用PromptManager进行提示词管理、渲染和LLM交互
 */

import { createPromptManager, DEFAULT_PROMPTS } from '../prompt/PromptManager.js';
import { LLMManager } from '../llm/LLMManager.js';
import { ConfigManager } from '../utils/Config.js';
import { MessageRole } from '../prompt/types/index.js';

async function main() {
  console.log('=== 提示词管理系统使用示例 ===\n');

  try {
    // 1. 创建提示词管理器
    console.log('1. 创建提示词管理器...');
    const promptManager = await createPromptManager('./data/prompts');

    // 2. 创建默认提示词
    console.log('\n2. 创建默认提示词...');
    for (const [key, template] of Object.entries(DEFAULT_PROMPTS)) {
      try {
        await promptManager.createTemplate({
          name: template.name,
          description: template.description,
          content: template.content,
          category: template.category as any,
          tags: template.tags,
          created_by: 'system',
        });
        console.log(`✅ 创建提示词: ${template.name}`);
      } catch (error) {
        console.log(`❌ 创建提示词失败 ${template.name}: ${(error as Error).message}`);
      }
    }

    // 3. 搜索提示词
    console.log('\n3. 搜索提示词...');
    const allTemplates = await promptManager.searchTemplates({});
    console.log(`找到 ${allTemplates.length} 个提示词模板`);

    const minecraftTemplates = await promptManager.searchTemplates({
      category: 'minecraft',
    });
    console.log(`Minecraft分类: ${minecraftTemplates.length} 个模板`);

    const generalTemplates = await promptManager.searchTemplates({
      tags: ['general'],
    });
    console.log('general标签:', generalTemplates.length, '个模板');

    // 4. 渲染基础提示词
    console.log('\n4. 渲染基础提示词...');
    const basicRender = await promptManager.renderTemplate({
      template_id: 'basic-assistant',
      variables: {
        user_input: 'What is the weather like today?',
      },
    });

    console.log('基础提示词渲染结果:');
    console.log('- 模板名称:', basicRender.template_name);
    console.log('- Token数量:', basicRender.token_count);
    console.log('- 渲染时间:', basicRender.render_time_ms, 'ms');
    console.log('- 渲染内容:');
    console.log('  ', basicRender.rendered_content);

    // 5. 渲染Minecraft提示词
    console.log('\n5. 渲染Minecraft提示词...');
    const minecraftRender = await promptManager.renderTemplate({
      template_id: 'minecraft-helper',
      variables: {
        game_mode: 'survival',
        player_health: 18,
        player_hunger: 15,
        current_biome: 'forest',
        nearby_players: 'none',
        inventory_items: 'wooden_sword, apples, stone',
        user_request: 'How do I craft a crafting table?',
      },
    });

    console.log('Minecraft提示词渲染结果:');
    console.log('- 模板名称:', minecraftRender.template_name);
    console.log('- Token数量:', minecraftRender.token_count);
    console.log('- 使用的变量:', minecraftRender.variables_used);
    console.log('- 渲染内容:');
    console.log(minecraftRender.rendered_content);

    // 6. 渲染复杂提示词
    console.log('\n6. 渲染决策系统提示词...');
    const decisionRender = await promptManager.renderTemplate({
      template_id: 'decision-maker',
      variables: {
        location: 'x:100, y:64, z:200',
        health: 20,
        hunger: 18,
        inventory: 'diamond_pickaxe, cooked_beef, torches',
        nearby_blocks: 'iron_ore, coal_ore',
        nearby_entities: 'cow, sheep',
        objectives: 'Find diamonds and build a house',
        available_actions: 'mine, build, explore, craft, eat',
        previous_actions: 'Mined coal, Crafted torches',
      },
    });

    console.log('决策系统提示词渲染结果:');
    console.log('- Token数量:', decisionRender.token_count);
    console.log('- 渲染时间:', decisionRender.render_time_ms, 'ms');
    console.log('- 错误数量:', decisionRender.errors.length);
    console.log('- 警告数量:', decisionRender.warnings.length);

    // 7. 直接渲染模板内容
    console.log('\n7. 直接渲染模板内容...');
    const inlineRender = await promptManager.renderTemplate({
      template_id: 'Hello, ${name}! You are in ${location}.\n\nYour inventory contains:\n${#each inventory_items}- ${item}${/each}\n\nWhat would you like to do next?\n',
      variables: {
        name: 'Steve',
        location: 'a forest',
        inventory_items: [
          { item: 'wooden_sword' },
          { item: 'apple' },
          { item: 'torch' },
        ],
      },
    });

    console.log('直接渲染结果:');
    console.log(inlineRender.rendered_content);

    // 8. 获取使用统计
    console.log('\n8. 获取使用统计...');
    const stats = promptManager.getUsageStats('basic-assistant');
    console.log('基础提示词使用统计:');
    console.log('- 渲染次数:', stats.render_count);
    console.log('- 错误次数:', stats.error_count);
    console.log('- 总渲染时间:', stats.total_render_time, 'ms');
    console.log('- 最后使用:', stats.last_used);

    // 9. 获取分类和标签
    console.log('\n9. 获取分类和标签...');
    const categories = await promptManager.getCategories();
    console.log('可用分类:', categories);

    const tags = await promptManager.getTags();
    console.log('可用标签:', tags);

    // 10. 与LLM集成（需要配置API密钥）
    console.log('\n10. LLM集成示例...');
    const configManager = new ConfigManager('./config.toml', './config-template.toml');
    await configManager.loadConfig();
    const config = configManager.getConfig();

    const llmManager = new LLMManager(config.llm);
    promptManager.setLLMManager(llmManager);

    // 尝试使用LLM（如果配置了API密钥）
    if (config.llm.openai.enabled && config.llm.openai.api_key) {
      try {
        console.log('尝试与LLM交互...');
        const llmResult = await promptManager.useWithLLM({
          template_id: 'basic-assistant',
          variables: {
            user_input: 'What is 2 + 2?',
          },
        });

        console.log('LLM交互成功!');
        console.log('- 响应ID:', llmResult.llm_response.id);
        console.log('- 使用的模型:', llmResult.llm_response.model);
        console.log('- Token使用:', llmResult.llm_response.usage);
        console.log('- AI回复:');
        console.log('  ', llmResult.llm_response.choices[0].message.content);
      } catch (error) {
        console.log('LLM交互失败:', (error as Error).message);
      }
    } else {
      console.log('LLM集成已跳过（未配置API密钥）');
    }

    // 11. 获取存储统计
    console.log('\n11. 获取存储统计...');
    const storageStats = await promptManager.getStorageStats();
    console.log('存储统计信息:');
    console.log('- 模板总数:', storageStats.total_templates);
    console.log('- 版本总数:', storageStats.total_versions);
    console.log('- 总文件大小:', Math.round(storageStats.total_size_bytes / 1024), 'KB');
    console.log('- 分类数量:', storageStats.categories);
    console.log('- 缓存大小:', storageStats.cache_size);

    // 12. 版本历史
    console.log('\n12. 获取版本历史...');
    const versions = await promptManager.getTemplateVersions('minecraft-helper');
    console.log(`minecraft-helper有${versions.length}个版本`);
    if (versions.length > 0) {
      console.log('- 最新版本:', versions[versions.length - 1].version);
      console.log('- 创建时间:', versions[versions.length - 1].created_at);
    }

    // 13. 清理资源
    console.log('\n13. 清理资源...');
    await promptManager.close();
    llmManager.close();
    configManager.close();

    console.log('\n✅ 示例执行完成！');

  } catch (error) {
    console.error('❌ 示例执行失败:', error);
  }
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

export { main };
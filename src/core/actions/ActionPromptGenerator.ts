/**
 * 动作提示词生成器
 *
 * 专门负责生成动作相关的 LLM 提示词
 * 从 ActionExecutor 中分离出提示词生成职责
 */

import { Action } from './Action';
import { ActionId } from './ActionIds';
import { ActionExecutor } from './ActionExecutor';

/**
 * 动作提示词生成器类
 */
export class ActionPromptGenerator {
  constructor(private executor: ActionExecutor) {}

  /**
   * 生成动作列表提示词
   */
  generatePrompt(): string {
    const actions = this.executor.getRegisteredActions();

    if (actions.length === 0) {
      return '# 可用动作\n\n暂无可用动作';
    }

    const lines: string[] = ['# 可用动作', ''];

    for (const action of actions) {
      lines.push(`## ${action.name}`);
      lines.push(action.description);
      lines.push('');
      lines.push('```json');
      lines.push(
        JSON.stringify(
          {
            action_type: action.id,
            ...action.getParamsSchema?.(),
          },
          null,
          2,
        ),
      );
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 生成指定动作的提示词
   */
  generateActionPrompt(actionId: ActionId): string {
    const action = this.executor.getAction(actionId);
    if (!action) {
      return `# 动作 ${actionId}\n\n该动作未注册`;
    }

    const lines: string[] = [`# ${action.name}`, action.description, ''];

    lines.push('```json');
    lines.push(
      JSON.stringify(
        {
          action_type: action.id,
          ...action.getParamsSchema?.(),
        },
        null,
        2,
      ),
    );
    lines.push('```');

    return lines.join('\n');
  }

  /**
   * 生成动作分类提示词
   */
  generateCategorizedPrompt(): string {
    const actions = this.executor.getRegisteredActions();

    if (actions.length === 0) {
      return '# 可用动作\n\n暂无可用动作';
    }

    // 按类别分组动作
    const categories: Record<string, Action[]> = {};
    for (const action of actions) {
      const category = (action as any).category || '其他';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(action);
    }

    const lines: string[] = ['# 可用动作', ''];

    for (const [category, categoryActions] of Object.entries(categories)) {
      lines.push(`## ${category}`, '');

      for (const action of categoryActions) {
        lines.push(`### ${action.name}`);
        lines.push(action.description);
        lines.push('');
        lines.push('```json');
        lines.push(
          JSON.stringify(
            {
              action_type: action.id,
              ...action.getParamsSchema?.(),
            },
            null,
            2,
          ),
        );
        lines.push('```');
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

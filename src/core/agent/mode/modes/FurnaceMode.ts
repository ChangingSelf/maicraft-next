/**
 * 熔炉GUI模式
 *
 * 参考原maicraft的FurnaceGUIMode设计
 * 负责熔炉冶炼任务的GUI操作
 * 需要LLM决策的主动模式
 */

import { BaseMode } from '../BaseMode';
import { ModeManager } from '../ModeManager';
import type { RuntimeContext } from '@/core/context/RuntimeContext';
import type { AgentState } from '../../types';
import type { BlockPosition } from '@/core/state/types';
import { ActionIds } from '@/core/actions/ActionIds';
import { getLogger } from '@/utils/Logger';
import { promptManager } from '../../prompt';

interface FurnaceSlot {
  [itemName: string]: number;
}

interface FurnaceAction {
  action_type: 'take_items' | 'put_items';
  slot: 'input' | 'fuel' | 'output';
  item: string;
  count: number | 'all';
}

export class FurnaceMode extends BaseMode {
  readonly type = ModeManager.MODE_TYPES.FURNACE_GUI;
  readonly name = '熔炉模式';
  readonly description = '执行熔炉冶炼任务的GUI操作';
  readonly priority = 50; // 中等优先级
  readonly requiresLLMDecision = true; // 需要LLM决策

  // 模式配置 - 参考原maicraft设计
  readonly maxDuration = 300; // 5分钟
  readonly autoRestore = true; // 自动恢复到主模式
  readonly restoreDelay = 5; // 5秒后恢复

  // GameStateListener 实现
  readonly listenerName = 'FurnaceMode';
  readonly enabled = false; // GUI模式不需要监听游戏状态

  // 熔炉特定状态
  private position: BlockPosition | null = null;
  private inputSlot: FurnaceSlot = {};
  private fuelSlot: FurnaceSlot = {};
  private outputSlot: FurnaceSlot = {};

  constructor(context: RuntimeContext) {
    super(context);
    // 重新设置logger以使用正确的名称
    this.logger = getLogger(this.name);
  }

  /**
   * 设置熔炉位置
   */
  setPosition(position: BlockPosition): void {
    this.position = position;
    this.logger.info(`🔥 设置熔炉位置: (${position.x}, ${position.y}, ${position.z})`);
  }

  /**
   * 激活模式
   */
  protected async onActivate(reason: string): Promise<void> {
    this.logger.info(`🔥 激活熔炉模式: ${reason}`);

    if (!this.position) {
      this.logger.error('❌ 熔炉位置未设置，无法激活模式');
      return;
    }

    // 记录到思考日志
    if (this.state?.memory) {
      this.state.memory.recordThought(`🔥 开始熔炉操作: ${reason}`);
    }

    // 初始化熔炉状态
    await this.initializeFurnaceState();
  }

  /**
   * 停用模式
   */
  protected async onDeactivate(reason: string): Promise<void> {
    this.logger.info(`🟡 停用熔炉模式: ${reason}`);

    // 记录到思考日志
    if (this.state?.memory) {
      this.state.memory.recordThought(`🟡 熔炉操作完成: ${reason}`);
    }

    // 清理状态
    this.clearFurnaceState();
  }

  /**
   * 模式主逻辑 - LLM决策
   */
  async execute(): Promise<void> {
    if (!this.state || !this.position) {
      this.logger.warn('⚠️ 熔炉模式缺少必要组件，无法执行');
      return;
    }

    try {
      // 更新熔炉状态
      await this.updateFurnaceState();

      // 执行LLM决策
      await this.executeLLMDecision();

    } catch (error) {
      this.logger.error('❌ 熔炉模式执行异常:', undefined, error as Error);

      if (this.state?.memory) {
        this.state.memory.recordThought(`❌ 熔炉操作异常: ${error}`);
      }
    }
  }

  /**
   * 检查自动转换
   */
  async checkTransitions(): Promise<string[]> {
    const targetModes: string[] = [];

    // 检查是否超时
    if (this.isExpired()) {
      targetModes.push(ModeManager.MODE_TYPES.MAIN);
    }

    return targetModes;
  }

  /**
   * 初始化熔炉状态
   */
  private async initializeFurnaceState(): Promise<void> {
    if (!this.position || !this.state) return;

    try {
      // 查询熔炉容器信息
      const result = await this.state.context.executor.execute(ActionIds.QUERY_CONTAINER, {
        position: this.position,
      });

      if (result.success && result.data) {
        this.inputSlot = result.data.input || {};
        this.fuelSlot = result.data.fuel || {};
        this.outputSlot = result.data.output || {};

        this.logger.debug('🔥 熔炉状态初始化完成', {
          input: this.inputSlot,
          fuel: this.fuelSlot,
          output: this.outputSlot,
        });
      }
    } catch (error) {
      this.logger.error('❌ 熔炉状态初始化失败:', undefined, error as Error);
    }
  }

  /**
   * 更新熔炉状态
   */
  private async updateFurnaceState(): Promise<void> {
    if (!this.position || !this.state) return;

    try {
      const result = await this.state.context.executor.execute(ActionIds.QUERY_CONTAINER, {
        position: this.position,
      });

      if (result.success && result.data) {
        this.inputSlot = result.data.input || {};
        this.fuelSlot = result.data.fuel || {};
        this.outputSlot = result.data.output || {};
      }
    } catch (error) {
      this.logger.error('❌ 熔炉状态更新失败:', undefined, error as Error);
    }
  }

  /**
   * 执行LLM决策
   */
  private async executeLLMDecision(): Promise<void> {
    if (!this.state) return;

    // 生成熔炉状态描述
    const furnaceDescription = this.generateFurnaceDescription();

    // 生成提示词
    const prompt = promptManager.generatePrompt('furnace_operation', {
      furnace_gui: furnaceDescription,
      bot_name: this.state.context.gameState.playerName || 'Bot',
      player_name: this.state.context.gameState.playerName || 'Player',
    });

    // 生成系统提示词
    const systemPrompt = promptManager.generatePrompt('furnace_operation_system', {
      bot_name: this.state.context.gameState.playerName || 'Bot',
      player_name: this.state.context.gameState.playerName || 'Player',
    });

    this.logger.debug('🔥 生成熔炉操作提示词完成');

    // 调用LLM
    const response = await this.state.llmManager.chatCompletion(prompt, systemPrompt);

    if (!response.success) {
      this.logger.warn(`⚠️ 熔炉LLM调用失败`);
      return;
    }

    this.logger.info('🔥 熔炉LLM响应完成');

    // 解析并执行动作
    if (response.content) {
      await this.parseAndExecuteFurnaceActions(response.content);
    }
  }

  /**
   * 生成熔炉状态描述
   */
  private generateFurnaceDescription(): string {
    const parts: string[] = [];

    // 输入槽
    if (Object.keys(this.inputSlot).length > 0) {
      const inputItems = Object.entries(this.inputSlot)
        .map(([item, count]) => `${item} x${count}`)
        .join(', ');
      parts.push(`**输入槽**: ${inputItems}`);
    } else {
      parts.push('**输入槽**: 空');
    }

    // 燃料槽
    if (Object.keys(this.fuelSlot).length > 0) {
      const fuelItems = Object.entries(this.fuelSlot)
        .map(([item, count]) => `${item} x${count}`)
        .join(', ');
      parts.push(`**燃料槽**: ${fuelItems}`);
    } else {
      parts.push('**燃料槽**: 空');
    }

    // 输出槽
    if (Object.keys(this.outputSlot).length > 0) {
      const outputItems = Object.entries(this.outputSlot)
        .map(([item, count]) => `${item} x${count}`)
        .join(', ');
      parts.push(`**输出槽**: ${outputItems}`);
    } else {
      parts.push('**输出槽**: 空');
    }

    return parts.join('\n');
  }

  /**
   * 解析并执行熔炉动作
   */
  private async parseAndExecuteFurnaceActions(llmResponse: string): Promise<void> {
    try {
      // 简单的JSON解析
      const actionMatches = llmResponse.match(/\{[^}]*\}/g) || [];

      if (actionMatches.length === 0) {
        this.logger.warn('⚠️ 未检测到有效的熔炉动作');
        return;
      }

      this.logger.info(`🔥 准备执行 ${actionMatches.length} 个熔炉动作`);

      // 执行每个动作
      for (let i = 0; i < actionMatches.length; i++) {
        try {
          const actionJson = JSON.parse(actionMatches[i]);

          this.logger.debug(`🔍 解析的熔炉动作JSON: ${JSON.stringify(actionJson, null, 2)}`);

          // 验证动作格式
          if (!this.validateFurnaceAction(actionJson)) {
            this.logger.warn(`⚠️ 熔炉动作 ${i + 1}/${actionMatches.length}: 格式无效`);
            continue;
          }

          // 执行熔炉动作
          const result = await this.executeFurnaceAction(actionJson as FurnaceAction);

          if (result.success) {
            this.logger.info(`✅ 熔炉动作 ${i + 1}/${actionMatches.length}: 成功`);
          } else {
            this.logger.warn(`⚠️ 熔炉动作 ${i + 1}/${actionMatches.length}: 失败 - ${result.message}`);
            // 原maicraft设计：失败时停止后续动作
            break;
          }

          // 动作间隔（除了最后一个动作）
          if (i < actionMatches.length - 1) {
            await this.sleep(300);
          }
        } catch (parseError) {
          this.logger.error(`❌ 熔炉动作 ${i + 1}/${actionMatches.length} 解析失败:`, undefined, parseError as Error);
          break;
        }
      }

      // 更新熔炉状态
      await this.updateFurnaceState();

    } catch (error) {
      this.logger.error('❌ 熔炉动作解析执行异常:', undefined, error as Error);
    }
  }

  /**
   * 验证熔炉动作格式
   */
  private validateFurnaceAction(action: any): boolean {
    return (
      action &&
      typeof action.action_type === 'string' &&
      ['take_items', 'put_items'].includes(action.action_type) &&
      typeof action.slot === 'string' &&
      ['input', 'fuel', 'output'].includes(action.slot) &&
      typeof action.item === 'string' &&
      (typeof action.count === 'number' || action.count === 'all')
    );
  }

  /**
   * 执行单个熔炉动作
   */
  private async executeFurnaceAction(action: FurnaceAction): Promise<{ success: boolean; message: string }> {
    if (!this.position || !this.state) {
      return { success: false, message: '熔炉位置或状态未设置' };
    }

    try {
      const count = action.count === 'all' ? 999 : action.count;

      const result = await this.state.context.executor.execute(ActionIds.MANAGE_CONTAINER, {
        position: this.position,
        action: action.action_type,
        slot: action.slot,
        item: action.item,
        count: count,
      });

      // 记录到思考日志
      if (this.state.memory) {
        const actionText = action.action_type === 'take_items' ? '取出' : '放入';
        this.state.memory.recordThought(
          `🔥 熔炉操作: ${actionText} ${action.item} x${action.count} (${action.slot}槽)`
        );
      }

      return result;
    } catch (error) {
      this.logger.error('❌ 熔炉动作执行异常:', undefined, error as Error);
      return { success: false, message: `执行异常: ${error}` };
    }
  }

  /**
   * 清理熔炉状态
   */
  private clearFurnaceState(): void {
    this.inputSlot = {};
    this.fuelSlot = {};
    this.outputSlot = {};
  }

  /**
   * 获取熔炉统计信息
   */
  getFurnaceStats(): {
    position: BlockPosition | null;
    inputCount: number;
    fuelCount: number;
    outputCount: number;
  } {
    return {
      position: this.position,
      inputCount: Object.values(this.inputSlot).reduce((sum, count) => sum + count, 0),
      fuelCount: Object.values(this.fuelSlot).reduce((sum, count) => sum + count, 0),
      outputCount: Object.values(this.outputSlot).reduce((sum, count) => sum + count, 0),
    };
  }

  /**
   * 等待方法（用于动作间隔）
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
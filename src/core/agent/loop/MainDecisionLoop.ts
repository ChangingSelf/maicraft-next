/**
 * 主决策循环
 *
 * 参考原maicraft的run_execute_loop设计
 * 职责：
 * - 检查中断
 * - 通知游戏状态更新
 * - 执行当前模式逻辑
 * - 定期评估任务
 */

import type { AgentState } from '../types';
import { LLMManager } from '@/llm/LLMManager';
import { BaseLoop } from './BaseLoop';
import { promptManager, initAllTemplates } from '../prompt';
import { ModeManager } from '../mode/ModeManager';

export class MainDecisionLoop extends BaseLoop<AgentState> {
  private llmManager: LLMManager;
  private evaluationCounter: number = 0;
  private promptsInitialized: boolean = false;

  constructor(state: AgentState, llmManager: LLMManager) {
    super(state, 'MainDecisionLoop');

    // 必须传入 llmManager，不允许创建新实例
    this.llmManager = llmManager;

    // 初始化提示词模板（只初始化一次）
    if (!this.promptsInitialized) {
      initAllTemplates();
      this.promptsInitialized = true;
      this.logger.info('✅ 提示词模板初始化完成');
    }
  }

  /**
   * 执行一次循环迭代
   * 参考原maicraft的run_execute_loop和next_thinking设计
   */
  protected async runLoopIteration(): Promise<void> {
    // 1. 检查中断
    if (this.state.interrupt.isInterrupted()) {
      const reason = this.state.interrupt.getReason();
      this.state.interrupt.clear();
      this.logger.warn(`⚠️ 决策循环被中断: ${reason}`);
      await this.sleep(1000);
      return;
    }

    // 2. 通知游戏状态更新
    await this.notifyGameStateUpdate();

    // 3. 检查模式自动切换
    const modeSwitched = await this.state.modeManager.checkAutoTransitions();
    if (modeSwitched) {
      this.logger.debug('✨ 模式已自动切换');
      // 模式切换后，跳过本次决策，让新模式在下次循环中执行
      await this.sleep(500);
      return;
    }

    // 4. 执行当前模式逻辑
    await this.executeCurrentMode();

    // 5. 定期评估任务
    this.evaluationCounter++;
    if (this.evaluationCounter % 5 === 0) {
      await this.evaluateTask();
    }

    // 6. 根据当前模式调整等待时间
    await this.adjustSleepDelay();
  }

  /**
   * 通知游戏状态更新
   * 替代原maicraft的环境监听器机制
   */
  private async notifyGameStateUpdate(): Promise<void> {
    try {
      const gameState = this.state.context.gameState;
      await this.state.modeManager.notifyGameStateUpdate(gameState);
    } catch (error) {
      this.logger.error('❌ 游戏状态通知失败:', undefined, error as Error);
    }
  }

  /**
   * 执行当前模式逻辑
   * 参考原maicraft：直接调用当前模式的执行方法
   */
  private async executeCurrentMode(): Promise<void> {
    try {
      await this.state.modeManager.executeCurrentMode();
    } catch (error) {
      this.logger.error('❌ 模式执行失败:', undefined, error as Error);

      // 安全机制：严重错误时强制恢复到主模式
      if (this.state.modeManager.getCurrentMode() !== ModeManager.MODE_TYPES.MAIN) {
        this.logger.warn('🔄 检测到模式执行异常，尝试恢复到主模式');
        await this.state.modeManager.forceRecoverToMain('模式执行异常恢复');
      }
    }
  }

  /**
   * 根据当前模式调整等待时间
   */
  private async adjustSleepDelay(): Promise<void> {
    const currentMode = this.state.modeManager.getCurrentMode();

    switch (currentMode) {
      case ModeManager.MODE_TYPES.COMBAT:
        // 战斗模式需要快速响应
        await this.sleep(200);
        break;
      case ModeManager.MODE_TYPES.MAIN:
        // 主模式正常间隔
        await this.sleep(100);
        break;
      default:
        // 其他模式默认间隔
        await this.sleep(500);
        break;
    }
  }

  /**
   * 评估任务
   *
   * 对应 maicraft 的 judge_task()
   */
  private async evaluateTask(): Promise<void> {
    try {
      const { gameState } = this.state.context;
      const { memory, planningManager } = this.state;

      // 构建评估数据
      const evaluationData = {
        goal: this.state.goal,
        current_task: planningManager?.getCurrentTask()?.title || '暂无任务',
        position: `位置: (${gameState.blockPosition.x}, ${gameState.blockPosition.y}, ${gameState.blockPosition.z})`,
        inventory: gameState.getInventoryDescription?.() || '空',
        recent_decisions: memory.buildContextSummary({
          includeDecisions: 10,
        }),
        recent_thoughts: memory.buildContextSummary({
          includeThoughts: 5,
        }),
      };

      // 生成评估提示词
      const prompt = promptManager.generatePrompt('task_evaluation', evaluationData);

      // 使用系统提示词模板
      const systemPrompt = promptManager.generatePrompt('task_evaluation_system', {
        bot_name: this.state.context.gameState.playerName || 'Bot',
        player_name: this.state.context.gameState.playerName || 'Player',
      });
      const userPrompt = prompt;

      const response = await this.llmManager.chatCompletion(userPrompt, systemPrompt);
      const evaluation = response.success ? response.content : null;

      if (evaluation) {
        // 记录评估结果
        this.state.memory.recordThought(`[任务评估] ${evaluation}`);
        this.logger.info(`📊 任务评估完成`);
      }
    } catch (error) {
      this.logger.error('❌ 任务评估异常', undefined, error as Error);
    }
  }
}

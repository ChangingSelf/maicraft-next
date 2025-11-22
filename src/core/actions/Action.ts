/**
 * 动作基类和接口
 */

import { RuntimeContext } from '@/core/context/RuntimeContext';
import { ActionResult, BaseActionParams } from './types';

/**
 * 动作接口
 */
export interface Action<P extends BaseActionParams = BaseActionParams> {
  /**
   * 动作唯一标识
   */
  readonly id: string;

  /**
   * 动作名称
   */
  readonly name: string;

  /**
   * 动作描述
   */
  readonly description: string;

  /**
   * 执行动作
   */
  execute(context: RuntimeContext, params: P): Promise<ActionResult>;

  /**
   * 验证参数
   */
  validateParams?(params: P): boolean;

  /**
   * 获取参数 Schema（用于 LLM 工具调用）
   */
  getParamsSchema?(): any;

  /**
   * 判断动作是否应该激活（是否在提示词中显示）
   * 默认返回 true（始终激活）
   */
  shouldActivate?(context: RuntimeContext): boolean;
}

/**
 * 动作基类
 */
export abstract class BaseAction<P extends BaseActionParams = BaseActionParams> implements Action<P> {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;

  abstract execute(context: RuntimeContext, params: P): Promise<ActionResult>;

  /**
   * 验证参数（默认实现）
   */
  validateParams(params: P): boolean {
    return true;
  }

  /**
   * 获取参数 Schema（默认实现）
   */
  getParamsSchema(): any {
    return {};
  }

  /**
   * 判断动作是否应该激活（默认实现：始终激活）
   */
  shouldActivate(_context: RuntimeContext): boolean {
    return true;
  }

  /**
   * 创建成功结果
   */
  protected success(message: string, data?: any): ActionResult {
    return {
      success: true,
      message,
      data,
    };
  }

  /**
   * 创建失败结果
   */
  protected failure(message: string, error?: Error, data?: any): ActionResult {
    return {
      success: false,
      message,
      error,
      data,
    };
  }
}

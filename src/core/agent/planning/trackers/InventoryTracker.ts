/**
 * 背包追踪器
 * 检查背包中的物品数量
 */

import type { TaskTracker, TaskProgress } from '../types';
import type { GameContext } from '../../types';

export class InventoryTracker implements TaskTracker {
  readonly type = 'inventory';

  constructor(
    private itemName: string,
    private targetCount: number,
    private exact: boolean = false, // 是否需要精确数量
  ) {}

  checkCompletion(context: GameContext): boolean {
    const currentCount = this.getCurrentCount(context);

    if (this.exact) {
      return currentCount === this.targetCount;
    } else {
      return currentCount >= this.targetCount;
    }
  }

  getProgress(context: GameContext): TaskProgress {
    const current = this.getCurrentCount(context);
    const target = this.targetCount;

    return {
      current,
      target,
      percentage: Math.min((current / target) * 100, 100),
      description: `${current}/${target} ${this.itemName}`,
    };
  }

  getDescription(): string {
    const operator = this.exact ? '恰好' : '至少';
    return `背包中${operator}有 ${this.targetCount} 个 ${this.itemName}`;
  }

  private getCurrentCount(context: GameContext): number {
    const inventory = context.gameState.inventory || [];

    return inventory.filter((item: any) => item.name === this.itemName).reduce((sum: number, item: any) => sum + item.count, 0);
  }

  toJSON(): any {
    return {
      type: 'inventory',
      itemName: this.itemName,
      targetCount: this.targetCount,
      exact: this.exact,
    };
  }

  static fromJSON(json: any): InventoryTracker {
    return new InventoryTracker(json.itemName, json.targetCount, json.exact);
  }
}

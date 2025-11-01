/**
 * 制作追踪器
 * 检查是否制作了指定物品（通过背包增量检测）
 */

import type { TaskTracker, TaskProgress } from '../types';
import type { GameContext } from '../../types';

export class CraftTracker implements TaskTracker {
  readonly type = 'craft';

  private initialCount: number = 0;
  private initialized: boolean = false;

  constructor(
    private itemName: string,
    private targetCount: number,
  ) {}

  checkCompletion(context: GameContext): boolean {
    if (!this.initialized) {
      this.initialize(context);
    }

    const currentCount = this.getCurrentCount(context);
    const crafted = currentCount - this.initialCount;

    return crafted >= this.targetCount;
  }

  getProgress(context: GameContext): TaskProgress {
    if (!this.initialized) {
      this.initialize(context);
    }

    const currentCount = this.getCurrentCount(context);
    const crafted = currentCount - this.initialCount;

    return {
      current: crafted,
      target: this.targetCount,
      percentage: Math.min((crafted / this.targetCount) * 100, 100),
      description: `已制作 ${crafted}/${this.targetCount} ${this.itemName}`,
    };
  }

  getDescription(): string {
    return `制作 ${this.targetCount} 个 ${this.itemName}`;
  }

  private initialize(context: GameContext): void {
    this.initialCount = this.getCurrentCount(context);
    this.initialized = true;
  }

  private getCurrentCount(context: GameContext): number {
    const inventory = context.gameState.inventory || [];

    return inventory.filter((item: any) => item.name === this.itemName).reduce((sum: number, item: any) => sum + item.count, 0);
  }

  toJSON(): any {
    return {
      type: 'craft',
      itemName: this.itemName,
      targetCount: this.targetCount,
      initialCount: this.initialCount,
      initialized: this.initialized,
    };
  }

  static fromJSON(json: any): CraftTracker {
    const tracker = new CraftTracker(json.itemName, json.targetCount);
    tracker.initialCount = json.initialCount || 0;
    tracker.initialized = json.initialized || false;
    return tracker;
  }
}

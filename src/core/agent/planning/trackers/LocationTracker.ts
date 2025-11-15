/**
 * 位置追踪器
 * 检查是否到达指定位置
 */

import type { TaskTracker, TaskProgress } from '@/core/agent/planning/types';
import type { GameContext } from '@/core/agent/types';

export class LocationTracker implements TaskTracker {
  readonly type = 'location';

  constructor(
    private targetX: number,
    private targetY: number,
    private targetZ: number,
    private radius: number = 3, // 到达半径
  ) {}

  checkCompletion(context: GameContext): boolean {
    const pos = context.gameState.blockPosition;
    if (!pos) return false;

    const distance = Math.sqrt(Math.pow(pos.x - this.targetX, 2) + Math.pow(pos.y - this.targetY, 2) + Math.pow(pos.z - this.targetZ, 2));

    return distance <= this.radius;
  }

  getProgress(context: GameContext): TaskProgress {
    const pos = context.gameState.blockPosition;
    if (!pos) {
      return {
        current: 0,
        target: this.radius,
        percentage: 0,
        description: '位置未知',
      };
    }

    const distance = Math.sqrt(Math.pow(pos.x - this.targetX, 2) + Math.pow(pos.y - this.targetY, 2) + Math.pow(pos.z - this.targetZ, 2));

    const maxDistance = 100; // 假设最大距离
    const percentage = Math.max(0, (1 - distance / maxDistance) * 100);

    return {
      current: Math.floor(distance),
      target: this.radius,
      percentage,
      description: `距离目标 ${distance.toFixed(1)} 格`,
    };
  }

  getDescription(): string {
    return `到达位置 (${this.targetX}, ${this.targetY}, ${this.targetZ})`;
  }

  toJSON(): any {
    return {
      type: 'location',
      targetX: this.targetX,
      targetY: this.targetY,
      targetZ: this.targetZ,
      radius: this.radius,
    };
  }

  static fromJSON(json: any): LocationTracker {
    return new LocationTracker(json.targetX, json.targetY, json.targetZ, json.radius);
  }
}

/**
 * 组合追踪器
 * 支持 AND/OR 逻辑组合多个追踪器
 */

import type { TaskTracker, TaskProgress } from '../types';
import type { GameContext } from '../../types';

export class CompositeTracker implements TaskTracker {
  readonly type = 'composite';

  constructor(
    private trackers: TaskTracker[],
    private logic: 'and' | 'or' = 'and',
  ) {}

  checkCompletion(context: GameContext): boolean {
    if (this.logic === 'and') {
      return this.trackers.every(tracker => tracker.checkCompletion(context));
    } else {
      return this.trackers.some(tracker => tracker.checkCompletion(context));
    }
  }

  getProgress(context: GameContext): TaskProgress {
    const completedCount = this.trackers.filter(t => t.checkCompletion(context)).length;

    return {
      current: completedCount,
      target: this.trackers.length,
      percentage: (completedCount / this.trackers.length) * 100,
      description: `完成 ${completedCount}/${this.trackers.length} 个条件`,
    };
  }

  getDescription(): string {
    const descriptions = this.trackers.map(t => t.getDescription());
    const connector = this.logic === 'and' ? ' 并且 ' : ' 或者 ';
    return descriptions.join(connector);
  }

  toJSON(): any {
    return {
      type: 'composite',
      logic: this.logic,
      trackers: this.trackers.map(t => t.toJSON()),
    };
  }

  static fromJSON(json: any, trackerFactory: any): CompositeTracker {
    const trackers = json.trackers.map((t: any) => trackerFactory.fromJSON(t));
    return new CompositeTracker(trackers, json.logic);
  }
}

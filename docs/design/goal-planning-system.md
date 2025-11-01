# Goal-Planning 系统设计

> **设计目标**: 为 Minecraft AI Agent 设计面向游戏的目标-规划-任务系统

---

## 🎯 概念层次

```
Goal (目标) - "我想要达到什么？"
  ↓
Plan (计划) - "我应该怎么做？"
  ↓
Task (任务) - "我现在要执行什么？"
  ↓
Action (动作) - "我执行具体的操作"
```

### 概念定义

1. **Goal（目标）**
   - **定义**: 长期、高层次的愿望或目标状态
   - **示例**: "击败末影龙"、"建造一座城堡"、"收集全套钻石装备"
   - **特点**: 模糊、需要分解、可能需要很长时间

2. **Plan（计划）**
   - **定义**: 为实现目标而制定的步骤序列
   - **示例**: "1.收集材料 → 2.制作工具 → 3.挖掘矿石 → 4.制作装备"
   - **特点**: 有顺序、可调整、由 LLM 生成

3. **Task（任务）**
   - **定义**: 具体的、可执行的、有明确完成条件的单元
   - **示例**: "收集 64 个橡木"、"制作 1 把铁镐"、"移动到 (100, 64, 200)"
   - **特点**: 明确、可追踪、可自动检测完成

---

## 🎮 任务追踪器系统

### 核心思想

> **LLM 在创建任务时，就指定用什么追踪器来自动检测任务完成**

```typescript
/**
 * 任务追踪器接口
 * 用于自动检测任务是否完成
 */
interface TaskTracker {
  /**
   * 追踪器类型
   */
  readonly type: string;

  /**
   * 检查任务是否完成
   */
  checkCompletion(context: GameContext): boolean;

  /**
   * 获取当前进度
   */
  getProgress(context: GameContext): TaskProgress;

  /**
   * 生成描述（用于显示）
   */
  getDescription(): string;
}

/**
 * 游戏上下文（用于追踪器检查）
 */
interface GameContext {
  gameState: GameState; // 游戏状态
  blockCache: BlockCache; // 方块缓存
  containerCache: ContainerCache; // 容器缓存
  locationManager: LocationManager; // 位置管理
}

/**
 * 任务进度
 */
interface TaskProgress {
  current: number;
  target: number;
  percentage: number;
  description: string;
}
```

### 内置追踪器

#### 1. InventoryTracker - 背包追踪器

```typescript
/**
 * 背包追踪器
 * 检查背包中的物品数量
 */
class InventoryTracker implements TaskTracker {
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
    const inventory = context.gameState.inventory;

    return inventory.filter(item => item.name === this.itemName).reduce((sum, item) => sum + item.count, 0);
  }

  /**
   * 序列化（用于保存和 LLM 生成）
   */
  toJSON(): any {
    return {
      type: 'inventory',
      itemName: this.itemName,
      targetCount: this.targetCount,
      exact: this.exact,
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(json: any): InventoryTracker {
    return new InventoryTracker(json.itemName, json.targetCount, json.exact);
  }
}
```

#### 2. LocationTracker - 位置追踪器

```typescript
/**
 * 位置追踪器
 * 检查是否到达指定位置
 */
class LocationTracker implements TaskTracker {
  readonly type = 'location';

  constructor(
    private targetX: number,
    private targetY: number,
    private targetZ: number,
    private radius: number = 3, // 到达半径
  ) {}

  checkCompletion(context: GameContext): boolean {
    const pos = context.gameState.blockPosition;

    const distance = Math.sqrt(Math.pow(pos.x - this.targetX, 2) + Math.pow(pos.y - this.targetY, 2) + Math.pow(pos.z - this.targetZ, 2));

    return distance <= this.radius;
  }

  getProgress(context: GameContext): TaskProgress {
    const pos = context.gameState.blockPosition;

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
```

#### 3. CraftTracker - 制作追踪器

```typescript
/**
 * 制作追踪器
 * 检查是否制作了指定物品（通过背包增量检测）
 */
class CraftTracker implements TaskTracker {
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
    const inventory = context.gameState.inventory;

    return inventory.filter(item => item.name === this.itemName).reduce((sum, item) => sum + item.count, 0);
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
```

#### 4. BlockTracker - 方块追踪器

```typescript
/**
 * 方块追踪器
 * 检查指定位置的方块状态
 */
class BlockTracker implements TaskTracker {
  readonly type = 'block';

  constructor(
    private x: number,
    private y: number,
    private z: number,
    private expectedBlockType: string, // 期望的方块类型
    private shouldExist: boolean = true, // true: 应该存在, false: 应该不存在（被破坏）
  ) {}

  checkCompletion(context: GameContext): boolean {
    const block = context.blockCache.getBlock(this.x, this.y, this.z);

    if (!block) {
      return !this.shouldExist;
    }

    if (this.shouldExist) {
      return block.block_type === this.expectedBlockType;
    } else {
      return block.block_type !== this.expectedBlockType;
    }
  }

  getProgress(context: GameContext): TaskProgress {
    const completed = this.checkCompletion(context);

    return {
      current: completed ? 1 : 0,
      target: 1,
      percentage: completed ? 100 : 0,
      description: completed ? '已完成' : '未完成',
    };
  }

  getDescription(): string {
    if (this.shouldExist) {
      return `在 (${this.x}, ${this.y}, ${this.z}) 放置 ${this.expectedBlockType}`;
    } else {
      return `破坏 (${this.x}, ${this.y}, ${this.z}) 的 ${this.expectedBlockType}`;
    }
  }

  toJSON(): any {
    return {
      type: 'block',
      x: this.x,
      y: this.y,
      z: this.z,
      expectedBlockType: this.expectedBlockType,
      shouldExist: this.shouldExist,
    };
  }

  static fromJSON(json: any): BlockTracker {
    return new BlockTracker(json.x, json.y, json.z, json.expectedBlockType, json.shouldExist);
  }
}
```

#### 5. KillTracker - 击杀追踪器

```typescript
/**
 * 击杀追踪器
 * 检查是否击杀了指定数量的生物
 */
class KillTracker implements TaskTracker {
  readonly type = 'kill';

  private killCount: number = 0;

  constructor(
    private mobType: string,
    private targetCount: number,
  ) {}

  /**
   * 注册击杀事件监听
   */
  initialize(context: GameContext): void {
    context.gameState.context.events.on('entityDead', event => {
      if (event.entityType === this.mobType) {
        this.killCount++;
      }
    });
  }

  checkCompletion(context: GameContext): boolean {
    return this.killCount >= this.targetCount;
  }

  getProgress(context: GameContext): TaskProgress {
    return {
      current: this.killCount,
      target: this.targetCount,
      percentage: Math.min((this.killCount / this.targetCount) * 100, 100),
      description: `已击杀 ${this.killCount}/${this.targetCount} ${this.mobType}`,
    };
  }

  getDescription(): string {
    return `击杀 ${this.targetCount} 个 ${this.mobType}`;
  }

  toJSON(): any {
    return {
      type: 'kill',
      mobType: this.mobType,
      targetCount: this.targetCount,
      killCount: this.killCount,
    };
  }

  static fromJSON(json: any): KillTracker {
    const tracker = new KillTracker(json.mobType, json.targetCount);
    tracker.killCount = json.killCount || 0;
    return tracker;
  }
}
```

#### 6. CompositeTracker - 组合追踪器

```typescript
/**
 * 组合追踪器
 * 支持 AND/OR 逻辑组合多个追踪器
 */
class CompositeTracker implements TaskTracker {
  readonly type = 'composite';

  constructor(
    private trackers: TaskTracker[],
    private logic: 'AND' | 'OR' = 'AND',
  ) {}

  checkCompletion(context: GameContext): boolean {
    if (this.logic === 'AND') {
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
    const connector = this.logic === 'AND' ? ' 并且 ' : ' 或者 ';
    return descriptions.join(connector);
  }

  toJSON(): any {
    return {
      type: 'composite',
      logic: this.logic,
      trackers: this.trackers.map(t => t.toJSON()),
    };
  }

  static fromJSON(json: any): CompositeTracker {
    const trackers = json.trackers.map((t: any) => TrackerFactory.fromJSON(t));
    return new CompositeTracker(trackers, json.logic);
  }
}
```

### 追踪器工厂

```typescript
/**
 * 追踪器工厂
 * 用于创建和反序列化追踪器
 */
class TrackerFactory {
  private static trackers: Map<string, any> = new Map([
    ['inventory', InventoryTracker],
    ['location', LocationTracker],
    ['craft', CraftTracker],
    ['block', BlockTracker],
    ['kill', KillTracker],
    ['composite', CompositeTracker],
  ]);

  /**
   * 注册自定义追踪器
   */
  static register(type: string, trackerClass: any): void {
    this.trackers.set(type, trackerClass);
  }

  /**
   * 从 JSON 创建追踪器
   */
  static fromJSON(json: any): TaskTracker {
    const TrackerClass = this.trackers.get(json.type);

    if (!TrackerClass) {
      throw new Error(`未知的追踪器类型: ${json.type}`);
    }

    return TrackerClass.fromJSON(json);
  }
}
```

---

## 📋 任务系统重新设计

```typescript
/**
 * 任务
 * 具体、可执行、可追踪的单元
 */
class Task {
  readonly id: string;
  title: string;
  description: string;

  // 追踪器（核心！）
  tracker: TaskTracker;

  // 状态
  status: 'pending' | 'active' | 'completed' | 'failed';

  // 时间
  readonly createdAt: number;
  updatedAt: number;
  completedAt?: number;

  // 依赖关系
  dependencies: string[]; // 依赖的任务 ID

  // 元数据
  metadata: Record<string, any>;

  constructor(params: { title: string; description: string; tracker: TaskTracker; dependencies?: string[] }) {
    this.id = this.generateId();
    this.title = params.title;
    this.description = params.description;
    this.tracker = params.tracker;
    this.status = 'pending';
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.dependencies = params.dependencies || [];
    this.metadata = {};
  }

  /**
   * 检查任务是否完成（自动）
   */
  checkCompletion(context: GameContext): boolean {
    if (this.status === 'completed') {
      return true;
    }

    const completed = this.tracker.checkCompletion(context);

    if (completed && this.status !== 'completed') {
      this.complete();
    }

    return completed;
  }

  /**
   * 获取任务进度（自动）
   */
  getProgress(context: GameContext): TaskProgress {
    return this.tracker.getProgress(context);
  }

  /**
   * 激活任务
   */
  activate(): void {
    this.status = 'active';
    this.updatedAt = Date.now();
  }

  /**
   * 完成任务
   */
  complete(): void {
    this.status = 'completed';
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * 失败任务
   */
  fail(): void {
    this.status = 'failed';
    this.updatedAt = Date.now();
  }

  /**
   * 检查是否可以开始
   */
  canStart(completedTaskIds: Set<string>): boolean {
    if (this.status !== 'pending') {
      return false;
    }

    // 检查依赖是否都完成
    return this.dependencies.every(depId => completedTaskIds.has(depId));
  }

  /**
   * 转换为字符串
   */
  toString(context?: GameContext): string {
    const statusIcon = this.getStatusIcon();
    const progress = context ? this.getProgress(context) : null;
    const progressStr = progress ? ` (${progress.percentage.toFixed(0)}%)` : '';

    return `${statusIcon} ${this.title}${progressStr}`;
  }

  private getStatusIcon(): string {
    switch (this.status) {
      case 'pending':
        return '⏳';
      case 'active':
        return '🔄';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
    }
  }

  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 序列化
   */
  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      tracker: this.tracker.toJSON(),
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      dependencies: this.dependencies,
      metadata: this.metadata,
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(json: any): Task {
    const tracker = TrackerFactory.fromJSON(json.tracker);

    const task = new Task({
      title: json.title,
      description: json.description,
      tracker,
      dependencies: json.dependencies,
    });

    Object.assign(task, {
      id: json.id,
      status: json.status,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
      completedAt: json.completedAt,
      metadata: json.metadata,
    });

    return task;
  }
}
```

---

## 📝 计划系统

```typescript
/**
 * 计划
 * 为实现目标而制定的任务序列
 */
class Plan {
  readonly id: string;
  title: string;
  description: string;

  // 任务列表（有序）
  tasks: Task[];

  // 状态
  status: 'active' | 'completed' | 'abandoned';

  // 时间
  readonly createdAt: number;
  updatedAt: number;
  completedAt?: number;

  // 关联的目标
  goalId: string;

  constructor(params: { title: string; description: string; goalId: string; tasks?: Task[] }) {
    this.id = this.generateId();
    this.title = params.title;
    this.description = params.description;
    this.goalId = params.goalId;
    this.tasks = params.tasks || [];
    this.status = 'active';
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * 添加任务
   */
  addTask(task: Task): void {
    this.tasks.push(task);
    this.updatedAt = Date.now();
  }

  /**
   * 获取下一个可执行的任务
   */
  getNextTask(context: GameContext): Task | null {
    const completedTaskIds = new Set(this.tasks.filter(t => t.status === 'completed').map(t => t.id));

    // 找到第一个可以开始的任务
    return this.tasks.find(t => t.canStart(completedTaskIds)) || null;
  }

  /**
   * 检查计划是否完成
   */
  isCompleted(context: GameContext): boolean {
    return this.tasks.every(t => t.checkCompletion(context));
  }

  /**
   * 获取完成进度
   */
  getProgress(context: GameContext): {
    completed: number;
    total: number;
    percentage: number;
  } {
    const completed = this.tasks.filter(t => t.checkCompletion(context)).length;

    return {
      completed,
      total: this.tasks.length,
      percentage: this.tasks.length > 0 ? (completed / this.tasks.length) * 100 : 0,
    };
  }

  /**
   * 完成计划
   */
  complete(): void {
    this.status = 'completed';
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * 放弃计划
   */
  abandon(): void {
    this.status = 'abandoned';
    this.updatedAt = Date.now();
  }

  /**
   * 转换为字符串
   */
  toString(context?: GameContext): string {
    const progress = context ? this.getProgress(context) : null;
    const progressStr = progress ? ` (${progress.completed}/${progress.total})` : '';

    const taskList = this.tasks.map((t, i) => `  ${i + 1}. ${t.toString(context)}`).join('\n');

    return `📋 ${this.title}${progressStr}\n${taskList}`;
  }

  private generateId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 序列化
   */
  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      goalId: this.goalId,
      tasks: this.tasks.map(t => t.toJSON()),
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(json: any): Plan {
    const tasks = json.tasks.map((t: any) => Task.fromJSON(t));

    const plan = new Plan({
      title: json.title,
      description: json.description,
      goalId: json.goalId,
      tasks,
    });

    Object.assign(plan, {
      id: json.id,
      status: json.status,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
      completedAt: json.completedAt,
    });

    return plan;
  }
}
```

---

## 🎯 目标系统

```typescript
/**
 * 目标
 * 长期、高层次的愿望
 */
class Goal {
  readonly id: string;
  description: string;

  // 状态
  status: 'active' | 'completed' | 'abandoned';

  // 时间
  readonly createdAt: number;
  updatedAt: number;
  completedAt?: number;

  // 关联的计划
  planIds: string[];

  // 元数据
  metadata: Record<string, any>;

  constructor(description: string) {
    this.id = this.generateId();
    this.description = description;
    this.status = 'active';
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.planIds = [];
    this.metadata = {};
  }

  /**
   * 添加计划
   */
  addPlan(planId: string): void {
    if (!this.planIds.includes(planId)) {
      this.planIds.push(planId);
      this.updatedAt = Date.now();
    }
  }

  /**
   * 完成目标
   */
  complete(): void {
    this.status = 'completed';
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * 放弃目标
   */
  abandon(): void {
    this.status = 'abandoned';
    this.updatedAt = Date.now();
  }

  private generateId(): string {
    return `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 序列化
   */
  toJSON(): any {
    return {
      id: this.id,
      description: this.description,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      planIds: this.planIds,
      metadata: this.metadata,
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(json: any): Goal {
    const goal = new Goal(json.description);
    Object.assign(goal, json);
    return goal;
  }
}
```

---

## 🎮 Goal-Planning 管理器

```typescript
/**
 * Goal-Planning 管理器
 * 统一管理目标、计划和任务
 */
class GoalPlanningManager {
  private goals: Map<string, Goal> = new Map();
  private plans: Map<string, Plan> = new Map();
  private currentGoalId: string | null = null;
  private currentPlanId: string | null = null;
  private currentTaskId: string | null = null;

  private context: GameContext;
  private dataFile = 'data/goal-planning.json';

  constructor(context: GameContext) {
    this.context = context;
    this.load();

    // 启动自动检查循环
    this.startAutoCheckLoop();
  }

  /**
   * 设置当前目标
   */
  setCurrentGoal(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    this.currentGoalId = goalId;
    this.save();
    return true;
  }

  /**
   * 获取当前目标
   */
  getCurrentGoal(): Goal | null {
    return this.currentGoalId ? this.goals.get(this.currentGoalId) || null : null;
  }

  /**
   * 创建目标
   */
  createGoal(description: string): Goal {
    const goal = new Goal(description);
    this.goals.set(goal.id, goal);

    if (!this.currentGoalId) {
      this.currentGoalId = goal.id;
    }

    this.save();
    return goal;
  }

  /**
   * 创建计划
   */
  createPlan(params: { title: string; description: string; goalId: string; tasks: Task[] }): Plan {
    const plan = new Plan(params);
    this.plans.set(plan.id, plan);

    // 添加到目标
    const goal = this.goals.get(params.goalId);
    if (goal) {
      goal.addPlan(plan.id);
    }

    this.save();
    return plan;
  }

  /**
   * 获取当前计划
   */
  getCurrentPlan(): Plan | null {
    return this.currentPlanId ? this.plans.get(this.currentPlanId) || null : null;
  }

  /**
   * 设置当前计划
   */
  setCurrentPlan(planId: string): boolean {
    const plan = this.plans.get(planId);
    if (!plan) return false;

    this.currentPlanId = planId;
    this.save();
    return true;
  }

  /**
   * 获取当前任务
   */
  getCurrentTask(): Task | null {
    const plan = this.getCurrentPlan();
    if (!plan) return null;

    if (this.currentTaskId) {
      const task = plan.tasks.find(t => t.id === this.currentTaskId);
      if (task && task.status !== 'completed') {
        return task;
      }
    }

    // 查找下一个可执行的任务
    const nextTask = plan.getNextTask(this.context);
    if (nextTask) {
      this.currentTaskId = nextTask.id;
      nextTask.activate();
      this.save();
    }

    return nextTask;
  }

  /**
   * 自动检查任务完成
   * 在后台循环中运行
   */
  private async autoCheckCompletion(): Promise<void> {
    const plan = this.getCurrentPlan();
    if (!plan) return;

    // 检查所有任务的完成状态
    for (const task of plan.tasks) {
      if (task.status !== 'completed') {
        task.checkCompletion(this.context);
      }
    }

    // 检查当前任务是否完成
    const currentTask = this.getCurrentTask();
    if (currentTask && currentTask.status === 'completed') {
      this.context.logger.info(`✅ 任务完成: ${currentTask.title}`);

      // 查找下一个任务
      const nextTask = plan.getNextTask(this.context);
      if (nextTask) {
        this.currentTaskId = nextTask.id;
        nextTask.activate();
        this.context.logger.info(`🔄 开始新任务: ${nextTask.title}`);
      } else {
        // 没有更多任务，检查计划是否完成
        if (plan.isCompleted(this.context)) {
          plan.complete();
          this.context.logger.info(`✅ 计划完成: ${plan.title}`);

          // 检查目标是否完成
          this.checkGoalCompletion();
        }
      }

      this.save();
    }
  }

  /**
   * 检查目标是否完成
   */
  private checkGoalCompletion(): void {
    const goal = this.getCurrentGoal();
    if (!goal) return;

    // 检查所有计划是否都完成
    const allPlansCompleted = goal.planIds.every(planId => {
      const plan = this.plans.get(planId);
      return plan && plan.status === 'completed';
    });

    if (allPlansCompleted && goal.planIds.length > 0) {
      goal.complete();
      this.context.logger.info(`🎯 目标完成: ${goal.description}`);

      // 清空当前目标和计划
      this.currentGoalId = null;
      this.currentPlanId = null;
      this.currentTaskId = null;

      this.save();
    }
  }

  /**
   * 启动自动检查循环
   */
  private startAutoCheckLoop(): void {
    setInterval(() => {
      this.autoCheckCompletion();
    }, 1000); // 每秒检查一次
  }

  /**
   * 生成状态摘要（用于 LLM prompt）
   */
  generateStatusSummary(): string {
    const lines: string[] = [];

    const goal = this.getCurrentGoal();
    if (goal) {
      lines.push(`🎯 当前目标: ${goal.description}`);
      lines.push('');
    }

    const plan = this.getCurrentPlan();
    if (plan) {
      lines.push(plan.toString(this.context));
      lines.push('');
    }

    const currentTask = this.getCurrentTask();
    if (currentTask) {
      const progress = currentTask.getProgress(this.context);
      lines.push(`🔄 当前任务: ${currentTask.title}`);
      lines.push(`   进度: ${progress.description}`);
      lines.push(`   完成条件: ${currentTask.tracker.getDescription()}`);
    }

    return lines.join('\n');
  }

  /**
   * 保存
   */
  private async save(): Promise<void> {
    const data = {
      currentGoalId: this.currentGoalId,
      currentPlanId: this.currentPlanId,
      currentTaskId: this.currentTaskId,
      goals: Array.from(this.goals.values()).map(g => g.toJSON()),
      plans: Array.from(this.plans.values()).map(p => p.toJSON()),
    };

    await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
  }

  /**
   * 加载
   */
  private async load(): Promise<void> {
    if (!fs.existsSync(this.dataFile)) return;

    try {
      const content = await fs.readFile(this.dataFile, 'utf-8');
      const data = JSON.parse(content);

      this.currentGoalId = data.currentGoalId;
      this.currentPlanId = data.currentPlanId;
      this.currentTaskId = data.currentTaskId;

      this.goals.clear();
      for (const goalData of data.goals || []) {
        const goal = Goal.fromJSON(goalData);
        this.goals.set(goal.id, goal);
      }

      this.plans.clear();
      for (const planData of data.plans || []) {
        const plan = Plan.fromJSON(planData);
        this.plans.set(plan.id, plan);
      }
    } catch (error) {
      console.error('加载 Goal-Planning 数据失败:', error);
    }
  }
}
```

---

## 🤖 LLM 如何使用这套系统

### 1. 制定目标和计划

**Prompt 示例**:

```
你是一个 Minecraft AI。当前目标：收集全套铁装备

请制定一个计划来实现这个目标。计划应该包含具体的任务，每个任务都需要指定追踪器。

可用的追踪器类型：
- inventory: 检查背包中的物品数量
  格式: { type: "inventory", itemName: "iron_ingot", targetCount: 24 }

- craft: 检查是否制作了物品
  格式: { type: "craft", itemName: "iron_pickaxe", targetCount: 1 }

- location: 检查是否到达位置
  格式: { type: "location", targetX: 100, targetY: 64, targetZ: 200, radius: 3 }

- block: 检查方块状态
  格式: { type: "block", x: 100, y: 64, z: 200, expectedBlockType: "chest", shouldExist: true }

- composite: 组合多个条件
  格式: { type: "composite", logic: "AND", trackers: [...] }

请输出 JSON 格式的计划：
{
  "title": "计划标题",
  "description": "计划描述",
  "tasks": [
    {
      "title": "任务1",
      "description": "任务描述",
      "tracker": { ... },
      "dependencies": []  // 依赖的任务索引
    },
    ...
  ]
}
```

**LLM 输出**:

```json
{
  "title": "收集全套铁装备",
  "description": "挖掘铁矿，制作全套铁装备",
  "tasks": [
    {
      "title": "收集24个铁锭",
      "description": "挖掘铁矿并熔炼成铁锭",
      "tracker": {
        "type": "inventory",
        "itemName": "iron_ingot",
        "targetCount": 24
      },
      "dependencies": []
    },
    {
      "title": "制作铁头盔",
      "description": "使用5个铁锭制作铁头盔",
      "tracker": {
        "type": "inventory",
        "itemName": "iron_helmet",
        "targetCount": 1
      },
      "dependencies": [0]
    },
    {
      "title": "制作铁胸甲",
      "description": "使用8个铁锭制作铁胸甲",
      "tracker": {
        "type": "inventory",
        "itemName": "iron_chestplate",
        "targetCount": 1
      },
      "dependencies": [0]
    },
    {
      "title": "制作铁护腿",
      "description": "使用7个铁锭制作铁护腿",
      "tracker": {
        "type": "inventory",
        "itemName": "iron_leggings",
        "targetCount": 1
      },
      "dependencies": [0]
    },
    {
      "title": "制作铁靴子",
      "description": "使用4个铁锭制作铁靴子",
      "tracker": {
        "type": "inventory",
        "itemName": "iron_boots",
        "targetCount": 1
      },
      "dependencies": [0]
    }
  ]
}
```

### 2. 执行任务

**Prompt 示例**:

```
当前任务：收集24个铁锭
进度：12/24 (50%)
完成条件：背包中至少有 24 个 iron_ingot

你现在应该执行什么动作？

可用动作：
- find_block: 寻找方块
- mine_block: 挖掘方块
- move: 移动到坐标
- craft: 制作物品
- use_furnace: 使用熔炉
... [其他动作]

请输出 JSON 格式的动作序列。
```

**LLM 输出**:

```json
[
  {
    "action_type": "find_block",
    "block": "iron_ore",
    "radius": 16
  },
  {
    "action_type": "mine_block",
    "name": "iron_ore",
    "count": 12
  }
]
```

### 3. 检查完成并制定下一个计划

**系统自动检查**：不需要 LLM 参与

- 每秒自动检查任务追踪器
- 任务完成时自动激活下一个任务
- 计划完成时通知 LLM 制定新计划

**Prompt 示例（计划完成后）**:

```
✅ 计划"收集全套铁装备"已完成！

当前目标：击败末影龙
已完成的计划：
- 收集全套铁装备 ✅

请制定下一个计划来推进目标。
```

---

## 📦 配置文件支持

```toml
# config.toml

[agent]
# 初始目标
initial_goals = [
  "收集全套钻石装备",
  "建造一座房子",
]

# 是否自动开始第一个目标
auto_start_first_goal = true

# 是否在完成目标后自动选择下一个
auto_continue = true

[agent.planning]
# 自动检查任务完成的间隔（毫秒）
auto_check_interval = 1000

# 是否在任务完成时记录到经验记忆
record_to_experience = true
```

```typescript
/**
 * 从配置初始化目标
 */
class GoalPlanningManager {
  async initializeFromConfig(config: Config): Promise<void> {
    const initialGoals = config.agent.initial_goals || [];

    for (const goalDesc of initialGoals) {
      const goal = this.createGoal(goalDesc);
      this.context.logger.info(`📝 创建初始目标: ${goalDesc}`);
    }

    if (config.agent.auto_start_first_goal && this.goals.size > 0) {
      const firstGoal = Array.from(this.goals.values())[0];
      this.setCurrentGoal(firstGoal.id);
      this.context.logger.info(`🎯 开始目标: ${firstGoal.description}`);

      // 提示 LLM 制定计划
      await this.requestPlanFromLLM(firstGoal);
    }
  }

  private async requestPlanFromLLM(goal: Goal): Promise<void> {
    // 生成提示词，请求 LLM 制定计划
    // ...
  }
}
```

---

## 🎯 总结

### 核心改进

1. **任务追踪器系统** ✅
   - 自动检测任务完成，无需 LLM 判断
   - LLM 在创建任务时指定追踪器
   - 支持多种追踪器类型，易于扩展

2. **清晰的层次** ✅
   - Goal: 长期愿望
   - Plan: 步骤序列
   - Task: 具体单元

3. **游戏化设计** ✅
   - 去除人类待办清单的特性（截止时间等）
   - 专注于游戏内的条件检查
   - 与游戏状态深度集成

4. **自动化管理** ✅
   - 自动检查任务完成
   - 自动激活下一个任务
   - 自动记录到经验记忆

5. **LLM 友好** ✅
   - 清晰的 JSON 接口
   - 详细的追踪器说明
   - 自动生成 prompt

---

_版本: v4.0_  
_创建日期: 2024-11-01_  
_面向游戏 AI 的设计_

# 记忆系统与任务系统设计

> **设计目标**: 模块化、可扩展的记忆和任务管理系统

---

## 🎯 问题 1: 记忆组件的分离与扩展

### 为什么事件系统要分离？

**原因**:

1. **职责独立**: 游戏事件是外部输入，与 AI 内部记忆是不同层面
2. **生命周期不同**: 事件需要即时处理，记忆需要持久化
3. **访问模式不同**: 事件是推送模式，记忆是查询模式
4. **数据量级不同**: 事件流量大，记忆需要精简

### 记忆组件的模块化设计

```typescript
/**
 * 记忆系统架构
 *
 * Memory System (抽象层)
 *   ├─ ThoughtMemory (思考记忆)
 *   ├─ ConversationMemory (对话记忆)
 *   ├─ DecisionMemory (决策记忆)
 *   ├─ ExperienceMemory (经验记忆) - 可扩展
 *   └─ SemanticMemory (语义记忆) - 可扩展
 */

/**
 * 记忆存储接口
 * 所有记忆模块都实现此接口
 */
interface MemoryStore<T> {
  /**
   * 添加记忆
   */
  add(entry: T): void;

  /**
   * 查询记忆
   */
  query(options: QueryOptions): T[];

  /**
   * 获取最近的记忆
   */
  getRecent(count: number): T[];

  /**
   * 搜索记忆（可选，用于语义搜索）
   */
  search?(query: string, limit: number): T[];

  /**
   * 清除旧记忆
   */
  cleanup(strategy: CleanupStrategy): void;

  /**
   * 保存到磁盘
   */
  save(): Promise<void>;

  /**
   * 从磁盘加载
   */
  load(): Promise<void>;

  /**
   * 获取统计信息
   */
  getStats(): MemoryStats;
}

/**
 * 查询选项
 */
interface QueryOptions {
  timeRange?: [number, number];
  limit?: number;
  filter?: (entry: any) => boolean;
  sortBy?: 'timestamp' | 'relevance';
}

/**
 * 清理策略
 */
interface CleanupStrategy {
  maxEntries?: number; // 最大条目数
  maxAge?: number; // 最大保存时间（毫秒）
  keepImportant?: boolean; // 保留重要记忆
}

/**
 * 记忆统计
 */
interface MemoryStats {
  totalEntries: number;
  oldestTimestamp: number;
  newestTimestamp: number;
  sizeInBytes: number;
}

/**
 * 思考记忆存储
 */
class ThoughtMemory implements MemoryStore<ThoughtEntry> {
  private entries: ThoughtEntry[] = [];
  private maxEntries = 50;
  private dataFile = 'data/memory/thoughts.json';

  add(entry: ThoughtEntry): void {
    this.entries.push(entry);
    this.cleanup({ maxEntries: this.maxEntries });
  }

  query(options: QueryOptions): ThoughtEntry[] {
    let results = [...this.entries];

    // 时间范围过滤
    if (options.timeRange) {
      const [start, end] = options.timeRange;
      results = results.filter(e => e.timestamp >= start && e.timestamp <= end);
    }

    // 自定义过滤
    if (options.filter) {
      results = results.filter(options.filter);
    }

    // 限制数量
    if (options.limit) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  getRecent(count: number): ThoughtEntry[] {
    return this.entries.slice(-count);
  }

  cleanup(strategy: CleanupStrategy): void {
    // 按最大条目数清理
    if (strategy.maxEntries && this.entries.length > strategy.maxEntries) {
      this.entries = this.entries.slice(-strategy.maxEntries);
    }

    // 按时间清理
    if (strategy.maxAge) {
      const cutoffTime = Date.now() - strategy.maxAge;
      this.entries = this.entries.filter(e => e.timestamp > cutoffTime);
    }
  }

  async save(): Promise<void> {
    await fs.writeFile(this.dataFile, JSON.stringify(this.entries, null, 2));
  }

  async load(): Promise<void> {
    if (fs.existsSync(this.dataFile)) {
      const content = await fs.readFile(this.dataFile, 'utf-8');
      this.entries = JSON.parse(content);
    }
  }

  getStats(): MemoryStats {
    return {
      totalEntries: this.entries.length,
      oldestTimestamp: this.entries[0]?.timestamp || 0,
      newestTimestamp: this.entries[this.entries.length - 1]?.timestamp || 0,
      sizeInBytes: JSON.stringify(this.entries).length,
    };
  }
}

/**
 * 对话记忆存储
 */
class ConversationMemory implements MemoryStore<ConversationEntry> {
  private entries: ConversationEntry[] = [];
  private maxEntries = 100;
  private dataFile = 'data/memory/conversations.json';

  // 实现 MemoryStore 接口...
  // 可以添加对话特有的方法，如按说话人过滤等

  /**
   * 获取与特定玩家的对话
   */
  getConversationWith(playerName: string, limit: number = 10): ConversationEntry[] {
    return this.entries
      .filter(e => (e.speaker === 'player' && e.context?.username === playerName) || (e.speaker === 'ai' && e.context?.replyTo === playerName))
      .slice(-limit);
  }
}

/**
 * 决策记忆存储
 */
class DecisionMemory implements MemoryStore<DecisionEntry> {
  private entries: DecisionEntry[] = [];
  private maxEntries = 200;
  private dataFile = 'data/memory/decisions.json';

  // 实现 MemoryStore 接口...

  /**
   * 获取成功的决策（用于学习）
   */
  getSuccessfulDecisions(limit: number = 20): DecisionEntry[] {
    return this.entries.filter(e => e.result === 'success').slice(-limit);
  }

  /**
   * 获取失败的决策（用于避免重复错误）
   */
  getFailedDecisions(limit: number = 20): DecisionEntry[] {
    return this.entries.filter(e => e.result === 'failed').slice(-limit);
  }

  /**
   * 分析决策成功率
   */
  analyzeSuccessRate(timeRange?: [number, number]): {
    total: number;
    successful: number;
    failed: number;
    interrupted: number;
    successRate: number;
  } {
    let decisions = this.entries;

    if (timeRange) {
      const [start, end] = timeRange;
      decisions = decisions.filter(d => d.timestamp >= start && d.timestamp <= end);
    }

    const total = decisions.length;
    const successful = decisions.filter(d => d.result === 'success').length;
    const failed = decisions.filter(d => d.result === 'failed').length;
    const interrupted = decisions.filter(d => d.result === 'interrupted').length;

    return {
      total,
      successful,
      failed,
      interrupted,
      successRate: total > 0 ? successful / total : 0,
    };
  }
}

/**
 * 经验记忆存储（可扩展）
 * 用于记录"经验教训"，如：
 * - "挖掘钻石需要铁镐"
 * - "夜晚出门容易遇到怪物"
 * - "熔炉需要燃料才能工作"
 */
class ExperienceMemory implements MemoryStore<ExperienceEntry> {
  private entries: ExperienceEntry[] = [];
  private maxEntries = 100;
  private dataFile = 'data/memory/experiences.json';

  add(entry: ExperienceEntry): void {
    // 检查是否已存在相似经验
    const existing = this.entries.find(e => this.calculateSimilarity(e.lesson, entry.lesson) > 0.8);

    if (existing) {
      // 增强现有经验
      existing.confidence += 0.1;
      existing.occurrences++;
      existing.lastOccurrence = entry.timestamp;
    } else {
      this.entries.push(entry);
    }

    this.cleanup({ maxEntries: this.maxEntries });
  }

  /**
   * 查询相关经验
   */
  queryRelevant(context: string, limit: number = 5): ExperienceEntry[] {
    return this.entries
      .map(e => ({
        entry: e,
        relevance: this.calculateSimilarity(e.lesson, context),
      }))
      .filter(r => r.relevance > 0.3)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
      .map(r => r.entry);
  }

  private calculateSimilarity(a: string, b: string): number {
    // 简单的相似度计算（实际可以用更复杂的算法）
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.size / union.size;
  }

  // 实现其他 MemoryStore 接口方法...
}

/**
 * 经验条目
 */
interface ExperienceEntry {
  id: string;
  lesson: string; // 经验教训描述
  context: string; // 发生的上下文
  confidence: number; // 置信度（0-1）
  occurrences: number; // 发生次数
  timestamp: number; // 首次学到的时间
  lastOccurrence: number; // 最后一次发生的时间
}

/**
 * 统一的记忆管理器
 */
class MemoryManager {
  private thoughts: ThoughtMemory;
  private conversations: ConversationMemory;
  private decisions: DecisionMemory;
  private experiences: ExperienceMemory;

  // 可扩展：添加新的记忆类型
  private customMemories: Map<string, MemoryStore<any>> = new Map();

  constructor() {
    this.thoughts = new ThoughtMemory();
    this.conversations = new ConversationMemory();
    this.decisions = new DecisionMemory();
    this.experiences = new ExperienceMemory();
  }

  /**
   * 注册自定义记忆类型
   */
  registerMemoryStore<T>(name: string, store: MemoryStore<T>): void {
    this.customMemories.set(name, store);
  }

  /**
   * 获取记忆存储
   */
  getMemoryStore<T>(name: string): MemoryStore<T> | undefined {
    return this.customMemories.get(name);
  }

  /**
   * 构建上下文摘要（整合所有记忆）
   */
  buildContextSummary(options: {
    includeThoughts?: number;
    includeConversations?: number;
    includeDecisions?: number;
    includeExperiences?: number;
    includeCustom?: Record<string, number>;
  }): string {
    const parts: string[] = [];

    // 思考记忆
    if (options.includeThoughts) {
      const thoughts = this.thoughts.getRecent(options.includeThoughts);
      if (thoughts.length > 0) {
        parts.push('【最近思考】');
        parts.push(thoughts.map(t => this.formatThought(t)).join('\n'));
      }
    }

    // 对话记忆
    if (options.includeConversations) {
      const conversations = this.conversations.getRecent(options.includeConversations);
      if (conversations.length > 0) {
        parts.push('\n【最近对话】');
        parts.push(conversations.map(c => this.formatConversation(c)).join('\n'));
      }
    }

    // 决策记忆
    if (options.includeDecisions) {
      const decisions = this.decisions.getRecent(options.includeDecisions);
      if (decisions.length > 0) {
        parts.push('\n【最近决策】');
        parts.push(decisions.map(d => this.formatDecision(d)).join('\n'));
      }
    }

    // 经验记忆
    if (options.includeExperiences) {
      const experiences = this.experiences.getRecent(options.includeExperiences);
      if (experiences.length > 0) {
        parts.push('\n【相关经验】');
        parts.push(experiences.map(e => this.formatExperience(e)).join('\n'));
      }
    }

    // 自定义记忆
    if (options.includeCustom) {
      for (const [name, count] of Object.entries(options.includeCustom)) {
        const store = this.customMemories.get(name);
        if (store) {
          const entries = store.getRecent(count);
          if (entries.length > 0) {
            parts.push(`\n【${name}】`);
            parts.push(entries.map(e => JSON.stringify(e)).join('\n'));
          }
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * 保存所有记忆
   */
  async saveAll(): Promise<void> {
    await Promise.all([
      this.thoughts.save(),
      this.conversations.save(),
      this.decisions.save(),
      this.experiences.save(),
      ...Array.from(this.customMemories.values()).map(store => store.save()),
    ]);
  }

  /**
   * 加载所有记忆
   */
  async loadAll(): Promise<void> {
    await Promise.all([
      this.thoughts.load(),
      this.conversations.load(),
      this.decisions.load(),
      this.experiences.load(),
      ...Array.from(this.customMemories.values()).map(store => store.load()),
    ]);
  }

  /**
   * 获取所有记忆统计
   */
  getAllStats(): Record<string, MemoryStats> {
    return {
      thoughts: this.thoughts.getStats(),
      conversations: this.conversations.getStats(),
      decisions: this.decisions.getStats(),
      experiences: this.experiences.getStats(),
      ...Object.fromEntries(Array.from(this.customMemories.entries()).map(([name, store]) => [name, store.getStats()])),
    };
  }

  // 格式化方法
  private formatThought(t: ThoughtEntry): string {
    return `${this.formatTime(t.timestamp)}: ${t.content}`;
  }

  private formatConversation(c: ConversationEntry): string {
    const speaker = c.speaker === 'ai' ? '[我]' : '[玩家]';
    return `${this.formatTime(c.timestamp)} ${speaker}: ${c.message}`;
  }

  private formatDecision(d: DecisionEntry): string {
    const icon = d.result === 'success' ? '✅' : d.result === 'failed' ? '❌' : '⚠️';
    return `${this.formatTime(d.timestamp)} ${icon} ${d.intention}`;
  }

  private formatExperience(e: ExperienceEntry): string {
    return `${e.lesson} (置信度: ${(e.confidence * 100).toFixed(0)}%, 发生次数: ${e.occurrences})`;
  }

  private formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  // 快捷访问方法
  get thought(): ThoughtMemory {
    return this.thoughts;
  }
  get conversation(): ConversationMemory {
    return this.conversations;
  }
  get decision(): DecisionMemory {
    return this.decisions;
  }
  get experience(): ExperienceMemory {
    return this.experiences;
  }
}
```

**优势**:

- ✅ **模块化**: 每种记忆类型独立，易于维护
- ✅ **可扩展**: 通过 `MemoryStore` 接口轻松添加新类型
- ✅ **统一接口**: 所有记忆存储遵循相同的接口
- ✅ **灵活查询**: 支持时间范围、过滤、排序等
- ✅ **智能清理**: 多种清理策略
- ✅ **持久化**: 独立的文件存储，易于备份
- ✅ **统计分析**: 提供详细的统计信息

---

## 🎯 问题 2: 任务系统的改进

### 原任务系统的问题

```python
# maicraft 的任务系统
❌ MaiGoal 只是简单的字符串包装
❌ ToDoItem 缺少优先级、依赖关系、截止时间
❌ check_full() 逻辑复杂，硬编码 5 个任务限制
❌ ID 生成逻辑奇怪（从 1 开始找最小可用 ID）
❌ del_task_by_id 有重复代码
❌ 缺少任务分类、标签、子任务等功能
❌ 没有任务历史记录
❌ 没有任务优先级排序
❌ need_edit 和 is_done 字段职责不清
```

### 改进的任务系统

```typescript
/**
 * 任务优先级
 */
enum TaskPriority {
  CRITICAL = 0, // 紧急且重要
  HIGH = 1, // 重要但不紧急
  MEDIUM = 2, // 一般
  LOW = 3, // 可选
}

/**
 * 任务状态
 */
enum TaskStatus {
  PENDING = 'pending', // 待开始
  IN_PROGRESS = 'in_progress', // 进行中
  BLOCKED = 'blocked', // 被阻塞
  COMPLETED = 'completed', // 已完成
  FAILED = 'failed', // 失败
  CANCELLED = 'cancelled', // 取消
}

/**
 * 任务类型
 */
enum TaskType {
  GATHER = 'gather', // 收集资源
  CRAFT = 'craft', // 制作物品
  BUILD = 'build', // 建造
  EXPLORE = 'explore', // 探索
  COMBAT = 'combat', // 战斗
  INTERACT = 'interact', // 交互
  CUSTOM = 'custom', // 自定义
}

/**
 * 任务条目
 */
class Task {
  // 基本信息
  readonly id: string;
  title: string;
  description: string;
  type: TaskType;

  // 状态
  status: TaskStatus;
  priority: TaskPriority;

  // 完成条件
  completionCriteria: CompletionCriteria;
  progress: TaskProgress;

  // 时间信息
  readonly createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  deadline?: number;

  // 关系
  parentTaskId?: string; // 父任务 ID
  subTaskIds: string[]; // 子任务 ID 列表
  dependencies: string[]; // 依赖的任务 ID
  blockedBy: string[]; // 被哪些任务阻塞

  // 标签和分类
  tags: string[];

  // 执行信息
  attempts: number; // 尝试次数
  lastError?: string; // 最后的错误信息

  // 元数据
  metadata: Record<string, any>;

  constructor(params: {
    title: string;
    description: string;
    type?: TaskType;
    priority?: TaskPriority;
    completionCriteria?: CompletionCriteria;
    deadline?: number;
    parentTaskId?: string;
    tags?: string[];
  }) {
    this.id = this.generateId();
    this.title = params.title;
    this.description = params.description;
    this.type = params.type || TaskType.CUSTOM;
    this.status = TaskStatus.PENDING;
    this.priority = params.priority || TaskPriority.MEDIUM;
    this.completionCriteria = params.completionCriteria || { type: 'manual' };
    this.progress = { current: 0, total: 1 };
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.deadline = params.deadline;
    this.parentTaskId = params.parentTaskId;
    this.subTaskIds = [];
    this.dependencies = [];
    this.blockedBy = [];
    this.tags = params.tags || [];
    this.attempts = 0;
    this.metadata = {};
  }

  /**
   * 开始任务
   */
  start(): void {
    if (this.status !== TaskStatus.PENDING) {
      throw new Error('只能开始待处理的任务');
    }

    this.status = TaskStatus.IN_PROGRESS;
    this.startedAt = Date.now();
    this.updatedAt = Date.now();
    this.attempts++;
  }

  /**
   * 更新进度
   */
  updateProgress(current: number, total?: number): void {
    this.progress.current = current;
    if (total !== undefined) {
      this.progress.total = total;
    }
    this.updatedAt = Date.now();
  }

  /**
   * 完成任务
   */
  complete(): void {
    this.status = TaskStatus.COMPLETED;
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
    this.progress.current = this.progress.total;
  }

  /**
   * 失败任务
   */
  fail(error: string): void {
    this.status = TaskStatus.FAILED;
    this.lastError = error;
    this.updatedAt = Date.now();
  }

  /**
   * 取消任务
   */
  cancel(reason?: string): void {
    this.status = TaskStatus.CANCELLED;
    if (reason) {
      this.lastError = reason;
    }
    this.updatedAt = Date.now();
  }

  /**
   * 阻塞任务
   */
  block(blockedByTaskId: string): void {
    if (!this.blockedBy.includes(blockedByTaskId)) {
      this.blockedBy.push(blockedByTaskId);
    }
    this.status = TaskStatus.BLOCKED;
    this.updatedAt = Date.now();
  }

  /**
   * 解除阻塞
   */
  unblock(taskId: string): void {
    this.blockedBy = this.blockedBy.filter(id => id !== taskId);
    if (this.blockedBy.length === 0 && this.status === TaskStatus.BLOCKED) {
      this.status = TaskStatus.PENDING;
    }
    this.updatedAt = Date.now();
  }

  /**
   * 检查是否完成
   */
  isCompleted(): boolean {
    return this.status === TaskStatus.COMPLETED;
  }

  /**
   * 检查是否可以开始
   */
  canStart(): boolean {
    return this.status === TaskStatus.PENDING && this.blockedBy.length === 0;
  }

  /**
   * 检查是否超时
   */
  isOverdue(): boolean {
    if (!this.deadline) return false;
    return Date.now() > this.deadline && !this.isCompleted();
  }

  /**
   * 获取完成百分比
   */
  getCompletionPercentage(): number {
    if (this.progress.total === 0) return 0;
    return (this.progress.current / this.progress.total) * 100;
  }

  /**
   * 转换为字符串
   */
  toString(): string {
    const statusIcon = this.getStatusIcon();
    const priorityIcon = this.getPriorityIcon();
    const progress = this.getCompletionPercentage().toFixed(0);

    return `${statusIcon} ${priorityIcon} [${this.id}] ${this.title} (${progress}%)`;
  }

  private getStatusIcon(): string {
    switch (this.status) {
      case TaskStatus.PENDING:
        return '⏳';
      case TaskStatus.IN_PROGRESS:
        return '🔄';
      case TaskStatus.BLOCKED:
        return '🚫';
      case TaskStatus.COMPLETED:
        return '✅';
      case TaskStatus.FAILED:
        return '❌';
      case TaskStatus.CANCELLED:
        return '🚫';
    }
  }

  private getPriorityIcon(): string {
    switch (this.priority) {
      case TaskPriority.CRITICAL:
        return '🔴';
      case TaskPriority.HIGH:
        return '🟠';
      case TaskPriority.MEDIUM:
        return '🟡';
      case TaskPriority.LOW:
        return '🟢';
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
      type: this.type,
      status: this.status,
      priority: this.priority,
      completionCriteria: this.completionCriteria,
      progress: this.progress,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      deadline: this.deadline,
      parentTaskId: this.parentTaskId,
      subTaskIds: this.subTaskIds,
      dependencies: this.dependencies,
      blockedBy: this.blockedBy,
      tags: this.tags,
      attempts: this.attempts,
      lastError: this.lastError,
      metadata: this.metadata,
    };
  }

  /**
   * 反序列化
   */
  static fromJSON(json: any): Task {
    const task = new Task({
      title: json.title,
      description: json.description,
      type: json.type,
      priority: json.priority,
      completionCriteria: json.completionCriteria,
      deadline: json.deadline,
      parentTaskId: json.parentTaskId,
      tags: json.tags,
    });

    // 恢复所有字段
    Object.assign(task, json);

    return task;
  }
}

/**
 * 完成条件
 */
interface CompletionCriteria {
  type: 'manual' | 'auto' | 'condition';
  condition?: (context: any) => boolean; // 自动检查条件
  description?: string;
}

/**
 * 任务进度
 */
interface TaskProgress {
  current: number;
  total: number;
  details?: string;
}

/**
 * 任务管理器
 */
class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private currentTaskId: string | null = null;
  private completedTasks: Task[] = []; // 完成的任务历史
  private goal: Goal | null = null;

  private maxActiveTasks = 10;
  private maxCompletedTasks = 50;
  private dataFile = 'data/tasks.json';

  constructor() {
    this.load();
  }

  /**
   * 设置目标
   */
  setGoal(goal: Goal): void {
    this.goal = goal;
    this.save();
  }

  /**
   * 获取目标
   */
  getGoal(): Goal | null {
    return this.goal;
  }

  /**
   * 创建任务
   */
  createTask(params: {
    title: string;
    description: string;
    type?: TaskType;
    priority?: TaskPriority;
    completionCriteria?: CompletionCriteria;
    deadline?: number;
    parentTaskId?: string;
    tags?: string[];
  }): Task {
    const task = new Task(params);

    // 如果有父任务，添加到父任务的子任务列表
    if (params.parentTaskId) {
      const parent = this.tasks.get(params.parentTaskId);
      if (parent) {
        parent.subTaskIds.push(task.id);
      }
    }

    this.tasks.set(task.id, task);
    this.save();

    return task;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 删除任务
   */
  deleteTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // 删除子任务
    for (const subTaskId of task.subTaskIds) {
      this.deleteTask(subTaskId);
    }

    // 从父任务中移除
    if (task.parentTaskId) {
      const parent = this.tasks.get(task.parentTaskId);
      if (parent) {
        parent.subTaskIds = parent.subTaskIds.filter(id => id !== taskId);
      }
    }

    // 移除依赖关系
    for (const [_, t] of this.tasks) {
      t.dependencies = t.dependencies.filter(id => id !== taskId);
      t.blockedBy = t.blockedBy.filter(id => id !== taskId);
    }

    this.tasks.delete(taskId);

    if (this.currentTaskId === taskId) {
      this.currentTaskId = null;
    }

    this.save();
    return true;
  }

  /**
   * 开始任务
   */
  startTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || !task.canStart()) {
      return false;
    }

    task.start();
    this.currentTaskId = taskId;
    this.save();

    return true;
  }

  /**
   * 完成任务
   */
  completeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.complete();

    // 移动到已完成列表
    this.completedTasks.push(task);
    this.tasks.delete(taskId);

    // 限制已完成任务数量
    if (this.completedTasks.length > this.maxCompletedTasks) {
      this.completedTasks.shift();
    }

    // 解除依赖此任务的其他任务的阻塞
    for (const [_, t] of this.tasks) {
      if (t.blockedBy.includes(taskId)) {
        t.unblock(taskId);
      }
    }

    // 如果是当前任务，清空
    if (this.currentTaskId === taskId) {
      this.currentTaskId = this.findNextTask()?.id || null;
    }

    // 检查父任务是否完成
    if (task.parentTaskId) {
      this.checkParentCompletion(task.parentTaskId);
    }

    this.save();
    return true;
  }

  /**
   * 检查父任务是否完成
   */
  private checkParentCompletion(parentTaskId: string): void {
    const parent = this.tasks.get(parentTaskId);
    if (!parent) return;

    // 检查所有子任务是否完成
    const allSubTasksCompleted = parent.subTaskIds.every(id => {
      const subTask = this.tasks.get(id);
      return !subTask; // 不在活动列表中，说明已完成
    });

    if (allSubTasksCompleted && parent.status === TaskStatus.IN_PROGRESS) {
      this.completeTask(parentTaskId);
    }
  }

  /**
   * 失败任务
   */
  failTask(taskId: string, error: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.fail(error);

    if (this.currentTaskId === taskId) {
      this.currentTaskId = this.findNextTask()?.id || null;
    }

    this.save();
    return true;
  }

  /**
   * 添加任务依赖
   */
  addDependency(taskId: string, dependsOnTaskId: string): boolean {
    const task = this.tasks.get(taskId);
    const dependsOn = this.tasks.get(dependsOnTaskId);

    if (!task || !dependsOn) return false;

    // 检查循环依赖
    if (this.hasCircularDependency(taskId, dependsOnTaskId)) {
      return false;
    }

    if (!task.dependencies.includes(dependsOnTaskId)) {
      task.dependencies.push(dependsOnTaskId);
    }

    // 如果依赖的任务未完成，阻塞当前任务
    if (!dependsOn.isCompleted()) {
      task.block(dependsOnTaskId);
    }

    this.save();
    return true;
  }

  /**
   * 检查循环依赖
   */
  private hasCircularDependency(taskId: string, dependsOnTaskId: string): boolean {
    const visited = new Set<string>();
    const queue = [dependsOnTaskId];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current === taskId) {
        return true; // 发现循环
      }

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);

      const task = this.tasks.get(current);
      if (task) {
        queue.push(...task.dependencies);
      }
    }

    return false;
  }

  /**
   * 获取当前任务
   */
  getCurrentTask(): Task | null {
    return this.currentTaskId ? this.tasks.get(this.currentTaskId) || null : null;
  }

  /**
   * 暂停当前任务
   */
  pauseCurrentTask(): void {
    this.currentTaskId = null;
  }

  /**
   * 查找下一个任务（按优先级）
   */
  private findNextTask(): Task | null {
    const availableTasks = Array.from(this.tasks.values())
      .filter(t => t.canStart())
      .sort((a, b) => {
        // 先按优先级
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        // 再按创建时间
        return a.createdAt - b.createdAt;
      });

    return availableTasks[0] || null;
  }

  /**
   * 获取所有活动任务
   */
  getAllActiveTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 按优先级获取任务
   */
  getTasksByPriority(priority: TaskPriority): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.priority === priority);
  }

  /**
   * 按类型获取任务
   */
  getTasksByType(type: TaskType): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.type === type);
  }

  /**
   * 按标签获取任务
   */
  getTasksByTag(tag: string): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.tags.includes(tag));
  }

  /**
   * 获取已完成的任务
   */
  getCompletedTasks(limit?: number): Task[] {
    const tasks = [...this.completedTasks].reverse();
    return limit ? tasks.slice(0, limit) : tasks;
  }

  /**
   * 生成任务列表字符串
   */
  toString(): string {
    const lines: string[] = [];

    if (this.goal) {
      lines.push(`🎯 目标: ${this.goal.description}`);
      lines.push('');
    }

    const activeTasks = this.getAllActiveTasks();

    if (activeTasks.length === 0) {
      lines.push('📝 当前没有活动任务');
      return lines.join('\n');
    }

    lines.push(`📝 活动任务 (${activeTasks.length}):`);
    lines.push('');

    // 按优先级分组
    for (const priority of [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW]) {
      const tasks = activeTasks.filter(t => t.priority === priority);

      if (tasks.length > 0) {
        for (const task of tasks) {
          const isCurrent = task.id === this.currentTaskId;
          const prefix = isCurrent ? '👉' : '  ';
          lines.push(`${prefix} ${task.toString()}`);

          if (task.description) {
            lines.push(`     ${task.description}`);
          }

          if (task.deadline) {
            const deadlineStr = new Date(task.deadline).toLocaleString();
            lines.push(`     截止: ${deadlineStr}`);
          }

          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 保存
   */
  async save(): Promise<void> {
    const data = {
      goal: this.goal,
      currentTaskId: this.currentTaskId,
      tasks: Array.from(this.tasks.values()).map(t => t.toJSON()),
      completedTasks: this.completedTasks.map(t => t.toJSON()),
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

      this.goal = data.goal;
      this.currentTaskId = data.currentTaskId;

      this.tasks.clear();
      for (const taskData of data.tasks || []) {
        const task = Task.fromJSON(taskData);
        this.tasks.set(task.id, task);
      }

      this.completedTasks = (data.completedTasks || []).map((t: any) => Task.fromJSON(t));
    } catch (error) {
      console.error('加载任务失败:', error);
    }
  }
}

/**
 * 目标
 */
interface Goal {
  description: string;
  deadline?: number;
  completionCriteria?: string;
  metadata?: Record<string, any>;
}
```

**优势**:

- ✅ **完整的任务模型**: 优先级、依赖、子任务、标签等
- ✅ **任务状态管理**: 清晰的状态转换
- ✅ **依赖管理**: 自动阻塞和解除阻塞
- ✅ **智能排序**: 按优先级和时间自动排序
- ✅ **历史记录**: 保留已完成任务的历史
- ✅ **灵活查询**: 按优先级、类型、标签查询
- ✅ **循环依赖检测**: 防止任务依赖死锁
- ✅ **自动完成检测**: 子任务全部完成时自动完成父任务

---

## 🎯 总结

### 记忆系统改进

| 特性   | 原设计            | 新设计              |
| ------ | ----------------- | ------------------- |
| 模块化 | ❌ 混在一起       | ✅ 独立模块         |
| 可扩展 | ❌ 难以添加新类型 | ✅ 统一接口，易扩展 |
| 查询   | ❌ 硬编码数量     | ✅ 灵活查询         |
| 持久化 | ✅ 支持           | ✅ 独立文件         |
| 统计   | ❌ 无             | ✅ 详细统计         |

### 任务系统改进

| 特性     | 原设计  | 新设计        |
| -------- | ------- | ------------- |
| 任务模型 | ⚠️ 简单 | ✅ 完整       |
| 优先级   | ❌ 无   | ✅ 4级优先级  |
| 依赖管理 | ❌ 无   | ✅ 依赖+阻塞  |
| 子任务   | ❌ 无   | ✅ 层级任务   |
| 任务历史 | ❌ 无   | ✅ 完整历史   |
| 标签分类 | ❌ 无   | ✅ 灵活标签   |
| 查询功能 | ⚠️ 基础 | ✅ 多维度查询 |

---

_版本: v3.0_  
_创建日期: 2024-11-01_

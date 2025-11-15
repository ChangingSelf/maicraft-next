/**
 * 简单的依赖注入容器
 *
 * 特点：
 * - 不使用反射
 * - 使用 Map 存储工厂函数
 * - 支持单例和瞬态（每次新建）
 * - 支持异步初始化
 * - 支持生命周期管理
 *
 * 使用示例：
 * ```ts
 * // 注册
 * container.registerSingleton('logger', () => createLogger());
 * container.registerSingleton('bot', () => createBot(...));
 * container.register('action', (c) => new MyAction(c.resolve('bot')));
 *
 * // 解析
 * const logger = container.resolve<Logger>('logger');
 * const bot = container.resolve<Bot>('bot');
 * ```
 */

import { getLogger, type Logger } from '@/utils/Logger';

/**
 * 服务标识符类型
 */
export type ServiceKey = string | symbol;

/**
 * 工厂函数类型
 * @param container 容器实例，可用于解析其他依赖
 */
export type Factory<T = any> = (container: Container) => T | Promise<T>;

/**
 * 服务生命周期
 */
export enum Lifetime {
  /** 单例：整个应用生命周期只创建一次 */
  Singleton = 'singleton',
  /** 瞬态：每次解析都创建新实例 */
  Transient = 'transient',
  /** 作用域：在同一个作用域内是单例（暂未实现） */
  Scoped = 'scoped',
}

/**
 * 服务描述
 */
interface ServiceDescriptor<T = any> {
  key: ServiceKey; //服务键：服务的唯一标识
  factory: Factory<T>; //工厂函数：创建实例的函数
  lifetime: Lifetime; //生命周期：服务实例的生命周期
  instance?: T; //实例：已创建的实例
  initializer?: (instance: T) => Promise<void> | void; //初始化器：在实例创建后调用的函数
  disposer?: (instance: T) => Promise<void> | void; //销毁器：在实例销毁时调用的函数
}

/**
 * 依赖注入容器
 */
export class Container {
  private services = new Map<ServiceKey, ServiceDescriptor>(); //服务注册表：存储所有已注册的服务
  private resolving = new Set<ServiceKey>(); // 防止循环依赖
  private logger: Logger; //日志记录器：用于记录容器操作的日志

  constructor(logger?: Logger) {
    this.logger = logger || getLogger('Container');
  }

  /**
   * 注册单例服务
   */
  registerSingleton<T>(key: ServiceKey, factory: Factory<T>): this {
    return this.register(key, factory, Lifetime.Singleton);
  }

  /**
   * 注册瞬态服务（每次解析都创建新实例）
   */
  registerTransient<T>(key: ServiceKey, factory: Factory<T>): this {
    return this.register(key, factory, Lifetime.Transient);
  }

  /**
   * 注册服务
   */
  register<T>(key: ServiceKey, factory: Factory<T>, lifetime: Lifetime = Lifetime.Singleton): this {
    if (this.services.has(key)) {
      this.logger.warn(`服务 ${String(key)} 已存在，将被覆盖`);
    }

    this.services.set(key, {
      key,
      factory,
      lifetime,
    });

    this.logger.debug(`注册服务: ${String(key)} (${lifetime})`);
    return this;
  }

  /**
   * 注册已存在的实例（作为单例）
   */
  registerInstance<T>(key: ServiceKey, instance: T): this {
    this.services.set(key, {
      key,
      factory: () => instance,
      lifetime: Lifetime.Singleton,
      instance,
    });

    this.logger.debug(`注册实例: ${String(key)}`);
    return this;
  }

  /**
   * 为服务添加初始化器（在首次创建后调用）
   */
  withInitializer<T>(key: ServiceKey, initializer: (instance: T) => Promise<void> | void): this {
    const descriptor = this.services.get(key);
    if (!descriptor) {
      throw new Error(`服务 ${String(key)} 未注册`);
    }

    descriptor.initializer = initializer;
    return this;
  }

  /**
   * 为服务添加销毁器（在容器销毁时调用）
   */
  withDisposer<T>(key: ServiceKey, disposer: (instance: T) => Promise<void> | void): this {
    const descriptor = this.services.get(key);
    if (!descriptor) {
      throw new Error(`服务 ${String(key)} 未注册`);
    }

    descriptor.disposer = disposer;
    return this;
  }

  /**
   * 解析服务
   */
  resolve<T>(key: ServiceKey): T {
    const descriptor = this.services.get(key) as ServiceDescriptor<T>;
    if (!descriptor) {
      throw new Error(`服务 ${String(key)} 未注册`);
    }

    // 检测循环依赖
    if (this.resolving.has(key)) {
      const chain = Array.from(this.resolving)
        .map(k => String(k))
        .join(' -> ');
      throw new Error(`检测到循环依赖: ${chain} -> ${String(key)}`);
    }

    // 如果是单例且已创建，直接返回
    if (descriptor.lifetime === Lifetime.Singleton && descriptor.instance !== undefined) {
      return descriptor.instance as T;
    }

    try {
      // 标记正在解析
      this.resolving.add(key);

      // 调用工厂函数创建实例
      const instance = descriptor.factory(this);

      // 如果是 Promise，需要等待
      if (instance instanceof Promise) {
        throw new Error(`resolve() 不支持异步工厂，请使用 resolveAsync() 解析 ${String(key)}`);
      }

      // 如果是单例，保存实例
      if (descriptor.lifetime === Lifetime.Singleton) {
        descriptor.instance = instance;
      }

      // 调用初始化器（同步）
      if (descriptor.initializer && descriptor.lifetime === Lifetime.Singleton) {
        const result = descriptor.initializer(instance);
        if (result instanceof Promise) {
          throw new Error(`resolve() 不支持异步初始化器，请使用 resolveAsync() 解析 ${String(key)}`);
        }
      }

      return instance as T;
    } finally {
      // 解析完成，移除标记
      this.resolving.delete(key);
    }
  }

  /**
   * 异步解析服务（支持异步工厂和初始化器）
   */
  async resolveAsync<T>(key: ServiceKey): Promise<T> {
    const descriptor = this.services.get(key);
    if (!descriptor) {
      throw new Error(`服务 ${String(key)} 未注册`);
    }

    // 检测循环依赖
    if (this.resolving.has(key)) {
      const chain = Array.from(this.resolving)
        .map(k => String(k))
        .join(' -> ');
      throw new Error(`检测到循环依赖: ${chain} -> ${String(key)}`);
    }

    // 如果是单例且已创建，直接返回
    if (descriptor.lifetime === Lifetime.Singleton && descriptor.instance !== undefined) {
      return descriptor.instance as T;
    }

    try {
      // 标记正在解析
      this.resolving.add(key);

      // 调用工厂函数创建实例
      const instance = await descriptor.factory(this);

      // 如果是单例，保存实例
      if (descriptor.lifetime === Lifetime.Singleton) {
        descriptor.instance = instance;
      }

      // 调用初始化器
      if (descriptor.initializer && descriptor.lifetime === Lifetime.Singleton) {
        await descriptor.initializer(instance);
      }

      return instance as T;
    } finally {
      // 解析完成，移除标记
      this.resolving.delete(key);
    }
  }

  /**
   * 检查服务是否已注册
   */
  has(key: ServiceKey): boolean {
    return this.services.has(key);
  }

  /**
   * 获取所有已注册的服务键
   */
  getRegisteredKeys(): ServiceKey[] {
    return Array.from(this.services.keys());
  }

  /**
   * 清除所有服务（不会调用销毁器）
   */
  clear(): void {
    this.services.clear();
    this.logger.info('容器已清空');
  }

  /**
   * 销毁容器（会调用所有单例的销毁器）
   */
  async dispose(): Promise<void> {
    this.logger.info('正在销毁容器...');

    const disposers: Array<Promise<void>> = [];

    for (const descriptor of this.services.values()) {
      // 只销毁已创建的单例
      if (descriptor.lifetime === Lifetime.Singleton && descriptor.instance !== undefined && descriptor.disposer) {
        try {
          const result = descriptor.disposer(descriptor.instance);
          if (result instanceof Promise) {
            disposers.push(result);
          }
        } catch (error) {
          this.logger.error(`销毁服务 ${String(descriptor.key)} 失败`, undefined, error as Error);
        }
      }
    }

    // 等待所有异步销毁完成
    await Promise.all(disposers);

    this.services.clear();
    this.logger.info('容器已销毁');
  }

  /**
   * 创建子容器（继承父容器的服务）
   */
  createChild(): Container {
    const child = new Container(this.logger);
    // 浅复制父容器的服务注册（不包括实例）
    for (const [key, descriptor] of this.services.entries()) {
      child.services.set(key, {
        key: descriptor.key,
        factory: descriptor.factory,
        lifetime: descriptor.lifetime,
        initializer: descriptor.initializer,
        disposer: descriptor.disposer,
        // 不复制实例，子容器会创建自己的实例
      });
    }
    return child;
  }
}

/**
 * 全局容器实例（可选，也可以手动创建）
 */
export const globalContainer = new Container();

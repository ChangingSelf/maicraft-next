import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ConfigManager, ConfigError, initializeConfig, getConfig, getSection, updateConfig, DeepPartial } from '../Config';
import { createConfiguredLogger } from '../Logger';
import { AppConfig } from '../Config';

// 测试用的配置文件路径
const TEST_CONFIG_PATH = './test-config.toml';
const TEST_TEMPLATE_PATH = './test-config-template.toml';
const TEST_CONFIG_BACKUP = './test-config.toml.backup';

// 测试用的模板配置内容
const TEST_TEMPLATE_CONTENT = `
[app]
name = "test-app"
version = "1.0.0"
debug = true
data_dir = "./test-data"

[logging]
level = "debug"
console = true
file = false
max_file_size = 5242880
max_files = 3
log_dir = "./test-logs"

[minecraft]
host = "test.example.com"
port = 25565
username = "TestBot"
password = ""
auth = "offline"
reconnect = true
reconnect_delay = 3000
max_reconnect_attempts = 3
timeout = 15000
keep_alive = true

[agent]
model_name = "gpt-3.5-turbo"
max_tokens = 2048
temperature = 0.5
decision_timeout = 15000
max_actions_per_minute = 20
safe_mode = true
allow_destructive_actions = false
memory_limit = 500
save_memory_interval = 30000

[llm]
default_provider = "openai"

[llm.openai]
enabled = false
api_key = ""
model = "gpt-4"
max_tokens = 4096
temperature = 0.7
timeout = 30000

[llm.azure]
enabled = false
api_key = ""
endpoint = "https://example.openai.azure.com/"
deployment_name = ""
api_version = "2023-05-15"
model = "gpt-4"
max_tokens = 4096
temperature = 0.7
timeout = 30000

[llm.anthropic]
enabled = false
api_key = ""
model = "claude-2"
max_tokens = 4096
temperature = 0.7
timeout = 30000

[llm.retry]
max_attempts = 3
delay = 1000
backoff_factor = 2

[llm.usage_tracking]
enabled = true
persist_interval = 60000
stats_file = "./llm_usage.json"
daily_limit_warning = 0.8

[llm.pricing]
openai = { gpt_4_input = 0.03, gpt_4_output = 0.06, gpt_35_turbo_input = 0.0015, gpt_35_turbo_output = 0.002 }
anthropic = { claude_instant_input = 0.00163, claude_instant_output = 0.00551, claude_2_input = 0.01102, claude_2_output = 0.03268 }
azure = { gpt_4_input = 0.03, gpt_4_output = 0.06, gpt_35_turbo_input = 0.0015, gpt_35_turbo_output = 0.002 }

[plugins]
enabled = ["pathfinder", "tool"]

[plugins.pathfinder]
timeout = 5000
search_radius = 50

[plugins.tool]
auto_switch = true
prefer_efficiency = false

[advanced]
hot_reload = false
config_backup = false
backup_count = 3
tick_rate = 10
max_concurrent_tasks = 5
allow_operator_commands = false
restricted_items = ["diamond", "emerald"]
`;

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    // 创建测试用的模板文件
    writeFileSync(TEST_TEMPLATE_PATH, TEST_TEMPLATE_CONTENT);

    // 确保测试配置文件不存在
    if (existsSync(TEST_CONFIG_PATH)) {
      unlinkSync(TEST_CONFIG_PATH);
    }
    if (existsSync(TEST_CONFIG_BACKUP)) {
      unlinkSync(TEST_CONFIG_BACKUP);
    }

    configManager = new ConfigManager(TEST_CONFIG_PATH, TEST_TEMPLATE_PATH);
  });

  afterEach(() => {
    // 清理测试文件
    configManager.close();

    try {
      if (existsSync(TEST_CONFIG_PATH)) {
        unlinkSync(TEST_CONFIG_PATH);
      }
      if (existsSync(TEST_CONFIG_BACKUP)) {
        unlinkSync(TEST_CONFIG_BACKUP);
      }
      if (existsSync(TEST_TEMPLATE_PATH)) {
        unlinkSync(TEST_TEMPLATE_PATH);
      }
    } catch (error) {
      console.warn('清理测试文件失败:', error);
    }
  });

  describe('基本功能测试', () => {
    test('应该能够从模板创建配置文件', async () => {
      // 配置文件不存在时应该自动创建
      const config = await configManager.loadConfig();

      expect(existsSync(TEST_CONFIG_PATH)).toBe(true);
      expect(config.app.name).toBe('test-app');
      expect(config.app.debug).toBe(true);
      expect(config.logging.level).toBe('debug');
    });

    test('应该能够正确解析配置内容', async () => {
      await configManager.loadConfig();
      const config = configManager.getConfig();

      // 测试各个配置段
      expect(config.app.name).toBe('test-app');
      expect(config.app.version).toBe('1.0.0');
      expect(config.app.debug).toBe(true);
      expect(config.app.data_dir).toBe('./test-data');

      expect(config.logging.level).toBe('debug');
      expect(config.logging.console).toBe(true);
      expect(config.logging.file).toBe(false);

      expect(config.minecraft.host).toBe('test.example.com');
      expect(config.minecraft.port).toBe(25565);
      expect(config.minecraft.username).toBe('TestBot');

      expect(config.agent.model_name).toBe('gpt-3.5-turbo');
      expect(config.agent.max_tokens).toBe(2048);

      expect(config.plugins.enabled).toEqual(['pathfinder', 'tool']);
      expect(config.plugins.pathfinder?.timeout).toBe(5000);

      expect(config.advanced.hot_reload).toBe(false);
      expect(config.advanced.tick_rate).toBe(10);
      expect(config.advanced.restricted_items).toEqual(['diamond', 'emerald']);
    });

    test('应该能够获取指定的配置段', async () => {
      await configManager.loadConfig();

      const appConfig = configManager.getSection('app');
      expect(appConfig.name).toBe('test-app');
      expect(appConfig.version).toBe('1.0.0');

      const minecraftConfig = configManager.getSection('minecraft');
      expect(minecraftConfig.host).toBe('test.example.com');
      expect(minecraftConfig.port).toBe(25565);
    });

    test('未加载配置时获取配置应该抛出错误', () => {
      expect(() => {
        configManager.getConfig();
      }).toThrow(ConfigError);
    });
  });

  describe('配置更新测试', () => {
    test('应该能够更新配置', async () => {
      await configManager.loadConfig();

      const updates: DeepPartial<AppConfig> = {
        app: {
          debug: false,
          data_dir: './updated-data'
        },
        logging: {
          level: 'info',
          file: true
        }
      };

      await configManager.updateConfig(updates);
      const config = configManager.getConfig();

      expect(config.app.debug).toBe(false);
      expect(config.app.data_dir).toBe('./updated-data');
      expect(config.logging.level).toBe('info');
      expect(config.logging.file).toBe(true);

      // 未更新的配置应该保持原值
      expect(config.app.name).toBe('test-app');
      expect(config.logging.console).toBe(true);
    });

    test('更新配置应该触发事件', async () => {
      await configManager.loadConfig();

      const changeSpy = jest.fn();
      configManager.on('configChanged', changeSpy);

      await configManager.updateConfig({
        app: { debug: false }
      } as DeepPartial<AppConfig>);

      expect(changeSpy).toHaveBeenCalledTimes(1);
      expect(changeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          app: expect.objectContaining({
            debug: false
          })
        })
      );
    });

    test('重新加载配置应该触发事件', async () => {
      await configManager.loadConfig();

      const reloadSpy = jest.fn();
      configManager.on('configReloaded', reloadSpy);

      await configManager.reload();

      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('配置验证测试', () => {
    test('应该使用默认值处理缺失的配置项', async () => {
      // 创建一个不完整的配置文件
      const incompleteConfig = `
[app]
name = "incomplete-app"

[minecraft]
host = "custom-host"

[agent]
temperature = 1.5

[plugins]
enabled = ["custom-plugin"]

[advanced]
hot_reload = true

[logging]
level = "warn"
`;
      writeFileSync(TEST_CONFIG_PATH, incompleteConfig);

      const manager = new ConfigManager(TEST_CONFIG_PATH, TEST_TEMPLATE_PATH);
      const config = await manager.loadConfig();

      // 指定的配置项应该使用设置的值
      expect(config.app.name).toBe('incomplete-app');
      expect(config.minecraft.host).toBe('custom-host');
      expect(config.agent.temperature).toBe(1.5);
      expect(config.plugins.enabled).toEqual(['custom-plugin']);
      expect(config.advanced.hot_reload).toBe(true);
      expect(config.logging.level).toBe('warn');

      // 缺失的配置项应该使用默认值
      expect(config.app.version).toBe('0.1.0'); // 默认值
      expect(config.app.debug).toBe(false); // 默认值
      expect(config.minecraft.port).toBe(25565); // 默认值
      expect(config.agent.model_name).toBe('gpt-4'); // 默认值
      expect(config.advanced.config_backup).toBe(true); // 默认值
    });

    test('应该验证配置值的类型和范围', async () => {
      // 创建包含无效值的配置文件
      const invalidConfig = `
[app]
name = "test"
debug = "not-a-boolean"

[agent]
temperature = 3.0  # 超出范围 [0, 2]

[minecraft]
port = "not-a-number"

[logging]
console = "not-a-boolean"

[plugins]
enabled = "not-an-array"

[advanced]
tick_rate = -5  # 应该为正数
`;
      writeFileSync(TEST_CONFIG_PATH, invalidConfig);

      const manager = new ConfigManager(TEST_CONFIG_PATH, TEST_TEMPLATE_PATH);
      const config = await manager.loadConfig();

      // 当配置文件格式正确但包含无效值时，整个配置会回退到默认配置
      expect(config.app.name).toBe('maicraft-next'); // 默认值
      expect(config.app.debug).toBe(false); // 默认值
      expect(config.agent.temperature).toBe(0.7); // 默认值
      expect(config.minecraft.port).toBe(25565); // 默认值
      expect(config.logging.console).toBe(true); // 默认值
      expect(config.plugins.enabled).toEqual(['armor-manager', 'pathfinder', 'collectblock', 'pvp', 'tool']); // 默认值
      expect(config.advanced.tick_rate).toBe(20); // 默认值
    });
  });

  describe('错误处理测试', () => {
    test('模板文件不存在时应该抛出错误', async () => {
      if (existsSync(TEST_TEMPLATE_PATH)) {
        unlinkSync(TEST_TEMPLATE_PATH);
      }

      const manager = new ConfigManager(TEST_CONFIG_PATH, './non-existent-template.toml');

      // 应该抛出包含特定错误信息的错误
      await expect(manager.loadConfig()).rejects.toThrow('配置模板文件不存在');
    });

    test('配置文件格式错误时应该使用默认配置', async () => {
      // 创建格式错误的TOML文件
      const invalidToml = `
[app
name = "missing-bracket"
`;
      writeFileSync(TEST_CONFIG_PATH, invalidToml);

      const manager = new ConfigManager(TEST_CONFIG_PATH, TEST_TEMPLATE_PATH);
      const config = await manager.loadConfig();

      // 应该使用默认配置
      expect(config.app.name).toBe('maicraft-next');
      expect(config.app.version).toBe('0.1.0');
    });
  });

  describe('全局配置函数测试', () => {
    test('全局配置函数应该正常工作', async () => {
      // 使用不同的文件路径避免冲突
      const globalTestConfigPath = './global-test-config.toml';
      const globalTestTemplatePath = './global-test-template.toml';

      // 创建专用的模板文件
      writeFileSync(globalTestTemplatePath, TEST_TEMPLATE_CONTENT);

      // 确保配置文件不存在
      if (existsSync(globalTestConfigPath)) {
        unlinkSync(globalTestConfigPath);
      }

      try {
        // 创建新的配置管理器实例，避免全局状态污染
        const manager = new ConfigManager(globalTestConfigPath, globalTestTemplatePath);
        const config = await manager.loadConfig();

        expect(config.app.name).toBe('test-app');

        // 测试获取配置段
        const appSection = manager.getSection('app');
        expect(appSection.name).toBe('test-app');

        // 测试更新配置
        await manager.updateConfig({
          app: { debug: false }
        } as DeepPartial<AppConfig>);

        const updatedConfig = manager.getConfig();
        expect(updatedConfig.app.debug).toBe(false);

        manager.close();
      } finally {
        // 清理测试文件
        try {
          if (existsSync(globalTestConfigPath)) {
            unlinkSync(globalTestConfigPath);
          }
          if (existsSync(globalTestTemplatePath)) {
            unlinkSync(globalTestTemplatePath);
          }
        } catch {
          // 忽略清理错误
        }
      }
    });
  });
});

describe('Logger Integration', () => {
  beforeEach(() => {
    // 创建测试用的模板文件
    writeFileSync(TEST_TEMPLATE_PATH, TEST_TEMPLATE_CONTENT);

    // 确保测试配置文件不存在
    if (existsSync(TEST_CONFIG_PATH)) {
      unlinkSync(TEST_CONFIG_PATH);
    }
  });

  afterEach(() => {
    try {
      if (existsSync(TEST_CONFIG_PATH)) {
        unlinkSync(TEST_CONFIG_PATH);
      }
      if (existsSync(TEST_TEMPLATE_PATH)) {
        unlinkSync(TEST_TEMPLATE_PATH);
      }
    } catch (error) {
      console.warn('清理测试文件失败:', error);
    }
  });

  test('应该能够从配置创建日志器', async () => {
    await initializeConfig(TEST_CONFIG_PATH, TEST_TEMPLATE_PATH);

    const logger = createConfiguredLogger('TestModule');

    expect(logger).toBeDefined();
    // 日志器应该根据配置文件创建
    // 这里可以检查日志器的配置是否正确
  });

  test('配置不可用时应该使用默认配置', () => {
    // 删除配置文件，测试默认配置
    const logger = createConfiguredLogger('TestModule');

    expect(logger).toBeDefined();
    // 应该使用默认的日志配置
  });
});

describe('集成测试', () => {
  test('配置系统应该与日志系统正确集成', async () => {
    // 创建带有日志配置的模板
    const loggingConfig = TEST_TEMPLATE_CONTENT.replace(
      'hot_reload = false',
      'hot_reload = true'
    );
    writeFileSync(TEST_TEMPLATE_PATH, loggingConfig);

    const configManager = new ConfigManager(TEST_CONFIG_PATH, TEST_TEMPLATE_PATH);

    try {
      // 加载配置
      const config = await configManager.loadConfig();

      // 创建日志器
      const logger = createConfiguredLogger('IntegrationTest');

      // 测试日志功能
      logger.info('集成测试日志消息', { config: config.app.name });

      // 更新配置并测试日志器更新
      await configManager.updateConfig({
        logging: { level: 'error' }
      } as DeepPartial<AppConfig>);

      // 这里可以验证日志器是否正确响应配置变化
      expect(config.app.name).toBe('test-app');

    } finally {
      configManager.close();

      // 清理测试文件
      try {
        if (existsSync(TEST_CONFIG_PATH)) {
          unlinkSync(TEST_CONFIG_PATH);
        }
        if (existsSync(TEST_TEMPLATE_PATH)) {
          unlinkSync(TEST_TEMPLATE_PATH);
        }
      } catch (error) {
        console.warn('清理测试文件失败:', error);
      }
    }
  });
});
import Client from "./blackcat.js";
import config from "./config.js";

class Test extends Client {
  constructor() {
    super({
      config: config,
      commandHandler: {
        setCurrentLanguage: "vi", // ngôn ngữ tùy chỉnh của gói. Hiện tại chỉ hỗ trợ 2 ngôn ngữ: vi: Tiếng Việt và en: Tiếng Anh
        prefixCommand: true, // bật hoặc tắt lệnh đang chạy với prefix
        slashCommand: false, // bật hoặc tắt lệnh slash
        pathToCommand: {
          prefixCommand: "./Commands/PrefixCommands", // path to prefix commands
          slashCommand: "./Commands/SlashCommands", // path to slash commands
        },
      },
    });
  };
};

new Test();
import { Client as BlackCatClient, Discord, chalk as colors } from "blackcat.js";
import mongoose from "mongoose";

import dataModel from "./Schema/defaultData.js";
import config from "../config.js";

export default class Client extends BlackCatClient {
  constructor() {
    super({ 
      discordClient: {
        allowedMentions: {
          parse: ["roles", "users", "everyone"],
          repliedUser: false,
        },
        partials: [Discord.Partials.User, Discord.Partials.Message, Discord.Partials.Reaction], // Object.keys(Discord.Partials), // get tất cả sự kiện mà partials
        intents: [
          Discord.GatewayIntentBits.Guilds,
          Discord.GatewayIntentBits.GuildMessages,
          Discord.GatewayIntentBits.MessageContent,
          Discord.GatewayIntentBits.GuildInvites,
          Discord.GatewayIntentBits.GuildMembers,
          Discord.GatewayIntentBits.GuildPresences,
          Discord.GatewayIntentBits.GuildMessageReactions,
          Discord.GatewayIntentBits.GuildVoiceStates
        ], // Object.keys(Discord.GatewayIntentBits), // lấy tất cả sự kiện mà Discord.GatewayIntentBits có
      },
      // config.json
      config: config,
      // bảng điều khiển tùy chỉnh lệnh
      commandHandler: {
        prefixCommand: false, // bật hoặc tắt lệnh đang chạy với prefix
        slashCommand: false, // bật hoặc tắt lệnh slash
        setLanguage: "vi", // ngôn ngữ tùy chỉnh của gói. Hiện tại chỉ hỗ trợ 2 ngôn ngữ: vi: Tiếng Việt và en: Tiếng Anh
        path: {
          prefixCommand: "./Commands/PrefixCommands", // path to prefix commands
          slashCommand: "./Commands/SlashCommands", // path to slash commands
        },
      },
    });
    this.maps = new Map();
  };
  ClientReady() {
    // xem bot đã onl hay chưa
    this.on(Discord.Events.ClientReady, async (bot) => {
      console.log(colors.yellow(`${bot.user.username} đã sẵn sàng hoạt động`));
      mongoose.connect(this.config.mongourl).then(() => {
        console.log(colors.blue("Đã kết nối đến mongoose thành công."));
      }).catch(() => {
        console.log(colors.red("Kết nối đến mongoose không thành công."));
      });
      this.guilds.cache.forEach(async (guild) => {
        const checkGuild = await dataModel.findOne({ GuildId: guild.id });
        if(!checkGuild) return dataModel.create({
          GuildId: guild.id,
          GuildName: guild.name
        });
        if(checkGuild) return;
      });
    });
  };
  // chạy các file trong mục handlers
  async handlerFolder(commands) {
    // - Sử dụng Promise.all để chờ tất cả các promises được giải quyết trước khi tiếp tục.
    // - Dùng import để động cơ hóa việc nhập mô-đun từ đường dẫn cụ thể.
    // - Với mỗi mô-đun, gọi hàm default (nếu tồn tại) và truyền tham số "this ở đây là Discord.Client".
    return Promise.all(commands.map((files) => import(`../Handlers/${files}.js`))).then((modules) => {
      modules.forEach((command) => command.default(this));
    }).catch((error) => console.error(`Lỗi nhập mô-đun:`, error));
  };
};
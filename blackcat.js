import { Discord, ms, chalk } from "blackcat.js";
import nodeUrl from "node:url";
import fs from "node:fs";

export default class Client extends Discord.Client {
  constructor(options) {
    super(options.discordClient || {
      allowedMentions: {
        parse: ["roles", "users", "everyone"],
        repliedUser: false,
      },
      partials: [Object.keys(Discord.Partials)],
      intents: ["Guilds", "GuildMessages", "MessageContent", "GuildMembers"],
    });
    // Các tùy chọn cấu hình config.
    this.config = options.config;
    // bảng điều khiển tùy chỉnh lệnh
    this.setEventHandler(options.commandHandler);
    // khởi chạy bot
    if(!this.config.botToken) {
      console.error("Bạn chưa set token cho bot");
    } else this.login(this.config.botToken);
  };
  // 
  async setEventHandler(options) { 
    // Khởi tạo một Discord.Collection để lưu trữ slash commands.
    this.slashCommands = new Discord.Collection();
    // Khởi tạo một Discord Collection để quản lý cooldown của lệnh.
    this.cooldowns = new Discord.Collection();
    // Khởi tạo một Discord Collection để lưu trữ các lệnh thông thường.
    this.commands = new Discord.Collection();
    // Khởi tạo một Discord Collection để lưu trữ các bí danh của lệnh.
    this.aliases = new Discord.Collection();
    // đặt ngôn ngữ hiện tại của package
    this.currentLanguage = options.setCurrentLanguage;
    // sử dụng command prefix
    if(options.prefixCommand) {
      const pathToCommand = options.pathToCommand;
      // Sử dụng fs.readdirSync để đọc danh sách thư mục trong đường dẫn và áp dụng map để duyệt qua từng thư mục.
      await Promise.all(fs.readdirSync(pathToCommand.prefixCommand).map(async(dir) => {
        // Đọc danh sách tệp tin trong mỗi thư mục và lọc ra các tệp có đuôi là ".js".
        const commands = fs.readdirSync(`${pathToCommand.prefixCommand}/${dir}/`).filter((file) => file.endsWith(".js"));
        for (let file of commands) {
          // Dùng import để đọc nội dung của mỗi tệp và thiết lập lệnh từ thuộc tính default.
          const command = await import(this.globalFilePath(`${pathToCommand.prefixCommand}/${dir}/${file}`)).then((x) => x.default);
          // Nếu lệnh có tên (pull.name), thêm vào this.commands được khai báo thì sẽ in ra commandTable với trạng thái "✔️ sẵn sàng".
          if (command.name) {
            this.commands.set(command.name, command);
          } else { // Nếu không có tên, thêm vào commandTable với trạng thái "❌ Lỗi".
            return;
          };
          // Nếu có bí danh (pull.aliases), thêm mỗi bí danh vào this.aliases.
          if (command.aliases && Array.isArray(command.aliases)) {
            command.aliases.forEach((alias) => this.aliases.set(alias, command.name));
          };
        };
      }));
      // 
      this.on(Discord.Events.MessageCreate, async(message) => await this.MessageCreate({
        message: message, 
        prefix: this.config.botPrefix 
      }));
    };
    if(options.slashCommand) {
      const pathToCommand = options.pathToCommand;
      console.log(pathToCommand.slashCommand);
      this.on(Discord.Events.InteractionCreate, (interaction) => this.InteractionCreate({
        interaction: interaction
      }));
    };
  };
  // 
  MessageCreate({ message, prefix }) {
    // Kiểm tra nếu tin nhắn không phải từ bot và bắt đầu bằng prefix đã cho
    if (!message.author.bot && message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/g); // Cắt bỏ tiền tố và khoảng trắng ở đầu và cuối nội dung tin nhắn, sau đó chia thành mảng các tham số (args).
      const commands = args.shift().toLowerCase(); // Lấy lệnh từ mảng tham số và chuyển đổi thành chữ thường.
      if (commands.length === 0) return; // Nếu độ dài của lệnh sau khi chuyển đổi thành chữ thường là 0, không làm gì cả.
      let command = this.commands.get(commands); // Lấy lệnh từ một bộ sưu tập (presumably Map) của các lệnh sử dụng tên lệnh.
      if (!command) command = this.commands.get(this.aliases.get(commands)); // Nếu không tìm thấy lệnh trực tiếp bằng tên, kiểm tra xem có lệnh nào có bí danh (alias) giống với tên lệnh không.
      if (command) {
        command.executeCommand({ client: this, message, args });
      } else return message.reply({ content: this.getLocalizedString("commandHander.prefix.mes5", { prefix: prefix }) }).then((msg) => {
        setTimeout(() => msg.delete(), ms("5s")); // tự động xóa sau 5 giây
      });
    } else { // Kiểm tra nếu bot được mention trong tin nhắn
      if (message.mentions.users.has(this.user.id)) return message.reply({ content: this.getLocalizedString("commandHander.prefix.mes6", { 
        prefix: prefix
      })});
    };
    function onCooldown(cooldowns, botMessage, commands) {
      if (!botMessage || !commands) return;
      const timestamps = cooldowns.get(commands.name) || cooldowns.set(commands.name, new Discord.Collection()).get(commands.name);
      if (timestamps.has(botMessage.member.id)) {
        const expirationTime = timestamps.get(botMessage.member.id) + commands.cooldown * 1000;
        if (Date.now() < expirationTime) return (expirationTime - Date.now()) / 1000;
        timestamps.set(botMessage.member.id, Date.now());
        setTimeout(() => timestamps.delete(botMessage.member.id), commands.cooldown * 1000);
        return false;
      };
      timestamps.set(botMessage.member.id, Date.now());
      setTimeout(() => timestamps.delete(botMessage.member.id), commands.cooldown * 1000);
      return false;
    };
  };
  //
  InteractionCreate({ interaction }) {
    console.log("InteractionCreate");
  };
  /**
   * @info Chuyển đổi đường dẫn tệp thành URL toàn cầu (global URL) sử dụng pathToFileURL của Node.js.
   * @param {string} path Đường dẫn tệp cần chuyển đổi.
   * @returns {string} URL toàn cầu hoặc đường dẫn ban đầu nếu chuyển đổi không thành công.
   */
  globalFilePath(path) {
    // Sử dụng pathToFileURL của Node.js để chuyển đổi đường dẫn thành URL. Nếu thành công, trả về href của URL; nếu không, trả về đường dẫn ban đầu.
    return nodeUrl.pathToFileURL(path).href || path;
  }; 
  /**
   * @info Hàm `getLocalizedString` dùng để lấy chuỗi dịch dựa trên khóa và thực hiện thay thế giá trị nếu cần.
   * @param {string} key Khóa để xác định chuỗi cần lấy.
   * @param {Object} [replacements] Đối tượng chứa các giá trị thay thế có thể được sử dụng.
   * @warning Không thể sử dụng hàm này bên ngoài module hoặc class chứa nó do sự phụ thuộc vào ngôn ngữ (`en` và `vi`) và biến `currentLanguage`.
   */
  getLocalizedString(key, replacements) {
    // Đối tượng chứa các chuỗi cho từng ngôn ngữ
    let languageStrings = {
            "en": {
                tokenBot: "You haven't added a token for the bot yet",
                commandHander: {
                    prefix: {
                        // command table (commandTable)
                        cmd1: "Command Name",
                        cmd2: "Status",
                        cmd3: "✔️ Ready",
                        cmd4: "❌ Error",
                        // messages in messageCreate
                        mes1: "Missing permissions",
                        mes2: "You don't have the {permissions} permission to use this command",
                        mes3: "❌ You've used the command too quickly. Please wait {timestamp} seconds before using `{cmdName}` again",
                        mes4: "You can't use this command. Only <@{developer}> can use it",
                        mes5: "Invalid command. Type {prefix}help to review all commands",
                        mes6: "Hello. My prefix is: {prefix}",
                    },
                    slash: {
                        // command table (slashTable) 
                        cmd1: "Command Name",
                        cmd2: "Status",
                        cmd3: "❌ Error",
                        cmd4: "✔️ Ready",
                        cmd5: "Error inputting {slashCmds}: {slashCmds1}",
                        // messages in interaction 
                        slash1: "Missing permissions to use the command",
                        slash2: "I'm not a foolish bot, only the owner can use this command",
                        slash3: "Sorry, you don't have the {cmd1} permission in <#{cmd2}> to use the {cmd3} command",
                        slash4: "An error occurred while executing the command. Apologies for the inconvenience <3",
                    }
                }
            }, // tiếng anh 
            "vi": {
                tokenBot: "Bạn vẫn chưa thêm token cho bot",
                commandHander: {
                    prefix: {
                        // bảng điều khiển (commandTable)
                        cmd1: "Tên Lệnh",
                        cmd2: "Trạng thái",
                        cmd3: "✔️ sẵn sàng",
                        cmd4: "❌ Lỗi",
                        // tin nhắn trong messageCreate
                        mes1: "Thiếu quyền",
                        mes2: "Bạn không có quyền {permissions} để sử dụng lệnh này",
                        mes3: "❌ Bạn đã sử dụng lệnh quá nhanh vui lòng đợi {timestamp} giây trước khi sử dụng lại `{cmdName}`",
                        mes4: "Bạn không thể sử dụng lệnh này chỉ có <@{developer}> mới có thể sử dụng",
                        mes5: "Sai lệnh. nhập {prefix}help để xem lại tất cả các lệnh",
                        mes6: "Xin chào. prefix của tôi là: {prefix}",
                    },
                    slash: {
                        // bảng điều khiển (slashTable) 
                        cmd1: "Tên Lệnh",
                        cmd2: "Trạng thái",
                        cmd3: "❌ Lỗi",
                        cmd4: "✔️ sẵn sàng",
                        cmd5: "Lỗi nhập {slashCmds}: {slashCmds1}",
                        // tin nhắn trong interaction 
                        slash1: "Thiếu quyền sử dụng lệnh",
                        slash2: "Tôi, không phải là bot ngu ngốc, chỉ chủ sở hữu mới có thể sử dụng lệnh này",
                        slash3: "Xin lỗi, bạn không có quyền {cmd1} trong <#{cmd2}> để sử dụng lệnh {cmd3} này",
                        slash4: "Đã xảy ra lỗi khi thực hiện lệnh, xin lỗi vì sự bất tiện <3",
                    }
                }
            }, // tiếng việt
    };
    // Truy cập đệ quy vào đối tượng ngôn ngữ
    let currentObj = languageStrings[this.currentLanguage];
    for (const k of key.split('.')) {
      currentObj = currentObj[k];
      if (!currentObj) return "Không tìm thấy chuỗi ký tự";
    };
    // Thực hiện thay thế các giá trị
    if (typeof currentObj === 'string' && replacements) {
      for (const [placeholder, value] of Object.entries(replacements)) {
        currentObj = currentObj.replace(`{${placeholder}}`, value);
      };
    };
    return currentObj;
  };
};

export class CommandBuilder {
  constructor(options = {}) {
    const { owner, cooldown = 3000, permissions = [], description, aliases = [], name, usage, category, executeCommand } = options;
    this.cooldown = Number(cooldown); // Thời gian hồi lệnh
    this.owner = Boolean(owner); // Lệnh chỉ dành cho người phát triển
    this.permissions = permissions; // quyền hạn để có thể dùng lệnh
    this.description = description; // Mô tả của lệnh
    this.category = category; // Thể loại lệnh, có thể sử dụng luôn tên thư mục
    this.aliases = aliases; // Tên lệnh phụ (Bí danh)
    this.usage = usage; // cách sử dụng lệnh
    this.name = name; // Tên của lệnh
    // kiểm tra xem executeCommand xem có phải là 1 function không nếu không phải thì trả về.
    if (typeof executeCommand === "function") {
      this.executeCommand = executeCommand;
    } else return;
  };
  
  toJSON() {
    return {...this};
  }
};
import { getFileNameAndFolder } from "blackcat.js";

const cmdName = getFileNameAndFolder(import.meta.url);

class CommandBuilder {
  constructor(options = {}) {
    const { owner, cooldown = 3000, permissions = [], description, aliases = [], name, usage, category, executeCommand } = options;
    this.cooldown = Number(cooldown);
    this.owner = Boolean(owner);
    this.permissions = permissions;
    this.description = description;
    this.category = category;
    this.aliases = aliases;
    this.usage = usage;
    this.name = name;
    if (typeof executeCommand === 'function') {
      this.executeCommand = executeCommand;
    } else return;
  };
  toJSON() {
    return {...this};
  }
};

class PingCommands extends CommandBuilder {
  constructor() {
    super({
      name: cmdName.fileName.name, // Tên Lệnh chính
      usage: cmdName.fileName.name, // Cách sử dụng khi dùng lệnh help.
      category: cmdName.folderName.name, // thể loại lệnh
      aliases: ["pong", "pings", "pingbot", "botping"], // lệnh phụ
      description: "Hiển thị ping của bot", // mô tả dành cho lệnh
      cooldown: 5, // thời gian hồi lệnh
      owner: false, // bật tắt chế độ dev
      permissions: [] // quyền hạn khi sử dụng lệnh
    });
    console.log(this.toJSON());
  };

  executeCommand({ client, message, args }) {
    message.reply({ content: `Ping Ping: ${client.ws.ping} ms` })
  };
};

const customCommand = new CommandBuilder({
  name: cmdName.fileName.name, // Tên Lệnh chính
  usage: cmdName.fileName.name, // Cách sử dụng khi dùng lệnh help.
  category: cmdName.folderName.name, // thể loại lệnh
  aliases: ["pong", "pings", "pingbot", "botping"], // lệnh phụ
  description: "Hiển thị ping của bot", // mô tả dành cho lệnh
  cooldown: 5, // thời gian hồi lệnh
  owner: false, // bật tắt chế độ dev
  permissions: [], // quyền hạn khi sử dụng lệnh
  executeCommand: function({ client, message, args }) {
    message.reply({ content: `Ping Ping: ${client.ws.ping} ms!!` });
  },
});

export default new PingCommands;
import Client from "./Handlers/Client.js";
import fs from "node:fs/promises";

const build = new Client();
const client = build;
/**=====================================*/
const commandFiles = await fs.readdir("./Commands/PrefixCommands/Test");
for (const file of commandFiles) {
  if (file.endsWith('.js')) {
    const command = await import(`./Commands/PrefixCommands/Test/${file}`).then((e) => e.default);
    client.commands.set(command.name, command);
  };
};

client.on('messageCreate', (message) => {
  if (message.author.bot || !message.content.startsWith(client.config.prefix)) return;
  const args = message.content.slice(client.config.prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);
  if (command) {
    command.executeCommand({ client, message, args });
  };
});
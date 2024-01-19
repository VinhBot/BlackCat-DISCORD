import fs from "node:fs/promises";
import nodeUrl from "node:url";

function globalFilePath(path) {
    return nodeUrl.pathToFileURL(path)?.href || path;
};

export default async function (client) {
    const commandFiles = await fs.readdir(globalFilePath("./Commands/PrefixCommands/Test"));
    for (const file of commandFiles) {
        if (file.endsWith('.js')) {
            const command = await import(globalFilePath(`./Commands/PrefixCommands/Test/${file}`)).then((e) => e.default);
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
};
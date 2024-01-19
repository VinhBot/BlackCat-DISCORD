export default async function messageCreate(client) {
    const command = await import(`../Commands/PrefixCommands/Test/ping.js`).then((e) => e.default);
    client.commands.set(command.name, command);
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
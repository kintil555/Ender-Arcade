const env = require('./config/env');
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require('discord.js');

env.validate();

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

const commands = commandFiles
    .map((file) => require(path.join(commandsPath, file)))
    .filter((command) => command.name && command.description)
    .map((command) => ({
        name: command.name,
        description: command.description,
        options: command.options || [],
    }));

const commandNameRegex = /^[a-z0-9_-]{1,32}$/;

function collectInvalidNames(options = [], pathPrefix = "") {
    const invalid = [];

    for (let i = 0; i < options.length; i += 1) {
        const option = options[i];
        const currentPath = pathPrefix
            ? `${pathPrefix}.options[${i}]`
            : `options[${i}]`;

        if (option.name && !commandNameRegex.test(option.name)) {
            invalid.push(`${currentPath}.name=${option.name}`);
        }

        if (Array.isArray(option.options) && option.options.length > 0) {
            invalid.push(...collectInvalidNames(option.options, currentPath));
        }
    }

    return invalid;
}

const invalidCommands = commands
    .map((cmd) => {
        const errors = [];

        if (!commandNameRegex.test(cmd.name)) {
            errors.push(`name=${cmd.name}`);
        }

        errors.push(...collectInvalidNames(cmd.options));

        return {
            name: cmd.name,
            errors,
        };
    })
    .filter((entry) => entry.errors.length > 0);

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
const clientId = env.CLIENT_ID;

(async () => {
    try {
        if (!clientId) {
            throw new Error('CLIENT_ID belum diisi di file .env');
        }

        if (invalidCommands.length > 0) {
            const invalidList = invalidCommands
                .map((cmd) => `${cmd.name} -> ${cmd.errors.join(", ")}`)
                .join("; ");
            throw new Error(`Nama command/option tidak valid: ${invalidList}. Gunakan huruf kecil, angka, '_' atau '-' (1-32 karakter).`);
        }

        console.log('Mendaftarkan global slash commands...');

        await rest.put(
            Routes.applicationCommands(clientId), // Global untuk semua server yang invite bot
            { body: commands }
        );

        console.log('Global commands berhasil didaftarkan!');
    } catch (error) {
        console.error(error);
    }
})();

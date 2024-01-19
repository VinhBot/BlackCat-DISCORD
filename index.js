import Client from "./Handlers/Client.js";

const build = new Client();

build.handlerFolder(["messageCreate"]);

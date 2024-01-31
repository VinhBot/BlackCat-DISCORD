import Client from "./Handlers/Client.js";

const build = new Client();

build.handlerFolder([
  "distube", 
]);

build.ClientReady();
import { commandBuilder as CommandBuilder, getFileNameAndFolder, } from "blackcat.js";
import { EmbedBuilders } from "../../../Handlers/functions.js";
import ytdl from "@distube/ytdl-core";
const cmdName = getFileNameAndFolder(import.meta.url);

class PingCommand extends CommandBuilder {
  constructor() {
    super({
      name: cmdName.fileName.name, // Tên Lệnh chính
      usage: cmdName.fileName.name, // Cách sử dụng khi dùng lệnh help.
      category: cmdName.folderName.name, // thể loại lệnh
      aliases: ["minfo"], // lệnh phụ
      description: "Lấy thông tin bài hát theo yêu cầu", // mô tả dành cho lệnh
      cooldown: 5, // thời gian hồi lệnh
      owner: false, // bật tắt chế độ dev
      permissions: [], // quyền hạn khi sử dụng lệnh
    });
    // console.log(super.toJSON()); // xuất ra thông tin dưới dạng json
  }
  /**
   * @Info - Thực hiện lệnh khi được yêu cầu
   * @info client: Đại diện cho đối tượng Discord.Client, thường được sử dụng để tương tác với API Discord.
   * @info message: Đối tượng biểu diễn tin nhắn trong Discord, chứa thông tin về tin nhắn và người gửi.
   * @info args: Mảng chứa các đối số được truyền vào lệnh, thường được sử dụng để xử lý thêm thông tin từ người dùng.
   * @info prefix: Tiền tố được sử dụng để kích hoạt lệnh, giúp bot nhận biết khi nào người dùng muốn sử dụng lệnh.
   */
  async executeCommand({ client, message, args, prefix }) {
    const { getInfo } = ytdl;
    const songname = args.slice(0).join(" ");
    const song = await client.distube.search(songname);
    const data = await getInfo(song[0].url).then((info) => info.videoDetails);
    return message.reply({
      embeds: [
        new EmbedBuilders({
          images: data.thumbnails[0].url,
        }),
        new EmbedBuilders({
          title: { name: `Thông tin bài hát: ${data.title}`, url: data.video_url },
          description: data.description,
          timestamp: Date.now(),
          colors: "Random"
        })
      ],
    });
  }
}

export default new PingCommand();

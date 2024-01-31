import { commandBuilder as CommandBuilder, getFileNameAndFolder, ms } from "blackcat.js";
import { EmbedBuilders } from "../../../Handlers/functions.js";
import ytdl from "@distube/ytdl-core";
const cmdName = getFileNameAndFolder(import.meta.url);
const { getInfo } = ytdl;

export default class PingCommand extends CommandBuilder {
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
  };
  /**
   * @Info - Thực hiện lệnh khi được yêu cầu
   * @info client: Đại diện cho đối tượng Discord.Client, thường được sử dụng để tương tác với API Discord.
   * @info message: Đối tượng biểu diễn tin nhắn trong Discord, chứa thông tin về tin nhắn và người gửi.
   * @info args: Mảng chứa các đối số được truyền vào lệnh, thường được sử dụng để xử lý thêm thông tin từ người dùng.
   * @info prefix: Tiền tố được sử dụng để kích hoạt lệnh, giúp bot nhận biết khi nào người dùng muốn sử dụng lệnh.
   */
  async executeCommand({ client, message, args, prefix }) {
    const song = await client.distube.search(args.slice(0).join(" "));
    const data = await getInfo(song[0].url).then((info) => info.videoDetails);
    // chuyển đổi thời gian sang múi giờ việt nam
    const inputTime = new Date(data.uploadDate);
    const vietnamTime = inputTime.toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh"
    });
    // Chuyển đổi từ tổng số giây sang phút và giây
    const minutes = Math.floor(data.lengthSeconds / 60); // Lấy số phút
    const remainingSeconds = data.lengthSeconds % 60; // Lấy số giây còn lại
    const formattedMinutes = minutes.toString().padStart(2, '0'); // Dùng padStart để thêm số 0 vào đầu chuỗi nếu cần thiết
    const formattedSeconds = remainingSeconds.toString().padStart(2, '0'); // Dùng padStart để thêm số 0 vào đầu chuỗi nếu cần thiết
    // trả về nội dung chinh
    const msg = await message.reply({
      content: "Đang lấy thông tin của bài hát....",
      embeds: [],
    });

    setTimeout(() => {
      msg.edit({
        content: "",
        embeds: [new EmbedBuilders({
          author: { name: `Tên bài hát: ${data.title}`, iconURL: data.thumbnails[4].url },
          title: { name: `Link bài hát`, url: data.video_url },
          footer: { text: message.author.username },
          images: data.thumbnails[4].url,
          timestamp: Date.now(),
          colors: "Random",
          fields: [
            { name: "Chủ sở hữu:", value: `${data.author.name} (${data.author.user})` },
            { name: "Thời gian", value: `${formattedMinutes}:${formattedSeconds}` },
            { name: "Phát hành lúc:", value: `${vietnamTime}` },
            { name: "Thể loại:", value: `${data.category}` },
            { name: "key-words:", value: `${data.keywords.join("\n")}` }
          ],
        })],
      })
    }, ms("2s"));
  };
};
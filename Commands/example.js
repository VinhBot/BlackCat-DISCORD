import { commandBuilder, getFileNameAndFolder } from "blackcat.js";

const cmdName = getFileNameAndFolder(import.meta.url);
class Command extends commandBuilder {
  constructor() {
    super({
      name: cmdName.fileName.name, // Tên Lệnh chính
      usage: cmdName.fileName.name, // Cách sử dụng khi dùng lệnh help.
      category: cmdName.folderName.name, // thể loại lệnh
      aliases: [], // lệnh phụ
      description: "", // mô tả dành cho lệnh
      cooldown: 5, // thời gian hồi lệnh
      owner: false, // bật tắt chế độ dev
      permissions: [] // quyền hạn khi sử dụng lệnh
    });
    // console.log(super.toJSON()); // xuất ra thông tin dưới dạng json
    super.executeCommand((options) => this.run(options)); // Thiết lập hàm xử lý khi lệnh được thực thi.
  };
  /** 
   * @Info - Thực hiện lệnh khi được yêu cầu
   * @info client: Đại diện cho đối tượng Discord.Client, thường được sử dụng để tương tác với API Discord.
   * @info message: Đối tượng biểu diễn tin nhắn trong Discord, chứa thông tin về tin nhắn và người gửi.
   * @info args: Mảng chứa các đối số được truyền vào lệnh, thường được sử dụng để xử lý thêm thông tin từ người dùng.
   * @info prefix: Tiền tố được sử dụng để kích hoạt lệnh, giúp bot nhận biết khi nào người dùng muốn sử dụng lệnh.
   */
  async run({ client, message, args, prefix }) {
    // code
  };
};

export default new Command();
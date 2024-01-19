import CurrencySystem from "currency-system";
import { chalk as colors } from "blackcat.js";

const EconomyHandler = class extends CurrencySystem {
  constructor(client) {
    super();
    // Đặt số tiền ngân hàng mặc định khi người dùng mới được tạo!
    this.setDefaultWalletAmount(10000); // trong ví tiền
    this.setDefaultBankAmount(10000); // trong ngân hàng
    this.setMaxWalletAmount(0); // Đặt số lượng tiền trong ví tiền tối đa mặc định mà người dùng có thể có! ở đây 0 có nghĩa là vô hạn.
    this.setMaxBankAmount(0); // Giới hạn dung lượng ngân hàng của nó ở đây 0 có nghĩa là vô hạn. 
    this.setMongoURL(client.config.mongourl, false);
    // hiển thị nếu có phiêm bản mới
    this.searchForNewUpdate(true);
    // thiết lập tiền tệ của các nước.
    this.formats = ["vi-VN", "VND"]; 
    // chạy emitting
    CurrencySystem.cs.on("debug", (debug, error) => {
      console.log(debug);
      if(error) console.error(error);
    });
    CurrencySystem.cs.on("userFetch", (user, functionName) => {
      console.log(colors.magenta(`(${functionName}) - `) + " " + colors.cyan(`Đã tìm nạp người dùng: ${client.users.cache.get(user.userID).tag}`));
    });
    CurrencySystem.cs.on("userUpdate", (oldData, newData) => {
      console.log(colors.magenta("(userUpdate) - ") + colors.green("Người dùng đã cập nhật: ") + colors.yellow(`${client.users.cache.get(newData.userID).tag}`));
    });
  };
  // Phân loại tiền theo các nước
  formatter(money) {
    const c = new Intl.NumberFormat(this.formats[0], {
      style: 'currency',
      currency: this.formats[1],
    });
    return c.format(money);
  };
};

export default (client) => client.cs = new EconomyHandler(client);
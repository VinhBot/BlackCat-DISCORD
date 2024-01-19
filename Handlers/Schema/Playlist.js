import mongoose from "mongoose";

export default mongoose.model("playlist", new mongoose.Schema({
  GuildId: { type: mongoose.Schema.Types.String, comment: "Lấy id guild mà playlist được tạo" },
  GuildName: { type: mongoose.Schema.Types.String, comment: "Lấy name guild mà playlist được tạo" },
  username: { type: mongoose.Schema.Types.String, comment: "Lấy tên người tạo playlist" },
  userId: { type: mongoose.Schema.Types.String, comment: "Lấy id người tạo playlist" },
  createTime: { type: mongoose.Schema.Types.String, comment: "Lấy thời gian playlist được tạo" }, 
  playlistName: { type: mongoose.Schema.Types.String, comment: "Tên của playlist" },
  private: {
    type: mongoose.Schema.Types.Boolean,
    default: false,
    comment: "Bật tắt chế độ ẩn playlist",
  },
  songs: {
    url: { type: mongoose.Schema.Types.Array, comment: "URL của bài hát trong youtube" },
    name: { type: mongoose.Schema.Types.Array, comment: "Tên của bài hát" }
  },
}));
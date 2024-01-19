import mongoose from "mongoose";
// Định nghĩa schema cho Autoresume
export default mongoose.model("autoresume", new mongoose.Schema({
  guildId: { type: mongoose.Schema.Types.String, required: true, comment: "Id của guild, là một trường duy nhất và bắt buộc" },
  voiceChannel: { type: mongoose.Schema.Types.String, comment: "Id của kênh voice được lưu trữ trong autoresume" },
  textChannel: { type: mongoose.Schema.Types.String, comment: "Id của kênh văn bản được lưu trữ trong autoresume" },
  filters: [{ type: mongoose.Schema.Types.Array, comment: "Danh sách các bộ lọc âm nhạc được áp dụng" }],
  repeatMode: { type: mongoose.Schema.Types.Number, comment: "Chế độ lặp lại của autoresume" },
  autoplay: { type: mongoose.Schema.Types.Boolean, comment: "Tự động phát tiếp theo hay không" },
  volume: { type: mongoose.Schema.Types.Number, comment: "Cấp độ âm lượng của autoresume" },
  currentTime: { type: mongoose.Schema.Types.Number, comment: "Thời điểm hiện tại của bài hát đang được phát" },
  songs: [
    {
      url: { type: mongoose.Schema.Types.String, comment: "Đường dẫn của bài hát" },
      memberId: { type: mongoose.Schema.Types.String, comment: "Id của thành viên liên quan đến bài hát" },
      duration: { type: mongoose.Schema.Types.Number, comment: "Thời lượng của bài hát" },
      formattedDuration: { type: mongoose.Schema.Types.String, comment: "Thời lượng được định dạng của bài hát" },
      id: { type: mongoose.Schema.Types.String, comment: "Id của bài hát" },
      isLive: { type: mongoose.Schema.Types.Boolean, comment: "Bài hát có đang được phát trực tiếp hay không" },
      name: { type: mongoose.Schema.Types.String, comment: "Tên của bài hát" },
      thumbnail: { type: mongoose.Schema.Types.String, comment: "Đường link ảnh đại diện cho bài hát" },
      type: { type: mongoose.Schema.Types.String, comment: "Loại của bài hát, ví dụ: video, audio" },
      uploader: { 
        name: { type: mongoose.Schema.Types.String, comment: "Người tải lên bài hát" },
        url: { type: mongoose.Schema.Types.String, comment: "Url người tải lên bài hát" }
      },
      views: { type: mongoose.Schema.Types.Number, comment: "Số lượt xem của bài hát" },
      source: { type: mongoose.Schema.Types.String, comment: "Nguồn cung cấp bài hát" },
    },
  ]
}));
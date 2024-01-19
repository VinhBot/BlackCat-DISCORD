import { Discord, chalk as colors } from "blackcat.js";
/**
* Chuyển đổi chuỗi kiểu nút cũ của bạn thành ButtonStyle.
* @link Documentation: https://discord-api-types.dev/api/discord-api-types-v10/enum/ButtonStyle
* @param style
* @example toButtonStyle("Primary")
*/
export function toButtonStyle(style) {
  // Các tùy chọn kiểu là tùy chọn vì vậy nếu nó không được xác định thì đừng quan tâm
  if (style == undefined) return;
  // Tổ hợp combination
  const combination = [
    { key: 'Secondary', value: Discord.ButtonStyle.Secondary },
    { key: 'Primary', value: Discord.ButtonStyle.Primary },
    { key: 'Success', value: Discord.ButtonStyle.Success },
    { key: 'Danger', value: Discord.ButtonStyle.Danger },
    { key: 'Link', value: Discord.ButtonStyle.Link }
  ];
  // Sử dụng .find(callback) để lấy combination
  const buttonstyle = combination.find((item) => item.key == style);
  // Nếu nó không tồn tại, chỉ cần trả về không có gì
  if (Number(style) >= 1 && Number(style) <= 5) return Number(style);
  if (!buttonstyle || buttonstyle == undefined) return;
  return buttonstyle.value;
};
/*========================================================
# Chỉnh sửa rút gọn Embeds <Discord.EmbedBuilder>
========================================================*/
export const EmbedBuilders = class extends Discord.EmbedBuilder {
  constructor({ author, title, colors, fields, images, description, thumbnail, timestamp, footer }) {
    super();
    if(description) super.setDescription(description);
    if(thumbnail) super.setThumbnail(thumbnail);
    if(timestamp) super.setTimestamp(timestamp);
    if(title?.name) super.setTitle(title.name);
    if(title?.url) super.setURL(title.url);
    if(fields) super.addFields(fields);
    if(author) super.setAuthor(author);
    if(footer) super.setFooter(footer);
    if(images) super.setImage(images);
    if(colors) super.setColor(colors);
  };
};
/************************************************************
 * class: ComponentBuilder
 * description: Một lớp tiện ích để xây dựng các thành phần Discord.
 * @example 
 // Tạo một nút với các tùy chọn
 const tuyChonNut = {
   customId: 'nutMau',       // ID tùy chỉnh cho nút
   label: 'Nhấn vào tôi!',   // Nhãn hiển thị trên nút
   style: 'PRIMARY',         // Kiểu của nút (PRIMARY, SECONDARY, SUCCESS, DANGER, LINK)
   disabled: false,          // Tắt hoặc bật nút (Không bắt buộc)
   emoji: '😊',              // Emoji hiển thị trên nút (Không bắt buộc)
   url: 'https://vi-du.com', // Liên kết (nếu có) khi nút được nhấn (Không bắt buộc)
 };
 // Tạo một menu lựa chọn với các tùy chọn
 const tuyChonMenu = {
   customId: 'menuLuaChon',             // ID tùy chỉnh cho menu lựa chọn
   options: [
     { label: 'Tùy chọn 1', value: 'tuyChon1' },
     { label: 'Tùy chọn 2', value: 'tuyChon2' },
   ],                                   // Các tùy chọn trong menu
   disabled: false,                     // Tắt hoặc bật menu
   maxValues: 1,                        // Số lượng tùy chọn tối đa có thể chọn
   minValues: 1,                        // Số lượng tùy chọn tối thiểu phải chọn
   placeholder: 'Chọn một tùy chọn',    // Placeholder khi không có tùy chọn nào được chọn
 };

 const builderThanhPhan = new ComponentBuilder([
  { type: 'ButtonBuilder', options: [tuyChonNut] },
  { type: 'SelectMenuBuilder', options: tuyChonMenu },
 ]);
 ************************************************************/
export class ComponentBuilder {
  /**
   * Constructor cho ComponentBuilder.
   * @param {Array} components - Mảng để lưu trữ các thành phần.
   */
  constructor(components) {
    return components.map((a) => {
      if(a.type === "ButtonBuilder") {
        return this.buildActionRow(a.options.map(this.buildButton));
      } else if(a.type === "SelectMenuBuilder") {
        return this.buildActionRow(this.buildSelectMenu(a.options));
      } else {
        return console.error(colors.red("Vui lòng chỉ định đúng loại được phép."));
      };
    }).filter(Boolean);
  };
  /**
   * Xây dựng một nút Discord.
   * @param {Object} o - Các tùy chọn của nút.
   * @returns {Discord.ButtonBuilder} - Xây dựng nút Discord.
   */
  buildButton(o) {
    const button = new Discord.ButtonBuilder()
    if(o.customId) button.setCustomId(o.customId);
    if(o.disabled) button.setDisabled(o.disabled);
    if(o.label) button.setLabel(o.label);
    if(o.style) button.setStyle(o.style);
    if(o.emoji) button.setEmoji(o.emoji);
    if(o.url) button.setURL(o.url);
    return button;
  };
  /**
   * Xây dựng một menu lựa chọn Discord.
   * @param {Object} o - Tùy chọn của menu lựa chọn.
   * @returns {Discord.StringSelectMenuBuilder} - Xây dựng menu lựa chọn Discord.
   */
  buildSelectMenu(o) {
    return new Discord.StringSelectMenuBuilder().setCustomId(o.customId).setOptions(...o.options).setDisabled(o.disabled).setMaxValues(o.maxValues).setMinValues(o.minValues).setPlaceholder(o.placeholder);
  };
  /**
   * Xây dựng một hàng động với các thành phần.
   * @param {Array|Object} components - Các thành phần để thêm vào hàng động.
   * @returns {Discord.ActionRowBuilder} - Xây dựng hàng động Discord.
   */
  buildActionRow(components) {
    const actionRow = new Discord.ActionRowBuilder();
    Array.isArray(components) ? actionRow.addComponents(...components) : actionRow.addComponents([components]);
    return actionRow;
  };
};

/*
 * @example func.musicEmbedDefault(options)
 */
export const musicEmbedDefault = (client, guilds) => {
  const guild = client.guilds.cache.get(guilds.id);
  const genshinGif = [
    "https://upload-os-bbs.hoyolab.com/upload/2021/08/12/64359086/ad5f51c6a4f16adb0137cbe1e86e165d_8637324071058858884.gif?x-oss-process=image/resize,s_1000/quality,q_80/auto-orient,0/interlace,1/format,gif",
  ];
  const randomGenshin = genshinGif[Math.floor(Math.random() * genshinGif.length)];
  var Emojis = [`0️⃣`, `1️⃣`];
  const embeds = [
    new EmbedBuilders({
      description: `**Hiện tại có __0 Bài hát__ trong Hàng đợi**`,
      title: { name: `📃 hàng đợi của __${guild.name}__` },
      thumbnail: guild.iconURL({ dynamic: true }),
      colors: "Random",
    }),
    new EmbedBuilders({
      title: { name: `Bắt đầu nghe nhạc, bằng cách kết nối với Kênh voice và gửi **LIÊN KẾT BÀI HÁT** hoặc **TÊN BÀI HÁT** trong Kênh này!` },
      description: `> *Tôi hỗ trợ Youtube, Spotify, Soundcloud và các liên kết MP3 trực tiếp!*`,
      footer: { text: guild.name, iconURL: guild.iconURL({ dynamic: true }) },
      images: randomGenshin,
      colors: "Random"
    })
  ];
  const component = new ComponentBuilder([
    {
      type: "SelectMenuBuilder",
      options: {
        placeholder: "Vui lòng lựa chọn mục theo yêu cầu",
        customId: "StringSelectMenuBuilder",
        disabled: false,
        maxValues: 1,
        minValues: 1,
        options: [[`Gaming`, `NCS | No Copyright Music`].map((t, index) => {
          return {
            label: t.substring(0, 25), // trích xuất từ 0 đến 25 từ 
            value: t.substring(0, 25), // trích xuất từ 0 đến 25 từ
            description: `Tải Danh sách phát nhạc: '${t}'`.substring(0, 50),  // trích xuất từ 0 đến 50 từ
            emoji: Emojis[index], // thêm emoji cho từng cụm từ 
            default: false // lựa chọn mặc định
          };
        })]
      },
    },
    {
      type: "ButtonBuilder",
      options: [
        { style: "Primary", customId: "1", emoji: "⏭", label: "Skip", disabled: true },
        { style: "Danger", customId: "2", emoji: "🏠", label: "Stop", disabled: true },
        { style: "Secondary", customId: "3", emoji: "⏸", label: "Pause", disabled: true },
        { style: "Success", customId: "4", emoji: "🔁", label: "Autoplay", disabled: true },
        { style: "Primary", customId: "5", emoji: "🔀", label: "Shuffle", disabled: true },
      ]
    },
    {
      type: "ButtonBuilder",
      options: [
        { style: "Success", customId: "6", emoji: "🔁", label: "Song", disabled: true },
        { style: "Success", customId: "7", emoji: "🔂", label: "Queue", disabled: true },
        { style: "Primary", customId: "8", emoji: "⏩", label: "+10 Sec", disabled: true },
        { style: "Primary", customId: "9", emoji: "⏪", label: "-10 Sec", disabled: true },
        { style: "Primary", customId: "10", emoji: "📝", label: "Lyrics", disabled: true },
      ]
    },
  ]);

  return { embeds, components: component };
};

/**
 * Hàm parsePermissions chuyển đổi mảng quyền hạn thành chuỗi mô tả dễ đọc.
 * @param {Array} perms - Mảng chứa các quyền hạn cần chuyển đổi.
 * @returns {String} - Chuỗi mô tả quyền hạn.
 */
export const parsePermissions = (perms) => {
  // Danh sách các quyền hạn và mô tả tương ứng
  const permissions = {
    AddReactions: "Thêm Reactions",
    Administrator: "Quản trị viên",
    AttachFiles: "Đính kèm tệp",
    BanMembers: "Cấm thành viên",
    ChangeNickname: "Thay đổi biệt danh",
    Connect: "Kết nối",
    CreateInstantInvite: "Tạo lời mời tức thì",
    CreatePrivateThreads: "Tạo Threads riêng tư",
    CreatePublicThreads: "Tạo Threads công cộng",
    DeafenMembers: "Tắt âm thành viên",
    EmbedLinks: "Nhúng liên kết",
    KickMembers: "Đá thành viên",
    ManageChannels: "Quản lý kênh",
    ManageEmojisAndStickers: "Quản lý emojis và stickers",
    ManageEvents: "Quản lý Sự kiện",
    ManageGuild: "Quản lý server",
    ManageMessages: "Quản lý tin nhắn",
    ManageNicknames: "Quản lý biệt danh",
    ManageRoles: "Quản lý vai trò",
    ManageThreads: "Quản lý Threads",
    ManageWebhooks: "Quản lý webhooks",
    MentionEveryone: "Đề cập đến mọi người",
    ModerateMembers: "Kiểm soát thành viên",
    MoveMembers: "Di chuyển thành viên",
    MuteMembers: "Tắt tiếng thành viên",
    PrioritySpeaker: "Người phát biểu ưu tiên",
    ReadMessageHistory: "Đọc lịch sử tin nhắn",
    RequestToSpeak: "Yêu cầu nói",
    SendMessages: "Gửi tin nhắn",
    SendMessagesInThreads: "Gửi tin nhắn trong Threads",
    SendTTSMessages: "Gửi tin nhắn TTS",
    Speak: "Nói",
    Stream: "Phát video",
    UseApplicationCommands: "Sử dụng lệnh ứng dụng",
    UseEmbeddedActivities: "Sử dụng hoạt động nhúng",
    UseExternalEmojis: "Sử dụng emojis bên ngoài",
    UseExternalStickers: "Sử dụng stickers bên ngoài",
    UseVAD: "Sử dụng voice activity",
    ViewAuditLog: "Xem nhật ký kiểm toán",
    ViewChannel: "Xem kênh",
    ViewGuildInsights: "Xem thông tin server",
  };
  // Chuyển đổi mã quyền hạn thành chuỗi mô tả
  const permissionStrings = perms.map((perm) => permissions[perm]);
  return `\`${permissionStrings.join(", ")}\``;
};
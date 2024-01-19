import * as GiveawayHandlers from "discord-giveaways";
import { Discord } from "blackcat.js";
import { EmbedBuilders, parsePermissions, toButtonStyle, ComponentBuilder } from "./functions.js";
import giveawayModel from "./Schema/Giveaways.js";

const { ActionRowBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder, ChannelType, TextInputStyle, ComponentType, EmbedBuilder } = Discord;
const GiveawayManagerWithOwnDatabase = class extends GiveawayHandlers.GiveawaysManager {
    constructor(client) {
        super(client, {
            storage: false, // [storage='./giveaways.json'] Đường dẫn lưu trữ giveaway.
            forceUpdateEvery: null, // [forceUpdateEvery=null] Buộc cập nhật thông báo giveaway trong một khoảng thời gian cụ thể.
            endedGiveawaysLifetime: null, // [endedGiveawaysLifetime=null] Số mili giây sau đó giveaway kết thúc sẽ bị xóa khỏi DB. ⚠ giveaway đã xóa khỏi DB không thể được roll lại nữa!
            default: { // [default] Các tùy chọn mặc định cho giveaway mới.
                botsCanWin: false, // [default.botsCanWin=false] Nếu bot có thể giành được giveaway.
                exemptPermissions: [], // [default.exemptPermissions=["Administrator"]] Thành viên có bất kỳ quyền nào trong số này sẽ không thể giành được giveaway.
                exemptMembers: () => false, // [default.exemptMembers] Chức năng lọc thành viên. Nếu giá trị true được trả về, thành viên đó sẽ không thể giành được giveaway.
                embedColorEnd: 0xed4245, // [default.embedColorEnd='#000000'] Màu của giveaway được embed khi chúng kết thúc.
                embedColor: 0xfee75c, // [default.embedColor='#FF0000'] Màu sắc của giveaway embed khi đang chạy.
                reaction: '🎁', // [default.reaction='🎁'] Phản ứng khi muốn tham gia giveaway.
                lastChance: { // Hệ thống cơ hội cuối cùng 
                    enabled: true, // nếu hệ thống cơ hội cuối cùng được bật.
                    content: '⚠️ **CƠ HỘI CUỐI CÙNG ĐỂ THAM GIA!** ⚠️', // Văn bản embed
                    threshold: 10000, // số mili giây trước khi giveaways kết thúc.
                    embedColor: 0xfee75c // màu của embed.
                },
                pauseOptions: {
                    isPaused: false, // nếu embed bị tạm dừng.
                    content: '⚠️ **GIVEAWAY NÀY ĐÃ TẠM DỪNG!** ⚠️', // văn bản embed
                    unpauseAfter: null, // số mili giây hoặc dấu thời gian tính bằng mili giây, sau đó giveaway sẽ tự động bỏ tạm dừng.
                    embedColor: 0xfee75c, // màu embed
                    infiniteDurationText: '`KHÔNG BAO GIỜ`' // Văn bản được hiển thị bên cạnh GiveawayMessages#drawing phần embed bị tạm dừng, khi không có unpauseAfter.
                },
            },
        });
        // gởi tin nhắn đến cho người chiến thắng 
        this.on("giveawayRerolled", (giveaway, winners) => {
            winners.forEach((member) => {
                member.send({
                    embeds: [new EmbedBuilders({
                        title: { name: "🎉・Giveaway đã kết thúc" },
                        description: `Xin chúc mừng ${member.user.username}! Bạn đã trở thành người chiến thắng!`,
                        fields: [
                            { name: "🎁┆ Phần thưởng", value: `${giveaway.prize}`, inline: true },
                            { name: "🥳┆ Giveaway", value: `[Bấm vào đây](https://discordapp.com/channels/${giveaway.message.guildId}/${giveaway.message.channelId}/${giveaway.message.id})`, inline: true }
                        ]
                    })]
                }).catch((ex) => console.log(ex));
            });
        });
        // gởi tin nhắn đến cho thành viên khi react với icon giveway
        this.on("giveawayReactionAdded", (giveaway, member, reaction) => {
            const ChannelGiveaway = new ButtonBuilder().setLabel("Xem giveaway").setStyle("Link").setURL(`https://discordapp.com/channels/${giveaway.message?.guildId}/${giveaway.message?.channelId}/${giveaway.message?.id}`);
            member.send({
                content: `Yêu cầu của bạn vào giveaway này đã được phê duyệt.`,
                components: [new ActionRowBuilder().addComponents([ChannelGiveaway])]
            }).catch((ex) => console.log(ex));
        });
        // gởi tin nhắn cho thành viên khi họ out khỏi giveaway 
        this.on('giveawayReactionRemoved', (giveaway, member, reaction) => {
            const ChannelGiveaway = new ButtonBuilder().setLabel("Xem giveaway").setStyle("Link").setURL(`https://discordapp.com/channels/${giveaway.message?.guildId}/${giveaway.message?.channelId}/${giveaway.message?.id}`);
            return member.send({
                content: "Bạn đã hủy lượt tham gia dành giải thưởng",
                components: [new ActionRowBuilder().addComponents([ChannelGiveaway])]
            });
        });
        // gởi tin nhắn đến cho người chiến thắng 
        this.on("giveawayEnded", (giveaway, winners) => {
            winners.forEach((member) => {
                member.send({
                    embeds: [new EmbedBuilder()
                        .setTile("🎉・Giveaway đã kết thúc")
                        .setDescription(`Xin chúc mừng ${member.user.username}! Bạn đã trở thành người chiến thắng!`)
                        .addFields(
                            { name: "🎁┆ Phần thưởng", value: `${giveaway.prize}`, inline: true },
                            { name: "🥳┆ Giveaway", value: `[Bấm vào đây](https://discordapp.com/channels/${giveaway.message.guildId}/${giveaway.message.channelId}/${giveaway.message.id})`, inline: true }
                        )
                    ]
                }).catch((ex) => console.log(ex));
            });
        });
        // gởi tin nhắm cho thành viên khi giveaway đã kết thúc mà thành viên vẫn react với emojis
        this.on("endedGiveawayReactionAdded", (giveaway, member, reaction) => {
            member.send({ content: "Thật không may, giveaway đã kết thúc! Bạn không thể tham gia nữa" }).catch((ex) => { });
        });
        // Xuất hiện khi giveaway đã bị xoá
        this.on("giveawayDeleted", (giveaway) => {
            console.log(`Giveaway với id ${giveaway.messageId} đã bị xoá`);
        });
    };
    // Hàm này được gọi khi quản lý cần lấy tất cả các phần quà được lưu trong cơ sở dữ liệu.
    async getAllGiveaways() {
        // Lấy tất cả các phần quà từ cơ sở dữ liệu. Chúng ta truy xuất tất cả các tài liệu bằng cách truyền một điều kiện trống.
        return await giveawayModel.find().lean().exec();
    };
    // Hàm này được gọi khi một phần quà cần được lưu trong cơ sở dữ liệu.
    async saveGiveaway(messageId, giveawayData) {
        // Thêm phần quà mới vào cơ sở dữ liệu
        await giveawayModel.create(giveawayData);
        // Đừng quên trả về một cái gì đó!
        return true;
    };
    // Hàm này được gọi khi một phần quà cần được chỉnh sửa trong cơ sở dữ liệu.
    async editGiveaway(messageId, giveawayData) {
        // Tìm theo messageId và cập nhật nó
        await giveawayModel.updateOne({ messageId }, giveawayData).exec();
        // Đừng quên trả về một cái gì đó!
        return true;
    };
    // Hàm này được gọi khi một phần quà cần được xóa khỏi cơ sở dữ liệu.
    async deleteGiveaway(messageId) {
        // Tìm theo messageId và xóa nó
        await giveawayModel.deleteOne({ messageId }).exec();
        // Đừng quên trả về một cái gì đó!
        return true;
    };

    async startGiveaway(client, message, channelId) {
        // xác thực quyền trong kênh
        if (!channelId) return message.channel.send({ content: "Thiết lập giveaway đã bị hủy. Bạn không đề cập đến một kênh" });
        if (!channelId.type === ChannelType.GuildText && !channelId.permissionsFor(guild.members.me).has(["ViewChannel", "SendMessages", "EmbedLinks"])) {
            return channelId.send({
                content: `Thiết lập Giveaway đã bị hủy.\nTôi cần ${parsePermissions(["ViewChannel", "SendMessages", "EmbedLinks"])} trong ${channelId}`
            });
        };
        // tạo button thiết lập 
        const sentMsg = await channelId.send({
            content: "Vui lòng nhấp vào nút bên dưới để bắt đầu giveaways",
            components: new ComponentBuilder([
                {
                    type: "ButtonBuilder",
                    options: [{ customId: "giveaway_btnEdit", label: "Bắt Đầu", style: toButtonStyle("Primary") }]
                }
            ])
        });
        // 
        const btnInteraction = await channelId.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (i) => i.customId === "giveaway_btnEdit" && i.member.id === message.member.id && i.message.id === sentMsg.id,
            time: client.ms("20s"),
        }).catch((ex) => { });
        if (!btnInteraction) return sentMsg.edit({ content: "Không nhận được phản hồi, hủy cập nhật", components: [] });
        // phương thức hiển thị
        await btnInteraction.showModal(
            new ModalBuilder({
                customId: "giveaway-modalSetup",
                title: "Giveaway Setup",
                components: [
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("duration").setLabel("thời lượng là gì?").setPlaceholder("1h / 1d / 1w").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("prize").setLabel("Giải thưởng là gì?").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("winners").setLabel("Số lượng người chiến thắng?").setStyle(TextInputStyle.Short).setRequired(true)),
                ],
            })
        );
        // nhận đầu vào phương thức
        const modal = await btnInteraction.awaitModalSubmit({
            filter: (m) => m.customId === "giveaway-modalSetup" && m.member.id === message.member.id && m.message.id === sentMsg.id,
            time: 1 * 60 * 1000,
        }).catch((ex) => { });
        if (!modal) return sentMsg.edit({ content: "Không nhận được phản hồi, đang hủy thiết lập", components: [] });
        // xoá phương thức tương tác cũ
        sentMsg.delete().catch(() => { });
        await modal.reply("Đang thiết lập giveaways...");
        // khoảng thời gian
        const duration = client.ms(modal.fields.getTextInputValue("duration"));
        if (isNaN(duration)) return modal.editReply("Thiết lập đã bị hủy. Bạn không chỉ định thời hạn hợp lệ");
        // phần thưởng
        const giveawayPrize = modal.fields.getTextInputValue("prize");
        // số người chiến thắng
        const giveawayNumberWinners = parseInt(modal.fields.getTextInputValue("winners"));
        if (isNaN(giveawayNumberWinners)) return modal.editReply("Thiết lập đã bị hủy. Bạn không chỉ định số lượng người chiến thắng hợp lệ");
        // hiển thị nếu nó không phải kênh văn bản
        if (!channelId.type === ChannelType.GuildText) {
            return await modal.editReply("Bạn chỉ có thể bắt đầu giveaway trong các kênh văn bản.");
        };
        // chạy function.
        this.start(channelId, {
            duration: duration,
            prize: giveawayPrize,
            winnerCount: giveawayNumberWinners,
            hostedBy: true ? message.author : null,
            thumbnail: "https://imgur.io/4FGhUuk.gif",
            image: "https://i.vietgiaitri.com/2021/7/30/genshin-impact-se-them-vao-tinh-nang-cau-ca-va-quan-dao-moi-trong-phien-ban-21-c6f-5924512.png",
            messages: {
                giveaway: '',
                title: 'Phần thưởng: {this.prize}',
                drawing: 'Kết thúc sau: {timestamp}',
                dropMessage: 'Hãy là người đầu tiên phản ứng với 🎁!',
                inviteToParticipate: 'Phản ứng với 🎁 để tham gia!',
                embedFooter: '{this.winnerCount} người chiến thắng',
                noWinner: 'Giveaway bị hủy, không có người tham gia hợp lệ.',
                hostedBy: 'Tổ chức bởi: {this.hostedBy}',
                winners: 'Người chiến thắng:',
                endedAt: 'Đã kết thúc'
            },
        }).catch((err) => console.log(err));
        // hoàn tất
        await modal.editReply(`Giveaway đã được bắt đầu ở ${channelId}`);
    };
};

export default (client) => client.giveawaysManager = new GiveawayManagerWithOwnDatabase(client);
import { EmbedBuilders, toButtonStyle, ComponentBuilder } from "./functions.js";
import { SoundCloudPlugin as DistibeSoundCloud } from "@distube/soundcloud";
import { SpotifyPlugin as DistubeSpotify } from "@distube/spotify";
import { YtDlpPlugin as DistubeYtDlp } from "@distube/yt-dlp";
import { DisTube, Song, SearchResultVideo } from "distube";
import { Discord, chalk as colors, ms } from "blackcat.js";
import lyricsFinder from "lyrics-finder";
import stdb from "st.db";

import autoresumeModel from "./Schema/autoresume.js";
import dataModel from "./Schema/defaultData.js";

class distubeEvent extends DisTube {
  constructor(client) {
    super(client, {
      searchSongs: 0, // Giới hạn kết quả tìm kiếm phát ra trong sự kiện DisTube#event:searchResult khi phương thức DisTube#play được thực thi. Nếu searchSongs <= 1, hãy phát kết quả đầu tiên
      searchCooldown: 30, // Thời gian hồi lệnh tìm kiếm tích hợp trong vài giây (Khi bài hát tìm kiếm lớn hơn 0)
      emptyCooldown: 25, // Tích hợp nghỉ phép khi thời gian hồi lệnh trống trong vài giây (Khi leftOnEmpty là đúng)
      joinNewVoiceChannel: false, // Có tham gia kênh thoại mới hay không khi sử dụng phương thức DisTube#play
      savePreviousSongs: true, // Có hoặc không lưu các bài hát trước đó của hàng đợi và bật phương thức DisTube#previous
      leaveOnFinish: false, // Có rời kênh thoại khi hàng đợi kết thúc hay không.
      leaveOnEmpty: true, // Có rời khỏi kênh thoại hay không nếu kênh thoại trống sau DisTubeOptions.emptyCooldown giây.
      leaveOnStop: true, // Có rời khỏi kênh thoại sau khi sử dụng chức năng DisTube#stop hay không.
      directLink: true, // Có hay không phát một bài hát với liên kết trực tiếp
      nsfw: true, // Có hay không phát nội dung giới hạn độ tuổi và tắt tính năng tìm kiếm an toàn trong kênh không thuộc NSFW.
      plugins: [
        new DistubeSpotify({
          parallel: true, // Mặc định là true. Có hoặc không tìm kiếm danh sách phát song song.
          emitEventsAfterFetching: true, // Mặc định là false. Phát addList và playSong sự kiện trước hoặc sau khi tìm nạp tất cả các bài hát.
          api: {
            clientId: client.config.spotifyClientId, // Client ID của ứng dụng Spotify của bạn (Tùy chọn - Được sử dụng khi plugin không thể tự động lấy thông tin đăng nhập)
            clientSecret: client.config.spotifyClientSecret, // Client Secret của ứng dụng Spotify của bạn (Tùy chọn - Được sử dụng khi plugin không thể tự động lấy thông tin đăng nhập)
            topTracksCountry: "US", // Mã quốc gia của các bản nhạc của nghệ sĩ hàng đầu (mã quốc gia ISO 3166-1 alpha-2). Mặc định là US.
          }
        }),
        new DistubeYtDlp({ update: true }),
        new DistibeSoundCloud(),
      ], // DisTube plugins.
      youtubeCookie: [
        {
          domain: ".youtube.com",
          expirationDate: 1234567890,
          hostOnly: false,
          httpOnly: true,
          name: "LOGIN_INFO",
          path: "/",
          sameSite: "no_restriction",
          secure: true,
          session: false,
          value: client.config.youtubeCookie,
        },
      ],
      ytdlOptions: { // tùy chọn nhận thông tin ytdl-core
        highWaterMark: 1024 * 1024 * 64,
        quality: "highestaudio",
        format: "audioonly",
        liveBuffer: 60000,
        dlChunkSize: 1024 * 1024 * 4,
        youtubeCookie: client.config.youtubeCookie,
      },
      emitAddListWhenCreatingQueue: false, // Có hay không phát sự kiện addList khi tạo Queue mới
      emitAddSongWhenCreatingQueue: false, // Có hoặc không phát sự kiện addSong khi tạo Hàng đợi mới
      emitNewSongOnly: true, // Có hay không phát ra DisTube#event:playSong khi lặp một bài hát hoặc bài hát tiếp theo giống như bài hát trước đó
    });
    // xác định client
    this.client = client;
    // xác định database từ func
    this.autoresume = new stdb.Database({
      driver: new stdb.MongoDriver(client.config.mongourl, "BlackCat-Discord", "autoresume"),
    });
    /** Map để lưu trữ các khoảng thời gian và dữ liệu liên quan đến người chơi. */
    this.playerintervals = new Map();
    this.PlayerMap = new Map();
    /** Khoảng thời gian để chỉnh sửa thông tin bài hát. */
    this.songEditInterval = null;
    /** Cờ để theo dõi trạng thái chỉnh sửa cuối cùng */
    this.lastEdited = false;
    // 
    client.on("ready", (bot) => {
      // Tự động tiếp tục các bài hát sau một khoảng thời gian (2 lần ping của WebSocket)
      setTimeout(async () => this.autoresumeFunc(), 2 * client.ws.ping);
    });
    // dành cho hệ thống âm nhạc yêu cầu bài hát
    client.on(Discord.Events.MessageCreate, async (message) => {
      // Lấy dữ liệu từ MongoDB dựa trên guild.id
      const data = await dataModel.findOne({ GuildId: message.guild?.id });
      // Kiểm tra và trả về ngay lập tức nếu có lỗi hoặc không có guild
      if (!data || !message.guild?.available || !data.MusicData.ChannelId || data.MusicData.ChannelId.length < 5) return;
      // Lấy thông tin textChannel từ guild
      const textChannel = message.guild.channels.cache.get(data.MusicData.ChannelId) || await message.guild.channels.fetch(data.MusicData.ChannelId).catch(() => null);
      // Kiểm tra và in log nếu không tìm thấy channel
      if (!textChannel) return console.log("Không có channel nào được thiết lập");
      // Kiểm tra nếu message không được gửi trong textChannel đã cài đặt, return
      if (textChannel.id !== message.channel.id) return;
      // Xoá tin nhắn sau 3 giây nếu là của bot, ngược lại xoá ngay lập tức
      setTimeout(() => message.author.id === client.user.id && message.delete(), message.author.id === client.user.id ? 3000 : 0);
      // Kiểm tra nếu là tin nhắn của bot, return
      if (message.author.bot) return;
      // Kiểm tra xem thành viên có ở trong voice hay không, Nếu không ở trong voice, gửi thông báo
      if (!message.member.voice.channel) return message.channel.send({ content: "Bạn cần phải ở trong một kênh voice" });
      // Yêu cầu phát nhạc
      await this.play(message.member.voice.channel, message.cleanContent, {
        member: message.member,
        textChannel: message.channel,
        message,
      });
    });
    // dành cho button tương tác hệ thống âm nhạc và menu
    client.on(Discord.Events.InteractionCreate, async (interaction) => {
      if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
      var { guild, message, channel, member, user, customId } = interaction;
      const data = await dataModel.findOne({ GuildId: interaction.guild.id });
      if (!data) return; // trả về nếu không tìm thấy data
      if (!guild) guild = client.guilds.cache.get(interaction.guildId);
      if (!guild) return; // trả về nếu không tìm thấy guilds
      // nếu chưa setup, return
      if (!data.MusicData.ChannelId || data.MusicData.ChannelId.length < 5) return;
      if (!data.MusicData.MessageId || data.MusicData.MessageId.length < 5) return;
      // nếu kênh không tồn tại, hãy thử lấy và trả về nếu vẫn không tồn tại
      if (!channel) channel = guild.channels.cache.get(interaction.channelId);
      if (!channel) return;
      // nếu không đúng kênh quay lại
      if (data.MusicData.ChannelId != channel.id) return;
      //nếu không đúng tin nhắn, return
      if (data.MusicData.MessageId != message.id) return;
      if (!member) member = guild.members.cache.get(user.id);
      if (!member) member = await guild.members.fetch(user.id).catch(() => { });
      if (!member) return;
      // nếu thành viên không được kết nối với voice, return
      if (!member.voice.channel) return interaction.reply({
        content: `**Vui lòng kết nối với kênh voice trước!**`
      });
      let newQueue = this.getQueue(guild.id);
      if (interaction.isButton()) {
        if (!newQueue || !newQueue.songs || !newQueue.songs[0]) return interaction.reply({
          content: "Hiện tại không phát bài hát nào :))"
        });
        if (customId === "Stop") {
          if (newQueue) await newQueue.stop();
          return interaction.reply({ content: "⏹ **Dừng phát và rời khỏi Kênh**" });
        } else if (customId === "Skip") {
          try {
            if (newQueue.songs.length == 0) {
              await newQueue.stop();
              return interaction.reply({ content: "Ngừng phát và rời khỏi Kênh" });
            };
            await newQueue.skip();
            return interaction.reply({ content: "⏭ **Đã chuyển sang Bài hát tiếp theo!**" });
          } catch (e) {
            return interaction.reply({ content: "Bạn chỉ có 1 bài hát trong danh sách phát" });
          };
        } else if (customId === "Pause") {
          if (newQueue.paused) {
            newQueue.resume();
            return interaction.reply({ content: "Tiếp tục phát nhạc" });
          } else {
            await newQueue.pause();
            return interaction.reply({ content: "Tạm dừng phát nhạc" });
          };
        } else if (customId === "Autoplay") {
          newQueue.toggleAutoplay();
          return interaction.reply({ content: `Tự động phát đã được ${newQueue.autoplay ? "bật" : "tắt"}` });
        } else if (customId === "Shuffle") {
          client.maps.set(`beforeshuffle-${newQueue.id}`, newQueue.songs.map(track => track).slice(1));
          await newQueue.shuffle();
          return interaction.reply({ content: `Đã xáo trộn ${newQueue.songs.length} bài hát` });
        } else if (customId === "Song") {
          if (newQueue.repeatMode == 1) {
            await newQueue.setRepeatMode(0);
          } else {
            await newQueue.setRepeatMode(1);
          };
          return interaction.reply({ content: `${newQueue.repeatMode == 1 ? "Đã bật vòng lặp bài hát" : "Đã tắt vòng lặp bài hát"}` });
        } else if (customId === "Queue") {
          if (newQueue.repeatMode == 2) {
            await newQueue.setRepeatMode(0);
          } else {
            await newQueue.setRepeatMode(2);
          };
          return interaction.reply({ content: `${newQueue.repeatMode == 2 ? "Đã bật vòng lặp hàng đợi" : "Đã tắt vòng lặp bài hát"}` });
        } else if (customId === "Forward") {
          let seektime = newQueue.currentTime + 10;
          if (seektime >= newQueue.songs[0].duration) seektime = newQueue.songs[0].duration - 1;
          await newQueue.seek(seektime);
          return interaction.reply({ content: "Đã tua bài hát về trước 10 giây" });
        } else if (customId === "VolumeUp") {
          try {
            const volumeUp = Number(newQueue.volume) + 10;
            if (volumeUp < 0 || volumeUp > 100) return interaction.reply({
              embeds: [new Discord.EmbedBuilder().setColor("Random").setDescription("Bạn chỉ có thể đặt âm lượng từ 0 đến 100.").setTimestamp()], ephemeral: true
            });
            await newQueue.setVolume(volumeUp);
            await interaction.reply({ content: `:white_check_mark: | Âm lượng tăng lên ${volumeUp}%` });
          } catch (error) {
            console.log(error);
          };
        } else if (customId === "VolumeDown") {
          try {
            const volumeDown = Number(newQueue.volume) - 10;
            const invalidVolume = new Discord.EmbedBuilder().setColor("Random").setDescription(":x: | Không thể giảm âm lượng của bạn nữa nếu tiếp tục giảm bạn sẽ không nghe thấy gì").setTimestamp();
            if (volumeDown <= 0) return interaction.reply({ embeds: [invalidVolume] });
            await newQueue.setVolume(volumeDown);
            await interaction.reply({ content: `:white_check_mark: | Âm lượng giảm xuống ${volumeDown}%` });
          } catch (error) {
            console.log(error);
          };
        } else if (customId === "Rewind") {
          let seektime = newQueue.currentTime - 10;
          if (seektime < 0) seektime = 0;
          if (seektime >= newQueue.songs[0].duration - newQueue.currentTime) seektime = 0;
          await newQueue.seek(seektime);
          return interaction.reply({ content: "Đã tua bài hát về sau 10 giây" });
        } else if (customId === "Lyrics") {
          await interaction.reply({ content: "Đang tìm kiếm lời bài hát", embeds: [], ephemeral: true });
          let thumbnail = newQueue.songs.map((song) => song.thumbnail).slice(0, 1).join("\n");
          let name = newQueue.songs.map((song) => song.name).slice(0, 1).join("\n");
          return interaction.editReply({
            embeds: [new EmbedBuilders({
              author: { name: name, iconURL: thumbnail, url: newQueue.songs.map((song) => song.url).slice(0, 1).join("\n") },
              description: (await lyricsFinder(newQueue.songs.map((song) => song.uploader.name).slice(0, 1).join("\n"), name)) || "Không tìm thấy lời bài hát!",
              thumbnail: thumbnail,
              colors: "Random"
            })],
            ephemeral: true
          });
        };
        this.updateMusicSystem(this.client, newQueue);
      } else if (interaction.isStringSelectMenu()) {
        let link;
        if (interaction.values[0]) {
          if (interaction.values[0].toLowerCase().startsWith(`g`)) link = `https://open.spotify.com/playlist/4a54P2VHy30WTi7gix0KW6`; // gaming
          if (interaction.values[0].toLowerCase().startsWith(`n`)) link = `https://open.spotify.com/playlist/7sZbq8QGyMnhKPcLJvCUFD`; //ncs | no copyrighted music
        };
        await interaction.reply({ content: `Đang tải **${interaction.values[0]}**`, ephemeral: true });
        try {
          await this.play(member.voice.channel, link, { member: member });
          return interaction.editReply({ content: `${newQueue?.songs?.length > 0 ? "👍 Thêm vào" : "🎶 Đang phát"}: **'${interaction.values[0]}'**`, ephemeral: true });
        } catch (e) {
          console.log(e);
        };
      };
    });
    this.distubeEvent();
  };
  distubeEvent() {
    // Phát ra khi DisTube phát một bài hát. Nếu DisTubeOptions.emitNewSongOnly là true thì sự kiện này sẽ không được phát ra khi lặp lại một bài hát hoặc bài hát tiếp theo là bài hát trước đó.
    this.on("playSong", async (queue, track) => {
      const data = await dataModel.findOne({ GuildId: queue.id });
      if (!data) return; // tìm kiếm data trong database // nếu không thấy data. return;
      var newQueue = this.getQueue(queue.id);
      this.updateMusicSystem(this.client, newQueue);
      const nowplay = await queue.textChannel?.send(this.receiveQueueData(newQueue, track)).then(async (message) => {
        this.PlayerMap.set("idTextchannel", message.id);
        return message;
      }).catch((e) => console.log(e));
      if (queue.textChannel?.id === data.MusicData.ChannelId) return;
      // Xóa interval hiện tại nếu có
      try { clearInterval(this.songEditInterval) } catch (e) { };
      // Tạo interval để cập nhật thông điệp hàng đợi
      this.songEditInterval = setInterval(async () => {
        if (!this.lastEdited) {
          try {
            return await nowplay.edit(this.receiveQueueData(newQueue, newQueue.songs[0]));
          } catch (e) {
            clearInterval(this.songEditInterval);
          };
        };
      }, ms("4s"));
      const collector = nowplay.createMessageComponentCollector({
        filter: (i) => i.isButton() && i.user && i.message.author.id == this.client.user.id,
        time: track.duration > 0 ? track.duration * 1000 : 600000,
      });
      collector?.on('collect', async (i) => {
        this.lastEdited = true;
        setTimeout(() => {
          this.lastEdited = false;
        }, ms("7s"));
        let member = i.member;
        // if(!member.voice.channel) return i.reply({ content: "❌ **Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**" });
        const test = i.guild.channels.cache.filter((chnl) => (chnl.type == Discord.ChannelType.GuildVoice)).find(channel => (channel.members.has(this.client.user.id)));
        if (test && member.voice.channel?.id !== test?.id) return interaction.reply({ embeds: [new Discord.EmbedBuilder().setDescription(`❌ Tôi đã chơi trong <#${test?.id}>`)], ephemeral: true });
        // bỏ qua bài hát
        if (i.customId === "skip") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });
          if (newQueue.songs.length == 0) {
            clearInterval(this.songEditInterval);
            await this.stop(i.guild.id);
            return await i.reply({
              embeds: [new EmbedBuilders({
                colors: "Random",
                title: { name: "⏹ **Dừng phát nhạc**" },
                footer: { text: `Yêu cầu bởi: ${member.user.tag}`, iconURL: `${member.user.displayAvatarURL({ dynamic: true })}` },
              })]
            }).then((i) => {
              setTimeout(() => i.interaction.deleteReply(), 3000);
            });
          };
          try {
            await this.skip(i.guild.id)
            await i.reply({
              embeds: [new Discord.EmbedBuilder()
                .setColor("Random").setTimestamp()
                .setTitle(`⏭ **Bỏ qua bài hát!**`)
                .setFooter({ text: `Yesu cầu bởi: ${member.user.tag}`, iconURL: `${member.user.displayAvatarURL({ dynamic: true })}` })
              ]
            }).then((i) => {
              setTimeout(() => i.interaction.deleteReply(), 3000);
            });
            nowplay.edit({ components: [] });
          } catch (error) {
            i.reply({ content: "Hiện tại chỉ có một bài hát trong playlist, bạn cần thêm tối thiểu ít nhất một bài hát nữa ..." }).then((i) => {
              setTimeout(() => i.interaction.deleteReply(), 3000);
            });
          };
        }
        else if (i.customId === "stop") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });
          nowplay.edit({ components: [] });
          await i.reply({ content: "👌 Đã dừng phát nhạc và rời khỏi kênh voice channel theo yêu cầu" }).then((i) => {
            setTimeout(() => i.interaction.deleteReply(), 3000);
          });
          await this.voices.leave(i.guild.id);
        }
        else if (i.customId === "pause") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });
          if (newQueue.playing) {
            await this.pause(i.guild.id);
            nowplay.edit(this.receiveQueueData(this.getQueue(newQueue.id), newQueue.songs[0]));
            await i.reply({
              embeds: [new Discord.EmbedBuilder()
                .setColor("Random").setTimestamp()
                .setTitle(`⏸ **Tạm dừng**`)
                .setFooter({ text: `yêu cầu bởi ${member.user.tag}`, iconURL: `${member.user.displayAvatarURL({ dynamic: true })}` })]
            }).then((i) => {
              setTimeout(() => i.interaction.deleteReply(), ms("3s"));
            });
          } else {
            await this.resume(i.guild.id);
            nowplay.edit(this.receiveQueueData(this.getQueue(newQueue.id), newQueue.songs[0]));
            await i.reply({
              embeds: [new Discord.EmbedBuilder()
                .setColor("Random").setTimestamp()
                .setTitle(`▶️ **tiếp tục**`)
                .setFooter({ text: `Yêu cầu bởi ${member.user.tag}`, iconURL: `${member.user.displayAvatarURL({ dynamic: true })}` })]
            }).then((i) => {
              setTimeout(() => i.interaction.deleteReply(), 3000);
            });
          };
        }
        else if (i.customId === "autoplay") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });
          await newQueue.toggleAutoplay();
          if (newQueue.autoplay) {
            nowplay.edit(this.receiveQueueData(this.getQueue(newQueue.id), newQueue.songs[0]));
          } else {
            nowplay.edit(this.receiveQueueData(this.getQueue(newQueue.id), newQueue.songs[0]));
          };
          await i.reply({
            embeds: [new Discord.EmbedBuilder()
              .setColor("Random").setTimestamp()
              .setTitle(`${newQueue.autoplay ? `✔️ **Đã bật chế độ tự động phát**` : `❌ **Đã tắt chế độ tự động phát**`}`)
              .setFooter({ text: `yêu cầu bởi ${member.user.tag}`, iconURL: `${member.user.displayAvatarURL({ dynamic: true })}` })]
          }).then((i) => {
            setTimeout(() => i.interaction.deleteReply(), 3000);
          });
        }
        else if (i.customId === "shuffle") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });

          client.maps.set(`beforeshuffle-${newQueue.id}`, newQueue.songs.map(track => track).slice(1));
          await newQueue.shuffle();
          await i.reply({
            embeds: [new Discord.EmbedBuilder()
              .setColor("Random").setTimestamp()
              .setTitle(`🔀 **Xáo trộn ${newQueue.songs.length} bài hát!**`)
              .setFooter({ text: `YC bởi: ${member.user.tag}`, iconURL: `${member.user.displayAvatarURL({ dynamic: true })}` })]
          }).then((i) => {
            setTimeout(() => i.interaction.deleteReply(), 3000);
          });
        }
        else if (i.customId === "song") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });

          if (newQueue.repeatMode == 1) {
            await newQueue.setRepeatMode(0);
          } else {
            await newQueue.setRepeatMode(1);
          };
          await i.reply({
            embeds: [new Discord.EmbedBuilder()
              .setColor("Random").setTimestamp()
              .setTitle(`${newQueue.repeatMode == 1 ? `✔️ **Lặp bài hát đã bật**` : `❌ **Lặp bài hát đã tắt**`}`)
              .setFooter({ text: `Yêu cầu bởi: ${member.user.tag}`, iconURL: `${member.user.displayAvatarURL({ dynamic: true })}` })]
          }).then((i) => setTimeout(() => i.interaction.deleteReply(), 3000));
          nowplay.edit(this.receiveQueueData(this.getQueue(newQueue.id), newQueue.songs[0]));
        }
        else if (i.customId === "queue") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });
          if (newQueue.repeatMode == 2) {
            await newQueue.setRepeatMode(0);
          } else {
            await newQueue.setRepeatMode(2);
          };
          await i.reply({
            embeds: [new Discord.EmbedBuilder()
              .setColor("Random").setTimestamp()
              .setTitle(`${newQueue.repeatMode == 2 ? `**Lặp hàng đợi đã bật**` : `**Lặp hàng đợi đã tắt**`}`)
              .setFooter({ text: `Yêu cầu bởi: ${member.user.tag}`, iconURL: `${member.user.displayAvatarURL({ dynamic: true })}` })]
          }).then((i) => setTimeout(() => i.interaction.deleteReply(), 3000));
          nowplay.edit(this.receiveQueueData(this.getQueue(newQueue.id), newQueue.songs[0]));
        }
        else if (i.customId === "seek") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });
          let seektime = newQueue.currentTime + 10;
          if (seektime >= newQueue.songs[0].duration) seektime = newQueue.songs[0].duration - 1;
          await newQueue.seek(Number(seektime))
          collector.resetTimer({ time: (newQueue.songs[0].duration - newQueue.currentTime) * 1000 })
          await i.reply({
            embeds: [new Discord.EmbedBuilder()
              .setColor("Random").setTimestamp()
              .setTitle(`⏩ **+10 Giây!**`)
              .setFooter({ text: `yêu cầu bởi: ${member.user.tag}`, iconURL: `${member.user.displayAvatarURL({ dynamic: true })}` })]
          }).then((i) => setTimeout(() => i.interaction.deleteReply(), 3000));
          nowplay.edit(this.receiveQueueData(this.getQueue(newQueue.id), newQueue.songs[0]));
        }
        else if (i.customId === "seek2") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });
          let seektime = newQueue.currentTime - 10;
          if (seektime < 0) seektime = 0;
          if (seektime >= newQueue.songs[0].duration - newQueue.currentTime) seektime = 0;
          await newQueue.seek(Number(seektime))
          collector.resetTimer({ time: (newQueue.songs[0].duration - newQueue.currentTime) * 1000 })
          await i.reply({
            embeds: [new Discord.EmbedBuilder()
              .setColor("Random").setTimestamp()
              .setTitle(`⏪ **-10 Giây!**`)
              .setFooter({ text: `yêu cầu bởi: ${member.user.tag}`, iconURL: `${member.user.displayAvatarURL({ dynamic: true })}` })]
          }).then((i) => setTimeout(() => i.interaction.deleteReply(), 3000));
          nowplay.edit(this.receiveQueueData(this.getQueue(newQueue.id), newQueue.songs[0]));
        }
        else if (i.customId === "lyrics") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });
          await i.deferReply();
          try {
            let thumbnail = newQueue.songs.map((song) => song.thumbnail).slice(0, 1).join("\n");
            let name = newQueue.songs.map((song) => song.name).slice(0, 1).join("\n");
            const findLyrics = lyricsFinder(name);
            var lyrics
            findLyrics.then((ly) => {
              return lyrics = ly;
            });
            i.editReply({
              embeds: [new Discord.EmbedBuilder()
                .setAuthor({ name: name, iconURL: thumbnail, url: newQueue.songs.map((song) => song.url).slice(0, 1).join("\n") })
                .setColor("Random")
                .setThumbnail(thumbnail)
                .setDescription(lyrics ? lyrics : "Không tìm thấy lời bài hát!")
              ], ephemeral: true
            });
          } catch (e) {
            console.log(e)
            i.editReply({ content: "Đã sảy ra lỗi vui lòng thử lại sau", ephemeral: true });
          };
        }
        else if (i.customId == "volumeUp") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });
          try {
            const volumeUp = Number(newQueue.volume) + 10;
            await newQueue.setVolume(volumeUp);
            await i.reply({ content: `:white_check_mark: | Âm lượng tăng lên ${volumeUp}%` }).then((i) => {
              setTimeout(() => i.interaction.deleteReply(), 3000);
            });
          } catch (error) {
            console.log(error);
          };
        }
        else if (i.customId == "volumeDown") {
          if (!member.voice.channel) return i.reply({ content: `**Bạn phải tham gia kênh voice mới có thể sử dụng lệnh**` });
          if (!this.getQueue(i.guild.id) || !newQueue.songs || newQueue.songs.length == 0) return await i.reply({ content: "Danh sách nhạc trống" });
          if (member.voice.channel.id !== newQueue.voiceChannel.id) return i.reply({ content: `**Tham gia kênh voice của tôi**` });
          try {
            const volumeDown = Number(newQueue.volume) - 10;
            await newQueue.setVolume(volumeDown);
            await i.reply({ content: `:white_check_mark: | Âm lượng giảm xuống ${volumeDown}%` }).then((i) => {
              setTimeout(() => i.interaction.deleteReply(), 3000);
            });
          } catch (error) {
            console.log(error);
          };
        };
      });
      // Xử lý sự kiện khi collector kết thúc
      collector?.on('end', async (collected, reason) => {
        // Nếu là do hết thời gian, xóa các thành phần tin nhắn
        if (reason === "time") {
          nowplay.edit({ components: [] });
        };
      });
    });
    // Được phát ra sau khi DisTube thêm danh sách phát mới vào Hàng đợi đang phát
    this.on("addList", async (queue, playlist) => {
      const embed = new EmbedBuilders({
        description: `👍 Danh sách: [\`${playlist.name}\`](${playlist.url ? playlist.url : "https:youtube.com/"})  -  \`${playlist.songs.length} Bài hát ${playlist.songs.length > 0 ? `` : ``}\``,
        thumbnail: `${playlist.thumbnail.url ? playlist.thumbnail.url : `https://img.youtube.com/vi/${playlist.songs[0].id}/mqdefault.jpg`}`,
        footer: { text: `💯 ${playlist.user.tag}`, iconURL: `${playlist.user.displayAvatarURL({ dynamic: true })}` },
        title: { name: "Đã thêm vài hát vào hàng đợi" },
        timestamp: Date.now(),
        colors: "Random",
        fields: [
          { name: `**Thời gian dự tính**`, value: `\`${queue.songs.length - - playlist.songs.length} Bài hát\` - \`${(Math.floor((queue.duration - playlist.duration) / 60 * 100) / 100).toString().replace(`.`, `:`)}\``, inline: true },
          { name: `**Thời lượng hàng đợi**`, value: `\`${queue.formattedDuration}\``, inline: true },
        ]
      });
      return queue.textChannel?.send({ embeds: [embed] });
    });
    // Được phát ra sau khi DisTube thêm bài hát mới vào Hàng đợi đang phát.
    this.on("addSong", async (queue, song) => {
      const embed = new EmbedBuilders({
        author: { name: `Bài hát đã được thêm!`, iconURL: `${song.user.displayAvatarURL({ dynamic: true })}`, url: song.url },
        footer: { text: `💯 ${song.user.tag}`, iconURL: `${song.user.displayAvatarURL({ dynamic: true })}` },
        description: `👍 Bài hát: [${song.name}](${song.url})  -  ${song.formattedDuration}`,
        thumbnail: `https://img.youtube.com/vi/${song.id}/mqdefault.jpg`,
        timestamp: Date.now(),
        colors: "Random",
        fields: [
          { name: "⌛ **Thời gian dự tính**", value: `\`${queue.songs.length - 1} Bài hát\` - \`${(Math.floor((queue.duration - song.duration) / 60 * 100) / 100).toString().replace(`.`, `:`)}\``, inline: true },
          { name: "🎥 Lượt xem", value: `${(queue.songs[0].views).toLocaleString()}`, inline: true },
          { name: "👍 Likes", value: `${(queue.songs[0].likes).toLocaleString()}`, inline: true },
          { name: "👎 Dislikes", value: `${(queue.songs[0].dislikes).toLocaleString()}`, inline: true },
          { name: "🌀 **Thời lượng hàng đợi**", value: `\`${queue.formattedDuration}\``, inline: true },
        ]
      });
      return queue.textChannel?.send({ embeds: [embed] });
    });
    // Được phát ra khi Hàng đợi bị xóa vì bất kỳ lý do gì.
    this.on("deleteQueue", async (queue) => {
      if (!this.PlayerMap.has(`deleted-${queue.id}`)) {
        this.PlayerMap.set(`deleted-${queue.id}`, true);
        if (this.client.maps.has(`beforeshuffle-${queue.id}`)) {
          this.client.maps.delete(`beforeshuffle-${queue.id}`);
        };
        try {
          //Xóa khoảng thời gian để kiểm tra hệ thống thông báo liên quan
          clearInterval(playerintervals.get(`checkrelevantinterval-${queue.id}`));
          this.playerintervals.delete(`checkrelevantinterval-${queue.id}`);
          // Xóa khoảng thời gian cho Hệ thống Embed Chỉnh sửa Nhạc
          clearInterval(playerintervals.get(`musicsystemeditinterval-${queue.id}`));
          this.playerintervals.delete(`musicsystemeditinterval-${queue.id}`);
          // Xóa Khoảng thời gian cho trình tiết kiệm hồ sơ tự động
          clearInterval(playerintervals.get(`autoresumeinterval-${queue.id}`))
          if(this.autoresume.has(queue.id)) {
            await this.autoresume.remove(queue.id); // Xóa db nếu nó vẫn ở đó
          };
          this.playerintervals.delete(`autoresumeinterval-${queue.id}`);
        } catch (e) {
          console.log(e);
        };
        this.updateMusicSystem(this.client, queue, true);
        const embeds = new EmbedBuilders({
          description: `:headphones: **Hàng đợi đã bị xóa**`,
          title: { name: "Kết thúc bài hát" },
          timestamp: Date.now(),
          colors: "Random",
        });
        return queue.textChannel?.send({ embeds: [embeds] });
      };
    });
    // Được phát ra khi không còn bài hát nào trong hàng đợi và Queue#autoplay là false. DisTube sẽ rời khỏi kênh voice nếu DisTubeOptions.leaveOnFinish là true;
    this.on("finish", async (queue) => {
      return queue.textChannel?.send({
        embeds: [new EmbedBuilders({ color: "Random", description: "Đã phát hết nhạc trong hàng đợi... rời khỏi kênh voice" })]
      });
    });
    // Được phát ra khi DisTube khởi tạo hàng đợi để thay đổi thuộc tính mặc định của hàng đợi.
    this.on("initQueue", async (queue) => {
      // tìm kiếm trong cơ sở dữ liệu xem có mục này hay không 
      const data = await dataModel.findOne({ GuildId: queue.id });
      var newQueue = this.getQueue(queue.id);
      if (!data) return; // nếu data trống thì return;
      let channelId = data.MusicData.ChannelId; // get id channel từ cơ sở dữ liệu
      let messageId = data.MusicData.MessageId; // get id message từ cơ sở dữ liệu
      if (this.PlayerMap.has(`deleted-${queue.id}`)) {
        this.PlayerMap.delete(`deleted-${queue.id}`);
      };
      queue.autoplay = Boolean(data.MusicData.DefaultAutoplay || false); // mặc định tự động phát false
      queue.volume = Number(data.MusicData.DefaultVolume || 50); // mặc định âm lượng là 50v
      queue.filters.set(data.MusicData.DefaultFilters || ['bassboost']); // mặc định filters là bassboost, 3d
      queue.voice.setSelfDeaf(true); // xét chế độ điếc cho bot
      /** 
      * Kiểm tra các thông báo có liên quan bên trong Kênh yêu cầu hệ thống âm nhạc
      */
      this.playerintervals.set(`checkrelevantinterval-${queue.id}`, setInterval(async () => {
        if (channelId && channelId.length > 5) {
          console.log(colors.cyanBright(`Music System - Relevant Checker`) + ` - Kiểm tra các tin nhắn không liên quan`);
          let guild = this.client.guilds.cache.get(queue.id);
          if (!guild) return console.log(colors.cyanBright(`Music System - Relevant Checker`) + ` - Không tìm thấy Guild!`);
          let channel = guild.channels.cache.get(channelId);
          if (!channel) channel = await guild.channels.fetch(channelId).catch(() => { }) || false;
          if (!channel) return console.log(colors.cyanBright(`Music System - Relevant Checker`) + ` - Không tìm thấy kênh!`);
          let messages = await channel.messages.fetch();
          if (messages.filter((m) => m.id != messageId).size > 0) {
            channel.bulkDelete(messages.filter((m) => m.id != messageId)).catch((e) => {
              console.log(e)
            }).then(messages => console.log(colors.cyanBright(`Music System - Relevant Checker`) + ` - Đã xóa hàng loạt ${messages.size ? messages.size : "0"} tin nhắn`));
          } else {
            console.log(colors.cyanBright(`Music System - Relevant Checker`) + ` - Không có tin nhắn liên quan`);
          };
        };
      }, 60000));
      /**
      * Music System Edit Embeds
      */
      this.playerintervals.set(`musicsystemeditinterval-${queue.id}`, setInterval(async () => {
        if (channelId && channelId.length > 5) {
          let guild = this.client.guilds.cache.get(queue.id);
          if (!guild) return console.log(colors.magentaBright("Music System Edit Embeds") + ` - Music System - Không tìm thấy Guild!`);
          let channel = guild.channels.cache.get(channelId);
          if (!channel) channel = await guild.channels.fetch(channelId).catch(() => { }) || false;
          if (!channel) return console.log(colors.magentaBright("Music System Edit Embeds") + ` - Music System - Không tìm thấy kênh!`);
          let message = channel.messages.cache.get(messageId);
          if (!message) message = await channel.messages.fetch(messageId).catch(() => { }) || false;
          if (!message) return console.log(colors.magentaBright("Music System Edit Embeds") + ` - Music System - Không tìm thấy tin nhắn!`);
          if (!message.editedTimestamp) return console.log(colors.magentaBright("Music System Edit Embeds") + ` - Chưa từng chỉnh sửa trước đây!`);
          if (Date.now() - message.editedTimestamp > (7000) - 100) {
            message.edit(this.generateQueueEmbed(this.client, queue.id)).catch((e) => console.log(e)).then(() => {
              console.log(colors.magentaBright("Music System Edit Embeds") + ` - Đã chỉnh sửa embed hệ thống âm nhạc, vì không có chỉnh sửa nào khác trong ${Math.floor((7000) / 1000)} giây!`)
            });
          };
        };
      }, 7000));
      /**
      * AUTO-RESUME-DATABASING
      */
      this.playerintervals.set(`autoresumeinterval-${queue.id}`, setInterval(async () => {
        if (newQueue && newQueue.id && Boolean(data.DefaultAutoresume)) {
          return await this.autoresume.set(newQueue.id, {
            guild: newQueue.id,
            voiceChannel: newQueue.voiceChannel ? newQueue.voiceChannel.id : null,
            textChannel: newQueue.textChannel ? newQueue.textChannel.id : null,
            currentTime: newQueue.currentTime,
            repeatMode: newQueue.repeatMode,
            autoplay: newQueue.autoplay,
            playing: newQueue.playing,
            volume: newQueue.volume,
            filters: [...newQueue.filters.names].filter(Boolean),
            songs: newQueue.songs && newQueue.songs.length > 0 ? [...newQueue.songs].map((track) => {
              return {
                memberId: track.memberId,
                source: track.source,
                duration: track.duration,
                formattedDuration: track.formattedDuration,
                id: track.id,
                isLive: track.isLive,
                name: track.name,
                thumbnail: track.thumbnail,
                type: "video",
                uploader: track.uploader,
                url: track.url,
                views: track.views,
              };
            }) : null,
          });
        };
      }, ms("5s")));
    });
    // Được phát ra khi Queue#autoplay là true, Queue#songs trống và DisTube không thể tìm thấy các bài hát liên quan để phát.
    this.on("noRelated", async (queue) => {
      return await queue.textChannel?.send({ content: "Không thể tìm thấy video, nhạc liên quan để phát." });
    });
    // Được phát ra khi DisTubeOptions.searchSongs lớn hơn 0 và tìm kiếm bị hủy do DisTubeOptions.searchTimeout.
    this.on("searchCancel", async (queue) => {
      return await queue.textChannel?.send({ content: "Tìm kiếm bài hát bị hủy" });
    });
    // Phát ra khi DisTube kết thúc một bài hát.
    this.on("finishSong", async (queue, song) => {
      const fetchChannel = queue.textChannel?.messages?.fetch(this.PlayerMap.get("idTextchannel"));
      const embed = new EmbedBuilders({
        author: { name: song.name, iconURL: "https://cdn.discordapp.com/attachments/883978730261860383/883978741892649000/847032838998196234.png", url: song.url },
        footer: { text: "💯 BlackCat-Club\n⛔️ Bài hát đã kết thúc!", iconURL: song.user?.displayAvatarURL({ dynamic: true }) },
        thumbnail: `https://img.youtube.com/vi/${song.id}/mqdefault.jpg`,
        colors: "Random"
      });
      return fetchChannel.then((msg) => msg.edit({ embeds: [embed], components: [] }));
    });
    // Được phát ra khi bot bị ngắt kết nối với kênh voice.
    this.on("disconnect", async (queue) => {
      return queue.textChannel?.send({ embeds: [new EmbedBuilders({ description: ":x: | Đã ngắt kết nối khỏi kênh voice" })] });
    });
    // Được phát ra khi không có người dùng trong kênh voice, DisTubeOptions.leaveOnEmpty là true và có hàng đợi phát. Nếu không có hàng đợi phát (đã dừng và DisTubeOptions.leaveOnStop là false), nó sẽ rời khỏi kênh mà không phát ra sự kiện này.
    this.on("empty", async (queue) => {
      return queue.textChannel?.send({ content: "Kênh voice chống. rời khỏi kênh :))" });
    });
    // Phát ra khi DisTube gặp lỗi khi phát bài hát.
    this.on("error", async (channel, error) => {
      console.log(error);
      const embeds = new EmbedBuilders({
        titlre: { name: "có lỗi suất hiện" },
        description: `Đã xảy ra lỗi: ${error}`,
        colors: "Random"
      });
      return channel.send({ embeds: [embeds] });
    });
    // Được phát ra khi DisTube không thể tìm thấy bất kỳ kết quả nào cho truy vấn.
    this.on("searchNoResult", async (message) => {
      return message.channel.send({ content: "Không thể tìm kiếm bài hát" });
    });
    // Được phát ra khi DisTubeOptions.searchSongs lớn hơn 0 và thông số bài hát của DisTube#play là url không hợp lệ. DisTube sẽ đợi tin nhắn tiếp theo của người dùng để chọn bài hát theo cách thủ công.
    // Tìm kiếm an toàn được bật nếu DisTubeOptions.nsfw bị tắt và kênh của tin nhắn không phải là kênh nsfw.
    this.on("searchResult", async (message, results) => {
      let i = 0;
      return message.channel.send({ content: `**Chọn một tùy chọn từ bên dưới**\n${results.map((song) => `**${++i}**. ${song.name} - \`${song.formattedDuration}\``).join("\n")}\n*Nhập bất kỳ thứ gì khác hoặc đợi 60 giây để hủy*` });
    });
    // Được phát ra khi DisTubeOptions.searchSongs lớn hơn 0 và tìm kiếm bị hủy do tin nhắn tiếp theo của người dùng không phải là số hoặc nằm ngoài phạm vi kết quả.
    this.on("searchInvalidAnswer", async () => { });
    // Được phát ra khi DisTubeOptions.searchSongs lớn hơn 0 và sau khi người dùng chọn kết quả tìm kiếm để phát.
    this.on("searchDone", async () => { });
  };
  /*
   * Tự động kết nối lại voice và phát tiếp nhạc 
   */
  async autoresumeFunc() {
    // Lấy danh sách các guild có autoresume
    let guilds = await this.autoresume.keysAll();
    console.log(colors.cyanBright("Autoresume: - Tự động tiếp tục các bài hát:"), guilds);
    // Nếu không có guild hoặc danh sách rỗng, thoát khỏi hàm
    if (!guilds || guilds.length === 0) return;
    // Duyệt qua từng guild trong danh sách
    for (const gId of guilds) {
      try {
        // Lấy thông tin guild và autoresume data
        let guild = this.client.guilds.cache.get(gId);
        let data = await this.autoresume.get(gId);
        // Nếu bot không ở trong guild, xóa autoresume data và in log
        if (!guild) {
          await this.autoresume.remove(gId);
          console.log(colors.redBright(`Autoresume: - Bot bị kick ra khỏi Guild`));
          continue;
        };
        // Lấy thông tin kênh giọng nói từ data hoặc fetch lại nếu cần
        let voiceChannel = guild.channels.cache.get(data.voiceChannel);
        if (!voiceChannel && data.voiceChannel) voiceChannel = (await guild.channels.fetch(data.voiceChannel).catch(() => { })) || false;
        // Nếu kênh giọng nói không tồn tại hoặc không có người nghe, xóa autoresume data và in log
        if (!voiceChannel || !voiceChannel.members || voiceChannel.members.filter((m) => !m.user.bot && !m.voice.deaf && !m.voice.selfDeaf).size < 1) {
          await this.autoresume.remove(gId);
          console.log(colors.cyanBright("Autoresume: - Kênh voice trống / Không có người nghe / đã bị xoá"));
          continue;
        };
        // Lấy thông tin kênh văn bản từ data hoặc fetch lại nếu cần
        let textChannel = guild.channels.cache.get(data.textChannel);
        if (!textChannel) textChannel = await guild.channels.fetch(data.textChannel).catch(() => { }) || false;
        // Nếu kênh văn bản không tồn tại, xóa autoresume data và in log
        if (!textChannel) {
          await this.autoresume.remove(gId);
          console.log(colors.cyanBright(`Autoresume: - Kênh văn bản đã bị xóa`));
          continue;
        };
        // Lấy danh sách bài hát từ data
        let tracks = data.songs;
        // Nếu danh sách bài hát trống, in log và tiếp tục vòng lặp
        if (!tracks || !tracks[0]) {
          console.log(colors.cyanBright(`Autoresume: - Đã hủy trình phát, vì không có bản nhạc nào`));
          continue;
        };
        // Phát bài hát đầu tiên và cài đặt hàng đợi
        await this.play(voiceChannel, tracks[0].url, {
          member: guild.members.cache.get(tracks[0].memberId) || guild.me,
          textChannel: textChannel
        });
        // Lấy hàng đợi mới
        let newQueue = this.getQueue(guild.id);
        // Thêm các bài hát còn lại vào hàng đợi
        for (const track of tracks.slice(1)) {
          newQueue.songs.push(() => {
            return new Song(new SearchResultVideo({
              duration: track.duration,
              formattedDuration: track.formattedDuration,
              id: track.id,
              isLive: track.isLive,
              name: track.name,
              thumbnail: track.thumbnail,
              type: "video",
              uploader: track.uploader,
              url: track.url,
              views: track.views,
            }), guild.members.cache.get(track.memberId) || guild.members.me, track.source);
          });
        };
        // In log về việc thêm bài hát vào hàng đợi
        console.log(colors.cyanBright(`Autoresume:  - Đã thêm ${newQueue.songs.length} vài hát vào hàng đợi và bắt đầu phát ${newQueue.songs[0].name} trong ${guild.name}`));
        // Cài đặt âm lượng, chế độ lặp lại, thời điểm phát tiếp theo, bộ lọc và autoplay
        if (data.filters && data.filters.length > 0) newQueue.filters.set(data.filters, true);
        if (data.repeatMode && data.repeatMode !== 0) newQueue.setRepeatMode(data.repeatMode);
        if (data.autoplay === Boolean(true)) newQueue.autoplay = Boolean(data.autoplay);
        newQueue.setVolume(data.volume);
        newQueue.seek(data.currentTime);
        // Xóa mục từ autoresume và in log
        await this.autoresume.remove(newQueue.id);
        console.log(colors.cyanBright(`Autoresume: - Đã thay đổi theo dõi autoresume để điều chỉnh hàng đợi + đã xóa mục nhập cơ sở dữ liệu `));
        // Chờ 1 giây trước khi tiếp tục vòng lặp
        await new Promise((resolve) => {
          setTimeout(() => resolve(2), 1000);
        });
      } catch (e) {
        console.log(e);
      };
    };
  };
  /**
   * Hàm để cập nhật thông tin hệ thống âm nhạc trong kênh của Discord guild.
   * @param {Discord.Client} client - Thể hiện của máy khách Discord.
   * @param {Queue} queue - Hàng đợi âm nhạc.
   * @param {boolean} [leave=false] - Cờ chỉ định xem hàng đợi có rời khỏi không.
   * @returns {Promise<void>} - Một promise giải quyết sau khi cập nhật hệ thống âm nhạc.
   */
  async updateMusicSystem(client, queue, leave = false) {
    // Lấy dữ liệu từ MongoDB dựa trên queue.id
    const data = await dataModel.findOne({ GuildId: queue.id });
    // Kiểm tra nếu không có dữ liệu hoặc không có queue, return
    if (!data || !queue) return;
    // Kiểm tra nếu có ChannelId và có độ dài lớn hơn 5
    if (data.MusicData.ChannelId && data.MusicData.ChannelId.length > 5) {
      // Lấy thông tin guild từ client
      const guild = client.guilds.cache.get(queue.id);
      // Kiểm tra nếu không tìm thấy guild, in log và return
      if (!guild) return console.log(colors.cyan(`Update-Music-System`) + ` - Music System - Không tìm thấy Guild!`);
      // Lấy thông tin channel từ guild
      let channel = guild.channels.cache.get(data.MusicData.ChannelId) || await guild.channels.fetch(data.MusicData.ChannelId).catch(() => { });
      // Kiểm tra nếu không tìm thấy channel, in log và return
      if (!channel) return console.log(colors.cyan(`Update-Music-System`) + ` - Music System - Không tìm thấy kênh!`);
      // Lấy thông tin message từ channel
      let message = channel.messages.cache.get(data.MusicData.MessageId) || await channel.messages.fetch(data.MusicData.MessageId).catch(() => { });
      // Kiểm tra nếu không tìm thấy message, in log và return
      if (!message) return console.log(colors.cyan(`Update-Music-System`) + ` - Music System - Không tìm thấy tin nhắn!`);
      // Chỉnh sửa tin nhắn với thông tin mới từ hàm generateQueueEmbed
      message.edit(this.generateQueueEmbed(client, queue.id, leave)).catch((e) => console.log(e)).then(() => console.log(colors.hex('#FFA500')(`- Đã chỉnh sửa tin nhắn do Tương tác của người dùng`)));
    };
  };
  /**
   * Nhận dữ liệu hàng đợi và bài hát mới và trả về một Embed thông báo.
   * @param {Queue} newQueue - Hàng đợi âm nhạc mới.
   * @param {Track} newTrack - Bài hát mới.
   * @param {Queue} queue - Hàng đợi âm nhạc hiện tại.
   * @returns {object} - Đối tượng chứa Embed và components.
   */
  receiveQueueData(newQueue, newTrack, queue) {
    // Kiểm tra nếu không tìm thấy bài hát hoặc track, Trả về một Embed thông báo lỗi
    if (!newQueue || !newTrack) return new EmbedBuilders({
      color: "Random",
      title: { name: "Không thể tìm kiếm bài hát" }
    });
    // Lấy thông tin cần thiết từ newQueue và newTrack
    const formattedCurrentTime = newQueue.formattedCurrentTime;
    const formattedDuration = newTrack.formattedDuration;
    const songs = newQueue.songs;
    // Xây dựng Embed chứa thông tin bài hát và queue
    const embeds = new EmbedBuilders({
      author: { name: `${newTrack.name}`, iconURL: "https://i.pinimg.com/originals/ab/4d/e0/ab4de08ece783245be1fb1f7fde94c6f.gif", url: newTrack.url },
      images: `https://img.youtube.com/vi/${newTrack.id}/mqdefault.jpg`,
      timestamp: Date.now(),
      color: "Random",
      fields: [
        { name: `Thời lượng:`, value: `>>> \`${formattedCurrentTime} / ${formattedDuration}\``, inline: true },
        { name: `Hàng chờ:`, value: `>>> \`${songs.length} bài hát\`\n\`${newQueue.formattedDuration}\``, inline: true },
        { name: `Âm lượng:`, value: `>>> \`${newQueue.volume} %\``, inline: true },
        { name: `vòng lặp:`, value: `>>> ${newQueue.repeatMode ? newQueue.repeatMode === 2 ? `✔️ hàng chờ` : `✔️ Bài hát` : `❌`}`, inline: true },
        { name: `Tự động phát:`, value: `>>> ${newQueue.autoplay ? `✔️` : `❌`}`, inline: true },
        { name: `Filters:`, value: `\`${newQueue.filters.names.join(", ") || "Tắt"}\``, inline: true },
        // Thông tin thêm về video
        { name: `Tải nhạc về:`, value: `>>> [Click vào đây](${newTrack.streamURL})`, inline: true },
        { name: `Lượt xem:`, value: `${Intl.NumberFormat().format(songs[0].views)}`, inline: true },
        { name: `Likes`, value: `👍 ${Intl.NumberFormat().format(songs[0].likes)}`, inline: true },
        { name: `Dislikes`, value: `👎 ${Intl.NumberFormat().format(songs[0].dislikes)}`, inline: true },
      ]
    });
    // Xây dựng components cho Embed
    const components = new ComponentBuilder([
      {
        type: "ButtonBuilder",
        options: [
          { customId: "skip", style: toButtonStyle("Primary"), emoji: "⏭", label: "Bỏ qua", disabled: false },
          { customId: "stop", style: toButtonStyle("Danger"), emoji: "🛑", label: "Dừng phát", disabled: false },
          { customId: "pause", style: toButtonStyle("Success"), emoji: "⏸", label: "Tạm dừng", disabled: false },
          { customId: "autoplay", style: toButtonStyle("Success"), emoji: "❌", label: "Tự động phát", disabled: false },
          { customId: "shuffle", style: toButtonStyle("Primary"), emoji: "🔀", label: "Xáo trộn", disabled: false },
        ]
      },
      {
        type: "ButtonBuilder",
        options: [
          { customId: "song", style: toButtonStyle("Success"), emoji: "🔁", label: "Bài hát", disabled: false },
          { customId: "queue", style: toButtonStyle("Success"), emoji: "🔂", label: "Hàng chờ", disabled: false },
          { customId: "seek", style: toButtonStyle("Primary"), emoji: "⏩", label: "+10 Giây", disabled: false },
          { customId: "seek2", style: toButtonStyle("Primary"), emoji: "⏪", label: "-10 Giây", disabled: false },
          { customId: "lyrics", style: toButtonStyle("Primary"), emoji: "📝", label: "Lời nhạc", disabled: false },
        ]
      },
      {
        type: "ButtonBuilder",
        options: [
          { customId: "volumeUp", style: toButtonStyle("Primary"), emoji: "🔊", label: "+10", disabled: false },
          { customId: "volumeDown", style: toButtonStyle("Primary"), emoji: "🔉", label: "-10", disabled: false },
        ]
      }
    ]);
    // Tối ưu hóa các điều kiện
    if (!newQueue.playing) {
      components[0].components[2].setStyle(toButtonStyle("Success")).setEmoji('▶️').setLabel(`Tiếp tục`);
    } else if (newQueue.autoplay) {
      components[0].components[3].setStyle(toButtonStyle("Secondary")).setEmoji("👍");
    };
    // Tối ưu hóa các điều kiện repeatMode
    const repeatModeStyles = { 0: ["Success", "Success"], 1: ["Secondary", "Success"], 2: ["Success", "Secondary"] };
    const [firstStyle, secondStyle] = repeatModeStyles[newQueue.repeatMode];
    components[1].components[0].setStyle(toButtonStyle(firstStyle));
    components[1].components[1].setStyle(toButtonStyle(secondStyle));
    // Tối ưu hóa điều kiện cho seek buttons
    components[1].components[2].setDisabled(Math.floor((newTrack.duration - newQueue.currentTime)) <= 10 ? true : false);
    components[1].components[3].setDisabled(Math.floor(newQueue.currentTime) < 10 ? true : false);
    // tối ưu hoá cho volume button
    components[2].components[0].setDisabled(newQueue.volume >= 120 ? true : false);
    components[2].components[1].setDisabled(newQueue.volume <= 10 ? true : false);
    // Trả về object chứa embeds và components
    return { embeds: [embeds], components: components };
  };
  /**
   * Tạo một embed và các thành phần cho hàng đợi nhạc.
   * @param {Discord.Client} client - Đối tượng Discord client.
   * @param {string} guildId - ID của guild.
   * @param {boolean} leave - Dấu hiệu bot có rời khỏi kênh âm thanh hay không.
   * @returns {Object} - Một đối tượng chứa embeds và components đã được cập nhật.
   */
  generateQueueEmbed(client, guildId, leave) {
    // tìm kiếm guilds
    let guild = client.guilds.cache.get(guildId);
    if (!guild) return; // nếu không thấy guilds, return 
    let newQueue = this.getQueue(guild.id); // tìm kiếm hàng đợi 
    // gif chờ chạy nhạc
    const genshinGif = [
      "https://upload-os-bbs.hoyolab.com/upload/2021/08/12/64359086/ad5f51c6a4f16adb0137cbe1e86e165d_8637324071058858884.gif?x-oss-process=image/resize,s_1000/quality,q_80/auto-orient,0/interlace,1/format,gif",
      "https://upload-os-bbs.hoyolab.com/upload/2021/08/12/64359086/2fc26b1deefa6d2ff633dda1718d6e5b_6343886487912626448.gif?x-oss-process=image/resize,s_1000/quality,q_80/auto-orient,0/interlace,1/format,gif",
    ];
    // khởi tạo embeds 
    var embeds = [
      new EmbedBuilders({
        description: "**Hiện tại có 0 Bài hát trong Hàng đợi**",
        title: { name: `📃 hàng đợi của __${guild.name}__` },
        thumbnail: guild.iconURL({ dynamic: true }),
        colors: "Random",
        fields: [
          { name: "Bắt đầu nghe nhạc, bằng cách kết nối với Kênh voice và gửi __liên kết bài hát__ hoặc __tên bài hát__ trong Kênh này!", value: "\u200B" },
          { name: "Tôi hỗ trợ __youtube-url__, __Spotify__, __SoundCloud__ và các __mp3__ trực tiếp ...", value: "\u200B" },
        ]
      }),
      new EmbedBuilders({ footer: { text: guild.name, iconURL: guild.iconURL({ dynamic: true }) }, images: genshinGif[Math.floor(Math.random() * genshinGif.length)], colors: "Random" })
    ];
    const components = new ComponentBuilder([
      {
        type: "SelectMenuBuilder",
        options: {
          placeholder: "Vui lòng lựa chọn mục theo yêu cầu",
          customId: "StringSelectMenuBuilder",
          disabled: true,
          maxValues: 1,
          minValues: 1,
          options: [["Gaming", "NCS | No Copyright Music"].map((t, index) => {
            return {
              label: t.substring(0, 25), // trích xuất từ 0 đến 25 từ 
              value: t.substring(0, 25), // trích xuất từ 0 đến 25 từ
              description: `Tải Danh sách phát nhạc: '${t}'`.substring(0, 50),  // trích xuất từ 0 đến 50 từ
              emoji: ["0️⃣", "1️⃣"][index], // thêm emoji cho từng cụm từ 
              default: false // lựa chọn mặc định
            };
          })]
        },
      },
      {
        type: "ButtonBuilder",
        options: [
          { customId: "Stop", style: toButtonStyle("Danger"), emoji: "🛑", label: "Dừng phát", disabled: true },
          { customId: "Skip", style: toButtonStyle("Primary"), emoji: "⏭", label: "Bỏ qua", disabled: true },
          { customId: "Shuffle", style: toButtonStyle("Primary"), emoji: "🔀", label: "Xáo trộn", disabled: true },
          { customId: "Pause", style: toButtonStyle("Secondary"), emoji: "⏸", label: "Tạm dừng", disabled: true },
          { customId: "Autoplay", style: toButtonStyle("Success"), emoji: "🛞", label: "Tự động phát", disabled: true },
        ],
      },
      {
        type: "ButtonBuilder",
        options: [
          { customId: "Song", style: toButtonStyle("Success"), emoji: "🔁", label: "Bài hát", disabled: true },
          { customId: "Queue", style: toButtonStyle("Success"), emoji: "🔂", label: "Hàng đợi", disabled: true },
          { customId: "Forward", style: toButtonStyle("Primary"), emoji: "⏩", label: "+10 Giây", disabled: true },
          { customId: "Rewind", style: toButtonStyle("Primary"), emoji: "⏪", label: "-10 Giây", disabled: true },
          { customId: "VolumeUp", style: toButtonStyle("Primary"), emoji: "🔊", label: "+10", disabled: true },
        ],
      },
      {
        type: "ButtonBuilder",
        options: [
          { customId: "VolumeDown", style: toButtonStyle("Primary"), emoji: "🔉", label: "-10", disabled: true },
          { customId: "Lyrics", style: toButtonStyle("Primary"), emoji: "📝", label: "Lời nhạc", disabled: true },
        ],
      }
    ]);

    if (!leave && newQueue && newQueue.songs[0]) {
      // hiển thị và khởi chạy bài hát đầu tiên
      embeds[1] = new EmbedBuilders({
        images: `https://img.youtube.com/vi/${newQueue.songs[0].id}/mqdefault.jpg`,
        author: { name: `${newQueue.songs[0].name}`, iconURL: `https://images-ext-1.discordapp.net/external/DkPCBVBHBDJC8xHHCF2G7-rJXnTwj_qs78udThL8Cy0/%3Fv%3D1/https/cdn.discordapp.com/emojis/859459305152708630.gif`, url: newQueue.songs[0].url },
        footer: { text: `${newQueue.songs[0].member ? newQueue.songs[0].member?.displayName : "BlackCat-Club"}`, iconURL: newQueue.songs[0].user?.displayAvatarURL({ dynamic: true }) },
        colors: "Random",
        fields: [
          { name: `🔊 Âm lượng:`, value: `>>> \`${newQueue.volume} %\``, inline: true },
          { name: `${newQueue.playing ? `♾ Vòng lặp:` : `⏸️ Đã tạm dừng:`}`, value: newQueue.playing ? `>>> ${newQueue.repeatMode ? newQueue.repeatMode === 2 ? `✔️ Hàng đợi` : `✔️ \`Bài hát\`` : `❌`}` : `>>> ✔️`, inline: true },
          { name: `Autoplay:`, value: `>>> \`Đang ${newQueue.autoplay ? "bật" : "tắt"}\``, inline: true },
          { name: `❔ Filters:`, value: `>>> ${newQueue.filters.names.join(", ") || "❌"}`, inline: true },
          { name: `⏱ Thời gian:`, value: `\`${newQueue.formattedCurrentTime}\` ${createBar(newQueue.songs[0].duration, newQueue.currentTime, 13)} \`${newQueue.songs[0].formattedDuration}\``, inline: true },
          { name: `🚨 Yêu cầu bởi:`, value: `>>> ${newQueue.songs[0].member?.displayName}`, inline: true }
        ],
      });
      var maxTracks = 10; // bài hát / Trang hàng đợi 
      embeds[0] = new EmbedBuilders({
        title: { name: `📃 hàng đợi của __${guild.name}__ - [${newQueue.songs.length} bài hát]` },
        colors: "Random",
        description: `${String(newQueue.songs.slice(0, maxTracks).map((track, index) => `**\` ${++index}. \` ${track.url ? `[${track.name.substr(0, 60).replace(/\[/igu, `\[`).replace(/\]/igu, `\]`)}](${track.url})` : track.name}** - \`${track.isStream ? "Trực Tiếp" : track.formattedDuration}\`\n> *Được yêu cầu bởi: __${track.user ? track.user.globalName : client.user.username}__*`).join(`\n`)).substr(0, 2048)}`,
      });
      // hiển thị số lượng bài hát đang chờ
      if (newQueue.songs.length > 10) {
        embeds[0].addFields({ name: `**\` =>. \` và *${newQueue.songs.length > maxTracks ? newQueue.songs.length - maxTracks : newQueue.songs.length}*** bài hát khác ...`, value: `\u200b` })
      };
      // hiển thị bài hát đang được phát
      embeds[0].addFields({ name: `**\` =>. \` __HIỆN TẠI ĐANG PHÁT__**`, value: `**${newQueue.songs[0].url ? `[${newQueue.songs[0].name.substr(0, 60).replace(/\[/igu, `\[`).replace(/\]/igu, `\]`)}](${newQueue.songs[0].url})` : newQueue.songs[0].name}** - \`${newQueue.songs[0].isStream ? "Trực Tiếp" : newQueue.formattedCurrentTime}\`\n> *Được yêu cầu bởi: __${newQueue.songs[0].user ? newQueue.songs[0].user.globalName : client.user.username}__*` })
      // loại bỏ disabled
      components.forEach((c) => {
        c.components.forEach((btn) => btn.setDisabled(false));
      });
      // Cập nhật style và label cho các nút điều khiển dựa trên trạng thái của queue
      if (newQueue.autoplay) {
        components[1].components[4].setStyle(toButtonStyle("Secondary"));
      } else if (newQueue.paused) {
        components[1].components[3].setStyle(toButtonStyle("Success")).setEmoji('▶️').setLabel("Tiếp tục");
      };
      // Cập nhật style cho các nút điều khiển lặp lại
      if (newQueue.repeatMode === 1) {
        components[2].components[0].setStyle(toButtonStyle("Secondary"));
        components[2].components[1].setStyle(toButtonStyle("Success"));
      } else if (newQueue.repeatMode === 2) {
        components[2].components[0].setStyle(toButtonStyle("Success"));
        components[2].components[1].setStyle(toButtonStyle("Secondary"));
      } else {
        components[2].components[0].setStyle(toButtonStyle("Success"));
        components[2].components[1].setStyle(toButtonStyle("Success"));
      };
    };
    // mốc tính thời gian 
    function createBar(total, current, size = 25, line = "▬", slider = "⏳") {
      // Kiểm tra nếu không có tổng thời gian, hoặc thời gian hiện tại, trả về thanh mặc định
      if (!total || !current) return `**[${slider}${line.repeat(size - 1)}]**`;
      // Tính toán giá trị thanh và phần trăm
      const [barLine, percent] = current > total ? [line.repeat(size), 100] /* Nếu thời gian hiện tại lớn hơn tổng thời gian, hiển thị thanh đầy và phần trăm 100% */ : [line.repeat(Math.round(size * (current / total))).replace(/.$/, slider) + line.repeat(size - Math.round(size * (current / total)) + 1), (current / total) * 100];
      // Nếu thanh không chứa slider, trả về thanh mặc định
      return !String(barLine).includes(slider) ? `**[${slider}${line.repeat(size - 1)}]**` : `**[${barLine}]**`;  // Ngược lại, trả về thanh đã tính toán và hiển thị phần trăm
    };
    // Trả về embeds và components đã được cập nhật
    return { embeds, components: components };
  };
  // 
  distubeSend(message, option) {
    message.textChannel.send({ content: "" });
  };
};

export default (client) => client.distube = new distubeEvent(client);
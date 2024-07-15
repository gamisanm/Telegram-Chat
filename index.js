const express = require("express");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");
const { Telegraf } = require("telegraf");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const bot = new Telegraf("YOUR_BOT_KEY");
const messagesFilePath = "./messages.json";

// Чтение истории сообщений из файла
function readMessages() {
  if (fs.existsSync(messagesFilePath)) {
    const data = fs.readFileSync(messagesFilePath);
    return JSON.parse(data);
  }
  return {};
}

// Запись истории сообщений в файл
function writeMessages(messages) {
  fs.writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2));
}

// Загрузка существующих сообщений
let messages = readMessages();

// Хранилище для неотвеченных сообщений
const unansweredMessages = new Set();

// Мапа для хранения последних сообщений от пользователей
const userSessions = new Map();

// Загрузка всех пользователей из сообщений
const allUsers = Object.keys(messages);

// Обработка сообщений от Telegram
bot.on("text", (ctx) => {
  const message = ctx.message.text;
  const userId = ctx.message.from.id;
  const firstName = ctx.message.from.first_name;
  const lastName = ctx.message.from.last_name;
  const username = ctx.message.from.username;

  // Сохраняем пользователя и его сообщение
  if (!messages[userId]) {
    messages[userId] = {
      userInfo: {
        firstName,
        lastName,
        username,
      },
      messages: [],
    };
    allUsers.push(userId);
  }
  messages[userId].messages.push({ from: "user", text: message });
  writeMessages(messages);

  // Отправляем сообщение на фронтенд в режиме онлайн
  io.emit("telegramMessage", {
    userId,
    message,
    firstName,
    lastName,
    username,
  });

  // Отвечаем пользователю
  // ctx.reply("Ваше сообщение получено!");
});

bot.launch();

// Настройка Express для раздачи статических файлов
app.use(express.static("public"));

// Обработка сообщений от фронтенда и отправка их в Telegram
io.on("connection", (socket) => {
  console.log("Новое соединение");

  // Отправляем список всех пользователей на фронтенд
  socket.emit("allUsers", allUsers);

  // Загрузка истории сообщений при выборе пользователя
  socket.on("selectUser", (userId) => {
    const userMessages = messages[userId] ? messages[userId].messages : [];
    const userInfo = messages[userId] ? messages[userId].userInfo : {};

    // Удаляем пользователя из списка неотвеченных сообщений
    unansweredMessages.delete(userId);

    // Отправляем историю сообщений и информацию о пользователе на фронтенд
    socket.emit("loadMessages", { userMessages, userInfo });

    // Отправляем обновленный список пользователей с неотвеченными сообщениями
    io.emit("updateUsersWithUnanswered", [...unansweredMessages]);
  });

  socket.on("sendMessageToTelegram", ({ userId, message }) => {
    if (!messages[userId]) {
      messages[userId] = {
        userInfo: {},
        messages: [],
      };
      allUsers.push(userId);
    }
    messages[userId].messages.push({ from: "bot", text: message });
    writeMessages(messages);

    // Отправка сообщения пользователю через Telegram бота
    bot.telegram.sendMessage(userId, message);

    // Добавляем пользователя обратно в список неотвеченных сообщений
    unansweredMessages.add(userId);

    // Отправляем обновленный список пользователей с неотвеченными сообщениями
    io.emit("updateUsersWithUnanswered", [...unansweredMessages]);
  });
});

// Запуск сервера
server.listen(3000, () => {
  console.log("Сервер запущен на http://localhost:3000");
});

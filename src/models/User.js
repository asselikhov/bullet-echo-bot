const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  telegramId: {
    type: String,
    required: true,
    unique: true
  },
  telegramUsername: {
    type: String,
    default: null
  },
  language: {
    type: String,
    enum: ['EN', 'RU'],
    default: 'RU'
  },
  nickname: {
    type: String
  },
  userId: {
    type: String
  },
  syndicate: {
    type: String
  },
  name: {
    type: String
  },
  age: {
    type: Number
  },
  gender: {
    type: String
  },
  country: {
    type: String
  },
  city: {
    type: String
  },
  trophies: {
    type: Number,
    default: 0,
    min: 0
  },
  valorPath: {
    type: Number,
    default: 0,
    min: 0
  },
  registrationStep: {
    type: String,
    default: 'language'
  }
}, {
  timestamps: true // Добавляет createdAt и updatedAt для отслеживания времени
});

module.exports = mongoose.model('User', UserSchema);
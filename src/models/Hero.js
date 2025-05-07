const mongoose = require('mongoose');

const HeroSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  heroId: { type: String, required: true },
  classId: { type: String, required: true },
  level: { type: Number, default: 1 },
  battlesPlayed: { type: Number, default: 0 },
  heroesKilled: { type: Number, default: 0 },
  winPercentage: { type: Number, default: 0 },
  heroesRevived: { type: Number, default: 0 },
  strength: { type: Number, default: 0 },
  isPrimary: { type: Boolean, default: false }, // Убедитесь, что это поле добавлено
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Hero', HeroSchema);
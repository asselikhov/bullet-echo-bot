const mongoose = require('mongoose');

const HeroSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  heroId: { type: String, required: true },
  classId: { type: String, required: true },
  level: { type: Number, default: 1, min: 1 },
  battlesPlayed: { type: Number, default: 0, min: 0 },
  heroesKilled: { type: Number, default: 0, min: 0 },
  winPercentage: { type: Number, default: 0, min: 0, max: 100 },
  heroesRevived: { type: Number, default: 0, min: 0 },
  strength: { type: Number, default: 0, min: 0 },
  isPrimary: { type: Boolean, default: false },
}, {
  timestamps: true // Автоматическое управление createdAt и updatedAt
});

module.exports = mongoose.model('Hero', HeroSchema);
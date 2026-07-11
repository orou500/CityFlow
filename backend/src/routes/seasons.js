import { Router } from 'express';
import mongoose from 'mongoose';
import Season from '../models/Season.js';
import { getCurrentSeason } from '../engine/seasonReset.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const seasons = await Season.find({ status: 'completed' })
      .sort({ number: -1 })
      .select(
        'number name startDate endDate archive.winner archive.totalPlayers archive.totalTransactions archive.economicStatistics archive.marketStatistics archive.summary archive.playerRankings archive.cityStatistics',
      );

    const active = await getCurrentSeason();
    const activeInfo = active
      ? {
          _id: active._id,
          number: active.number,
          name: active.name,
          startDate: active.startDate,
          status: active.status,
        }
      : null;

    res.json({ activeSeason: activeInfo, completedSeasons: seasons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/player/:userId', async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.params.userId);
    const seasons = await Season.find({
      status: 'completed',
      'archive.playerRankings.userId': userId,
    })
      .sort({ number: -1 })
      .select('number name startDate endDate archive.playerRankings archive.winner archive.totalPlayers archive.economicStatistics.tickCount archive.summary');

    const playerHistory = seasons.map((season) => {
      const playerData = season.archive.playerRankings.find(
        (p) => p.userId.toString() === userId.toString(),
      );
      return {
        seasonNumber: season.number,
        seasonName: season.name,
        startDate: season.startDate,
        endDate: season.endDate,
        rank: playerData?.rank,
        netWorth: playerData?.netWorth,
        balance: playerData?.balance,
        portfolioValue: playerData?.portfolioValue,
        propertiesOwned: playerData?.propertiesOwned,
        totalPlayers: season.archive.totalPlayers,
        monthsPlayed: season.archive.economicStatistics?.tickCount,
        winner: season.archive.winner,
        summary: season.archive.summary,
      };
    });

    res.json(playerHistory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const season = await Season.findById(req.params.id);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    res.json(season);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

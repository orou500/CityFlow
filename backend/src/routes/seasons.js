import { Router } from 'express';
import mongoose from 'mongoose';
import Season from '../models/Season.js';
import { getCurrentSeason } from '../engine/seasonReset.js';
import { cacheGetOrSet } from '../utils/cache.js';
import { cacheTTL } from '../utils/cacheKeys.js';
import { resolveCurrentUsers, resolveUserIdentity } from '../utils/userIdentity.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await cacheGetOrSet(
      'cf:seasons:list',
      async () => {
        const seasons = await Season.find({ status: 'completed' })
          .sort({ number: -1 })
          .select(
            'number name startDate endDate archive.winner archive.totalPlayers archive.totalTransactions archive.economicStatistics archive.marketStatistics archive.summary archive.playerRankings archive.cityStatistics',
          )
          .lean();

        // Identity for season archives comes from CURRENT user data (one bulk
        // query) — cosmetics are never baked into historical snapshots.
        // Resolved onto plain objects so the ObjectId-typed archive.winner
        // subdoc field cannot re-cast the identity object.
        for (const season of seasons) {
          if (season.archive?.winner) {
            season.archive.winner = (await resolveUserIdentity(season.archive.winner)) || season.archive.winner;
          }
          if (Array.isArray(season.archive?.playerRankings)) {
            await resolveCurrentUsers(season.archive.playerRankings, 'userId');
          }
        }

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

        return { activeSeason: activeInfo, completedSeasons: seasons };
      },
      cacheTTL.standard,
    );

    res.json(result);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/player/:userId', async (req, res) => {
  try {
    let userId;
    try {
      userId = new mongoose.Types.ObjectId(req.params.userId);
    } catch {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const seasons = await Season.find({
      status: 'completed',
      'archive.playerRankings.userId': userId,
    })
      .sort({ number: -1 })
      .select(
        'number name startDate endDate archive.playerRankings archive.winner archive.totalPlayers archive.economicStatistics.tickCount archive.summary',
      );

    const playerHistory = seasons.map((season) => {
      const playerData = season.archive.playerRankings.find((p) => p.userId.toString() === userId.toString());
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
        reward: playerData?.reward ?? null,
        totalPlayers: season.archive.totalPlayers,
        monthsPlayed: season.archive.economicStatistics?.tickCount,
        winner: season.archive.winner,
        summary: season.archive.summary,
      };
    });

    res.json(playerHistory);
  } catch (err) {
    res.serverError(err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const season = await Season.findById(req.params.id);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    res.json(season);
  } catch (err) {
    res.serverError(err);
  }
});

export default router;

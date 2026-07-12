import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import Backup from '../models/Backup.js';
import { requireAdmin } from '../middleware/admin.js';
import {
  createBackup,
  restoreBackup,
  deleteBackup,
  getBackupStats,
  enforceRetention,
  uploadBackup,
} from '../engine/backup.js';
import { config } from '../config/index.js';

const router = Router();
router.use(requireAdmin);

const upload = multer({
  dest: path.join(config.backupDir, '.tmp'),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.gz', '.zip', '.gzip', '.archive', '.bson', '.json.gz'];
    const ext = path.extname(file.originalname).toLowerCase();
    const fullExt = path.extname(path.basename(file.originalname, '.gz')).toLowerCase() + '.gz';
    if (
      allowed.includes(ext) ||
      allowed.includes(fullExt) ||
      file.mimetype === 'application/gzip' ||
      file.mimetype === 'application/x-gzip'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Allowed: .gz, .zip, .gzip, .archive'));
    }
  },
});

router.get('/', async (req, res) => {
  try {
    const backups = await Backup.find({ status: { $ne: 'deleted' } })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'username');
    const stats = await getBackupStats();
    res.json({ backups, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    res.json({
      retentionCount: config.backupRetentionCount,
      schedule: config.backupSchedule,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const backup = await createBackup(req.user._id, 'manual');
    res.status(201).json({ message: 'Backup created successfully', backup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    const backup = await Backup.findById(req.params.id).select('logs filename status type createdAt');
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    res.json({ backupId: backup._id, filename: backup.filename, status: backup.status, type: backup.type, createdAt: backup.createdAt, logs: backup.logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    const result = await restoreBackup(req.params.id, req.user._id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const backup = await Backup.findById(req.params.id);
    if (!backup || backup.status !== 'completed') {
      return res.status(404).json({ error: 'Backup not found' });
    }

    const filepath = path.join(config.backupDir, backup.filename);
    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({ error: 'Backup file not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
    res.setHeader('Content-Type', 'application/gzip');
    const stream = (await import('fs')).createReadStream(filepath);
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', upload.single('backup'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const backup = await uploadBackup(req.file.path, req.file.originalname, req.user._id);
    res.status(201).json({ message: 'Backup uploaded successfully', backup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteBackup(req.params.id);
    res.json({ message: 'Backup deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/retention', async (req, res) => {
  try {
    const deleted = await enforceRetention();
    res.json({ message: `Removed ${deleted} old backup(s)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

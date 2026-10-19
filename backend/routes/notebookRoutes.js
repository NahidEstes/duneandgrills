import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import NotebookNote from '../models/NotebookNote.js';
import { protect, authorize } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import { NOTEBOOK_ROLES, publicNotebookNote, saveNotebookNote } from '../services/notebookService.js';

const router = express.Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.post('/login', rateLimit({ windowMs: 15 * 60000, max: 20, keyPrefix: 'notebook-login' }), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 200 || !password) return res.status(400).json({ success: false, message: 'Enter your staff email and password.' });
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password +sessionVersion');
    if (!user || user.isActive === false || !NOTEBOOK_ROLES.includes(user.role) || !(await user.comparePassword(password))) return res.status(401).json({ success: false, message: 'Invalid staff email or password.' });
    const token = jwt.sign({ id: user._id, role: user.role, sv: Number(user.sessionVersion || 0) }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.json({ success: true, token, expiresAt: jwt.decode(token).exp * 1000, user: { id: String(user._id), name: user.name, role: user.role } });
  } catch (error) { next(error); }
});
router.use(protect, authorize(...NOTEBOOK_ROLES));
router.get('/notes', async (req, res, next) => {
  try {
    if (req.query.after && (typeof req.query.after !== 'string' || !/^[a-f0-9]{24}$/i.test(req.query.after))) return res.status(400).json({ success: false, message: 'Invalid page cursor.' });
    const scope = { owner: req.user._id, ...(req.query.after ? { _id: { $gt: new mongoose.Types.ObjectId(req.query.after) } } : {}) };
    const notes = await NotebookNote.find(scope).sort({ _id: 1 }).limit(10).lean();
    res.json({ success: true, notes: notes.map(publicNotebookNote), next: notes.length === 10 ? String(notes.at(-1)._id) : null });
  } catch (error) { next(error); }
});
router.put('/notes/:id', async (req, res, next) => {
  try { res.json({ success: true, note: await saveNotebookNote(req.user._id, req.user.name, req.params.id, req.body) }); }
  catch (error) {
    if (error.status === 409) return res.status(409).json({ success: false, message: error.message, serverNote: error.serverNote });
    next(error);
  }
});
export default router;

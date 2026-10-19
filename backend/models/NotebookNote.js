import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: String, required: true },
  text: { type: String, required: true, maxlength: 5000 },
  title: { type: String, maxlength: 100, default: '' },
  category: { type: String, enum: ['purchase', 'expense', 'other', ''], default: '' },
  amountMinor: { type: Number, min: 0, max: 999999999, default: null },
  quantity: { type: String, maxlength: 60, default: '' },
  payment: { type: String, enum: ['cash', 'credit', ''], default: '' },
  receiptData: { type: String, maxlength: 800000, default: '' },
  status: { type: String, enum: ['pending', 'entered'], required: true },
  notedAt: { type: Date, required: true },
  enteredAt: { type: Date, default: null },
  enteredBy: { type: String, maxlength: 100, default: '' },
  revision: { type: Number, required: true, min: 1 },
  lastMutationId: { type: String, required: true },
}, { timestamps: true });
schema.index({ owner: 1, clientId: 1 }, { unique: true });
schema.index({ owner: 1, _id: 1 });
export default mongoose.model('NotebookNote', schema);

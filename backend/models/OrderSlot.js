import mongoose from 'mongoose';
// One permanent bucket per fulfillment/time. Cancellation never deletes buckets.
const schema = new mongoose.Schema({ _id: String, used: { type: Number, default: 0, min: 0 } });
export default mongoose.model('OrderSlot', schema);

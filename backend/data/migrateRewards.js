import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

const SOURCE_KEY = "MIGRATION:LEGACY_REWARD_BALANCE";

const run = async () => {
  try {
    const uri =
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/duneandgrills";
    await mongoose.connect(uri);

    const users = await User.collection
      .find(
        { rewardPoints: { $exists: true } },
        { projection: { rewardPoints: 1, pointsBalance: 1, pointTransactions: 1 } }
      )
      .toArray();

    let migrated = 0;
    for (const user of users) {
      const update = { $unset: { rewardPoints: "" } };
      if (user.pointsBalance === undefined) {
        const balance = Math.max(0, Number(user.rewardPoints) || 0);
        update.$set = { pointsBalance: balance };
        const alreadyRecorded = (user.pointTransactions || []).some(
          (entry) => entry.sourceKey === SOURCE_KEY
        );
        if (balance > 0 && !alreadyRecorded) {
          update.$push = {
            pointTransactions: {
              _id: new mongoose.Types.ObjectId(),
              type: "EARN",
              points: balance,
              order: null,
              reward: null,
              description:
                "Opening points balance migrated from the previous rewards system",
              balanceAfter: balance,
              sourceKey: SOURCE_KEY,
              createdAt: new Date(),
            },
          };
        }
      }
      await User.collection.updateOne({ _id: user._id }, update);
      migrated += 1;
    }

    console.log(`Migrated ${migrated} legacy reward account(s) safely.`);
  } catch (error) {
    console.error("Reward migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();

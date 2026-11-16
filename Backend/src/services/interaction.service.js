
import { Interaction } from "../models/interaction.model.js";

const VIEW_DEDUPE_MINUTES = 30;

const recordInteraction = async ({
  userId,
  productId,
  eventType,
  source = "live",
}) => {
  // Ignore repeated VIEW events within 30 minutes
  if (eventType === "VIEW") {
    const cutoffTime = new Date(
      Date.now() - VIEW_DEDUPE_MINUTES * 60 * 1000
    );

    const existingView = await Interaction.findOne({
      userId,
      productId,
      eventType: "VIEW",
      timestamp: { $gte: cutoffTime },
    });

    if (existingView) {
      return {
        interaction: existingView,
        created: false,
      };
    }
  }

  const interaction = await Interaction.create({
    userId,
    productId,
    eventType,
    source,
  });

  return {
    interaction,
    created: true,
  };
};

export { recordInteraction };

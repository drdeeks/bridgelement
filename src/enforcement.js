import { evaluatePolicy } from "../vendor/core/src/index.js";
import { EFFECTS } from "../vendor/protocol/src/index.js";
import { profileToPolicy } from "../vendor/config-schema/src/profile.js";

export function checkAction({ profile, tool, command, recentAcks, openHold }) {
  const policy = profileToPolicy(profile);
  const result = evaluatePolicy({ tool, command }, policy);

  const lastHabitNames = recentAcks
    .filter((a) => a.habitName)
    .slice(-10)
    .map((a) => a.habitName);

  const lastHabitReasons = recentAcks
    .filter((a) => a.reason)
    .slice(-10)
    .map((a) => a.reason);

  const habit = (profile.habits || []).find((h) => h.name && h.requiresAck !== false);
  const requiresAck = habit && !lastHabitNames.includes(habit.name);

  if (openHold) {
    return {
      decision: "hold",
      decisionId: openHold.decisionId || "hold-existing",
      reasonCodes: ["acknowledgment_pending"],
      requiredAcknowledgment: true,
      expiresAt: null,
      nextAction: "acknowledge_hold",
    };
  }

  if (result.effect === "deny") {
    return {
      decision: "deny",
      decisionId: result.decisionId || newId("dec"),
      reasonCodes: result.reasonCodes || ["policy_denied"],
      requiredAcknowledgment: false,
      expiresAt: null,
      nextAction: "continue",
    };
  }

  if (result.effect === "hold" || requiresAck) {
    return {
      decision: "hold",
      decisionId: newId("dec"),
      reasonCodes: ["acknowledgment_required"],
      requiredAcknowledgment: true,
      expiresAt: null,
      nextAction: "acknowledge_hold",
    };
  }

  return {
    decision: "allow",
    decisionId: newId("dec"),
    reasonCodes: result.reasonCodes || ["policy_allowed"],
    requiredAcknowledgment: false,
    expiresAt: null,
    nextAction: "continue",
  };
}

export function acknowledge({ profile, habitName, reason, recentAcks }) {
  if (!habitName) {
    return { decision: "deny", reasonCodes: ["habit_required"] };
  }
  if (!reason || reason.trim().length < 3) {
    return { decision: "deny", reasonCodes: ["reason_required"] };
  }
  if (recentAcks.some((a) => a.habitName === habitName && a.reason === reason)) {
    return { decision: "deny", reasonCodes: ["duplicate_ack"] };
  }
  return { decision: "acknowledge", reasonCodes: ["acknowledged"] };
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function unavailable(ctx, { reasonCodes }) {
  return {
    decision: "unavailable",
    reasonCodes: reasonCodes || ["unavailable"],
  };
}
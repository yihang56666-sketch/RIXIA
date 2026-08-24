import type { InteractiveVideoChoice, InteractiveVideoNode } from "./extendedModels";

export function shouldPresentInteractiveChoice(
  node: InteractiveVideoNode | null | undefined,
  currentTimeSeconds: number,
  durationSeconds: number,
  alreadyPresented: boolean,
): boolean {
  if (!node || alreadyPresented || node.isLeaf || node.choices.length === 0 || durationSeconds <= 0) return false;
  const leadSeconds = Math.max(0, (node.choicePromptLeadTimeMs ?? 0) / 1000);
  return currentTimeSeconds >= Math.max(0, durationSeconds - leadSeconds);
}

export function interactiveChoiceTarget(choice: InteractiveVideoChoice): { cid: number; edgeId: number } {
  return { cid: choice.cid, edgeId: choice.edgeId };
}

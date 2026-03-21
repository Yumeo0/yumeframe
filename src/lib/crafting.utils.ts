import type { CollectionPart } from "@/components/app/foundry.types";

export function normalizeCraftName(value: string): string {
	return value.trim().toLowerCase();
}

export const AUTO_COLLAPSE_RECIPE_UNIQUE_NAMES = new Set(
	[
		"/Lotus/Types/Items/MiscItems/Morphic",
		"/Lotus/Types/Items/MiscItems/ControlModule",
		"/Lotus/Types/Items/MiscItems/NeuralSensor",
		"/Lotus/Types/Items/MiscItems/Neurode",
		"/Lotus/Types/Items/MiscItems/OrokinCell",
		"/Lotus/Types/Items/MiscItems/Gallium",
	].map(normalizeCraftName),
);

export function shouldAutoCollapseRecipe(uniqueName?: string): boolean {
	if (!uniqueName) {
		return false;
	}
	return AUTO_COLLAPSE_RECIPE_UNIQUE_NAMES.has(normalizeCraftName(uniqueName));
}

export function getNameCandidatesForPart(part: CollectionPart): string[] {
	const candidates = new Set<string>();
	const baseName = part.name.trim();

	candidates.add(baseName);

	// Parts frequently appear as "<Part Name> Blueprint" in requirements.
	const withoutBlueprintSuffix = baseName.replace(/\s+blueprint$/i, "").trim();
	if (withoutBlueprintSuffix.length > 0) {
		candidates.add(withoutBlueprintSuffix);
	}

	return [...candidates];
}

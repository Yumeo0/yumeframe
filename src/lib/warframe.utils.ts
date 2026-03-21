import type {
	Companion,
	ExportWarframeEntry,
	ExportWeaponEntry,
	ManifestEntry,
	RecipeData,
	Resource,
	Upgrade,
	VoidRelic,
} from "@/types";

const PUBLIC_EXPORT_BASE_URL = "http://content.warframe.com/PublicExport";

type ManifestLookupInput =
	| ManifestEntry[]
	| Record<string, string>
	| Map<string, string>;

type ExportLookupSource =
	| "ExportWarframes"
	| "ExportWeapons"
	| "ExportSentinels"
	| "ExportRelicArcane"
	| "ExportRecipes"
	| "ExportResources"
	| "ExportUpgrades";

type ExportLookupEntry =
	| ExportWarframeEntry
	| ExportWeaponEntry
	| Companion
	| VoidRelic
	| RecipeData
	| Resource
	| Upgrade;

export interface UniqueNameLookupIndexes {
	manifest?: ManifestEntry[] | Record<string, string>;
	warframes?: Record<string, ExportWarframeEntry>;
	weapons?: Record<string, ExportWeaponEntry>;
	companions?: Record<string, Companion>;
	relics?: Record<string, VoidRelic>;
	recipes?: Record<string, RecipeData>;
	resources?: Record<string, Resource>;
	upgrades?: Record<string, Upgrade>;
	rewardDucatValues?: Record<string, number>;
	rewardPlatinumValues?: Record<string, number>;
}

export interface UniqueNameMappedRelicReward {
	rewardName: string;
	rawRewardName: string;
	normalizedRewardName: string;
	rarity: "COMMON" | "UNCOMMON" | "RARE";
	tier: number;
	itemCount: number;
	imageUrl: string;
	ducats: number;
	platinum: number;
}

export interface UniqueNameResolvedRelic extends Omit<VoidRelic, "relicRewards"> {
	imageUrl: string;
	relicRewards: UniqueNameMappedRelicReward[];
}

export interface UniqueNameLookupResult {
	source: ExportLookupSource;
	data: ExportLookupEntry;
	textureLocation: string;
	imageUrl: string;
	resolvedRelic?: UniqueNameResolvedRelic;
}

export function normalizeStoreItemPath(value: string): string {
	return value.replace("/StoreItems", "");
}

export function normalizeLookupName(value: string): string {
	return value
		.toLowerCase()
		.replace(/<archwing>\s*/g, "")
		.replace(/["'`\u2019]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function normalizeMarketName(value: string): string {
	return value
		.toLowerCase()
		.replace(/['\u2019]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function slugifyMarketName(value: string): string {
	return normalizeMarketName(value).replace(/\s+/g, "_");
}

export function buildManifestTextureLookup(
	manifest: ManifestLookupInput,
): Record<string, string> {
	if (manifest instanceof Map) {
		const byUniqueName: Record<string, string> = {};
		for (const [key, value] of manifest.entries()) {
			if (!key || !value) {
				continue;
			}

			byUniqueName[key] = value;
			byUniqueName[normalizeStoreItemPath(key)] = value;
		}

		return byUniqueName;
	}

	if (Array.isArray(manifest)) {
		const byUniqueName: Record<string, string> = {};
		for (const entry of manifest) {
			if (!entry.uniqueName || !entry.textureLocation) {
				continue;
			}

			byUniqueName[entry.uniqueName] = entry.textureLocation;
			byUniqueName[normalizeStoreItemPath(entry.uniqueName)] =
				entry.textureLocation;
		}

		return byUniqueName;
	}

	return manifest;
}

export function getTextureLocationForUniqueName(
	uniqueName: string,
	manifest: ManifestLookupInput,
): string {
	if (!uniqueName) {
		return "";
	}

	const manifestLookup = buildManifestTextureLookup(manifest);
	const normalizedUniqueName = normalizeStoreItemPath(uniqueName);
	return manifestLookup[uniqueName] || manifestLookup[normalizedUniqueName] || "";
}

export function getImageUrlForUniqueName(
	uniqueName: string,
	manifest: ManifestLookupInput,
): string {
	const textureLocation = getTextureLocationForUniqueName(uniqueName, manifest);
	return textureLocation ? `${PUBLIC_EXPORT_BASE_URL}${textureLocation}` : "";
}

export function getMasteryLevelTotalXPRequired(masteryLevel: number): number {
	if (masteryLevel <= 0) {
		return 0;
	}

	if (masteryLevel <= 30) {
		return 2500 * masteryLevel * masteryLevel;
	}

	return 2250000 + 147500 * (masteryLevel - 30);
}

export function getDataForUniqueName(
	unique_name: string,
	indexes: UniqueNameLookupIndexes,
): UniqueNameLookupResult | null {
	if (!unique_name) {
		return null;
	}

	const normalizedUniqueName = normalizeStoreItemPath(unique_name);
	const manifestLookup = indexes.manifest
		? buildManifestTextureLookup(indexes.manifest)
		: {};
	const orderedLookups: Array<{
		source: ExportLookupSource;
		entries: Record<string, ExportLookupEntry> | undefined;
	}> = [
		{ source: "ExportWarframes", entries: indexes.warframes },
		{ source: "ExportWeapons", entries: indexes.weapons },
		{ source: "ExportSentinels", entries: indexes.companions },
		{ source: "ExportRelicArcane", entries: indexes.relics },
		{ source: "ExportRecipes", entries: indexes.recipes },
		{ source: "ExportResources", entries: indexes.resources },
		{ source: "ExportUpgrades", entries: indexes.upgrades },
	];

	for (const lookup of orderedLookups) {
		if (!lookup.entries) {
			continue;
		}

		const data =
			lookup.entries[unique_name] || lookup.entries[normalizedUniqueName];
		if (!data) {
			continue;
		}

		const textureLocation = getTextureLocationForUniqueName(
			unique_name,
			manifestLookup,
		);

		const baseResult: UniqueNameLookupResult = {
			source: lookup.source,
			data,
			textureLocation,
			imageUrl: textureLocation ? `${PUBLIC_EXPORT_BASE_URL}${textureLocation}` : "",
		};

		if (lookup.source !== "ExportRelicArcane") {
			return baseResult;
		}

		const relicData = data as VoidRelic;
		const rewardDucatValues = indexes.rewardDucatValues ?? {};
		const rewardPlatinumValues = indexes.rewardPlatinumValues ?? {};
		const mappedRewards: UniqueNameMappedRelicReward[] = (
			relicData.relicRewards ?? []
		).map((reward) => {
			const normalizedRewardName = normalizeStoreItemPath(reward.rewardName);
			const rewardTextureLocation = getTextureLocationForUniqueName(
				normalizedRewardName,
				manifestLookup,
			);
			const rewardImageUrl = rewardTextureLocation
				? `${PUBLIC_EXPORT_BASE_URL}${rewardTextureLocation}`
				: "";

			return {
				rewardName: normalizedRewardName,
				rawRewardName: reward.rewardName,
				normalizedRewardName,
				rarity: reward.rarity,
				tier: reward.tier,
				itemCount: reward.itemCount,
				imageUrl: rewardImageUrl,
				ducats:
					rewardDucatValues[reward.rewardName] ??
					rewardDucatValues[normalizedRewardName] ??
					0,
				platinum:
					rewardPlatinumValues[reward.rewardName] ??
					rewardPlatinumValues[normalizedRewardName] ??
					0,
			};
		});

		return {
			...baseResult,
			resolvedRelic: {
				...relicData,
				imageUrl: baseResult.imageUrl,
				relicRewards: mappedRewards,
			},
		};
	}

	return null;
}
export type ArbitrationTier = "S" | "A" | "B" | "C" | "D" | "F";

export type ArbitrationTierList = Record<string, ArbitrationTier | null>;

function normalizeTierName(name: string): string {
	return name
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "")
		.trim();
}

function buildTierList(): ArbitrationTierList {
	const byName: ArbitrationTierList = {};

	const assignTier = (tier: ArbitrationTier, names: string[]) => {
		for (const name of names) {
			const key = normalizeTierName(name);
			if (key) {
				byName[key] = tier;
			}
		}
	};

	assignTier("S", [
		"Alator",
		"Callisto",
		"Munio",
		"Tyana Pass",
		"Umbriel",
	]);
	assignTier("A", [
		"Cinxia",
		"Cytherean",
		"Xini",
	]);
	assignTier("B", [
		"Akkad",
		"Belenus",
		"Casta",
		"Helene",
		"Hydron",
		"Hyf",
		"Kala-azar",
        "Oestrus",
		"Ose",
		"Sechura",
		"Seimeni",
		"Taranis",
	]);
	assignTier("C", [
        "Coba",
		"Kadesh",
		"Larzac",
		"Lith",
		"Mithra",
		"Odin",
		"Outer Terminus",
		"Paimon",
		"Spear",
		"Stephano",
		"Tessera",
	]);
	assignTier("D", [
		"Gaia",
		"Io",
		"Lares",
		"Rhea",
		"Sangeru",
		"Sinai",
		"Stöfler",
	]);
	return byName;
}

// Keys are normalized node names (not node codes).
export const ARBITRATION_TIERS: ArbitrationTierList = buildTierList();

export function getArbitrationTierByName(nodeName: string): ArbitrationTier | null {
	const key = normalizeTierName(nodeName);
	if (!key) {
		return null;
	}

	return ARBITRATION_TIERS[key] ?? null;
}

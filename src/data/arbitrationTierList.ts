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
		"Cinxia",
		"Casta",
		"Seimeni",
		"Callisto",
		"Alator",
		"Sechura",
		"Tyana Pass",
	]);
	assignTier("A", [
		"Hydron",
		"Helene",
		"Hyf",
		"Larzac",
	]);
	assignTier("B", [
		"Taranis",
		"Odin",
		"Paimon",
		"Belenus",
		"Spear",
		"Kadesh",
		"Akkad",
		"Mithra",
		"Tessera",
		"Ose",
		"Outer Terminus",
		"Kala-azar"]);
	assignTier("C", [
		"Sinai",
		"Sangeru",
		"Stephano",
		"Io",
		"Lares",
		"Lith",
		"Bellinus",
		"Cerberus",
		"Umbriel",
        "Oestrus",
        "Coba",
		"Cytherean",
	]);
	assignTier("D", [
		"Romula",
		"Rhea",
		"Berehynia",
		"Oestrus",
		"Xini",
		"Stöfler",
		"Caelus",
	]);
    assignTier("F", [
        "Tuvul Commons",
        "Amarna",
        "Gulliver",
        "Zabala",
        "Gabii",
        "Yursa",
        "Augustus",
        "Apollodorus",
        "Assur",
        "Proteus",
        "Ani",
        "Tikal",
        "Nimus",
        "Terrorem",
        "Cameria",
        "Zeugma",
        "Mot",
        "Palus",
        "Valefor",
        "Draco",
        "Ur",
        "V Prime",
        "Titan",
        "Despina",
        "Kelashin",
        "Yuvarium",
        "Tycho",
		"Gaia",
        "Memphis",
        "Everest",
        "Caracol",
    ])

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

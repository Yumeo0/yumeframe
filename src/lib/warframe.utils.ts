export function getMasteryLevelTotalXPRequired(masteryLevel: number): number {
	if (masteryLevel <= 0) {
		return 0;
	}

	if (masteryLevel <= 30) {
		return 2500 * masteryLevel * masteryLevel;
	}

	return 2250000 + 147500 * (masteryLevel - 30);
}

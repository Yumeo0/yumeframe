import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { RelicScanRewardValue, RelicScanTriggerSource } from "@/types";

interface OverlayPayload {
	source: RelicScanTriggerSource;
	triggeredAt: number;
	rewardCandidates: string[];
	rewards?: RelicScanRewardValue[];
	error?: string;
}

export function RelicOverlayWindow() {
	const [payload, setPayload] = useState<OverlayPayload | null>(null);

	useEffect(() => {
		let mounted = true;
		const unlistenPromise = listen<OverlayPayload>(
			"relic-scan-overlay",
			(event) => {
				if (!mounted) {
					return;
				}
				setPayload(event.payload);
			},
		);

		return () => {
			mounted = false;
			void unlistenPromise.then((unlisten) => {
				unlisten();
			});
		};
	}, []);

	return (
		<div className="flex items-start justify-end w-screen h-screen p-3 bg-transparent">
			<div className="p-3 text-white border shadow-lg w-115 rounded-xl border-white/30 bg-black/70 backdrop-blur-sm">
				<p className="text-xs tracking-wide uppercase text-white/70">YumeFrame Relic Scan</p>
				{payload?.error ? (
					<p className="mt-2 text-sm text-red-300">{payload.error}</p>
				) : payload?.rewards?.length ? (
					<div className="grid grid-cols-1 gap-2 mt-2">
						{payload.rewards.slice(0, 4).map((reward) => (
							<div
								key={`${payload.triggeredAt}-${reward.rewardName}`}
								className="px-2 py-1 border rounded border-white/20 bg-white/10"
							>
								<p className="text-sm font-medium">{reward.displayName}</p>
								<p className="text-xs text-white/75">
									{reward.platinum.toFixed(2)}p | {reward.ducats} ducats
								</p>
							</div>
						))}
					</div>
				) : (
					<p className="mt-2 text-sm text-white/75">Waiting for scan results...</p>
				)}
			</div>
		</div>
	);
}

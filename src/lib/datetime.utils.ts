function pad2(value: number): string {
	return value.toString().padStart(2, "0");
}

export function formatClockTime(
	timestamp: number,
	use24HourClock: boolean,
): string {
	const date = new Date(timestamp);
	const hours = date.getHours();
	const minutes = pad2(date.getMinutes());
	const seconds = pad2(date.getSeconds());

	if (use24HourClock) {
		return `${pad2(hours)}:${minutes}:${seconds}`;
	}

	const period = hours >= 12 ? "PM" : "AM";
	const hour12 = hours % 12 || 12;
	return `${pad2(hour12)}:${minutes}:${seconds} ${period}`;
}

export function formatDateTime(
	timestamp: number,
	use24HourClock: boolean,
): string {
	const date = new Date(timestamp);
	const day = pad2(date.getDate());
	const month = pad2(date.getMonth() + 1);
	const year = date.getFullYear();
	const time = formatClockTime(timestamp, use24HourClock);

	return `${day}.${month}.${year} ${time}`;
}
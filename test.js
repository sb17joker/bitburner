import { getAllTIXStocks, getStocks } from "./if.stock.wse"
const sleeptime = 1000;
const expectedTickTime = 6000;
const accelTickTime = 4000;

function hasTickOccurred(stocks) {
	console.log(stocks.price); // <- undefined???
	return stocks.some(s => s.hasTicked);
}

export async function main(ns) {
	getStocks();
	ns.disableLog("ALL");
	let stocks = getAllTIXStocks(ns);

	while (true) {
		getStocks();
		if (hasTickOccurred(stocks)) {
			ns.print("Tick Detected!")
			stocks.forEach(s => s.onTickDetected())
		}
		//console.log(stocks);
		await ns.sleep(sleeptime)
	}
}

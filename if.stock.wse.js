import BaseStock from "./if.stock";
import "https://code.jquery.com/jquery-3.6.0.min.js";
//import { getStocks } from "./200mStocks.js";

const stock_list = ["ECP", "MGCP", "BLD", "CLRK", "OMTK", "FSIG", "KGI", "FLCM", "STM", "DCOMM", "HLS", "VITA", "ICRS", "UNV", "AERO", "OMN", "SLRS", "GPH", "NVMD", "WDS", "LXO", "RHOC", "APHE", "SYSC", "CTK", "NTLK", "OMGA", "FNS", "JGN", "SGC", "CTYS", "MDYN", "TITN"]
const cycleLength = 75;
const lowerBoundHistoryLength = 21;
const upperBoundHistoryLength = 151;
const nearTermWindowLength = 10;
const longTermWindowLength = 76;
const inversionDetectionTolerance = 0.10;
const doc = eval("document");


export function getAllTIXStocks(ns) {
	let stocks = [];
	for (let s of stock_list) {
		stocks.push(new WSEStock(ns, s));
	}
	return stocks;
}

export default class WSEStock extends BaseStock {
	constructor(ns, ticker) {
		super();
		this.ns = ns;
		this._ticker = ticker;
		this.history = [];
		this.cycleTick = 0;
		this.currentTick = 0;
		this.stocks = [];
		this.stock_list = stock_list;
	}

	get maxShares() { return this.getMaxShares(this.ticker); }

	get price() {
		return {
			bull: this.getAskPrice(this.ticker),
			bear: this.getBidPrice(this.ticker),
			avg: (this.getAskPrice(this.ticker) + this.getBidPrice(this.ticker)) / 2
		} 
	}

	get position() {
		let pos = this.getPosition(this.ticker);
		return {
			bull: pos[0],
			bullPrice: pos[1],
			bear: pos[2],
			bearPrice: pos[3],
			value: pos[0] * this.price.bull + (pos[2] * this.price.bear - (pos[2] * this.price.bear - pos[2] * this.price.bull))
		}
	}

	_golong(shares) {
		return this.buy(this.ticker, shares) * shares
	}

	max_long() {
		let shares = (this.ns.getServerMoneyAvailable("home") - 100000) / this.price.bull
		shares = Math.floor(Math.min(shares, this.maxShares - this.position.bull))
		if (shares * this.price.bull > 2000000) {
			return this._golong(shares)
		}
	}

	longCost(shares) { return (shares * this.price.bull) + 100000 }

	unbuy(shares = this.position.bull) {
		return this.sell(this.ticker, shares);
	}

	get bullish() { return this.forecast > .535; }
	get bearish() { return this.forecast < .465; }

	get hasTicked() { /*console.log("Price Ave: " + this.price.ave + "Last Price: " + this.lastprice);*/ return this.price.avg != this.lastPrice }

	onTickDetected() {
		this.currentTick = (this.currentTick + 1) % 75;
		this.lastPrice = this.price.avg;
		this.lastForecast = this.forecast;
		this.history.unshift(this.price.avg);
		this.history = this.history.slice(0, upperBoundHistoryLength);
	}

	get forecast() { return this.longTermForecast }

	calcForecast(history = this.history) {
		return history.reduce((ups, price, idx) => idx == 0 ? 0 : (this.history[idx - 1] > price ? ups + 1 : ups), 0) / (history.length - 1);
	}

	get nearTermForecast() { return this.calcForecast(this.history.slice(0, nearTermWindowLength)) }
	get longTermForecast() { return this.calcForecast(this.history.slice(0, this.probWindowLength)) }

	get volatility() {
		return this.history.reduce((max, price, idx) => Math.max(max, idx == 0 ? 0 : Math.abs(this.history[idx - 1] - price) / price), 0);
	}

	get std_dev() {
		return Math.sqrt((this.forecast * (1 - this.forecast)) / this.probWindowLength);
	}

	get probWindowLength() {
		return Math.min(longTermWindowLength, (this.currentTick - this.cycleTick) % cycleLength);
	}

	detectInversion(p1, p2) {
		const tol2 = inversionDetectionTolerance / 2;
		return ((p1 >= 0.5 + tol2) && (p2 <= 0.5 - tol2) && p2 <= (1 - p1) + inversionDetectionTolerance)
        /* Reverse Condition: */ || ((p1 <= 0.5 - tol2) && (p2 >= 0.5 + tol2) && p2 >= (1 - p1) - inversionDetectionTolerance);
	}

	get expected_value() {
		let normalizedProb = (this.forecast - 0.5);
		let conservativeProb = normalizedProb < 0 ? Math.min(0, normalizedProb + this.std_dev) : Math.max(0, normalizedProb - this.std_dev);
		return this.volatility * conservativeProb;
	}

	get preNearTermWindowProb() { return this.calcForecast(this.history.slice(nearTermWindowLength)); }

	get hasInverted() {
		return this.detectInversion(this.preNearTermWindowProb, this.nearTermForecast) && (this.history.length >= lowerBoundHistoryLength)
	}

	getMaxShares(ticker) {
		const stocks = JSON.parse(this.ns.read("stockData.txt"));
		for (let s of stocks) {
			if (s.sym === ticker) return s.max;
		}
	}
	getAskPrice(ticker) {
		const stocks = JSON.parse(this.ns.read("stockData.txt"));
		for (let s of stocks) {
			if (s.sym === ticker) return s.bull;
		}
	}
	getBidPrice(ticker) {
		const stocks = JSON.parse(this.ns.read("stockData.txt"))
		for (let s of stocks) {
			if (s.sym === ticker) return s.bear;
		}
	}
	getPosition(ticker) { return [0, 0, 0, 0]; }

	async updateCache(repeat = true, kv = new Map()) {
		do {
			let getters = this.listGetters(this)
			for (let o of Object.keys(getters)) {
				if (!kv.has(getters[o])) {
					kv.set(getters[o], this[getters[o]])
				}
			}
			await super.updateCache(false, kv)
			if (repeat) {
				await this.ns.asleep(6000); // base server update rate is 60s. we'll call faster updates when we need them.
			}

		} while (repeat)
	}
}

export async function getStocks(ns) {
	const stock_list = ["ECP", "MGCP", "BLD", "CLRK", "OMTK", "FSIG", "KGI", "FLCM", "STM", "DCOMM", "HLS", "VITA", "ICRS", "UNV", "AERO", "OMN", "SLRS", "GPH", "NVMD", "WDS", "LXO", "RHOC", "APHE", "SYSC", "CTK", "NTLK", "OMGA", "FNS", "SGC", "JGN", "CTYS", "MDYN", "TITN"]
	const symbols = { k: '', m: '000', b: '000000', t: '000000000', q: '000000000000', Q: '000000000000000', s: '000000000000000000', S: '000000000000000000000', o: '000000000000000000000000', n: '000000000000000000000000000', e33: '000000000000000000000000000000', e36: '000000000000000000000000000000000', e39: '000000000000000000000000000000000000' };
	var returnToEditor = false;
	const stockMarketButton = [];
	const stockBearElements = [];
	const doc = eval("document");
	var server = 1;

	clickMenuButton("Stock Market");
	openStockTree();
	var bullValues = retrieveBullValues();
	var bearValues = retrieveBearValues();
	var maxShares = retrieveMaxShares();
	const stocks = [];
	for (let i = 0; i < stock_list.length; i++) {
		var s = {};
		s.sym = stock_list[i]
		s.bull = bullValues[i];
		s.bear = bearValues[i];
		s.max =  maxShares[i];
		stocks.push(s);
	}
	openStockTree();
	//console.log(stocks);
	await ns.write("stockData.txt", JSON.stringify(stocks), "w");

	function openStockTree() {
		const stockButtons = [];
		for (let s = 1; s < 34; s++) {
			const button = doc.querySelector("#root :nth-child(1) :nth-child(2) :nth-child(2) :nth-child(" + (17 + s) + ") :nth-child(1)");
			stockButtons.push(button);
		}
		stockButtons.forEach(element => element.click());
	}
	function retrieveMaxShares() {
		const stockMaxSharesElements = [];
		const stocks = [];
		for (let s = 1; s < 34; s++) {
			const stock = $("#root :nth-child(1) :nth-child(2) :nth-child(2) :nth-child(" + (17 + s) + ") p:contains('Max Shares:') ");
			stockMaxSharesElements.push(stock);
		}
		stockMaxSharesElements.forEach(function (element) {
			stocks.push(cleanShares(element[0].innerHTML));
		});
		return stocks;
	}

	function retrieveBullValues() {
		const stockBullElements = [];
		const stocks = [];
		for (let s = 1; s < 34; s++) {
			const stock = $("#root :nth-child(1) :nth-child(2) :nth-child(2) :nth-child(" + (17 + s) + ") :contains('Ask Price') ");
			stockBullElements.push(stock);
		}
		//console.log(cleanPrice(stockBullElements[28][4].getElementsByTagName("span")[0].textContent));
		stockBullElements.forEach(function (element) {
			stocks.push(cleanPrice(element[4].getElementsByTagName("span")[0].textContent));
		});
		return stocks;
	}
	function retrieveBearValues() {
		const stockBearElements = [];
		const stocks = [];
		for (let s = 1; s < 34; s++) {

			const stock = $("#root :nth-child(1) :nth-child(2) :nth-child(2) :nth-child(" + (17 + s) + ") :contains('Bid Price') ");
			stockBearElements.push(stock);
		}
		stockBearElements.forEach(function (element) {
			stocks.push(cleanPrice(element[4].getElementsByTagName("span")[0].textContent));
		});
		return stocks;
	}
	function cleanPrice(price) {
		price = price.replace('$', '');
		for (let key in symbols) {
			if (price.includes(key)) {
				price = price.replace(key, symbols[key]);
				price = price.replace('.', '');
			}
		}
		return price;
	}
	function cleanShares(shares) {
		shares = shares.replace('Max Shares:', '');
		for (let key in symbols) {
			if (shares.includes(key)) {
				shares = shares.replace(key, symbols[key]);
				shares = shares.replace('.', '');
			}
		}
		return shares;
	}
	function clickMenuButton(button) {
		const menuButtons = doc.getElementsByClassName("MuiListItem-button");

		for (let b = 0; b < menuButtons.length; b++) {
			if (menuButtons[b].getElementsByTagName("p")[0].innerHTML.includes(button)) {
				menuButtons[b].click();
			}
		}
	}
}

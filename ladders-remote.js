/**
 * Main server ladder library
 * Pokemon Showdown - http://pokemonshowdown.com/
 *
 * This file handles ladders for the main server on
 * play.pokemonshowdown.com.
 *
 * Ladders for all other servers is handled by ladders.js.
 *
 * Matchmaking is currently still implemented in rooms.js.
 *
 * @license MIT license
 */

'use strict';

class LadderStore {
	/**
	 * @param {string} formatid
	 */
	constructor(formatid) {
		this.formatid = formatid;
	}

	/**
	 * Returns [formatid, html], where html is an the HTML source of a
	 * ladder toplist, to be displayed directly in the ladder tab of the
	 * client.
	 * @return {Promise<[string, string]?>}
	 */
	async getTop() {
		return null;
	}

	/**
	 * Returns a Promise for the Elo rating of a user
	 * @param {string} userid
	 * @return {Promise<number>}
	 */
	async getRating(userid) {
		let formatid = this.formatid;
		let user = Users.getExact(userid);
		if (!user) {
			throw new Error(`Expired rating for ${userid}`);
		}
		if (Ladders.disabled === true || Ladders.disabled === 'db' && !user.mmrCache[formatid]) {
			throw new Error(`Ladders are disabled.`);
		}
		if (user.mmrCache[formatid]) {
			return user.mmrCache[formatid];
		}
		const mmr = await new Promise((resolve, reject) => {
			LoginServer.request('mmr', {
				format: formatid,
				user: userid,
			}, (/** @type {any} */ data, /** @type {number} */ statusCode, /** @type {Error?} */ error) => {
				if (!data) return resolve(NaN);
				if (data.errorip) {
					return resolve(NaN);
				}
				return resolve(parseInt(data));
			});
		});
		if (isNaN(mmr)) return 1000;
		if (user.userid !== userid) throw new Error(`Expired rating for ${userid}`);

		user.mmrCache[formatid] = mmr;
		return mmr;
	}

	/**
	 * Update the Elo rating for two players after a battle, and display
	 * the results in the passed room.
	 * @param {string} p1name
	 * @param {string} p2name
	 * @param {number} p1score
	 * @param {GameRoom} room
	 */
	async updateRating(p1name, p2name, p1score, room) {
		if (Ladders.disabled) {
			room.addRaw(`Ratings not updated. The ladders are currently disabled.`).update();
			return [p1score, undefined, undefined];
		}

		let formatid = this.formatid;
		room.update();
		room.send(`||Ladder updating...`);
		let data;
		try {
			data = await new Promise((resolve, reject) => {
				LoginServer.request('ladderupdate', {
					p1: p1name,
					p2: p2name,
					score: p1score,
					format: formatid,
				}, (/** @type {any} */ data, /** @type {number} */ statusCode, /** @type {Error?} */ error) => {
					if (error) return reject(error);
					resolve(data);
				});
			});
		} catch (error) {
			room.add(`||Ladder (probably) updated, but score could not be retrieved (${error.message}).`);
			return [p1score, undefined, undefined];
		}
		if (!room.battle) {
			Monitor.warn(`room expired before ladder update was received`);
			return [p1score, undefined, undefined];
		}
		if (data.errorip) {
			room.add(`||This server's request IP ${data.errorip} is not a registered server.`);
			room.add(`||You should be using ladders.js and not ladders-remote.js for ladder tracking.`);
			room.update();
			return [p1score, undefined, undefined];
		}

		let p1rating, p2rating;
		try {
			p1rating = data.p1rating;
			p2rating = data.p2rating;

			let oldelo = Math.round(p1rating.oldelo);
			let elo = Math.round(p1rating.elo);
			let act = (p1score > 0.9 ? `winning` : (p1score < 0.1 ? `losing` : `tying`));
			let reasons = `${elo - oldelo} for ${act}`;
			if (reasons.charAt(0) !== '-') reasons = '+' + reasons;
			room.addRaw(Chat.html`${p1name}'s rating: ${oldelo} &rarr; <strong>${elo}</strong><br />(${reasons})`);
			let minElo = elo;

			oldelo = Math.round(p2rating.oldelo);
			elo = Math.round(p2rating.elo);
			act = (p1score > 0.9 || p1score < 0 ? `losing` : (p1score < 0.1 ? `winning` : `tying`));
			reasons = `${elo - oldelo} for ${act}`;
			if (reasons.charAt(0) !== '-') reasons = '+' + reasons;
			room.addRaw(Chat.html`${p2name}'s rating: ${oldelo} &rarr; <strong>${elo}</strong><br />(${reasons})`);
			if (elo < minElo) minElo = elo;
			room.rated = minElo;

			let p1 = Users.getExact(p1name);
			if (p1) p1.mmrCache[formatid] = +p1rating.elo;
			let p2 = Users.getExact(p2name);
			if (p2) p2.mmrCache[formatid] = +p2rating.elo;
			room.update();
		} catch (e) {
			room.addRaw(`There was an error calculating rating changes.`);
			room.update();
		}

		return [p1score, p1rating, p2rating];
	}

	/**
	 * Returns a Promise for an array of strings of <tr>s for ladder ratings of the user
	 * @param {string} username
	 * @return {Promise<string[]>}
	 */
	static async visualizeAll(username) {
		return [`<tr><td><strong>Please use the official client at play.pokemonshowdown.com</strong></td></tr>`];
	}
}

LadderStore.formatsListPrefix = '';

module.exports = LadderStore;
